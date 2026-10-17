import { authed } from './_lib/auth.js';
import { db, json } from './_lib/db.js';

/** GET /api/me: the signed-in user and the groups they belong to. */
export const GET = authed(async (request, user) => {
  const sql = db();
  const [me] = await sql`select id, email, name, created_at from users where id = ${user.id}`;
  const groups = await sql`
    select g.id, g.name, m.role from group_members m join groups g on g.id = m.group_id
    where m.user_id = ${user.id} order by m.joined_at`;
  return json({ user: me, groups });
});
