# Dormie

A phone-first app for golf money games, starting with the Nassau.

- Teams (best ball or aggregate), the wheel, everyone-vs-everyone, or custom matches, for 2–5 players
- Net or gross with allowances, strokes off the low man, low in group, or full
- Manual presses, N-down auto presses (presses on presses), press limits, pressing the overall
- Multiple tees per course; live hole-by-hole scoring, scorecard, bet ribbons, running day net, and settle-up

## Files

- `ninepoint.js` — the 9 Point engine (5-3-1 per hole, win-by-2 sweeps, birdie doubles, carryovers, two settle-up methods).
- `games.js` — adds up every game in a round (the Nassau in `round.game`, side games like 9 Point in `round.sideGames`); used by the app, the server ledger and the Money tab.
- `nassau.js` — the betting engine. Pure functions, no DOM or storage, so it can move into a native app unchanged.
- `app.js` — the UI (Preact + htm, vendored in `vendor/`; no build step).
- `config.js` — where the API lives (`''` = same origin). The iPhone build swaps in the server's URL.
- `index.html` — page shell and styles.
- `store.js` — keeps local state in sync with the server: changes queue in an offline outbox and go to `/api/sync`; fresh state comes from `/api/state`.
- `camera.js` — takes or picks a scorecard photo, shrinks it, and sends it to `/api/scan`.
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

Sign-in is Neon Auth (managed Better Auth). The browser talks to it through `/api/auth/*`, which `api/auth-proxy.js` forwards to `NEON_AUTH_URL` so the session cookie stays first-party (Safari drops third-party cookies). API endpoints check a short-lived JWT from that session; wrap a handler in `authed()` from `api/_lib/auth.js` to require a signed-in user. Data is saved to Neon per group. Group members share players and courses, but each person only gets the rounds they played in or started (and the money from those); the server enforces it in `/api/state` and `/api/sync`. The app also keeps a copy in localStorage so it opens and scores with no signal; changes made offline sync when the connection returns. Sample players, courses and the sample round stay on the device and are never uploaded. Data saved by the old signed-out version (`dormie.v1`) is uploaded once, the first time someone signs in on that browser.

## Deploy

Hosted on Vercel (project `dormie`, production at https://dormie-gold.vercel.app). Static files at the repo root are served as-is and `api/*.js` become functions; `.vercelignore` keeps `.env`, `db/` and `scripts/` from being uploaded.

```bash
vercel --prod
```

Production needs `DATABASE_URL` and `NEON_AUTH_URL` set in Vercel. Any new domain the app is served from must be added to Neon Auth's trusted domains, or sign-in fails.

## Databases

Neon project `dormie`. Production (Vercel) uses the `main` branch; local development uses the `dev` branch, so testing never touches real data. Each branch has its own Neon Auth, so accounts are separate too. `.env` holds the dev branch's `DATABASE_URL` and `NEON_AUTH_URL`; production's live in Vercel. To start dev over from a copy of production, reset the `dev` branch from its parent in the Neon console, then run `npm run migrate`.

## iPhone app

The iPhone app is the same web app wrapped with [Capacitor](https://capacitorjs.com) (project in `ios/`, config in `capacitor.config.json`). `npm run app:build` copies the web files into `www/` and points `config.js` at the API server; Capacitor bundles `www/` into the app.

```bash
npm run ios
```

That builds `www/` for production, syncs it into the Xcode project, and opens Xcode. For the simulator against your local server instead: `DORMIE_API=http://localhost:8017 npm run app:build && npx cap sync ios`, with `npm run dev` running.

Sign-in in the app doesn't use cookies: it sends `x-dormie-client: native`, keeps the Neon Auth session itself (in Capacitor Preferences), and `api/auth-proxy.js` turns that into the cookie Neon Auth expects. API calls use the same short-lived JWT as the website. `CapacitorHttp` sends requests natively, so the API needs no CORS setup.

To ship a build: in Xcode, select the `App` target, set your team under Signing & Capabilities, then Product → Archive → Distribute App → TestFlight & App Store. The bundle ID is `com.mattspiegel.dormie`.

## Scorecard photos

`api/scan.js` reads a scorecard photo with Claude (`claude-opus-5-5`, vision + structured JSON output) and returns either a course (name, par, handicaps, tees with rating/slope) or a round's handwritten scores matched to the group's players. Nothing is saved by the endpoint: the app shows the result for the golfer to check and fix first. It needs `ANTHROPIC_API_KEY` (in `.env` locally and in Vercel for production); without it the endpoint answers 503 and the app says scanning isn't set up. A scan costs a few cents. Server-side refusal fallbacks are enabled, so a rare safety decline retries on another model instead of failing.

