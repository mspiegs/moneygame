// Keeps the app's state in sync with the server.
//
// The UI works on local state, exactly as before, so it stays instant and
// keeps working with no signal on the course. Each change is turned into an
// idempotent op and queued in an outbox (saved in localStorage); the outbox is
// sent to /api/sync whenever we're online. Fresh state is pulled from the
// server on load, when the app comes back to the foreground, and every so
// often while a round is live, but only when nothing is waiting to go up, so
// a pull can never undo a change made on this device.

import { api } from './auth.js';

const cacheKey = (userId) => `dormie.v2.${userId}`;
const V1_KEY = 'dormie.v1';
const V1_IMPORTED = 'dormie.v1.imported';
const BATCH = 100;
const RETRY_MS = 15_000;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const isSample = (x) => !!x?.sample;
const hasData = (s) => s.players.length || s.courses.length || s.rounds.length;

/** Server ops for a reducer action, given the state before it. Samples never leave the device. */
export function opsFor(a, s) {
  const round = a.roundId && s.rounds.find((r) => r.id === a.roundId);
  if (round && isSample(round)) return [];
  switch (a.type) {
    case 'addPlayer': return isSample(a.player) ? [] : [{ type: 'player.upsert', player: a.player }];
    case 'updatePlayer': {
      const p = { ...s.players.find((x) => x.id === a.id), ...a.patch };
      return isSample(p) ? [] : [{ type: 'player.upsert', player: p }];
    }
    case 'removePlayer': return isSample(s.players.find((x) => x.id === a.id)) ? [] : [{ type: 'player.archive', id: a.id }];
    case 'saveCourse': return isSample(a.course) ? [] : [{ type: 'course.upsert', course: a.course }];
    case 'removeCourse': return isSample(s.courses.find((c) => c.id === a.id)) ? [] : [{ type: 'course.archive', id: a.id }];
    case 'createRound': {
      if (isSample(a.round)) return [];
      const course = s.courses.find((c) => c.id === a.round.course.id);
      return [
        { type: 'round.put', round: a.round },
        ...(course && !isSample(course) ? [{ type: 'course.upsert', course: { ...course, lastTee: a.round.course.teeId } }] : []),
      ];
    }
    case 'deleteRound': return [{ type: 'round.delete', roundId: a.roundId }];
    case 'setScore': return [{ type: 'score.set', roundId: a.roundId, pid: a.pid, hole: a.hole, value: a.value }];
    case 'fillPar': return round.players
      .filter((p) => round.scores[p.id][a.hole] == null)
      .map((p) => ({ type: 'score.set', roundId: a.roundId, pid: p.id, hole: a.hole, value: round.course.par[a.hole] }));
    case 'setHole': return [{ type: 'round.hole', roundId: a.roundId, hole: a.hole }];
    case 'addPress': return [{ type: 'press.add', roundId: a.roundId, press: a.press }];
    case 'removePress': return [{ type: 'press.remove', roundId: a.roundId, pressId: a.pressId }];
    case 'setStatus': return [{ type: 'round.status', roundId: a.roundId, status: a.status }];
    default: return [];
  }
}

/** Ops that upload everything real from the pre-account (v1) local data. */
function importOps(v1) {
  return [
    ...v1.players.filter((p) => !isSample(p)).map((player) => ({ type: 'player.upsert', player })),
    ...v1.courses.filter((c) => !isSample(c)).map((course) => ({ type: 'course.upsert', course })),
    // Oldest first, so the server's order matches when they were played.
    ...v1.rounds.filter((r) => !isSample(r)).reverse().map((round) => ({ type: 'round.put', round })),
  ];
}

export class Sync {
  /**
   * @param userId   whose cache to use
   * @param seed     () => starter state (with samples) for a first visit
   * @param loadV1   () => the old signed-out localStorage state, or null
   */
  constructor(userId, { seed, loadV1 }) {
    this.userId = userId;
    const cache = read(cacheKey(userId));
    this.fresh = !cache; // first visit for this user on this device
    this.group = cache?.group ?? null;
    this.outbox = cache?.outbox ?? [];
    this.state = cache?.state ?? seed();
    this.version = 0; // bumps on every local change
    this.offline = false;
    this.flushing = null;
    this.retry = null;
    this.listeners = new Set();

    // One-time upload of data from before accounts existed.
    const v1 = loadV1();
    if (v1 && !read(V1_IMPORTED)) {
      const ops = importOps(v1);
      if (ops.length) this.outbox.push(...ops);
      write(V1_IMPORTED, { userId, at: Date.now(), ops: ops.length });
      this.persist();
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  status() {
    return { pending: this.outbox.length, offline: this.offline, group: this.group };
  }
  emit() {
    const st = this.status();
    for (const fn of this.listeners) fn(st);
  }
  persist() {
    write(cacheKey(this.userId), { v: 2, group: this.group, state: this.state, outbox: this.outbox });
  }

  /** Record new local state and queue the ops that produced it. */
  commit(state, ops = []) {
    this.state = state;
    if (ops.length) {
      this.version++;
      this.outbox.push(...ops);
    }
    this.persist();
    if (ops.length) {
      this.emit();
      this.flush();
    }
  }

  /** Send the outbox. Resolves true when it's empty. */
  flush() {
    this.flushing ??= this.sendAll().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async sendAll() {
    clearTimeout(this.retry);
    while (this.outbox.length) {
      const batch = this.outbox.slice(0, BATCH);
      let res;
      try {
        res = await api('sync', { method: 'POST', body: { group: this.group, ops: batch } });
      } catch (e) {
        // Offline, or the server stopped partway: keep everything and try again later.
        this.offline = e instanceof TypeError;
        this.retry = setTimeout(() => this.flush(), RETRY_MS);
        this.emit();
        return false;
      }
      if (res.rejected?.length) console.warn('Dormie: server rejected changes', res.rejected);
      this.group = res.group?.id ?? this.group;
      this.outbox.splice(0, res.done);
      this.offline = false;
      this.persist();
      this.emit();
    }
    return true;
  }

  /**
   * Fetch the group's state from the server, merged with this device's samples.
   * Returns null if local changes are still waiting to go up, or a change was made
   * while the request was in flight.
   */
  async pull() {
    if (!(await this.flush())) return null;
    const version = this.version;
    let res;
    try {
      res = await api(`state${this.group ? `?group=${encodeURIComponent(this.group)}` : ''}`);
    } catch (e) {
      this.offline = e instanceof TypeError;
      this.emit();
      return null;
    }
    if (version !== this.version || this.outbox.length) return null;
    this.group = res.group.id;
    this.offline = false;
    const server = res.state;
    // Samples live only on this device. Someone signing in on a new device who
    // already has data doesn't need them.
    const keepSamples = !(this.fresh && hasData(server));
    this.fresh = false;
    const local = this.state;
    const extra = (key) => (keepSamples ? local[key].filter((x) => isSample(x) && !server[key].some((y) => y.id === x.id)) : []);
    const state = {
      ...local,
      players: [...server.players, ...extra('players')],
      courses: [...server.courses, ...extra('courses')],
      rounds: [...extra('rounds'), ...server.rounds],
    };
    this.state = state;
    this.persist();
    this.emit();
    return state;
  }
}
