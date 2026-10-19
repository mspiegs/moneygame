// 9 Point: a three-player game, scored hole by hole.
//
// Each hole splits 9 points: 5-3-1 for best, middle and worst score.
//   Two tied for best: 4-4-1. Two tied for worst: 5-2-2. All three tied: 3-3-3.
// Options (per game):
//   sweep          Best score beating both others by 2+ takes all 9 (9-0-0).
//   birdieDoubles  A sweep made with a natural birdie pays double (18).
//   netBirdies     ...and a net birdie counts too.
//   carryovers     All three tied: nobody scores, and the next hole is worth
//                  double (stacking while ties continue).
//   settle         'average': each player gets (points - the group's average) x stake.
//                  'pairs':   each pair settles its full point difference x stake.
// Pure functions, like nassau.js: no DOM or storage.

import { matchStrokes, netScore } from './nassau.js';

export const NINE_POINT_SETTLE = {
  average: { label: 'Against the average', short: 'vs. average' },
  pairs: { label: 'Pair by pair', short: 'pair by pair' },
};

export function defaultNinePoint(players = []) {
  return {
    id: `np-${Math.random().toString(36).slice(2, 8)}`,
    type: 'ninepoint',
    players: players.slice(0, 3),
    stake: 1, // $ per point
    handicap: { mode: 'net', allowance: 100, strokesOff: 'match' }, // 'match' = off the low man of the three, or 'full'
    sweep: true,
    birdieDoubles: true,
    netBirdies: false,
    carryovers: false,
    settle: 'average',
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Strokes each of the game's three players gets. */
export function ninePointStrokes(round, game) {
  return matchStrokes({ ...round, game: { handicap: game.handicap } }, { a: game.players, b: [] });
}

/** Base points for one hole from three scores (lower is better). Returns { points[3], sweep, allTie }. */
function holePoints(scores, game) {
  const sorted = [...scores].sort((a, b) => a - b);
  const [lo, mid, hi] = sorted;
  if (lo === hi) return { points: [3, 3, 3], sweep: false, allTie: true };
  if (game.sweep && lo < mid && mid - lo >= 2) {
    return { points: scores.map((s) => (s === lo ? 9 : 0)), sweep: true, allTie: false };
  }
  if (lo === mid) return { points: scores.map((s) => (s === lo ? 4 : 1)), sweep: false, allTie: false };
  if (mid === hi) return { points: scores.map((s) => (s === lo ? 5 : 2)), sweep: false, allTie: false };
  return { points: scores.map((s) => (s === lo ? 5 : s === mid ? 3 : 1)), sweep: false, allTie: false };
}

/**
 * Plays the game through the scores so far.
 * holes[h] = null until all three have a score there, else
 *   { points: {id: n}, net: {id: n}, sweep, birdie, allTie, carried, multiplier }
 * totals: {id: points}; money: {id: $}; pairwise: [{ winner, loser, amount }]
 * pendingCarry: holes' worth of points riding on the next hole (carryovers only).
 */
export function computeNinePoint(round, game) {
  const ids = game.players;
  const strokes = ninePointStrokes(round, game);
  const { par, si } = round.course;
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  const holes = [];
  let carry = 0;
  let thru = 0;
  for (let h = 0; h < 18; h++) {
    const gross = ids.map((id) => round.scores[id]?.[h]);
    if (gross.some((g) => g == null)) { holes.push(null); continue; }
    if (thru === h) thru = h + 1;
    const net = ids.map((id, i) => (game.handicap.mode === 'gross' ? gross[i] : netScore(gross[i], strokes[id], si[h])));
    const base = holePoints(net, game);
    const multiplier = game.carryovers ? carry + 1 : 1;
    const carried = multiplier - 1;
    let birdie = false;
    let points = base.points;
    if (game.carryovers && base.allTie) {
      // Nobody scores; the hole's points ride on the next one.
      points = [0, 0, 0];
      carry++;
    } else {
      carry = 0;
      if (base.sweep && game.birdieDoubles) {
        const w = base.points.indexOf(9);
        birdie = gross[w] < par[h] || (game.netBirdies && net[w] < par[h]);
      }
      points = points.map((p) => p * multiplier * (birdie ? 2 : 1));
    }
    ids.forEach((id, i) => { totals[id] += points[i]; });
    holes.push({
      points: Object.fromEntries(ids.map((id, i) => [id, points[i]])),
      net: Object.fromEntries(ids.map((id, i) => [id, net[i]])),
      sweep: base.sweep, birdie, allTie: base.allTie, carried, multiplier,
    });
  }
  return { game, holes, totals, thru, pendingCarry: carry, strokes, ...ninePointMoney(game, totals) };
}

/** Money from point totals, per the game's settlement option. */
export function ninePointMoney(game, totals) {
  const ids = game.players;
  const factor = game.settle === 'pairs' ? 1 : 1 / ids.length; // pair share of the point difference
  const money = Object.fromEntries(ids.map((id) => [id, 0]));
  const pairwise = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const amount = round2((totals[a] - totals[b]) * factor * game.stake);
      money[a] += amount;
      money[b] -= amount;
      if (amount > 0) pairwise.push({ winner: a, loser: b, amount });
      else if (amount < 0) pairwise.push({ winner: b, loser: a, amount: -amount });
    }
  for (const id of ids) money[id] = round2(money[id]);
  return { money, pairwise };
}

/** One-line description of a game's setup, e.g. "$1/pt · net · birdies double · carryovers". */
export function ninePointSummary(game) {
  return [
    `$${game.stake}/pt`,
    game.handicap.mode === 'gross' ? 'gross' : `net${game.handicap.allowance !== 100 ? ` ${game.handicap.allowance}%` : ''}`,
    game.sweep && 'win by 2 sweeps',
    game.sweep && game.birdieDoubles && (game.netBirdies ? 'birdies double' : 'natural birdies double'),
    game.carryovers && 'carryovers',
    NINE_POINT_SETTLE[game.settle]?.short,
  ].filter(Boolean).join(' · ');
}
