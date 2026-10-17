import { HttpError } from './db.js';

/**
 * The group a request acts on. With an id, the user must be a member. Without
 * one, it's the user's first group, created on first use.
 */
export async function resolveGroup(sql, user, groupId) {
  if (groupId) {
    const [g] = await sql`select g.id, g.name, m.role from group_members m join groups g on g.id = m.group_id
      where m.group_id = ${groupId} and m.user_id = ${user.id}`;
    if (!g) throw new HttpError(403, 'Not a member of that group');
    return g;
  }
  const [g] = await sql`select g.id, g.name, m.role from group_members m join groups g on g.id = m.group_id
    where m.user_id = ${user.id} order by m.joined_at limit 1`;
  if (g) return g;
  // Deterministic id so two first requests racing each other make one group.
  const id = `g-${user.id}`;
  const name = `${(user.name || user.email || 'My').split(/[\s@]/)[0]}'s group`;
  await sql.transaction([
    sql`insert into groups (id, name, created_by) values (${id}, ${name}, ${user.id}) on conflict (id) do nothing`,
    sql`insert into group_members (group_id, user_id, role) values (${id}, ${user.id}, 'owner') on conflict do nothing`,
  ]);
  return { id, name, role: 'owner' };
}
