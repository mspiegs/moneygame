// Sign-in and authenticated API calls.
//
// Neon Auth (Better Auth) is reached through /api/auth on our own origin, so its
// session cookie is first-party. Our API wants a short-lived JWT instead: we get
// one from the session check's `set-auth-jwt` header and refresh it before it expires.

const AUTH = '/api/auth';
const USER_KEY = 'dormie.user';

let jwt = null;
let jwtExp = 0;

function remember(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
}

/** The last signed-in user, for opening the app offline on the course. */
export function cachedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

function takeJwt(res) {
  const t = res.headers.get('set-auth-jwt');
  if (!t) return;
  jwt = t;
  try { jwtExp = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { jwtExp = 0; }
}

async function call(path, body) {
  const res = await fetch(`${AUTH}${path}`, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  takeJwt(res);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AuthError(data?.message || 'Something went wrong. Try again.', data?.code);
  return data;
}

export class AuthError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** The signed-in user, or null. Throws (TypeError) when the network is down. */
export async function session() {
  const data = await call('/get-session');
  const user = data?.user ? { id: data.user.id, email: data.user.email, name: data.user.name } : null;
  if (!user) jwt = null;
  remember(user);
  return user;
}

export async function signIn(email, password) {
  await call('/sign-in/email', { email, password });
  return session();
}

export async function signUp(name, email, password) {
  await call('/sign-up/email', { name, email, password });
  return session();
}

export async function signOut() {
  jwt = null;
  remember(null);
  await call('/sign-out', {}).catch(() => {});
}

async function token() {
  if (!jwt || Date.now() > jwtExp - 60_000) await session();
  return jwt;
}

/** fetch() against our API with the user's token. Returns parsed JSON or throws. */
export async function api(path, { method = 'GET', body } = {}) {
  const send = async () => fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${await token()}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 401) { jwt = null; res = await send(); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
