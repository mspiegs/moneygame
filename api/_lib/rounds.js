import { pairwiseAll } from '../../games.js';

const num = (v) => (v == null ? null : Number(v));
export { num };

/**
 * Rounds in the client's shape ({ id, course, players, scores, game, presses, ... }).
 * Pass a group id for all of its rounds, or a round id for just that one.
 * With `visibleTo` (a user id), only rounds that user can see: ones they started, or
 * ones where one of the players is linked to their account. Everyone else's rounds
 * in the group stay private to the people in them.
 */
export async function loadRounds(sql, { groupId, roundId, visibleTo }) {
  const v = visibleTo ?? null;
  const [rounds, roundPlayers, scores, presses] = await Promise.all([
    sql`select r.id, r.course_snapshot, r.game, r.side_games, r.status, r.current_hole, r.started_at from rounds r
      where r.deleted_at is null and (r.group_id = ${groupId ?? null} or r.id = ${roundId ?? null})
        and (${v}::text is null or r.created_by = ${v} or exists (select 1 from round_players vp join players vpl on vpl.id = vp.player_id where vp.round_id = r.id and vpl.user_id = ${v}))
      order by r.started_at desc`,
    sql`select rp.round_id, rp.player_id, rp.name, rp.handicap_index, rp.color from round_players rp join rounds r on r.id = rp.round_id
      where r.deleted_at is null and (r.group_id = ${groupId ?? null} or r.id = ${roundId ?? null}) order by rp.seat`,
    sql`select s.round_id, s.player_id, s.hole, s.gross from scores s join rounds r on r.id = s.round_id
      where r.deleted_at is null and (r.group_id = ${groupId ?? null} or r.id = ${roundId ?? null}) and s.gross is not null`,
    sql`select p.id, p.round_id, p.match_id, p.segment, p.start_hole, p.by_side from presses p join rounds r on r.id = p.round_id
      where r.deleted_at is null and (r.group_id = ${groupId ?? null} or r.id = ${roundId ?? null}) order by p.created_at`,
  ]);
  const byRound = new Map(rounds.map((r) => [r.id, {
    id: r.id,
    createdAt: new Date(r.started_at).getTime(),
    course: r.course_snapshot,
    players: [],
    scores: {},
    game: r.game,
    sideGames: r.side_games ?? [],
    presses: [],
    hole: r.current_hole,
    status: r.status,
  }]));
  // Rows for rounds this user can't see are skipped, so nothing about them is returned.
  for (const p of roundPlayers) {
    const r = byRound.get(p.round_id);
    if (!r) continue;
    r.players.push({ id: p.player_id, name: p.name, index: num(p.handicap_index), color: p.color });
    r.scores[p.player_id] = Array(18).fill(null);
  }
  for (const s of scores) {
    const row = byRound.get(s.round_id)?.scores[s.player_id];
    if (row) row[s.hole] = s.gross;
  }
  for (const p of presses) {
    byRound.get(p.round_id)?.presses.push({ id: p.id, matchId: p.match_id, segment: p.segment, start: p.start_hole, by: p.by_side });
  }
  return [...byRound.values()];
}

/**
 * Rewrites a round's ledger rows: the pairwise money from its finished bets in every game
 * when the round is final, nothing otherwise (live, reopened or deleted).
 */
/** Can this user see (and so change) this round? They started it, or they're one of its players. */
export async function canSeeRound(sql, roundId, userId) {
  const [r] = await sql`select 1 from rounds r where r.id = ${roundId} and (r.created_by = ${userId}
    or exists (select 1 from round_players vp join players vpl on vpl.id = vp.player_id where vp.round_id = r.id and vpl.user_id = ${userId}))`;
  return !!r;
}

export async function refreshLedger(sql, roundId) {
  const [r] = await sql`select status, deleted_at from rounds where id = ${roundId}`;
  if (!r || r.status !== 'final' || r.deleted_at) {
    await sql`delete from ledger_entries where round_id = ${roundId}`;
    return;
  }
  const [round] = await loadRounds(sql, { roundId });
  const entries = pairwiseAll(round);
  await sql.transaction([
    sql`delete from ledger_entries where round_id = ${roundId}`,
    sql`insert into ledger_entries (round_id, winner_id, loser_id, amount)
      select ${roundId}, w, l, a from unnest(${entries.map((e) => e.winner)}::text[], ${entries.map((e) => e.loser)}::text[],
        ${entries.map((e) => e.amount)}::numeric[]) as t(w, l, a)`,
  ]);
}
