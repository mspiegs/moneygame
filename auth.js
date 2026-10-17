// Sign-in and authenticated API calls.
//
// Neon Auth (Better Auth) is reached through /api/auth on our own origin, so its
// session cookie is first-party. Our API wants a short-lived JWT instead: we get
// one from the session check's `set-auth-jwt` header and refresh it before it expires.
//
// In the iPhone app there's no cookie to lean on, so the app keeps the session
// itself (see api/auth-proxy.js): it arrives in `x-dormie-session` and is sent
// back as a Bearer token, and it's stored with Capacitor Preferences.

import { API_BASE } from './config.js';

export const NATIVE = !!globalThis.Capacitor?.isNativePlatform?.();
const AUTH = `${API_BASE}/api/auth`;
const USER_KEY = 'dormie.user';
const SESSION_KEY = 'dormie.session';
const prefs = () => globalThis.Capacitor?.Plugins?.Preferences;

let session_ = null; // native only: the Neon Auth session, as the cookie value
let loaded = !NATIVE;
async function loadSession() {
  if (loaded) return;
  session_ = (await prefs()?.get({ key: SESSION_KEY }))?.value || null;
  loaded = true;
}
async function saveSession(value) {
  session_ = value || null;
  if (value) await prefs()?.set({ key: SESSION_KEY, value });
  else await prefs()?.remove({ key: SESSION_KEY });
}

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
  await loadSession();
  const headers = {
    ...(body !== undefined && { 'content-type': 'application/json' }),
    ...(NATIVE && { 'x-dormie-client': 'native', ...(session_ && { authorization: `Bearer ${session_}` }) }),
  };
  const res = await fetch(`${AUTH}${path}`, body === undefined
    ? { credentials: 'same-origin', headers }
    : { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body) });
  takeJwt(res);
  if (NATIVE && res.headers.has('x-dormie-session')) await saveSession(res.headers.get('x-dormie-session'));
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
  if (!user) {
    jwt = null;
    if (NATIVE) await saveSession(null);
    // Signed out somewhere else, session expired, or account deleted: tell the app.
    if (cachedUser()) globalThis.dispatchEvent?.(new Event('dormie:signed-out'));
  }
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
  if (NATIVE) await saveSession(null);
}

async function token() {
  if (!jwt || Date.now() > jwtExp - 60_000) await session();
  return jwt;
}

/** fetch() against our API with the user's token. Returns parsed JSON or throws. */
export async function api(path, { method = 'GET', body } = {}) {
  const send = async () => {
    const t = await token();
    if (!t) throw new AuthError('Not signed in', 'SIGNED_OUT');
    return fetch(`${API_BASE}/api/${path}`, {
      method,
      headers: { authorization: `Bearer ${t}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  let res = await send();
  if (res.status === 401) { jwt = null; res = await send(); }
  if (res.status === 401) throw new AuthError('Not signed in', 'SIGNED_OUT');
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
