import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db, json } from './db.js';

let jwks;
const seen = new Set(); // user ids already upserted by this instance

/**
 * The signed-in user from the request's Bearer token (a Neon Auth JWT), or null.
 * Also makes sure the user has a row in our users table.
 */
export async function getUser(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const base = process.env.NEON_AUTH_URL;
  jwks ??= createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: new URL(base).origin, audience: new URL(base).origin }));
  } catch {
    return null;
  }
  const user = { id: payload.sub, email: payload.email ?? null, name: payload.name ?? null };
  if (!seen.has(user.id)) {
    await db()`insert into users (id, email, name) values (${user.id}, ${user.email}, ${user.name})
      on conflict (id) do update set email = excluded.email, name = coalesce(users.name, excluded.name)`;
    seen.add(user.id);
  }
  return user;
}

/** Wraps a handler so it only runs for signed-in users: handler(request, user). */
export const authed = (handler) => async (request) => {
  const user = await getUser(request);
  if (!user) return json({ error: 'Not signed in' }, 401);
  return handler(request, user);
};
