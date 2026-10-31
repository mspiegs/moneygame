// Hammer: two sides (1 v 1 or 2 v 2), each hole worth a set amount per man.
//
// At any point on a hole a side can throw the hammer, doubling the hole. The
// other side either accepts (play on at double, and now they hold the hammer
// and can throw it back) or declines (they lose the hole at its value before
// that hammer). Low net ball on each side wins the hole.
// Options (per game):
//   first     Who can throw the first hammer on a hole: 'either' side, the side 'behind'
//             in the game, or the side that 'lost' the last decided hole (tied: either).
//   max       Most hammers on one hole; 0 = no limit.
//   ties      'push': a tied hole is worth nothing. 'carry': its value adds to the next hole.
//   birdies   A natural birdie on the winning side doubles the hole (not on a declined hole).
// Throws live on the game: hammers[hole] = { by: 'a' | 'b' (first thrower), n: hammers thrown,
// declined: true if the last one was turned down }. Throws alternate, so `by` and `n` say who
// threw each one.
// Pure functions, like nassau.js: no DOM or storage.

import { matchStrokes, netScore } from './nassau.js';

export function defaultHammer(players = []) {
  const [a, b] = players.length === 4 ? [[players[0], players[3]], [players[1], players[2]]] : [players.slice(0, 1), players.slice(1, 2)];
  return {
    id: `hm-${Math.random().toString(36).slice(2, 8)}`,
    type: 'hammer',
    a,
    b,
    stake: 5, // $ a hole, per man, before any hammers
    handicap: { mode: 'net', allowance: 100, strokesOff: 'match' }, // 'match' = off the low man, or 'full'
    first: 'either',
    max: 0,
    ties: 'push',
    birdies: false,
    hammers: {},
  };
}

const round2 = (v) => Math.round(v * 100) / 100;
const other = (side) => (side === 'a' ? 'b' : 'a');

/** Sides must be the same size, 1 or 2 players each. */
export const sidesOk = (game) => game.a.length >= 1 && game.a.length <= 2 && game.a.length === game.b.length;

export function hammerStrokes(round, game) {
  return matchStrokes({ ...round, game: { handicap: game.handicap } }, game);
}

/**
 * Plays the game through the scores and throws so far. Values are in $ per man.
 * holes[h] = { start, value, n, by, declined, last (side that threw last), holder (who can
 *              throw next: 'a' | 'b' | 'either' | null), winner ('a' | 'b' | 'tie' | null),
 *              won ($ per man to the winners), birdie, scored }
 * money: {id: $}; side: { a: $, b: $ } per man; pairwise: [{ winner, loser, amount }]
 * pendingCarry: $ carried to the next hole (ties: 'carry').
 */
export function computeHammer(round, game) {
  const ids = [...game.a, ...game.b];
  const strokes = hammerStrokes(round, game);
  const { par, si } = round.course;
  const side = { a: 0, b: 0 };
  const holes = [];
  let carry = 0;
  let lastLoser = null;
  let thru = 0;
  for (let h = 0; h < 18; h++) {
    const t = game.hammers?.[h];
    const n = t?.n > 0 && (t.by === 'a' || t.by === 'b') ? t.n : 0;
    const by = n ? t.by : null;
    const declined = !!(n && t.declined);
    const last = n ? (n % 2 ? by : other(by)) : null;
    const start = game.stake + carry;
    const scored = ids.every((id) => round.scores[id]?.[h] != null);
    if (scored && thru === h) thru = h + 1;

    // Who may throw next.
    let holder = null;
    if (!declined && !scored && !(game.max > 0 && n >= game.max)) {
      if (n) holder = other(last);
      else if (game.first === 'behind') holder = side.a < side.b ? 'a' : side.b < side.a ? 'b' : 'either';
      else if (game.first === 'lost') holder = lastLoser ?? 'either';
      else holder = 'either';
    }
    const hole = { start, value: start * 2 ** n, n, by, declined, last, holder, winner: null, won: 0, birdie: false, scored };
    holes.push(hole);

    let winner = null;
    if (declined) {
      // Turning down the hammer concedes the hole at its value before that hammer.
      winner = last;
      hole.value = start * 2 ** (n - 1);
    } else if (scored) {
      const net = (id) => (game.handicap.mode === 'gross' ? round.scores[id][h] : netScore(round.scores[id][h], strokes[id], si[h]));
      const best = (s) => Math.min(...game[s].map(net));
      const diff = best('a') - best('b');
      if (diff === 0) {
        hole.winner = 'tie';
        carry = game.ties === 'carry' ? hole.value : 0;
        continue;
      }
      winner = diff < 0 ? 'a' : 'b';
      hole.birdie = !!game.birdies && game[winner].some((id) => round.scores[id][h] < par[h]);
    }
    if (!winner) continue;
    hole.winner = winner;
    hole.won = hole.value * (hole.birdie ? 2 : 1);
    side[winner] += hole.won;
    side[other(winner)] -= hole.won;
    lastLoser = other(winner);
    carry = 0;
  }
  const money = {};
  for (const s of ['a', 'b']) for (const id of game[s]) money[id] = round2(side[s]);
  // Equal sides: each winner's take is split evenly across the losers.
  const lead = side.a > 0 ? 'a' : side.b > 0 ? 'b' : null;
  const pairwise = [];
  if (lead) {
    const amount = round2(side[lead] / game[lead].length);
    for (const w of game[lead]) for (const l of game[other(lead)]) pairwise.push({ winner: w, loser: l, amount });
  }
  return { game, holes, side: { a: round2(side.a), b: round2(side.b) }, money, pairwise, thru, pendingCarry: carry, strokes, totals: money };
}

/** The throws on a hole after a side hammers, declines, or takes back the last tap. */
export function nextThrow(t, action, side) {
  const n = t?.n || 0;
  if (action === 'hammer') return n ? { ...t, n: n + 1 } : { by: side, n: 1, declined: false };
  if (action === 'decline') return n ? { ...t, declined: true } : t;
  // undo
  if (t?.declined) return { ...t, declined: false };
  return n > 1 ? { ...t, n: n - 1 } : null;
}

const FIRST = { either: 'either side first', behind: 'side behind first', lost: 'loser of last hole first' };

/** One-line description, e.g. "$5 a hole · either side first · max 3 · carryovers". */
export function hammerSummary(game) {
  return [
    `$${game.stake} a hole`,
    FIRST[game.first],
    game.max > 0 && `max ${game.max}`,
    game.ties === 'carry' && 'carryovers',
    game.birdies && 'birdies double',
    game.handicap.mode === 'gross' ? 'gross' : `net${game.handicap.allowance !== 100 ? ` ${game.handicap.allowance}%` : ''}`,
  ].filter(Boolean).join(' · ');
}
