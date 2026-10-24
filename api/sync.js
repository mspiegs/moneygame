import { authed } from './_lib/auth.js';
import { db, handle, HttpError, json } from './_lib/db.js';
import { resolveGroup } from './_lib/groups.js';
import { refreshLedger } from './_lib/rounds.js';

// POST /api/sync { group?, ops: [{ type, ... }] }
//
// Applies the client's queued changes in order. Every op is idempotent, so the
// client can safely resend any it isn't sure landed (e.g. after losing signal
// mid-request). The response says how many ops were handled:
//   { done: n, rejected: [{ index, error }] }
// The client drops the first n from its queue. Ops that can never succeed
// (bad input, no permission) count as done and are listed in `rejected`; a
// server or database hiccup stops the batch so the rest are retried later.

const MAX_OPS = 500;

const bad = (msg) => { throw new HttpError(400, msg); };
const str = (v, name) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : bad(`${name} is required`));
const int = (v, name, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : bad(`${name} must be ${min}–${max}`));
const numOrNull = (v, name) => (v == null ? null : Number.isFinite(v) ? v : bad(`${name} must be a number`));
const holes18 = (v, name) => (Array.isArray(v) && v.length === 18 ? v.map((x) => int(x, name, 1, 18)) : bad(`${name} needs 18 values`));

/** Throws 403 unless the row is new or already belongs to this group. */
async function assertOwned(sql, table, id, groupId) {
  const rows = table === 'rounds'
    ? await sql`select group_id from rounds where id = ${id}`
    : table === 'courses'
      ? await sql`select group_id from courses where id = ${id}`
      : await sql`select group_id from players where id = ${id}`;
  if (rows[0] && rows[0].group_id !== groupId) throw new HttpError(403, `${table} ${id} belongs to another group`);
  return !!rows[0];
}

async function requireRound(sql, roundId, groupId, ctx) {
  if (ctx?.checked.has(roundId)) return; // already checked earlier in this batch
  const [r] = await sql`select group_id from rounds where id = ${str(roundId, 'roundId')}`;
  if (!r) throw new HttpError(404, `Round ${roundId} not found`);
  if (r.group_id !== groupId) throw new HttpError(403, 'Round belongs to another group');
  ctx?.checked.add(roundId);
}

const handlers = {
  async 'player.upsert'(sql, g, user, { player: p }) {
    const id = str(p?.id, 'player.id');
    await assertOwned(sql, 'players', id, g);
    await sql`insert into players (id, group_id, name, handicap_index, color)
      values (${id}, ${g}, ${str(p.name, 'player.name')}, ${numOrNull(p.index, 'player.index')}, ${p.color ?? null})
      on conflict (id) do update set name = excluded.name, handicap_index = excluded.handicap_index,
        color = excluded.color, archived_at = null, updated_at = now()`;
  },

  async 'player.archive'(sql, g, user, { id }) {
    await assertOwned(sql, 'players', str(id, 'id'), g);
    // Keep players who appear in rounds (history needs them); delete the rest.
    await sql.transaction([
      sql`delete from players where id = ${id} and group_id = ${g}
        and not exists (select 1 from round_players where player_id = ${id})
        and not exists (select 1 from payments where from_id = ${id} or to_id = ${id})`,
      sql`update players set archived_at = now() where id = ${id} and group_id = ${g}`,
    ]);
  },

  async 'course.upsert'(sql, g, user, { course: c }) {
    const id = str(c?.id, 'course.id');
    await assertOwned(sql, 'courses', id, g);
    const tees = Array.isArray(c.teeSets) && c.teeSets.length ? c.teeSets : bad('course needs at least one tee set');
    const teeIds = tees.map((t) => str(t.id, 'tee.id'));
    await sql.transaction([
      sql`insert into courses (id, group_id, name, par, stroke_index, last_tee_id)
        values (${id}, ${g}, ${str(c.name, 'course.name')}, ${holes18(c.par, 'par')}, ${holes18(c.si, 'stroke index')}, ${c.lastTee ?? null})
        on conflict (id) do update set name = excluded.name, par = excluded.par, stroke_index = excluded.stroke_index,
          last_tee_id = excluded.last_tee_id, archived_at = null, updated_at = now()`,
      sql`delete from tee_sets where course_id = ${id} and not (id = any(${teeIds}::text[]))`,
      ...tees.map((t, i) => sql`insert into tee_sets (id, course_id, name, rating, slope, sort)
        values (${t.id}, ${id}, ${str(t.name, 'tee.name')}, ${numOrNull(t.rating, 'rating')}, ${int(t.slope, 'slope', 55, 155)}, ${i})
        on conflict (id) do update set name = excluded.name, rating = excluded.rating, slope = excluded.slope, sort = excluded.sort`),
    ]);
  },

  async 'course.archive'(sql, g, user, { id }) {
    await sql`update courses set archived_at = now() where id = ${str(id, 'id')} and group_id = ${g}`;
  },

  /** Creates or fully replaces a round, including its scores and presses (used on create and import). */
  async 'round.put'(sql, g, user, { round: r }, ctx) {
    const id = str(r?.id, 'round.id');
    await assertOwned(sql, 'rounds', id, g);
    const players = Array.isArray(r.players) && r.players.length ? r.players : bad('round needs players');
    const ids = players.map((p) => str(p.id, 'player.id'));
    // Players removed from the roster (or never synced, like samples) still need a row for history.
    const existing = await sql`select id, group_id from players where id = any(${ids}::text[])`;
    if (existing.some((p) => p.group_id !== g)) throw new HttpError(403, 'Round includes a player from another group');
    const missing = players.filter((p) => !existing.some((e) => e.id === p.id));

    const course = r.course || bad('round needs a course');
    const [known] = course.id ? await sql`select 1 from courses where id = ${course.id} and group_id = ${g}` : [];
    const status = r.status === 'final' ? 'final' : 'live';
    const sideGames = Array.isArray(r.sideGames) ? r.sideGames : [];
    if (sideGames.length > 8) bad('at most 8 side games');
    for (const g of sideGames) {
      if (g?.type === 'ninepoint') {
        if (!Array.isArray(g.players) || g.players.length !== 3 || g.players.some((p) => !ids.includes(p))) bad('9 Point needs 3 of the round\u2019s players');
        if (!(Number.isFinite(g.stake) && g.stake >= 0 && g.stake <= 10000)) bad('9 Point stake must be 0-10,000');
      } else if (g?.type === 'nassau') {
        // An extra Nassau with its own settings; match ids are prefixed with the game id.
        if (!Array.isArray(g.matches) || g.matches.length > 20) bad('Nassau matches missing');
        for (const m of g.matches) {
          if (typeof m?.id !== 'string' || !m.id.startsWith(`${g.id}:`)) bad('Nassau match ids must start with the game id');
          if (![...(m.a || []), ...(m.b || [])].every((p) => ids.includes(p))) bad('Nassau match has a player not in the round');
        }
        if (!['front', 'back', 'overall'].every((k) => Number.isFinite(g.stakes?.[k]) && g.stakes[k] >= 0 && g.stakes[k] <= 10000)) bad('Nassau stakes must be 0-10,000');
      } else bad(`unknown game ${g?.type}`);
    }
    const startedAt = new Date(Number.isFinite(r.createdAt) ? r.createdAt : Date.now()).toISOString();

    const scoreRows = [];
    for (const pid of ids) {
      (r.scores?.[pid] || []).forEach((v, hole) => { if (v != null) scoreRows.push([pid, hole, int(v, 'score', 1, 20)]); });
    }
    const presses = (r.presses || []).map((p) => [str(p.id, 'press.id'), str(p.matchId, 'press.matchId'),
      ['front', 'back', 'overall'].includes(p.segment) ? p.segment : bad('press.segment'), int(p.start, 'press.start', 0, 17),
      p.by === 'a' || p.by === 'b' ? p.by : bad('press.by')]);

    await sql.transaction([
      ...missing.map((p) => sql`insert into players (id, group_id, name, handicap_index, color, archived_at)
        values (${p.id}, ${g}, ${str(p.name, 'player.name')}, ${numOrNull(p.index, 'player.index')}, ${p.color ?? null}, now())
        on conflict (id) do nothing`),
      sql`insert into rounds (id, group_id, course_id, tee_set_id, course_snapshot, game, side_games, status, current_hole, created_by, started_at, finished_at)
        values (${id}, ${g}, ${known ? course.id : null}, ${course.teeId ?? null}, ${JSON.stringify(course)}::jsonb, ${JSON.stringify(r.game ?? {})}::jsonb, ${JSON.stringify(sideGames)}::jsonb,
          ${status}, ${int(r.hole ?? 0, 'hole', 0, 17)}, ${user.id}, ${startedAt}, ${status === 'final' ? new Date().toISOString() : null})
        on conflict (id) do update set course_id = excluded.course_id, tee_set_id = excluded.tee_set_id,
          course_snapshot = excluded.course_snapshot, game = excluded.game, side_games = excluded.side_games, status = excluded.status,
          current_hole = excluded.current_hole, finished_at = coalesce(rounds.finished_at, excluded.finished_at),
          deleted_at = null, updated_at = now()`,
      sql`delete from round_players where round_id = ${id} and not (player_id = any(${ids}::text[]))`,
      ...players.map((p, seat) => sql`insert into round_players (round_id, player_id, seat, name, handicap_index, color)
        values (${id}, ${p.id}, ${seat}, ${str(p.name, 'player.name')}, ${numOrNull(p.index, 'player.index')}, ${p.color ?? null})
        on conflict (round_id, player_id) do update set seat = excluded.seat, name = excluded.name,
          handicap_index = excluded.handicap_index, color = excluded.color`),
      sql`delete from scores where round_id = ${id}`,
      sql`insert into scores (round_id, player_id, hole, gross, updated_by)
        select ${id}, pid, hole, gross, ${user.id}
        from unnest(${scoreRows.map((s) => s[0])}::text[], ${scoreRows.map((s) => s[1])}::int[], ${scoreRows.map((s) => s[2])}::int[]) as t(pid, hole, gross)`,
      sql`delete from presses where round_id = ${id}`,
      sql`insert into presses (id, round_id, match_id, segment, start_hole, by_side, created_by)
        select pid, ${id}, mid, seg, start, side, ${user.id}
        from unnest(${presses.map((p) => p[0])}::text[], ${presses.map((p) => p[1])}::text[], ${presses.map((p) => p[2])}::text[],
          ${presses.map((p) => p[3])}::int[], ${presses.map((p) => p[4])}::text[]) as t(pid, mid, seg, start, side)
        on conflict (id) do nothing`,
    ]);
    ctx.touched.add(id);
  },

  async 'round.delete'(sql, g, user, { roundId }, ctx) {
    await requireRound(sql, roundId, g, ctx);
    await sql`update rounds set deleted_at = now(), updated_at = now() where id = ${roundId}`;
    ctx.touched.add(roundId);
  },

  async 'round.hole'(sql, g, user, { roundId, hole }) {
    await sql`update rounds set current_hole = ${int(hole, 'hole', 0, 17)}, updated_at = now()
      where id = ${str(roundId, 'roundId')} and group_id = ${g}`;
  },

  async 'round.status'(sql, g, user, { roundId, status }, ctx) {
    if (status !== 'live' && status !== 'final') bad('status must be live or final');
    await sql`update rounds set status = ${status}, updated_at = now(),
        finished_at = case when ${status} = 'final' then coalesce(finished_at, now()) else null end
      where id = ${str(roundId, 'roundId')} and group_id = ${g}`;
    ctx.touched.add(roundId);
  },

  async 'score.set'(sql, g, user, { roundId, pid, hole, value }, ctx) {
    await requireRound(sql, roundId, g, ctx);
    int(hole, 'hole', 0, 17);
    if (value == null) {
      await sql`delete from scores where round_id = ${roundId} and player_id = ${str(pid, 'pid')} and hole = ${hole}`;
    } else {
      await sql`insert into scores (round_id, player_id, hole, gross, updated_by)
        values (${roundId}, ${str(pid, 'pid')}, ${hole}, ${int(value, 'score', 1, 20)}, ${user.id})
        on conflict (round_id, player_id, hole) do update set gross = excluded.gross, updated_by = excluded.updated_by, updated_at = now()`;
    }
    ctx.touched.add(roundId);
  },

  async 'press.add'(sql, g, user, { roundId, press: p }, ctx) {
    await requireRound(sql, roundId, g, ctx);
    if (!['front', 'back', 'overall'].includes(p?.segment)) bad('press.segment');
    if (p.by !== 'a' && p.by !== 'b') bad('press.by');
    await sql`insert into presses (id, round_id, match_id, segment, start_hole, by_side, created_by)
      values (${str(p.id, 'press.id')}, ${roundId}, ${str(p.matchId, 'press.matchId')}, ${p.segment}, ${int(p.start, 'press.start', 0, 17)}, ${p.by}, ${user.id})
      on conflict (id) do nothing`;
    ctx.touched.add(roundId);
  },

  async 'press.remove'(sql, g, user, { roundId, pressId }, ctx) {
    await requireRound(sql, roundId, g, ctx);
    await sql`delete from presses where id = ${str(pressId, 'pressId')} and round_id = ${roundId}`;
    ctx.touched.add(roundId);
  },

  /** "This player is me": links the signed-in user to one player in the group. */
  async 'player.claim'(sql, g, user, { id }) {
    const [p] = await sql`select group_id, user_id from players where id = ${str(id, 'id')}`;
    if (!p || p.group_id !== g) throw new HttpError(404, 'Player not found');
    if (p.user_id && p.user_id !== user.id) throw new HttpError(409, 'Someone else already claimed that player');
    await sql.transaction([
      sql`update players set user_id = null, updated_at = now() where group_id = ${g} and user_id = ${user.id} and id <> ${id}`,
      sql`update players set user_id = ${user.id}, updated_at = now() where id = ${id}`,
    ]);
  },

  async 'payment.add'(sql, g, user, { payment: p }) {
    const id = str(p?.id, 'payment.id');
    const from = str(p.from, 'payment.from');
    const to = str(p.to, 'payment.to');
    if (from === to) bad('A player can\u2019t pay themselves');
    const amount = Number.isFinite(p.amount) && p.amount > 0 && p.amount <= 100000 ? Math.round(p.amount * 100) / 100 : bad('amount must be between 0 and 100,000');
    const players = await sql`select id from players where group_id = ${g} and id in (${from}, ${to})`;
    if (players.length !== 2) throw new HttpError(403, 'Both players must be in this group');
    const paidAt = new Date(Number.isFinite(p.paidAt) ? p.paidAt : Date.now()).toISOString();
    await sql`insert into payments (id, group_id, from_id, to_id, amount, round_id, note, paid_at, recorded_by)
      values (${id}, ${g}, ${from}, ${to}, ${amount}, ${p.roundId ?? null}, ${typeof p.note === 'string' ? p.note.slice(0, 200) : null}, ${paidAt}, ${user.id})
      on conflict (id) do nothing`;
  },

  async 'payment.remove'(sql, g, user, { id }) {
    await sql`delete from payments where id = ${str(id, 'id')} and group_id = ${g}`;
  },
};

// Postgres errors that mean "this op is wrong" rather than "try again later":
// data exceptions (22xxx) and constraint violations (23xxx).
const permanent = (e) => e instanceof HttpError || /^2[23]/.test(e.code ?? '');

export const POST = authed(handle(async (request, user) => {
  const body = await request.json().catch(() => null);
  const ops = Array.isArray(body?.ops) ? body.ops : bad('ops must be an array');
  if (ops.length > MAX_OPS) bad(`At most ${MAX_OPS} ops per request`);
  const sql = db();
  const group = await resolveGroup(sql, user, body.group);

  // Per batch: rounds already checked for access, and rounds whose money needs re-freezing.
  // The ledger is refreshed once per round at the end, not after every score tap.
  const ctx = { checked: new Set(), touched: new Set() };
  const refreshTouched = async () => { for (const id of ctx.touched) await refreshLedger(sql, id); };

  const rejected = [];
  let done = 0;
  for (const op of ops) {
    const fn = handlers[op?.type];
    try {
      if (!fn) bad(`Unknown op ${op?.type}`);
      await fn(sql, group.id, user, op, ctx);
    } catch (e) {
      if (!permanent(e)) {
        console.error('sync stopped at op', done, op?.type, e);
        await refreshTouched().catch((err) => console.error('ledger refresh failed', err));
        return json({ done, rejected, group, error: 'Server error' }, 500);
      }
      rejected.push({ index: done, type: op?.type, error: e.message });
    }
    done++;
  }
  await refreshTouched();
  return json({ done, rejected, group });
}));
