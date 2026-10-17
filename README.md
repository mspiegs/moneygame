# Dormie

A phone-first app for golf money games, starting with the Nassau.

- Teams (best ball or aggregate), the wheel, everyone-vs-everyone, or custom matches, for 2–5 players
- Net or gross with allowances, strokes off the low man, low in group, or full
- Manual presses, N-down auto presses (presses on presses), press limits, pressing the overall
- Multiple tees per course; live hole-by-hole scoring, scorecard, bet ribbons, running day net, and settle-up

## Files

- `nassau.js` — the betting engine. Pure functions, no DOM or storage, so it can move into a native app unchanged.
- `app.js` — the UI (Preact + htm, loaded from a CDN; no build step).
- `index.html` — page shell and styles.
- `store.js` — keeps local state in sync with the server: changes queue in an offline outbox and go to `/api/sync`; fresh state comes from `/api/state`.
- `auth.js` — sign-in and authenticated API calls from the browser.
- `api/` — serverless API (Vercel functions, Web-standard `GET`/`POST` handlers). Files under `api/_lib/` are shared helpers, not endpoints.
- `db/migrations/` — Postgres schema (Neon), applied in order by `npm run migrate`.
- `scripts/dev.js` — local server for the app and the API.

## Run locally

```bash
npm install
cp .env.example .env   # then set DATABASE_URL to your Neon connection string
npm run migrate
npm run dev
```

Then open http://localhost:8017. `/api/health` reports whether the database is reachable.

Sign-in is Neon Auth (managed Better Auth). The browser talks to it through `/api/auth/*`, which `api/auth-proxy.js` forwards to `NEON_AUTH_URL` so the session cookie stays first-party (Safari drops third-party cookies). API endpoints check a short-lived JWT from that session; wrap a handler in `authed()` from `api/_lib/auth.js` to require a signed-in user. Data is saved to Neon per group. The app also keeps a copy in localStorage so it opens and scores with no signal; changes made offline sync when the connection returns. Sample players, courses and the sample round stay on the device and are never uploaded. Data saved by the old signed-out version (`dormie.v1`) is uploaded once, the first time someone signs in on that browser.
