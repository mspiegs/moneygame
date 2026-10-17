import { authed, getUser } from './_lib/auth.js';
import { db, handle, HttpError, json } from './_lib/db.js';
import { resolveGroup } from './_lib/groups.js';

// Invite links: /?invite=<code>
//   GET  /api/invite?code=…                      preview (no sign-in needed): who invited you, to what, as whom
//   POST /api/invite { action: 'create', group, playerId? }   make a link (any member can)
//   POST /api/invite { action: 'accept', code }               join the group, and claim the player if the link names one

const TTL_DAYS = 30;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/o, 1/l/i)

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function findInvite(sql, code) {
  if (typeof code !== 'string' || !/^[a-z0-9]{6,20}$/.test(code)) throw new HttpError(404, 'That invite link isn’t valid.');
  const [inv] = await sql`
    select i.code, i.group_id, i.player_id, i.expires_at, g.name as group_name,
      coalesce(u.name, u.email) as inviter, p.name as player_name, p.user_id as player_user_id
    from group_invites i
    join groups g on g.id = i.group_id
    join users u on u.id = i.created_by
    left join players p on p.id = i.player_id
    where i.code = ${code}`;
  if (!inv) throw new HttpError(404, 'That invite link isn’t valid.');
  return { ...inv, expired: inv.expires_at && new Date(inv.expires_at) < new Date() };
}

export const GET = handle(async (request) => {
  const inv = await findInvite(db(), new URL(request.url).searchParams.get('code'));
  const viewer = await getUser(request).catch(() => null);
  return json({
    group: { id: inv.group_id, name: inv.group_name },
    inviter: inv.inviter,
    player: inv.player_id ? { id: inv.player_id, name: inv.player_name, taken: !!inv.player_user_id && inv.player_user_id !== viewer?.id } : null,
    expired: inv.expired,
  });
});

export const POST = authed(handle(async (request, user) => {
  const body = await request.json().catch(() => ({}));
  const sql = db();

  if (body.action === 'create') {
    const group = await resolveGroup(sql, user, body.group);
    let playerId = null;
    if (body.playerId) {
      const [p] = await sql`select id, user_id from players where id = ${body.playerId} and group_id = ${group.id}`;
      if (!p) throw new HttpError(404, 'Player not found. Wait a moment for it to sync and try again.');
      if (p.user_id) throw new HttpError(409, 'That player has already joined.');
      playerId = p.id;
      // One live link per player: reuse it rather than piling up codes.
      const [existing] = await sql`select code from group_invites
        where group_id = ${group.id} and player_id = ${playerId} and expires_at > now() + interval '7 days'`;
      if (existing) return json({ code: existing.code, url: `${new URL(request.url).origin}/?invite=${existing.code}` });
    }
    const code = newCode();
    await sql`insert into group_invites (code, group_id, player_id, created_by, expires_at)
      values (${code}, ${group.id}, ${playerId}, ${user.id}, now() + make_interval(days => ${TTL_DAYS}))`;
    return json({ code, url: `${new URL(request.url).origin}/?invite=${code}` });
  }

  if (body.action === 'accept') {
    const inv = await findInvite(sql, body.code);
    if (inv.expired) throw new HttpError(410, 'That invite has expired. Ask for a new link.');
    await sql`insert into group_members (group_id, user_id, role) values (${inv.group_id}, ${user.id}, 'member') on conflict do nothing`;

    // Claim the invited player, unless someone else has, or this user already is a player in the group.
    let claimed = null;
    if (inv.player_id) {
      const [mine] = await sql`select id from players where group_id = ${inv.group_id} and user_id = ${user.id}`;
      if (mine) claimed = mine.id;
      else {
        const [p] = await sql`update players set user_id = ${user.id}, updated_at = now()
          where id = ${inv.player_id} and user_id is null returning id`;
        claimed = p?.id ?? null;
      }
    }
    return json({ group: { id: inv.group_id, name: inv.group_name }, claimed });
  }

  throw new HttpError(400, 'Unknown action');
}));
