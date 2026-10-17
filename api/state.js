import { authed } from './_lib/auth.js';
import { db, handle, json } from './_lib/db.js';
import { resolveGroup } from './_lib/groups.js';

const num = (v) => (v == null ? null : Number(v));

/**
 * GET /api/state?group=<id>: everything the app shows for one group, in the
 * same shape the client keeps in memory.
 */
export const GET = authed(handle(async (request, user) => {
  const sql = db();
  const group = await resolveGroup(sql, user, new URL(request.url).searchParams.get('group'));
  const [players, courses, rounds, roundPlayers, scores, presses] = await Promise.all([
    sql`select id, name, handicap_index, color, user_id from players
      where group_id = ${group.id} and archived_at is null order by created_at`,
    sql`select c.id, c.name, c.par, c.stroke_index, c.last_tee_id,
        coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'rating', t.rating, 'slope', t.slope) order by t.sort)
          filter (where t.id is not null), '[]') as tee_sets
      from courses c left join tee_sets t on t.course_id = c.id
      where c.group_id = ${group.id} and c.archived_at is null group by c.id order by c.created_at`,
    sql`select id, course_snapshot, game, status, current_hole, started_at from rounds
      where group_id = ${group.id} and deleted_at is null order by started_at desc`,
    sql`select rp.round_id, rp.player_id, rp.name, rp.handicap_index, rp.color from round_players rp
      join rounds r on r.id = rp.round_id where r.group_id = ${group.id} and r.deleted_at is null order by rp.seat`,
    sql`select s.round_id, s.player_id, s.hole, s.gross from scores s
      join rounds r on r.id = s.round_id where r.group_id = ${group.id} and r.deleted_at is null and s.gross is not null`,
    sql`select p.id, p.round_id, p.match_id, p.segment, p.start_hole, p.by_side from presses p
      join rounds r on r.id = p.round_id where r.group_id = ${group.id} and r.deleted_at is null order by p.created_at`,
  ]);

  const byRound = new Map(rounds.map((r) => [r.id, {
    id: r.id,
    createdAt: new Date(r.started_at).getTime(),
    course: r.course_snapshot,
    players: [],
    scores: {},
    game: r.game,
    presses: [],
    hole: r.current_hole,
    status: r.status,
  }]));
  for (const p of roundPlayers) {
    const r = byRound.get(p.round_id);
    r.players.push({ id: p.player_id, name: p.name, index: num(p.handicap_index), color: p.color });
    r.scores[p.player_id] = Array(18).fill(null);
  }
  for (const s of scores) {
    const row = byRound.get(s.round_id)?.scores[s.player_id];
    if (row) row[s.hole] = s.gross;
  }
  for (const p of presses) {
    byRound.get(p.round_id).presses.push({ id: p.id, matchId: p.match_id, segment: p.segment, start: p.start_hole, by: p.by_side });
  }

  return json({
    group,
    state: {
      players: players.map((p) => ({ id: p.id, name: p.name, index: num(p.handicap_index), color: p.color, userId: p.user_id })),
      courses: courses.map((c) => ({
        id: c.id, name: c.name, par: c.par, si: c.stroke_index, lastTee: c.last_tee_id,
        teeSets: c.tee_sets.map((t) => ({ ...t, rating: num(t.rating) })),
      })),
      rounds: [...byRound.values()],
    },
  });
}));
