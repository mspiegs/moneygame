// Wolf: 3 to 5 players, one of them the wolf on each hole, in rotation.
//
// On each tee the wolf watches the drives and picks a partner (wolf & partner
// vs the rest), or goes it alone after seeing them all (lone wolf), or calls it
// before anyone hits (blind wolf). Low net ball on each side wins the hole.
//
// Money is pair by pair: every player on the winning side wins the hole's value
// from every player on the losing side. A partner hole is worth 1 point, a lone
// wolf `lone` points and a blind wolf `blind` points.
// Options (per game):
//   ties        'push': a tied hole is worth nothing. 'carry': its value rides on the next hole.
//   lastHoles   Holes left after the full rotations (17-18 with 4 players, 16-18 with 5):
//               'trailing' makes whoever is furthest behind the wolf; 'rotate' keeps rotating.
//   wolfHits    'first' or 'last' in the tee order (only changes the order shown).
//   birdies     A natural birdie on the winning side doubles the hole.
// Picks live on the game: picks[hole] = a partner's player id, 'lone' or 'blind'.
// Pure functions, like nassau.js: no DOM or storage.

import { matchStrokes, netScore } from './nassau.js';

export function defaultWolf(players = []) {
  return {
    id: `wf-${Math.random().toString(36).slice(2, 8)}`,
    type: 'wolf',
    players: players.slice(0, 5), // rotation order: players[0] is the wolf on hole 1
    stake: 1, // $ per point
    handicap: { mode: 'net', allowance: 100, strokesOff: 'match' }, // 'match' = off the low man, or 'full'
    lone: 2,
    blind: 3, // 0 = no blind wolf
    ties: 'push',
    lastHoles: 'trailing',
    wolfHits: 'last',
    birdies: false,
    picks: {},
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Strokes each player gets. */
export function wolfStrokes(round, game) {
  return matchStrokes({ ...round, game: { handicap: game.handicap } }, { a: game.players, b: [] });
}

/** Holes played in full rotations; the rest are the leftover holes. */
export const rotationHoles = (game) => 18 - (18 % game.players.length);

/** Who is the wolf on hole `h`, given each player's points before it. */
export function wolfOn(game, h, totals) {
  const ids = game.players;
  if (h < rotationHoles(game) || game.lastHoles !== 'trailing') return ids[h % ids.length];
  // Furthest behind; a tie goes to whoever comes first in the rotation.
  return ids.reduce((low, id) => (totals[id] < totals[low] ? id : low), ids[0]);
}

/** Tee order on a hole: the rotation starting from the wolf, with the wolf first or last. */
export function teeOrder(game, wolf) {
  const ids = game.players;
  const i = ids.indexOf(wolf);
  const rest = [...ids.slice(i + 1), ...ids.slice(0, i)];
  return game.wolfHits === 'first' ? [wolf, ...rest] : [...rest, wolf];
}

/** What a pick means: the wolf's side, the other side, and the multiplier. Null if it doesn't fit. */
export function sides(game, wolf, pick) {
  const others = game.players.filter((id) => id !== wolf);
  if (pick === 'lone') return { a: [wolf], b: others, mult: game.lone };
  if (pick === 'blind' && game.blind > 0) return { a: [wolf], b: others, mult: game.blind };
  if (others.includes(pick)) return { a: [wolf, pick], b: others.filter((id) => id !== pick), mult: 1 };
  return null;
}

/**
 * Plays the game through the scores and picks so far.
 * holes[h] = { wolf, pick, a, b, mult, value, winner ('a' | 'b' | 'tie' | null), points: {id: n},
 *              carried, birdie, needsPick }
 *   winner is null until every player has a score and the wolf has picked.
 * totals: {id: points}; money: {id: $}; pairwise: [{ winner, loser, amount }]
 * pendingCarry: points riding on the next hole (ties: 'carry').
 */
export function computeWolf(round, game) {
  const ids = game.players;
  const strokes = wolfStrokes(round, game);
  const { par, si } = round.course;
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  const pairs = new Map(); // "x|y" (x < y) -> points x won from y
  const holes = [];
  let carry = 0;
  let thru = 0;
  for (let h = 0; h < 18; h++) {
    const wolf = wolfOn(game, h, totals);
    const pick = game.picks?.[h] ?? null;
    const gross = ids.map((id) => round.scores[id]?.[h]);
    const scored = gross.every((g) => g != null);
    if (scored && thru === h) thru = h + 1;
    const s = pick && sides(game, wolf, pick);
    const hole = { wolf, pick: s ? pick : null, a: s?.a ?? null, b: s?.b ?? null, mult: s?.mult ?? 1, value: 0,
      winner: null, points: {}, carried: carry, birdie: false, needsPick: scored && !s };
    holes.push(hole);
    if (!scored || !s) continue;

    const net = (id) => (game.handicap.mode === 'gross' ? round.scores[id][h] : netScore(round.scores[id][h], strokes[id], si[h]));
    const best = (side) => Math.min(...side.map(net));
    const diff = best(s.a) - best(s.b);
    if (diff === 0) {
      hole.winner = 'tie';
      if (game.ties === 'carry') carry += s.mult;
      continue;
    }
    const [win, lose] = diff < 0 ? [s.a, s.b] : [s.b, s.a];
    hole.winner = diff < 0 ? 'a' : 'b';
    hole.birdie = !!game.birdies && win.some((id) => round.scores[id][h] < par[h]);
    hole.value = (s.mult + carry) * (hole.birdie ? 2 : 1);
    carry = 0;
    for (const w of win)
      for (const l of lose) {
        totals[w] += hole.value;
        totals[l] -= hole.value;
        hole.points[w] = (hole.points[w] || 0) + hole.value;
        hole.points[l] = (hole.points[l] || 0) - hole.value;
        const key = w < l ? `${w}|${l}` : `${l}|${w}`;
        pairs.set(key, (pairs.get(key) || 0) + (w < l ? hole.value : -hole.value));
      }
  }
  const money = Object.fromEntries(ids.map((id) => [id, round2(totals[id] * game.stake)]));
  const pairwise = [];
  for (const [key, v] of pairs) {
    const [x, y] = key.split('|');
    const amount = round2(Math.abs(v) * game.stake);
    if (amount) pairwise.push(v > 0 ? { winner: x, loser: y, amount } : { winner: y, loser: x, amount });
  }
  return { game, holes, totals, thru, pendingCarry: carry, strokes, money, pairwise };
}

/** One-line description of a game's setup, e.g. "$1/pt · lone ×2 · blind ×3 · carryovers". */
export function wolfSummary(game) {
  return [
    `$${game.stake}/pt`,
    `lone ×${game.lone}`,
    game.blind > 0 && `blind ×${game.blind}`,
    game.ties === 'carry' && 'carryovers',
    game.birdies && 'birdies double',
    game.handicap.mode === 'gross' ? 'gross' : `net${game.handicap.allowance !== 100 ? ` ${game.handicap.allowance}%` : ''}`,
  ].filter(Boolean).join(' · ');
}
