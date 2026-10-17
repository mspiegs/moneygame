// Forwards /api/auth/* to Neon Auth so its session cookie is first-party on our
// own domain. Without this, Safari (and soon other browsers) drop the cookie as
// third-party and sign-in silently fails.
//
// The iPhone app has no use for cookies (its pages aren't served from our
// domain), so it sends `x-dormie-client: native` and carries the session itself:
// it sends `Authorization: Bearer <session>` and gets the session back in an
// `x-dormie-session` header. Here that becomes the cookie Neon Auth expects.
const hopHeaders = ['host', 'connection', 'content-length', 'accept-encoding', 'cookie'];
const SESSION_COOKIE = '__Secure-neon-auth.session_token';

async function proxy(request) {
  const base = process.env.NEON_AUTH_URL;
  if (!base) return Response.json({ error: 'NEON_AUTH_URL is not set' }, { status: 500 });
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  url.searchParams.delete('path');
  if (!/^[a-z0-9\-/.]*$/i.test(path)) return Response.json({ error: 'Bad path' }, { status: 400 });

  const headers = new Headers(request.headers);
  for (const h of hopHeaders) headers.delete(h);
  // Our host's proxy headers (Vercel's x-forwarded-host etc.) make Neon Auth reject
  // the request as coming from the wrong hostname; it should see a plain client request.
  for (const h of [...headers.keys()]) if (h.startsWith('x-forwarded-') || h.startsWith('x-vercel-') || h === 'forwarded' || h === 'x-real-ip') headers.delete(h);
  // Plain-http dev (e.g. a phone on the LAN) can't hold __Secure- cookies, so
  // there they travel without the prefix and get it back on the way upstream.
  const insecure = url.protocol === 'http:';
  const native = request.headers.get('x-dormie-client') === 'native';
  headers.delete('x-dormie-client');
  if (native) {
    // Session from the Authorization header, never from cookies. And since the
    // app has no web origin of its own, it speaks for this server's origin.
    const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~%+/=-]+)$/)?.[1];
    headers.delete('authorization');
    if (token) headers.set('cookie', `${SESSION_COOKIE}=${token}`);
    headers.set('origin', url.origin);
  } else {
    // Only our own session cookies go upstream.
    const session = (request.headers.get('cookie') || '').split(/;\s*/)
      .filter((c) => c.includes('neon-auth.'))
      .map((c) => (insecure && c.startsWith('neon-auth.') ? `__Secure-${c}` : c));
    if (session.length) headers.set('cookie', session.join('; '));
  }

  const upstream = await fetch(`${base}/${path}${url.search}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });

  const out = new Headers();
  for (const [k, v] of upstream.headers) {
    if (['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) continue;
    if (k.startsWith('access-control-')) continue; // same-origin now
    out.set(k, v);
  }
  if (native) {
    // Hand the session to the app instead of setting cookies. Empty means signed out.
    const set = upstream.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    if (set) {
      const value = set.slice(SESSION_COOKIE.length + 1).split(';')[0];
      out.set('x-dormie-session', /max-age=0\b/i.test(set) ? '' : value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  // Re-scope cookies to our origin: same-site, not partitioned.
  for (const c of upstream.headers.getSetCookie()) {
    let cookie = c
      .replace(/;\s*Domain=[^;]*/i, '')
      .replace(/;\s*Partitioned/i, '')
      .replace(/;\s*SameSite=None/i, '; SameSite=Lax');
    if (insecure) cookie = cookie.replace(/^__Secure-/, '').replace(/;\s*Secure/i, '');
    out.append('set-cookie', cookie);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
