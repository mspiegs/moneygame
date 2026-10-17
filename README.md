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

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Data is saved in the browser's localStorage.
