// Snake: a putting game. Three-putt and you're holding the snake until someone
// else three-putts. Whoever holds it at the end pays every other player.
// Options (per game):
//   grow         Each three-putt adds `stake` to what the snake is worth; off, it's a flat `stake`.
//   fourDouble   A four-putt (or worse) counts as two three-putts.
//   nines        One snake for 18, or a front nine snake and a fresh back nine snake.
// Three-putts live on the game: snakes[hole] = [{ p: playerId, n: 3 | 4 }], in the order they
// happened, so the last one on the hole is the one holding the snake.
// Pure functions, like nassau.js: no DOM or storage.

export function defaultSnake(players = []) {
  return {
    id: `sn-${Math.random().toString(36).slice(2, 8)}`,
    type: 'snake',
    players: [...players],
    stake: 1,
    grow: true,
    fourDouble: true,
    nines: false,
    snakes: {},
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** The snake runs: all 18, or the front and back nines. */
export const segmentsOf = (game) => (game.nines ? [{ start: 0, end: 8, label: 'Front' }, { start: 9, end: 17, label: 'Back' }] : [{ start: 0, end: 17, label: '18' }]);

/** What a three-putt list on a hole adds to the snake. */
const weight = (game, e) => (e.n >= 4 && game.fourDouble ? 2 : 1);

/** A hole's three-putts after tapping a player: off -> 3 putts -> 4+ putts -> off. Order stays as tapped. */
export function nextPutts(list = [], playerId) {
  const at = list.findIndex((e) => e.p === playerId);
  if (at < 0) return [...list, { p: playerId, n: 3 }];
  if (list[at].n === 3) return list.map((e, i) => (i === at ? { ...e, n: 4 } : e));
  return list.filter((_, i) => i !== at);
}

/**
 * Plays the snake through the three-putts so far.
 * segments: [{ label, start, end, holder, count, value, done }]  value = $ the holder pays each other player
 * holes[h] = [{ p, n }] (only players in the game)
 * money: {id: $} (as if it ended now); pairwise: [{ winner, loser, amount }]
 */
export function computeSnake(round, game) {
  const ids = game.players;
  const holes = Array.from({ length: 18 }, (_, h) => (game.snakes?.[h] || []).filter((e) => ids.includes(e.p)));
  let thru = 0;
  while (thru < 18 && ids.every((id) => round.scores[id]?.[thru] != null)) thru++;
  const money = Object.fromEntries(ids.map((id) => [id, 0]));
  const pairs = new Map();
  const segments = segmentsOf(game).map((seg) => {
    let holder = null;
    let count = 0;
    for (let h = seg.start; h <= seg.end; h++)
      for (const e of holes[h]) {
        count += weight(game, e);
        holder = e.p;
      }
    const value = holder ? (game.grow ? game.stake * count : game.stake) : 0;
    if (holder)
      for (const id of ids) {
        if (id === holder) continue;
        money[id] += value;
        money[holder] -= value;
        pairs.set(`${id}|${holder}`, (pairs.get(`${id}|${holder}`) || 0) + value);
      }
    return { ...seg, holder, count, value: round2(value), done: thru > seg.end };
  });
  for (const id of ids) money[id] = round2(money[id]);
  const pairwise = [...pairs].map(([key, amount]) => {
    const [winner, loser] = key.split('|');
    return { winner, loser, amount: round2(amount) };
  });
  // The snake in play on the current hole: the front nine's until it's over.
  const live = segments.find((s) => !s.done) ?? segments[segments.length - 1];
  return { game, holes, segments, live, thru, money, pairwise, totals: money };
}

/** One-line description, e.g. "$1 · grows $1 a three-putt · 4-putts count twice". */
export function snakeSummary(game) {
  return [
    `$${game.stake}`,
    game.grow ? `grows $${game.stake} a three-putt` : 'flat',
    game.fourDouble && '4-putts count twice',
    game.nines && 'front and back',
  ].filter(Boolean).join(' · ');
}
