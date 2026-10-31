// Vegas: two teams of two. On each hole a team's two scores make a two-digit
// number, low score first (a 4 and a 5 make 45). The lower number wins the
// difference in points (45 v 53 = 8 points), and points are paid per man.
// Options (per game):
//   flip          A natural birdie flips the other team's number, high score first (45 -> 54).
//                 Both teams birdie: no flip.
//   netBirdies    ...and a net birdie flips too.
//   bigScores     A score of 10 or more: 'first' puts it in front (4 and 10 = 104);
//                 'nine' counts it as a 9.
//   partners      'fixed', or 'sixes': switch partners every 6 holes so everyone plays
//                 with everyone (holes 1-6 as set, 7-12 and 13-18 with the other two pairings).
//   cap           Most points a hole can be worth; 0 = no limit.
// Pure functions, like nassau.js: no DOM or storage.

import { matchStrokes, netScore } from './nassau.js';

export function defaultVegas(players = []) {
  const four = players.length === 4;
  return {
    id: `vg-${Math.random().toString(36).slice(2, 8)}`,
    type: 'vegas',
    a: four ? [players[0], players[3]] : [],
    b: four ? [players[1], players[2]] : [],
    stake: 1, // $ per point, per man
    handicap: { mode: 'net', allowance: 100, strokesOff: 'match' }, // 'match' = off the low man, or 'full'
    flip: true,
    netBirdies: false,
    bigScores: 'first',
    partners: 'fixed',
    cap: 0,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

export const sidesOk = (game) => game.a.length === 2 && game.b.length === 2;

export function vegasStrokes(round, game) {
  return matchStrokes({ ...round, game: { handicap: game.handicap } }, game);
}

/** The teams on hole `h`: as set, or switching every 6 holes so everyone partners everyone. */
export function teamsOn(game, h) {
  const [a1, a2] = game.a;
  const [b1, b2] = game.b;
  if (game.partners !== 'sixes' || h < 6) return { a: [a1, a2], b: [b1, b2] };
  return h < 12 ? { a: [a1, b1], b: [a2, b2] } : { a: [a1, b2], b: [a2, b1] };
}

/** A team's number from its two scores, e.g. [5, 4] -> 45, flipped -> 54. */
export function teamNumber(scores, game, flipped) {
  const s = scores.map((v) => (game.bigScores === 'nine' ? Math.min(v, 9) : v)).map((v) => Math.max(v, 1));
  // High first when flipped, and a 10+ always goes in front.
  const highFirst = flipped || s.some((v) => v >= 10);
  const [x, y] = [...s].sort((p, q) => (highFirst ? q - p : p - q));
  return Number(`${x}${y}`);
}

/**
 * Plays the game through the scores so far.
 * holes[h] = null until all four have a score there, else
 *   { a, b (team ids), num: { a, b }, flipped: { a, b }, points (to the winning team), winner ('a' | 'b' | null) }
 * totals: {id: points}; money: {id: $}; pairwise: [{ winner, loser, amount }]
 */
export function computeVegas(round, game) {
  const ids = [...game.a, ...game.b];
  const strokes = vegasStrokes(round, game);
  const { par, si } = round.course;
  const totals = Object.fromEntries(ids.map((id) => [id, 0]));
  const pairs = new Map(); // "x|y" (x < y) -> points x won from y
  const holes = [];
  let thru = 0;
  for (let h = 0; h < 18; h++) {
    if (!ids.every((id) => round.scores[id]?.[h] != null)) { holes.push(null); continue; }
    if (thru === h) thru = h + 1;
    const t = teamsOn(game, h);
    const gross = (id) => round.scores[id][h];
    const net = (id) => (game.handicap.mode === 'gross' ? gross(id) : netScore(gross(id), strokes[id], si[h]));
    const birdie = (team) => game.flip && t[team].some((id) => gross(id) < par[h] || (game.netBirdies && game.handicap.mode === 'net' && net(id) < par[h]));
    const bird = { a: birdie('a'), b: birdie('b') };
    // A birdie flips the other team's number, unless both teams made one.
    const flipped = { a: bird.b && !bird.a, b: bird.a && !bird.b };
    const num = { a: teamNumber(t.a.map(net), game, flipped.a), b: teamNumber(t.b.map(net), game, flipped.b) };
    const diff = Math.abs(num.a - num.b);
    const points = game.cap > 0 ? Math.min(diff, game.cap) : diff;
    const winner = num.a < num.b ? 'a' : num.b < num.a ? 'b' : null;
    holes.push({ ...t, num, flipped, points, winner });
    if (!winner) continue;
    const [win, lose] = winner === 'a' ? [t.a, t.b] : [t.b, t.a];
    for (const w of win) totals[w] += points;
    for (const l of lose) totals[l] -= points;
    // Each winner's points come half from each loser.
    for (const w of win)
      for (const l of lose) {
        const key = w < l ? `${w}|${l}` : `${l}|${w}`;
        pairs.set(key, (pairs.get(key) || 0) + (w < l ? points / 2 : -points / 2));
      }
  }
  const money = Object.fromEntries(ids.map((id) => [id, round2(totals[id] * game.stake)]));
  const pairwise = [];
  for (const [key, v] of pairs) {
    const [x, y] = key.split('|');
    const amount = round2(Math.abs(v) * game.stake);
    if (amount) pairwise.push(v > 0 ? { winner: x, loser: y, amount } : { winner: y, loser: x, amount });
  }
  return { game, holes, totals, money, pairwise, thru, strokes };
}

const fmtStake = (v) => (v < 1 ? `${Math.round(v * 100)}¢` : `$${v}`);

/** One-line description, e.g. "50¢/pt · birdies flip · switch every 6". */
export function vegasSummary(game) {
  return [
    `${fmtStake(game.stake)}/pt`,
    game.flip && (game.netBirdies ? 'birdies flip (net too)' : 'birdies flip'),
    game.partners === 'sixes' && 'switch every 6',
    game.cap > 0 && `max ${game.cap} a hole`,
    game.handicap.mode === 'gross' ? 'gross' : `net${game.handicap.allowance !== 100 ? ` ${game.handicap.allowance}%` : ''}`,
  ].filter(Boolean).join(' · ');
}
