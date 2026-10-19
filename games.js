// Every game in a round, added up. A round has one Nassau (round.game; it may
// have no matches) plus any number of side games (round.sideGames), currently
// 9 Point. Pure functions: used by the app, the server ledger and the Money tab.

import * as N from './nassau.js';
import { computeNinePoint } from './ninepoint.js';

export const sideGamesOf = (round) => round.sideGames || [];
export const hasNassau = (round) => (round.game?.matches?.length ?? 0) > 0;

const round2 = (v) => Math.round(v * 100) / 100;

/** Results for each side game, in order. */
export function sideResults(round) {
  return sideGamesOf(round).map((g) => (g.type === 'ninepoint' ? computeNinePoint(round, g) : null)).filter(Boolean);
}

/**
 * The Nassau's settleRound result, with settled/projected widened to include every
 * side game. 9 Point money accrues hole by hole, so it's the same in both.
 * Extra field: side = sideResults(round).
 */
export function settleAll(round) {
  const nassau = N.settleRound(round);
  const side = sideResults(round);
  const settled = { ...nassau.settled };
  const projected = { ...nassau.projected };
  for (const r of side)
    for (const [id, v] of Object.entries(r.money)) {
      settled[id] = round2((settled[id] || 0) + v);
      projected[id] = round2((projected[id] || 0) + v);
    }
  return { ...nassau, settled, projected, nassauSettled: nassau.settled, nassauProjected: nassau.projected, side };
}

/** Who won what from whom across all games, netted per pair: [{ winner, loser, amount }]. */
export function pairwiseAll(round, { projected = false } = {}) {
  const net = new Map(); // "a|b" (a < b) -> what a won from b
  const add = ({ winner, loser, amount }) => {
    const key = winner < loser ? `${winner}|${loser}` : `${loser}|${winner}`;
    net.set(key, (net.get(key) || 0) + (winner < loser ? amount : -amount));
  };
  N.pairwiseRound(round, { projected }).forEach(add);
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
  if (hasNassau(round)) parts.push(`${N.SEGMENT_KEYS.map((k) => round.game.stakes[k]).join('-')} Nassau`);
  const nines = sideGamesOf(round).filter((g) => g.type === 'ninepoint').length;
  if (nines) parts.push(nines > 1 ? `${nines}× 9 Point` : '9 Point');
  return parts.join(' + ') || 'No games';
}

/** Number of things being played for: Nassau matches plus side games. */
export const gameCount = (round) => (round.game?.matches?.length ?? 0) + sideGamesOf(round).length;
