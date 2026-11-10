// Every game in a round, added up. A round's first Nassau lives in round.game
// (it may have no matches); more Nassaus, each with its own settings, and 9 Point
// Wolf, Hammer, Vegas and Snake games live in round.sideGames ({ type: 'nassau' | 'ninepoint' | 'wolf' | ..., ... }).
// Extra Nassaus' match ids are prefixed with the game id, so presses (which point
// at a match id) never collide across Nassaus.
// Pure functions: used by the app, the server ledger and the Money tab.

import * as N from './nassau.js';
import { computeNinePoint } from './ninepoint.js';
import { computeWolf } from './wolf.js';
import { computeHammer } from './hammer.js';
import { computeVegas } from './vegas.js';
import { computeSnake } from './snake.js';

/** Side games that aren't Nassaus, and how to score each. */
const SCORERS = { ninepoint: computeNinePoint, wolf: computeWolf, hammer: computeHammer, vegas: computeVegas, snake: computeSnake };

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

/** Results for each side game (9 Point, Wolf, Hammer, Vegas, Snake), in order. Each has { game, money, pairwise, totals, holes }. */
export function sideResults(round) {
  return sideGamesOf(round).filter((g) => SCORERS[g.type]).map((g) => SCORERS[g.type](round, g));
}

/**
 * Money from every game. Shape matches nassau.js's settleRound so screens can use it as before:
 *   settled / projected: { playerId: $ } across all games (9 Point money accrues hole by hole,
 *                        so it's the same in both)
 *   matches: every Nassau's computed matches, each with `view` (that Nassau's round view,
 *            for its stakes and press rules) and `gameId`
 *   nassaus: [{ id, game, view, matches }]; side: every other game's results
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
  for (const [type, name] of [['ninepoint', '9 Point'], ['wolf', 'Wolf'], ['hammer', 'Hammer'], ['vegas', 'Vegas'], ['snake', 'Snake']]) {
    const n = sideGamesOf(round).filter((g) => g.type === type).length;
    if (n) parts.push(n > 1 ? `${n}× ${name}` : name);
  }
  return parts.join(' + ') || 'No games';
}

/** Number of things being played for: Nassau matches plus side games. */
export const gameCount = (round) => nassausOf(round).reduce((t, n) => t + n.game.matches.length, 0) + sideGamesOf(round).filter((g) => SCORERS[g.type]).length;

/**
 * How a finished round gets paid. Players pay whoever they like (one loser pays one winner
 * the lot, his partner pays the other), so payments recorded against the round come first,
 * then the fewest payments that square up whatever is left.
 *   balances: { playerId: $ } (the round's settled money); payments: that round's payments
 *   transfers: [{ from, to, amount, paid }]; left: { playerId: $ still to collect (+) or pay (-) }
 */
export function settlePlan(balances, payments = []) {
  const left = Object.fromEntries(Object.entries(balances).map(([id, v]) => [id, round2(v)]));
  const paid = new Map();
  for (const p of payments) {
    if (!(p.from in left) || !(p.to in left)) continue;
    left[p.from] = round2(left[p.from] + p.amount);
    left[p.to] = round2(left[p.to] - p.amount);
    const key = `${p.from}|${p.to}`;
    paid.set(key, round2((paid.get(key) || 0) + p.amount));
  }
  const transfers = [...paid].map(([key, amount]) => {
    const [from, to] = key.split('|');
    return { from, to, amount, paid: true };
  });
  for (const t of N.settleUp(left)) transfers.push({ ...t, paid: false });
  return { transfers, left };
}
