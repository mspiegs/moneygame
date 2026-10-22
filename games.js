// Every game in a round, added up. A round's first Nassau lives in round.game
// (it may have no matches); more Nassaus, each with its own settings, and 9 Point
// games live in round.sideGames ({ type: 'nassau' | 'ninepoint', ... }).
// Extra Nassaus' match ids are prefixed with the game id, so presses (which point
// at a match id) never collide across Nassaus.
// Pure functions: used by the app, the server ledger and the Money tab.

import * as N from './nassau.js';
import { computeNinePoint } from './ninepoint.js';

export const sideGamesOf = (round) => round.sideGames || [];

/**
 * Every Nassau in the round with matches: [{ id, game, view }], where `view` is the
 * round as that Nassau's engine sees it ({ ...round, game }).
 */
export function nassausOf(round) {
  const out = [];
  if (round.game?.matches?.length) out.push({ id: 'nassau', game: round.game, view: round });
  for (const g of sideGamesOf(round)) if (g.type === 'nassau' && g.matches?.length) out.push({ id: g.id, game: g, view: { ...round, game: g } });
  return out;
}
export const hasNassau = (round) => nassausOf(round).length > 0;

const round2 = (v) => Math.round(v * 100) / 100;

/** Results for each side game, in order. */
export function sideResults(round) {
  return sideGamesOf(round).filter((g) => g.type === 'ninepoint').map((g) => computeNinePoint(round, g));
}

/**
 * Money from every game. Shape matches nassau.js's settleRound so screens can use it as before:
 *   settled / projected: { playerId: $ } across all games (9 Point money accrues hole by hole,
 *                        so it's the same in both)
 *   matches: every Nassau's computed matches, each with `view` (that Nassau's round view,
 *            for its stakes and press rules) and `gameId`
 *   nassaus: [{ id, game, view, matches }]; side: 9 Point results
 */
export function settleAll(round) {
  const side = sideResults(round);
  const settled = Object.fromEntries(round.players.map((p) => [p.id, 0]));
  const projected = { ...settled };
  const nassaus = nassausOf(round).map((n) => {
    const r = N.settleRound(n.view);
    for (const id in settled) {
      settled[id] = round2(settled[id] + (r.settled[id] || 0));
      projected[id] = round2(projected[id] + (r.projected[id] || 0));
    }
    return { ...n, matches: r.matches.map((c) => ({ ...c, view: n.view, gameId: n.id })) };
  });
  for (const r of side)
    for (const [id, v] of Object.entries(r.money)) {
      settled[id] = round2((settled[id] || 0) + v);
      projected[id] = round2((projected[id] || 0) + v);
    }
  return { settled, projected, matches: nassaus.flatMap((n) => n.matches), nassaus, side };
}

/** Who won what from whom across all games, netted per pair: [{ winner, loser, amount }]. */
export function pairwiseAll(round, { projected = false } = {}) {
  const net = new Map(); // "a|b" (a < b) -> what a won from b
  const add = ({ winner, loser, amount }) => {
    const key = winner < loser ? `${winner}|${loser}` : `${loser}|${winner}`;
    net.set(key, (net.get(key) || 0) + (winner < loser ? amount : -amount));
  };
  for (const n of nassausOf(round)) N.pairwiseRound(n.view, { projected }).forEach(add);
  for (const r of sideResults(round)) r.pairwise.forEach(add);
  const out = [];
  for (const [key, v] of net) {
    const [a, b] = key.split('|');
    const amount = round2(Math.abs(v));
    if (amount) out.push(v > 0 ? { winner: a, loser: b, amount } : { winner: b, loser: a, amount });
  }
  return out;
}

/** Short description of the round's games, e.g. "10-10-10 Nassau + 9 Point". */
export function gamesLabel(round) {
  const parts = [];
  const ns = nassausOf(round);
  if (ns.length === 1) parts.push(`${N.SEGMENT_KEYS.map((k) => ns[0].game.stakes[k]).join('-')} Nassau`);
  else if (ns.length > 1) parts.push(`${ns.length} Nassaus`);
  const nines = sideGamesOf(round).filter((g) => g.type === 'ninepoint').length;
  if (nines) parts.push(nines > 1 ? `${nines}× 9 Point` : '9 Point');
  return parts.join(' + ') || 'No games';
}

/** Number of things being played for: Nassau matches plus side games. */
export const gameCount = (round) => nassausOf(round).reduce((t, n) => t + n.game.matches.length, 0) + sideGamesOf(round).filter((g) => g.type === 'ninepoint').length;
