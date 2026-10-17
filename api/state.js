import { authed } from './_lib/auth.js';
import { db, handle, json } from './_lib/db.js';
import { resolveGroup } from './_lib/groups.js';
import { loadRounds, num } from './_lib/rounds.js';

/**
 * GET /api/state?group=<id>: everything the app shows for one group, in the
 * same shape the client keeps in memory.
 */
export const GET = authed(handle(async (request, user) => {
  const sql = db();
  const group = await resolveGroup(sql, user, new URL(request.url).searchParams.get('group'));
  const [players, courses, rounds, ledger, payments] = await Promise.all([
    sql`select id, name, handicap_index, color, user_id from players
      where group_id = ${group.id} and archived_at is null order by created_at`,
    sql`select c.id, c.name, c.par, c.stroke_index, c.last_tee_id,
        coalesce(json_agg(json_build_object('id', t.id, 'name', t.name, 'rating', t.rating, 'slope', t.slope) order by t.sort)
          filter (where t.id is not null), '[]') as tee_sets
      from courses c left join tee_sets t on t.course_id = c.id
      where c.group_id = ${group.id} and c.archived_at is null group by c.id order by c.created_at`,
    loadRounds(sql, { groupId: group.id }),
    sql`select l.round_id, l.winner_id, l.loser_id, l.amount from ledger_entries l join rounds r on r.id = l.round_id
      where r.group_id = ${group.id} and r.deleted_at is null`,
    sql`select id, from_id, to_id, amount, note, paid_at, round_id from payments where group_id = ${group.id} order by paid_at desc`,
  ]);

  return json({
    group,
    state: {
      players: players.map((p) => ({ id: p.id, name: p.name, index: num(p.handicap_index), color: p.color, userId: p.user_id })),
      courses: courses.map((c) => ({
        id: c.id, name: c.name, par: c.par, si: c.stroke_index, lastTee: c.last_tee_id,
        teeSets: c.tee_sets.map((t) => ({ ...t, rating: num(t.rating) })),
      })),
      rounds,
      ledger: ledger.map((e) => ({ roundId: e.round_id, winner: e.winner_id, loser: e.loser_id, amount: num(e.amount) })),
      payments: payments.map((p) => ({
        id: p.id, from: p.from_id, to: p.to_id, amount: num(p.amount), note: p.note,
        paidAt: new Date(p.paid_at).getTime(), roundId: p.round_id,
      })),
    },
  });
}));
