// Dormie — Nassau engine.
// Pure functions only: no DOM, no storage. Safe to reuse in a native app later.
//
// Holes are 0-based internally (hole 1 = index 0).
// A match is side A vs side B; each side is 1+ players.
// Hole result: +1 = side A wins the hole, -1 = side B wins, 0 = halved, null = not finished.

export const SEGMENTS = {
  front: { key: 'front', label: 'Front', start: 0, end: 8 },
  back: { key: 'back', label: 'Back', start: 9, end: 17 },
  overall: { key: 'overall', label: 'Overall', start: 0, end: 17 },
};
export const SEGMENT_KEYS = ['front', 'back', 'overall'];

const sum = (a) => a.reduce((t, n) => t + n, 0);
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

export function defaultGame() {
  return {
    format: 'teams', // 'teams' | 'roundrobin' | 'custom'
    stakes: { front: 10, back: 10, overall: 10 },
    handicap: {
      mode: 'net', // 'net' | 'gross'
      allowance: 100, // percent of course handicap
      strokesOff: 'match', // 'match' (off the low man) | 'group' (off low in group) | 'full'
    },
    autoPress: { enabled: true, down: 2 },
    manualPress: true,
    pressOverall: true, // presses (auto + manual) allowed on the 18-hole bet
    maxPresses: 0, // per nine, per match; 0 = unlimited
    matches: [],
  };
}

// ---------- Handicaps ----------

export function coursePar(course) {
  return sum(course.par);
}

/** WHS course handicap: Index × (Slope / 113) + (Course Rating − Par). */
export function courseHandicap(index, course) {
  const raw = index * (course.slope / 113) + (course.rating - coursePar(course));
  return Math.round(raw);
}

export function playingHandicap(index, course, game) {
  if (game.handicap.mode === 'gross') return 0;
  return Math.round((courseHandicap(index, course) * game.handicap.allowance) / 100);
}

/** Strokes received on a hole with stroke index `si` (1 = hardest). Handles plus handicaps. */
export function strokesOnHole(strokes, si) {
  if (strokes >= 0) {
    const base = Math.floor(strokes / 18);
    const rem = strokes % 18;
    return base + (si <= rem ? 1 : 0);
  }
  // Plus handicap: gives strokes back starting on the easiest holes.
  const s = -strokes;
  const base = Math.floor(s / 18);
  const rem = s % 18;
  return -(base + (si > 18 - rem ? 1 : 0));
}

/** Map of playerId -> strokes received for a given match. */
export function matchStrokes(round, match) {
  const { course, game } = round;
  const ph = {};
  for (const p of round.players) ph[p.id] = playingHandicap(p.index, course, game);
  const inMatch = [...match.a, ...match.b];
  let base = 0;
  if (game.handicap.strokesOff === 'match') base = Math.min(...inMatch.map((id) => ph[id]));
  if (game.handicap.strokesOff === 'group') base = Math.min(...round.players.map((p) => ph[p.id]));
  const out = {};
  for (const id of inMatch) out[id] = ph[id] - base;
  return out;
}

export function netScore(gross, strokes, si) {
  if (gross == null) return null;
  return gross - strokesOnHole(strokes, si);
}

// ---------- Matches ----------

function sideScore(round, ids, strokes, h, scoring) {
  const nets = ids.map((id) => netScore(round.scores[id]?.[h], strokes[id], round.course.si[h]));
  if (nets.some((n) => n == null)) return null;
  return scoring === 'aggregate' ? sum(nets) : Math.min(...nets);
}

export function holeResults(round, match) {
  const strokes = matchStrokes(round, match);
  const out = [];
  for (let h = 0; h < 18; h++) {
    const a = sideScore(round, match.a, strokes, h, match.scoring);
    const b = sideScore(round, match.b, strokes, h, match.scoring);
    out.push(a == null || b == null ? null : a < b ? 1 : a > b ? -1 : 0);
  }
  return out;
}

/** Number of consecutive finished holes from hole 1. */
function thruCount(results) {
  let t = 0;
  while (t < 18 && results[t] != null) t++;
  return t;
}

function pressesAllowedOn(game, seg) {
  return seg !== 'overall' || game.pressOverall;
}

/**
 * Simulates every bet in one segment of a match: the original bet plus
 * manual presses (from round.presses) and auto presses (generated here).
 */
function simulateSegment(round, match, segKey, results, thru) {
  const { game } = round;
  const seg = SEGMENTS[segKey];
  const bets = [{ id: `${match.id}:${segKey}:main`, kind: 'main', start: seg.start, by: null, score: 0, history: [], triggered: false }];

  const manual = (round.presses || [])
    .filter((p) => p.matchId === match.id && p.segment === segKey && p.start >= seg.start && p.start <= seg.end)
    .sort((x, y) => x.start - y.start);
  for (const p of manual) bets.push({ id: p.id, kind: 'manual', start: p.start, by: p.by, score: 0, history: [], triggered: false });

  const capped = () => game.maxPresses > 0 && bets.length - 1 >= game.maxPresses;
  const autoOn = game.autoPress.enabled && pressesAllowedOn(game, segKey);

  for (let h = seg.start; h <= seg.end && h < thru; h++) {
    for (const b of bets) {
      if (b.start > h) continue;
      b.score += results[h];
      b.history.push(b.score);
    }
    if (!autoOn) continue;
    // Snapshot so a press created on this hole doesn't trigger on the same hole.
    for (const b of [...bets]) {
      if (b.triggered || b.start > h) continue;
      if (Math.abs(b.score) >= game.autoPress.down && h + 1 <= seg.end && !capped()) {
        b.triggered = true;
        bets.push({ id: `${b.id}>auto@${h + 1}`, kind: 'auto', start: h + 1, by: b.score > 0 ? 'b' : 'a', score: 0, history: [], triggered: false });
      }
    }
  }

  bets.sort((x, y) => x.start - y.start || (x.kind === 'main' ? -1 : 1));
  const segDone = thru > seg.end;
  let n = 0;
  for (const b of bets) {
    b.label = b.kind === 'main' ? seg.label : `Press ${++n}`;
    b.segment = segKey;
    b.stake = game.stakes[segKey];
    const playedTo = Math.min(thru, seg.end + 1); // exclusive
    b.played = Math.max(0, playedTo - b.start);
    b.holesLeft = seg.end + 1 - Math.max(b.start, playedTo);
    b.started = thru > b.start;
    b.decided = Math.abs(b.score) > b.holesLeft;
    b.final = segDone || b.decided;
    b.result = b.final ? sign(b.score) : null;
    b.leader = b.score > 0 ? 'a' : b.score < 0 ? 'b' : null;
    b.status = statusText(b);
  }
  return { key: segKey, label: seg.label, start: seg.start, end: seg.end, done: segDone, bets };
}

export function statusText(b) {
  if (!b.started) return `Starts #${b.start + 1}`;
  const up = Math.abs(b.score);
  if (b.decided && b.holesLeft > 0) return `${up}&${b.holesLeft}`;
  if (b.final) return up === 0 ? 'Push' : `Won ${up} UP`;
  if (up === 0) return 'AS';
  if (up === b.holesLeft) return `Dormie ${up}`;
  return `${up} UP`;
}

/** Full picture of one match: hole results, thru, and every bet per segment. */
export function computeMatch(round, match) {
  const results = holeResults(round, match);
  const thru = thruCount(results);
  const segments = SEGMENT_KEYS.map((k) => simulateSegment(round, match, k, results, thru));
  return { match, results, thru, segments, strokes: matchStrokes(round, match) };
}

/**
 * Can someone press this segment right now? Returns { side, start } or null.
 * The side that's down on the most recent live bet is the one who gets to press.
 */
export function pressOption(round, computed, segKey) {
  const { game } = round;
  if (!game.manualPress || !pressesAllowedOn(game, segKey)) return null;
  const seg = computed.segments.find((s) => s.key === segKey);
  const start = Math.max(computed.thru, seg.start);
  if (start > seg.end) return null;
  if (game.maxPresses > 0 && seg.bets.length - 1 >= game.maxPresses) return null;
  if (seg.bets.some((b) => b.start === start && b.kind !== 'main')) return null; // already a press starting there
  const live = seg.bets.filter((b) => b.started && !b.final && b.score !== 0);
  if (!live.length) return null;
  const latest = live[live.length - 1];
  return { side: latest.score > 0 ? 'b' : 'a', start };
}

// ---------- Matches from a format ----------

export function buildMatches(format, playerIds, teams, scoring = 'bestball', custom = [], wheel = []) {
  if (format === 'wheel') {
    // The wheel team (a fixed pair) plays every pair made from the other players.
    const pair = wheel.filter((id) => playerIds.includes(id));
    const others = playerIds.filter((id) => !pair.includes(id));
    if (pair.length !== 2 || others.length < 2) return [];
    const out = [];
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++)
        out.push({ id: `wheel-${others[i]}-${others[j]}`, a: [...pair], b: [others[i], others[j]], scoring });
    return out;
  }
  if (format === 'roundrobin') {
    const out = [];
    for (let i = 0; i < playerIds.length; i++)
      for (let j = i + 1; j < playerIds.length; j++)
        out.push({ id: `rr-${playerIds[i]}-${playerIds[j]}`, a: [playerIds[i]], b: [playerIds[j]], scoring: 'bestball' });
    return out;
  }
  if (format === 'teams') {
    const a = playerIds.filter((id) => teams[id] === 'a');
    const b = playerIds.filter((id) => teams[id] === 'b');
    if (!a.length || !b.length) return [];
    return [{ id: 'teams', a, b, scoring }];
  }
  return custom.filter((m) => m.a.length && m.b.length);
}

// ---------- Money ----------

/** Money for one settled bet: each winner collects the stake; losers split the total. */
function betMoney(match, result, stake) {
  const out = {};
  if (!result) return out;
  const winners = result > 0 ? match.a : match.b;
  const losers = result > 0 ? match.b : match.a;
  const total = stake * winners.length;
  for (const id of winners) out[id] = (out[id] || 0) + stake;
  for (const id of losers) out[id] = (out[id] || 0) - total / losers.length;
  return out;
}

/**
 * Totals for the round.
 *  settled:   only bets that are final.
 *  projected: every started bet as if the round ended right now.
 */
export function settleRound(round) {
  const settled = {};
  const projected = {};
  for (const p of round.players) settled[p.id] = projected[p.id] = 0;
  const matches = round.game.matches.map((m) => {
    const c = computeMatch(round, m);
    const net = {};
    for (const s of c.segments)
      for (const b of s.bets) {
        const fin = betMoney(m, b.result, b.stake);
        const proj = betMoney(m, b.started ? sign(b.score) : 0, b.stake);
        for (const [id, v] of Object.entries(fin)) settled[id] += v;
        for (const [id, v] of Object.entries(proj)) {
          projected[id] += v;
          net[id] = (net[id] || 0) + v;
        }
      }
    return { ...c, net };
  });
  return { settled, projected, matches };
}

/**
 * Who won what from whom in a round, netted per pair of players:
 * [{ winner, loser, amount }]. Each loser of a bet pays each winner an equal
 * share (stake ÷ number of losers), which adds up to the same per-player
 * totals as settleRound. `projected` counts every started bet as if the
 * round ended now; otherwise only finished bets count.
 */
export function pairwiseRound(round, { projected = false } = {}) {
  const net = new Map(); // "a|b" (a < b) -> what a won from b
  for (const m of round.game.matches) {
    for (const s of computeMatch(round, m).segments)
      for (const b of s.bets) {
        const result = projected ? (b.started ? sign(b.score) : 0) : b.result;
        if (!result) continue;
        const winners = result > 0 ? m.a : m.b;
        const losers = result > 0 ? m.b : m.a;
        const share = b.stake / losers.length;
        for (const w of winners)
          for (const l of losers) {
            const key = w < l ? `${w}|${l}` : `${l}|${w}`;
            net.set(key, (net.get(key) || 0) + (w < l ? share : -share));
          }
      }
  }
  const out = [];
  for (const [key, v] of net) {
    const [a, b] = key.split('|');
    const amount = Math.round(Math.abs(v) * 100) / 100;
    if (amount) out.push(v > 0 ? { winner: a, loser: b, amount } : { winner: b, loser: a, amount });
  }
  return out;
}

/** Fewest payments to square up. Input: { id: balance }. */
export function settleUp(balances) {
  const cents = Object.entries(balances).map(([id, v]) => ({ id, v: Math.round(v * 100) }));
  const debtors = cents.filter((x) => x.v < 0).sort((a, b) => a.v - b.v);
  const creditors = cents.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(-debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amt / 100 });
    debtors[i].v += amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
