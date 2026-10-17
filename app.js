import { html, render, useState, useReducer, useEffect, useMemo, useRef } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import * as N from './nassau.js';
import * as A from './auth.js';

// ---------- Icons ----------
const I = {
  back: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  next: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>`,
  check: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  x: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  flag: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2.5a1 1 0 0 1 1 1V4l11.2 4.3a.8.8 0 0 1 0 1.5L7 14v7.5a1 1 0 1 1-2 0v-18a1 1 0 0 1 1-1z"/></svg>`,
  flagO: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 21V3.5M6 4.5l11.5 4.5L6 13.5"/></svg>`,
  card: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M9 10v9M15 10v9"/></svg>`,
  swords: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5L14 2h3v3l-4.5 4.5M5 14l-2 2 2.5 2.5L8 16"/></svg>`,
  cash: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>`,
  users: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17.5 14.5c2.2.3 3.6 1.9 4 4.5"/></svg>`,
  home: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 21V3.5M6 4.5l11.5 4.5L6 13.5"/><ellipse cx="10" cy="20.5" rx="7" ry="1.6"/></svg>`,
  pin: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  arrow: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>`,
  info: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>`,
  copy: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>`,
};

// ---------- Helpers ----------
const COLORS = ['#2E6B4F', '#2459A6', '#B04A23', '#7A4FA3', '#B8862B', '#2B7F8E', '#A23B5C', '#56607A'];
const uid = (p = 'id') => `${p}${Math.random().toString(36).slice(2, 9)}`;
const initials = (name) => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const first = (name) => name.trim().split(/\s+/)[0];
const sum = (a) => a.reduce((t, n) => t + (n || 0), 0);
function money(v, { sign = true } = {}) {
  const r = Math.round(v * 100) / 100;
  const abs = Math.abs(r);
  const s = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2);
  if (r === 0) return '$0';
  return `${sign ? (r > 0 ? '+' : '−') : ''}$${s}`;
}
const moneyCls = (v) => (Math.round(v * 100) === 0 ? 'zero' : v > 0 ? 'pos' : 'neg');
const fmtIndex = (i) => (i < 0 ? `+${Math.abs(i).toFixed(1)}` : i.toFixed(1));
const dateLabel = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function Avatar({ p, size = '' }) {
  return html`<span class=${`av ${size}`} style=${{ background: p.color }} aria-hidden="true">${initials(p.name)}</span>`;
}
function sideNames(round, ids) {
  return ids.map((id) => first(round.players.find((p) => p.id === id).name)).join(' & ');
}

// ---------- Data: sample group + persistence ----------
const SAMPLE_COURSE = {
  id: 'c-sample',
  name: 'Pine Hollow GC',
  teeSets: [
    { id: 't-black', name: 'Black', rating: 74.1, slope: 138 },
    { id: 't-blue', name: 'Blue', rating: 71.8, slope: 131 },
    { id: 't-white', name: 'White', rating: 69.9, slope: 126 },
    { id: 't-gold', name: 'Gold', rating: 67.6, slope: 118 },
  ],
  lastTee: 't-blue',
  par: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
  si: [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 14, 18, 2, 10, 4, 16, 12, 6],
  sample: true,
};
/** The course as played from one tee set: flattens that tee's rating and slope onto the course. */
function withTee(course, teeId) {
  const sets = course.teeSets || [];
  const t = sets.find((x) => x.id === teeId) || sets.find((x) => x.id === course.lastTee) || sets[0];
  if (!t) return course;
  return { ...course, teeId: t.id, tees: t.name, rating: t.rating, slope: t.slope };
}
const TEE_COLORS = { black: '#1B1F1D', blue: '#2459A6', white: '#F4F4F0', gold: '#C9A227', yellow: '#E2C21B', red: '#B33A2B', green: '#2E7D4F', silver: '#A9B1B6', copper: '#B06A3B', orange: '#E07B24', purple: '#6E4A9E', tips: '#1B1F1D' };
const teeColor = (name) => TEE_COLORS[name.trim().toLowerCase()] || 'var(--ink-3)';
const teeSummary = (c) => (c.teeSets || []).map((t) => t.name).join(' · ');

const SAMPLE_PLAYERS = [
  ['p-jack', 'Jack Reilly', 4.2],
  ['p-danny', 'Danny Ortiz', 11.8],
  ['p-sam', 'Sam Whitaker', 7.5],
  ['p-chris', 'Chris Bell', 15.3],
  ['p-tommy', 'Tommy Nguyen', 2.1],
  ['p-mike', 'Mike Kowalski', 19.6],
].map(([id, name, index], i) => ({ id, name, index, color: COLORS[i % COLORS.length], sample: true }));

function sampleRound() {
  const ids = ['p-jack', 'p-danny', 'p-sam', 'p-chris'];
  const players = ids.map((id) => SAMPLE_PLAYERS.find((p) => p.id === id));
  const scores = {
    'p-jack': [4, 5, 3, 5, 5, 4, 3, 5, 4, 4, 5],
    'p-danny': [5, 6, 4, 5, 4, 5, 3, 6, 6, 4, 5],
    'p-sam': [4, 5, 3, 5, 4, 4, 4, 5, 4, 5, 4],
    'p-chris': [6, 5, 4, 6, 5, 6, 4, 6, 5, 4, 5],
  };
  for (const id of ids) scores[id] = [...scores[id], ...Array(18 - scores[id].length).fill(null)];
  const game = { ...N.defaultGame(), format: 'teams', teams: { 'p-jack': 'a', 'p-chris': 'a', 'p-danny': 'b', 'p-sam': 'b' } };
  game.matches = N.buildMatches('teams', ids, game.teams, 'bestball');
  return {
    id: 'r-sample', sample: true, createdAt: Date.now() - 1000 * 60 * 150, course: withTee(SAMPLE_COURSE, 't-blue'), players, scores, game,
    presses: [{ id: 'pr-sample', matchId: 'teams', segment: 'front', start: 6, by: 'b' }], hole: 11, status: 'live',
  };
}

function seed() {
  return { v: 1, players: SAMPLE_PLAYERS, courses: [SAMPLE_COURSE], rounds: [sampleRound()] };
}
const KEY = 'dormie.v1';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) {
      s.courses = s.courses.map((c) => (c.teeSets ? c : {
        ...c, teeSets: c.id === SAMPLE_COURSE.id ? SAMPLE_COURSE.teeSets : [{ id: uid('t-'), name: c.tees || 'Default', rating: c.rating, slope: c.slope }],
      }));
      return s;
    }
  } catch {}
  return seed();
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function reducer(s, a) {
  const mapRound = (fn) => ({ ...s, rounds: s.rounds.map((r) => (r.id === a.roundId ? fn(r) : r)) });
  switch (a.type) {
    case 'addPlayer': return { ...s, players: [...s.players, a.player] };
    case 'updatePlayer': return { ...s, players: s.players.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p)) };
    case 'removePlayer': return { ...s, players: s.players.filter((p) => p.id !== a.id) };
    case 'saveCourse': {
      const exists = s.courses.some((c) => c.id === a.course.id);
      return { ...s, courses: exists ? s.courses.map((c) => (c.id === a.course.id ? a.course : c)) : [...s.courses, a.course] };
    }
    case 'removeCourse': return { ...s, courses: s.courses.filter((c) => c.id !== a.id) };
    case 'createRound': return {
      ...s, rounds: [a.round, ...s.rounds],
      courses: s.courses.map((c) => (c.id === a.round.course.id ? { ...c, lastTee: a.round.course.teeId } : c)),
    };
    case 'deleteRound': return { ...s, rounds: s.rounds.filter((r) => r.id !== a.roundId) };
    case 'setScore': return mapRound((r) => {
      const row = [...r.scores[a.pid]];
      row[a.hole] = a.value;
      return { ...r, scores: { ...r.scores, [a.pid]: row } };
    });
    case 'fillPar': return mapRound((r) => {
      const scores = { ...r.scores };
      for (const p of r.players) if (scores[p.id][a.hole] == null) { scores[p.id] = [...scores[p.id]]; scores[p.id][a.hole] = r.course.par[a.hole]; }
      return { ...r, scores };
    });
    case 'setHole': return mapRound((r) => ({ ...r, hole: a.hole }));
    case 'addPress': return mapRound((r) => ({ ...r, presses: [...r.presses, a.press] }));
    case 'removePress': return mapRound((r) => ({ ...r, presses: r.presses.filter((p) => p.id !== a.pressId) }));
    case 'setStatus': return mapRound((r) => ({ ...r, status: a.status }));
    case 'reset': return seed();
    case 'clearSamples': {
      const courses = s.courses.filter((c) => !c.sample);
      return { ...s, players: s.players.filter((p) => !p.sample), rounds: s.rounds.filter((r) => !r.sample), courses: courses.length ? courses : s.courses };
    }
    default: return s;
  }
}

// ---------- Small controls ----------
function Seg({ value, options, onChange, tall }) {
  return html`<div class=${`seg ${tall ? 'tall' : ''}`} role="group">
    ${options.map((o) => html`<button type="button" aria-pressed=${value === o.value} onClick=${() => onChange(o.value)}>
      ${o.label}${o.sub && html`<small>${o.sub}</small>`}
    </button>`)}
  </div>`;
}
function Switch({ on, onChange, label }) {
  return html`<button type="button" class="switch" role="switch" aria-checked=${on} aria-label=${label} onClick=${() => onChange(!on)}></button>`;
}
function Stepper({ value, onChange, min = 0, max = 999, step = 1, format = (v) => v, label }) {
  return html`<div class="stepper" role="group" aria-label=${label}>
    <button type="button" aria-label="Decrease" onClick=${() => onChange(Math.max(min, value - (typeof step === 'function' ? step(value, -1) : step)))}>${I.minus}</button>
    <output>${format(value)}</output>
    <button type="button" aria-label="Increase" onClick=${() => onChange(Math.min(max, value + (typeof step === 'function' ? step(value, 1) : step)))}>${I.plus}</button>
  </div>`;
}
const stakeStep = (v, dir) => (dir > 0 ? (v < 10 ? 1 : v < 50 ? 5 : 10) : v <= 10 ? 1 : v <= 50 ? 5 : 10);

function Opt({ title, desc, children }) {
  return html`<div class="opt"><div class="grow"><div class="t">${title}</div>${desc && html`<div class="d">${desc}</div>`}</div>${children}</div>`;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 1800); };
  const node = msg && html`<div class="toast" role="status">${msg}</div>`;
  return [node, show];
}

// ---------- App ----------
function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState(undefined);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    A.session().then(setUser).catch(() => {
      // No signal: trust the last signed-in user so scoring still works on the course.
      setOffline(true);
      setUser(A.cachedUser());
    });
  }, []);
  if (user === undefined) return html`<div class="app"></div>`;
  if (!user) return html`<${SignIn} offline=${offline} onDone=${(u) => { setOffline(false); setUser(u); }} />`;
  return html`<${Main} user=${user} onSignOut=${async () => { await A.signOut(); setUser(null); }} />`;
}

function Main({ user, onSignOut }) {
  const [state, dispatch] = useReducer(reducer, null, load);
  useEffect(() => save(state), [state]);
  const [route, setRoute] = useState({ view: 'home' });
  const go = (r) => { setRoute(r); window.scrollTo(0, 0); };

  if (route.view === 'setup') return html`<${Setup} state=${state} dispatch=${dispatch} go=${go} />`;
  if (route.view === 'round') {
    const round = state.rounds.find((r) => r.id === route.id);
    if (round) return html`<${Round} round=${round} dispatch=${dispatch} go=${go} />`;
  }
  return html`<div class="app">
    ${route.view === 'account' ? html`<${Account} user=${user} onSignOut=${onSignOut} go=${go} />`
      : route.view === 'players' ? html`<${Players} state=${state} dispatch=${dispatch} />`
      : route.view === 'courses' ? html`<${Courses} state=${state} dispatch=${dispatch} />`
      : html`<${Home} state=${state} dispatch=${dispatch} go=${go} user=${user} />`}
    <nav class="tabbar" aria-label="Main"><div class="tabbar-inner">
      ${[['home', 'Rounds', I.home], ['players', 'Players', I.users], ['courses', 'Courses', I.pin]].map(([v, l, ic]) => html`
        <button type="button" aria-current=${route.view === v || (v === 'home' && !['players', 'courses', 'account'].includes(route.view)) ? 'page' : null} onClick=${() => go({ view: v })}>${ic}${l}</button>`)}
    </div></nav>
  </div>`;
}

// ---------- Sign in ----------
function SignIn({ offline, onDone }) {
  const [mode, setMode] = useState('in'); // 'in' | 'up'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const up = mode === 'up';
  const valid = email.includes('@') && password.length >= 8 && (!up || name.trim());
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = up ? await A.signUp(name.trim(), email.trim(), password) : await A.signIn(email.trim(), password);
      if (user) onDone(user);
      else setError('Signed in, but the session didn\u2019t stick. Check that cookies are allowed.');
    } catch (err) {
      setError(err instanceof TypeError ? 'No connection. Try again when you have signal.' : err.message);
    }
    setBusy(false);
  };
  return html`<div class="app"><main class="page fade-in signin">
    <div class="wordmark">Dorm<i>ie</i></div>
    <p class="sub">${up ? 'Create an account to save your rounds and keep the running tab with everyone you play.' : 'Sign in to your rounds, players and running tab.'}</p>
    ${offline && html`<div class="banner">${I.info}<span>You're offline. Sign in once you have signal.</span></div>`}
    <form class="card pad" style="display:flex;flex-direction:column;gap:12px" onSubmit=${submit}>
      ${up && html`<div class="field"><label for="si-name">Name</label><input id="si-name" class="input" value=${name} onInput=${(e) => setName(e.target.value)} autocomplete="name" placeholder="Your name" /></div>`}
      <div class="field"><label for="si-email">Email</label><input id="si-email" class="input" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} autocomplete="email" autocapitalize="off" /></div>
      <div class="field"><label for="si-pw">Password</label><input id="si-pw" class="input" type="password" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete=${up ? 'new-password' : 'current-password'} />
        ${up && html`<span class="note">At least 8 characters.</span>`}</div>
      ${error && html`<div class="form-error" role="alert">${error}</div>`}
      <button class="btn primary lg block" disabled=${!valid || busy}>${busy ? 'One sec\u2026' : up ? 'Create account' : 'Sign in'}</button>
    </form>
    <p class="sub" style="text-align:center">${up ? 'Already have an account?' : 'New here?'} <button type="button" class="link" onClick=${() => { setMode(up ? 'in' : 'up'); setError(null); }}>${up ? 'Sign in' : 'Create an account'}</button></p>
  </main></div>`;
}

function Account({ user, onSignOut, go }) {
  const [busy, setBusy] = useState(false);
  return html`<main class="page fade-in">
    <header class="topbar">
      <button type="button" class="icon-btn" aria-label="Back" onClick=${() => go({ view: 'home' })}>${I.back}</button>
      <div class="title"><b>Account</b></div>
      <span class="icon-btn"></span>
    </header>
    <div class="card rows">
      <div class="row"><${Avatar} p=${{ name: user.name || user.email, color: 'var(--accent)' }} />
        <div class="grow"><div class="name">${user.name || 'No name'}</div><div class="meta">${user.email}</div></div></div>
    </div>
    <button type="button" class="btn danger block" disabled=${busy} onClick=${async () => { setBusy(true); await onSignOut(); }}>Sign out</button>
  </main>`;
}

// ---------- Home ----------
function Scoreboard({ round, onOpen }) {
  const st = useMemo(() => N.settleRound(round), [round]);
  const thru = Math.min(...round.players.map((p) => { let t = 0; while (t < 18 && round.scores[p.id][t] != null) t++; return t; }));
  const ranked = [...round.players].sort((a, b) => st.projected[b.id] - st.projected[a.id]);
  const g = round.game;
  return html`<button type="button" class="board" onClick=${onOpen}>
    <div class="board-head">
      <span class="board-title">Leaders</span>
      <span class="board-tag"><span class="live-dot"></span>${round.status === 'live' ? `Live · thru ${thru}` : 'Final'}</span>
    </div>
    <div class="board-rows">
      ${ranked.map((p) => html`<div class="board-row" style="grid-template-columns:1fr auto">
        <span class="pname">${first(p.name)} ${p.name.split(' ')[1]?.[0] ?? ''}</span>
        <span class=${`tile ${st.projected[p.id] < 0 ? 'down' : 'up'}`}>${money(st.projected[p.id])}</span>
      </div>`)}
    </div>
    <div class="board-foot">
      <span><b>${round.course.name}</b> · ${N.SEGMENT_KEYS.map((k) => g.stakes[k]).join('-')} Nassau</span>
      <span>Open ›</span>
    </div>
  </button>`;
}

function Home({ state, dispatch, go, user }) {
  const live = state.rounds.filter((r) => r.status === 'live');
  const past = state.rounds.filter((r) => r.status !== 'live');
  const hasSample = state.rounds.some((r) => r.sample) || state.players.some((p) => p.sample);
  return html`<main class="page fade-in">
    <div class="home-head">
      <div class="wordmark">Dorm<i>ie</i></div>
      <div class="home-head-right">
        <small>${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</small>
        <button type="button" class="me-btn" aria-label="Account" onClick=${() => go({ view: 'account' })}><${Avatar} p=${{ name: user.name || user.email, color: 'var(--accent)' }} size="sm" /></button>
      </div>
    </div>

    ${live.map((r) => html`<div class="section">
      <div class="section-head"><h2>${r.sample ? 'Sample round' : 'In progress'}</h2><span class="meta">${r.players.length} players · ${r.game.matches.length} ${r.game.matches.length === 1 ? 'match' : 'matches'}</span></div>
      <${Scoreboard} round=${r} onOpen=${() => go({ view: 'round', id: r.id })} />
    </div>`)}

    <button type="button" class="btn primary lg block" onClick=${() => go({ view: 'setup' })}>${I.plus} Start a round</button>

    <div class="section">
      <div class="section-head"><h2>Past rounds</h2></div>
      ${past.length ? html`<div class="card rows">
        ${past.map((r) => {
          const st = N.settleRound(r);
          const top = [...r.players].sort((a, b) => st.settled[b.id] - st.settled[a.id])[0];
          return html`<button type="button" class="row" onClick=${() => go({ view: 'round', id: r.id })}>
            <div class="av-stack">${r.players.map((p) => html`<${Avatar} p=${p} size="sm" />`)}</div>
            <div class="grow"><div class="name">${r.course.name}</div><div class="meta">${dateLabel(r.createdAt)} · ${first(top.name)} took ${money(st.settled[top.id], { sign: false })}</div></div>
            <span class="icon-btn">${I.next}</span>
          </button>`;
        })}
      </div>` : html`<div class="card empty-state">Finished rounds land here with who paid whom.</div>`}
    </div>

    ${hasSample && html`<div class="banner">${I.info}<span style="flex:1">The group and round here are samples so you can see how it works. Add your own players, then clear them out.</span>
      <button type="button" class="link" onClick=${() => dispatch({ type: 'clearSamples' })}>Clear samples</button></div>`}
  </main>`;
}

// ---------- Players ----------
function PlayerForm({ initial, onSave, onCancel, submitLabel = 'Add player' }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [idx, setIdx] = useState(initial ? String(initial.index) : '');
  const parsed = parseFloat(idx.replace('+', '-'));
  const valid = name.trim() && !Number.isNaN(parsed) && parsed >= -10 && parsed <= 54;
  return html`<form class="card pad" style="display:flex;flex-direction:column;gap:12px" onSubmit=${(e) => { e.preventDefault(); if (valid) onSave({ name: name.trim(), index: parsed }); }}>
    <div class="form-grid">
      <div class="field span"><label for="pf-name">Name</label><input id="pf-name" class="input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="e.g. Kevin Walsh" autocomplete="off" /></div>
      <div class="field"><label for="pf-idx">Handicap index</label><input id="pf-idx" class="input" inputmode="decimal" value=${idx} onInput=${(e) => setIdx(e.target.value)} placeholder="12.4" /></div>
      <div class="field" style="justify-content:flex-end"><span class="note">Use + for plus handicaps, like +1.2</span></div>
    </div>
    <div style="display:flex;gap:10px">
      ${onCancel && html`<button type="button" class="btn ghost" onClick=${onCancel}>Cancel</button>`}
      <button class="btn primary" style="flex:1" disabled=${!valid}>${submitLabel}</button>
    </div>
  </form>`;
}

function Players({ state, dispatch }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);
  return html`<main class="page fade-in">
    <div><h1 class="h">Players</h1><p class="sub">Your regular group. Handicaps carry into every new round.</p></div>
    ${adding ? html`<${PlayerForm} onCancel=${() => setAdding(false)} onSave=${(v) => { dispatch({ type: 'addPlayer', player: { id: uid('p-'), color: COLORS[state.players.length % COLORS.length], ...v } }); setAdding(false); }} />`
      : html`<button type="button" class="btn soft block" onClick=${() => setAdding(true)}>${I.plus} Add player</button>`}
    <div class="card rows">
      ${state.players.map((p) => editing === p.id
        ? html`<div style="padding:4px"><${PlayerForm} initial=${p} submitLabel="Save" onCancel=${() => setEditing(null)} onSave=${(v) => { dispatch({ type: 'updatePlayer', id: p.id, patch: { ...v, sample: false } }); setEditing(null); }} /></div>`
        : html`<div class="row">
          <${Avatar} p=${p} />
          <div class="grow"><div class="name">${p.name}</div><div class="meta">Index ${fmtIndex(p.index)} · CH ${N.courseHandicap(p.index, withTee(state.courses[0] || SAMPLE_COURSE))} at ${(state.courses[0] || SAMPLE_COURSE).name} (${withTee(state.courses[0] || SAMPLE_COURSE).tees})${p.sample ? ' · sample' : ''}</div></div>
          ${confirm === p.id
            ? html`<button type="button" class="btn danger sm" onClick=${() => { dispatch({ type: 'removePlayer', id: p.id }); setConfirm(null); }}>Remove</button>
                   <button type="button" class="btn ghost sm" onClick=${() => setConfirm(null)}>Keep</button>`
            : html`<button type="button" class="link" onClick=${() => setEditing(p.id)}>Edit</button>
                   <button type="button" class="x-btn" aria-label=${`Remove ${p.name}`} onClick=${() => setConfirm(p.id)}>${I.x}</button>`}
        </div>`)}
    </div>
  </main>`;
}

// ---------- Courses ----------
function CourseForm({ initial, onSave, onCancel }) {
  const [c, setC] = useState(() => initial ? { ...initial, par: [...initial.par], si: [...initial.si], teeSets: initial.teeSets.map((t) => ({ ...t })) }
    : { id: uid('c-'), name: '', teeSets: [{ id: uid('t-'), name: 'Blue', rating: 72.0, slope: 128 }, { id: uid('t-'), name: 'White', rating: 70.0, slope: 122 }],
        par: [...SAMPLE_COURSE.par], si: [...SAMPLE_COURSE.si] });
  const set = (patch) => setC({ ...c, ...patch });
  const setHole = (key, h, v) => { const arr = [...c[key]]; arr[h] = parseInt(v, 10) || 0; set({ [key]: arr }); };
  const siOk = [...c.si].sort((a, b) => a - b).every((v, i) => v === i + 1);
  const setTee = (id, patch) => set({ teeSets: c.teeSets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const teesOk = c.teeSets.length > 0 && c.teeSets.every((t) => t.name.trim() && t.slope >= 55 && t.slope <= 155 && t.rating > 50 && t.rating < 85);
  const valid = c.name.trim() && teesOk && siOk && c.par.every((p) => p >= 3 && p <= 6);
  const nine = (start) => html`<div class="grid-holes">
    <span class="h"></span>${Array.from({ length: 9 }, (_, i) => html`<span class="h">${start + i + 1}</span>`)}
    <span class="h">Par</span>${Array.from({ length: 9 }, (_, i) => html`<input aria-label=${`Par hole ${start + i + 1}`} inputmode="numeric" value=${c.par[start + i]} onInput=${(e) => setHole('par', start + i, e.target.value)} />`)}
    <span class="h">SI</span>${Array.from({ length: 9 }, (_, i) => html`<input aria-label=${`Stroke index hole ${start + i + 1}`} inputmode="numeric" value=${c.si[start + i]} onInput=${(e) => setHole('si', start + i, e.target.value)} />`)}
  </div>`;
  return html`<form class="card pad" style="display:flex;flex-direction:column;gap:14px" onSubmit=${(e) => { e.preventDefault(); if (valid) onSave({ ...c, name: c.name.trim(), sample: false }); }}>
    <div class="form-grid">
      <div class="field span"><label for="cf-name">Course</label><input id="cf-name" class="input" value=${c.name} onInput=${(e) => set({ name: e.target.value })} placeholder="e.g. Ridgewood CC" /></div>
    </div>
    <div class="section">
      <div class="section-head"><span class="eyebrow">Tees</span><span class="meta">Par ${sum(c.par)}</span></div>
      <div class="tee-grid">
        <span class="h">Name</span><span class="h">Rating</span><span class="h">Slope</span><span></span>
        ${c.teeSets.map((t) => html`
          <input class="input" aria-label="Tee name" value=${t.name} onInput=${(e) => setTee(t.id, { name: e.target.value })} />
          <input class="input" aria-label=${`${t.name} rating`} inputmode="decimal" value=${t.rating} onInput=${(e) => setTee(t.id, { rating: parseFloat(e.target.value) || 0 })} />
          <input class="input" aria-label=${`${t.name} slope`} inputmode="numeric" value=${t.slope} onInput=${(e) => setTee(t.id, { slope: parseInt(e.target.value, 10) || 0 })} />
          <button type="button" class="x-btn" aria-label=${`Remove ${t.name} tees`} disabled=${c.teeSets.length === 1} onClick=${() => set({ teeSets: c.teeSets.filter((x) => x.id !== t.id) })}>${I.x}</button>`)}
      </div>
      <button type="button" class="btn ghost sm" style="align-self:flex-start" onClick=${() => set({ teeSets: [...c.teeSets, { id: uid('t-'), name: '', rating: 70.0, slope: 120 }] })}>${I.plus} Add tees</button>
      ${!teesOk && html`<div class="note neg">Each tee needs a name, a rating and a slope between 55 and 155.</div>`}
    </div>
    <div class="section"><div class="eyebrow">Front nine</div>${nine(0)}</div>
    <div class="section"><div class="eyebrow">Back nine</div>${nine(9)}</div>
    ${!siOk && html`<div class="note neg">Stroke indexes need to use 1 through 18 once each.</div>`}
    <div style="display:flex;gap:10px">
      ${onCancel && html`<button type="button" class="btn ghost" onClick=${onCancel}>Cancel</button>`}
      <button class="btn primary" style="flex:1" disabled=${!valid}>Save course</button>
    </div>
  </form>`;
}

function Courses({ state, dispatch }) {
  const [editing, setEditing] = useState(null);
  return html`<main class="page fade-in">
    <div><h1 class="h">Courses</h1><p class="sub">Rating, slope and stroke index decide who gets pops where.</p></div>
    ${editing === 'new' ? html`<${CourseForm} onCancel=${() => setEditing(null)} onSave=${(c) => { dispatch({ type: 'saveCourse', course: c }); setEditing(null); }} />`
      : html`<button type="button" class="btn soft block" onClick=${() => setEditing('new')}>${I.plus} Add course</button>`}
    <div class="card rows">
      ${state.courses.map((c) => editing === c.id
        ? html`<div style="padding:4px"><${CourseForm} initial=${c} onCancel=${() => setEditing(null)} onSave=${(v) => { dispatch({ type: 'saveCourse', course: v }); setEditing(null); }} /></div>`
        : html`<div class="row">
          <div class="grow"><div class="name">${c.name}</div><div class="meta">Par ${sum(c.par)} · ${teeSummary(c)}${c.sample ? ' · sample' : ''}</div></div>
          <button type="button" class="link" onClick=${() => setEditing(c.id)}>Edit</button>
        </div>`)}
    </div>
  </main>`;
}

// ---------- New round setup ----------
const MAX_PLAYERS = 5;

function Setup({ state, dispatch, go }) {
  const [step, setStep] = useState(0);
  const [ids, setIds] = useState([]);
  const [courseId, setCourseId] = useState(state.courses[0]?.id);
  const [teeId, setTeeId] = useState(state.courses[0]?.lastTee);
  const [wheel, setWheel] = useState([]);
  const [game, setGame] = useState(N.defaultGame);
  const [teams, setTeams] = useState({});
  const [scoring, setScoring] = useState('bestball');
  const [custom, setCustom] = useState([]);
  const [adding, setAdding] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);

  const baseCourse = state.courses.find((c) => c.id === courseId);
  const course = baseCourse && withTee(baseCourse, teeId);
  const pickCourse = (c) => { setCourseId(c.id); setTeeId(c.lastTee); };
  const selected = ids.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);

  const toggle = (id) => {
    if (ids.includes(id)) setIds(ids.filter((x) => x !== id));
    else if (ids.length < MAX_PLAYERS) setIds([...ids, id]);
  };

  // Default format + teams follow the group size.
  useEffect(() => {
    const t = {};
    ids.forEach((id, i) => { t[id] = ids.length === 4 ? (i === 0 || i === 3 ? 'a' : 'b') : i % 2 === 0 ? 'a' : 'b'; });
    setTeams(t);
    setGame((g) => ({ ...g, format: ids.length === 4 || ids.length === 2 ? 'teams' : ids.length === 5 ? 'wheel' : 'roundrobin' }));
    setWheel(ids.slice(0, 2));
    setCustom([]);
  }, [ids.join()]);

  const matches = useMemo(() => N.buildMatches(game.format, ids, teams, scoring, custom, wheel), [game.format, ids, teams, scoring, custom, wheel]);
  const draftRound = course && { course, players: selected, game: { ...game, matches } };

  const canNext = [ids.length >= 2, !!course, matches.length > 0][step];
  const next = () => {
    if (step < 2) { setStep(step + 1); window.scrollTo(0, 0); return; }
    const scores = {};
    for (const id of ids) scores[id] = Array(18).fill(null);
    const round = {
      id: uid('r-'), createdAt: Date.now(), course, players: selected.map((p) => ({ ...p })), scores,
      game: { ...game, teams, wheel, matches }, presses: [], hole: 0, status: 'live',
    };
    dispatch({ type: 'createRound', round });
    go({ view: 'round', id: round.id });
  };
  const back = () => (step === 0 ? go({ view: 'home' }) : setStep(step - 1));

  const titles = [["Who's playing?", `Pick 2 to ${MAX_PLAYERS} players. Tap in tee order.`], ['Where to?', 'Pick the course, then the tees you are playing.'], ['Set the game', 'A Nassau: front nine, back nine and the 18.']];

  return html`<div class="app">
    <header class="topbar">
      <button type="button" class="icon-btn" aria-label=${step === 0 ? 'Close' : 'Back'} onClick=${back}>${step === 0 ? I.x : I.back}</button>
      <div class="title"><b>New round</b><span>Step ${step + 1} of 3</span></div>
      <span class="icon-btn"></span>
    </header>
    <main class="page fade-in" key=${step}>
      <div class="steps" aria-hidden="true">${[0, 1, 2].map((i) => html`<span class=${i <= step ? 'on' : ''}></span>`)}</div>
      <div><h1 class="h">${titles[step][0]}</h1><p class="sub">${titles[step][1]}</p></div>

      ${step === 0 && html`
        <div class="tray" aria-label="Selected players">
          ${Array.from({ length: MAX_PLAYERS }, (_, i) => selected[i]
            ? html`<button type="button" class="tray-slot" onClick=${() => toggle(selected[i].id)} aria-label=${`Remove ${selected[i].name}`}><${Avatar} p=${selected[i]} /><span>${first(selected[i].name)}</span></button>`
            : html`<div class="tray-slot"><div class="empty"></div><span>${i < 2 ? 'Required' : 'Open'}</span></div>`)}
        </div>
        <div class="card rows">
          ${state.players.map((p) => {
            const on = ids.includes(p.id);
            return html`<button type="button" class="pick" aria-pressed=${on} disabled=${!on && ids.length >= MAX_PLAYERS} onClick=${() => toggle(p.id)}>
              <${Avatar} p=${p} />
              <div style="flex:1;min-width:0"><div style="font-weight:700">${p.name}</div><div class="note">Index ${fmtIndex(p.index)}${course ? ` · CH ${N.courseHandicap(p.index, course)}` : ''}</div></div>
              <span class="check">${I.check}</span>
            </button>`;
          })}
        </div>
        ${adding ? html`<${PlayerForm} onCancel=${() => setAdding(false)} onSave=${(v) => {
          const player = { id: uid('p-'), color: COLORS[state.players.length % COLORS.length], ...v };
          dispatch({ type: 'addPlayer', player });
          if (ids.length < MAX_PLAYERS) setIds([...ids, player.id]);
          setAdding(false);
        }} />` : html`<button type="button" class="btn ghost block" onClick=${() => setAdding(true)}>${I.plus} New player</button>`}
      `}

      ${step === 1 && html`
        <div class="card rows">
          ${state.courses.map((c) => html`<button type="button" class="pick" aria-pressed=${c.id === courseId} onClick=${() => pickCourse(c)}>
            <div style="flex:1;min-width:0"><div style="font-weight:700">${c.name}</div><div class="note">Par ${sum(c.par)} · ${c.teeSets.length} ${c.teeSets.length === 1 ? 'tee' : 'tees'}</div></div>
            <span class="check">${I.check}</span>
          </button>`)}
        </div>
        ${addingCourse ? html`<${CourseForm} onCancel=${() => setAddingCourse(false)} onSave=${(c) => { dispatch({ type: 'saveCourse', course: c }); pickCourse(c); setAddingCourse(false); }} />`
          : html`<button type="button" class="btn ghost block" onClick=${() => setAddingCourse(true)}>${I.plus} New course</button>`}
        ${baseCourse && html`<div class="section">
          <div class="section-head"><h2>Tees</h2><span class="meta">${baseCourse.name}</span></div>
          <div class="tee-picks" role="radiogroup" aria-label="Tees">
            ${baseCourse.teeSets.map((t) => html`<button type="button" role="radio" class="tee-pick" aria-checked=${course.teeId === t.id} onClick=${() => setTeeId(t.id)}>
              <span class="tee-dot" style=${{ background: teeColor(t.name) }}></span>
              <b>${t.name}</b><span class="num">${t.rating.toFixed(1)} / ${t.slope}</span>
            </button>`)}
          </div>
        </div>`}
        ${course && html`<div class="section">
          <div class="section-head"><h2>Course handicaps</h2><span class="meta">${course.tees} tees</span></div>
          <div class="card rows">${selected.map((p) => html`<div class="row" style="min-height:52px">
            <${Avatar} p=${p} size="sm" /><div class="grow"><div class="name">${p.name}</div></div>
            <span class="note">${fmtIndex(p.index)} →</span><b class="num" style="min-width:28px;text-align:right">${N.courseHandicap(p.index, course)}</b>
          </div>`)}</div>
        </div>`}
      `}

      ${step === 2 && draftRound && html`<${GameSetup} round=${draftRound} game=${game} setGame=${setGame} ids=${ids} players=${selected}
        teams=${teams} setTeams=${setTeams} wheel=${wheel} setWheel=${setWheel} scoring=${scoring} setScoring=${setScoring} custom=${custom} setCustom=${setCustom} matches=${matches} />`}
    </main>
    <div class="dock"><div class="dock-inner">
      <span class="hint">${step === 0 ? `${ids.length} of ${MAX_PLAYERS} selected` : step === 1 ? course?.name ?? 'Pick a course' : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}</span>
      <button type="button" class="btn primary" disabled=${!canNext} onClick=${next}>${step === 2 ? html`${I.flag} Tee off` : html`Next ${I.arrow}`}</button>
    </div></div>
  </div>`;
}

function SideToggle({ value, onChange, allowOut }) {
  const opts = allowOut ? ['a', 'b', 'x'] : ['a', 'b'];
  return html`<div class="side-toggle" role="group">
    ${opts.map((o) => html`<button type="button" class=${o} aria-pressed=${value === o || (o === 'x' && !value)} onClick=${() => onChange(o)}>${o === 'x' ? '—' : o.toUpperCase()}</button>`)}
  </div>`;
}

function CustomMatchBuilder({ players, onAdd }) {
  const [sides, setSides] = useState({});
  const [sc, setSc] = useState('bestball');
  const a = players.filter((p) => sides[p.id] === 'a').map((p) => p.id);
  const b = players.filter((p) => sides[p.id] === 'b').map((p) => p.id);
  return html`<div class="card">
    <div class="opt" style="padding-bottom:6px"><div class="grow"><div class="t">New match</div><div class="d">Put players on side A or B. Leave out anyone not in it.</div></div></div>
    <div class="rows">${players.map((p) => html`<div class="row" style="min-height:54px"><${Avatar} p=${p} size="sm" /><div class="grow"><div class="name">${p.name}</div></div>
      <${SideToggle} value=${sides[p.id]} allowOut onChange=${(v) => setSides({ ...sides, [p.id]: v === 'x' ? undefined : v })} /></div>`)}</div>
    ${(a.length > 1 || b.length > 1) && html`<div class="opt-sub" style="padding-top:12px"><${Seg} value=${sc} onChange=${setSc} options=${[{ value: 'bestball', label: 'Best ball' }, { value: 'aggregate', label: 'Aggregate' }]} /></div>`}
    <div class="opt-sub" style="padding-top:12px"><button type="button" class="btn soft block" disabled=${!a.length || !b.length}
      onClick=${() => { onAdd({ id: uid('m-'), a, b, scoring: sc }); setSides({}); }}>${I.plus} Add match</button></div>
  </div>`;
}

function GameSetup({ round, game, setGame, ids, players, teams, setTeams, wheel, setWheel, scoring, setScoring, custom, setCustom, matches }) {
  const upd = (patch) => setGame({ ...game, ...patch });
  const st = game.stakes;
  const same = st.front === st.back && st.back === st.overall;
  const name = (id) => first(players.find((p) => p.id === id).name);
  const preview = useMemo(() => {
    // Strokes per player: in a single match show match strokes, otherwise strokes off the group low.
    const r = { ...round, game: { ...game, matches } };
    if (matches.length === 1) return N.matchStrokes(r, matches[0]);
    const all = { id: 'all', a: ids, b: [] };
    const g = game.handicap.strokesOff === 'full' ? game : { ...game, handicap: { ...game.handicap, strokesOff: 'group' } };
    return N.matchStrokes({ ...r, game: g }, all);
  }, [round, game, matches]);

  const summary = [
    `$${same ? st.front : `${st.front}-${st.back}-${st.overall}`} Nassau`,
    game.handicap.mode === 'gross' ? 'gross' : `${game.handicap.allowance === 100 ? 'full' : `${game.handicap.allowance}%`} handicaps ${({ match: 'off the low man', group: 'off low in the group', full: 'with no adjustment' })[game.handicap.strokesOff]}`,
    game.autoPress.enabled ? `${game.autoPress.down}-down auto presses` : null,
    game.manualPress ? 'manual presses on' : null,
  ].filter(Boolean);
  const totalBets = matches.length * 3;

  return html`
    <div class="section">
      <div class="section-head"><h2>Format</h2></div>
      <${Seg} tall value=${game.format} onChange=${(v) => upd({ format: v })} options=${[
        { value: 'teams', label: 'Teams', sub: ids.length === 2 ? '1 v 1' : 'Side v side' },
        ...(ids.length === 5 ? [{ value: 'wheel', label: 'Wheel', sub: '2 v pairs' }] : []),
        { value: 'roundrobin', label: 'Everyone', sub: `${(ids.length * (ids.length - 1)) / 2} singles` },
        { value: 'custom', label: 'Custom', sub: 'Any combo' },
      ]} />
      ${game.format === 'teams' && html`<div class="card">
        <div class="rows">${players.map((p) => html`<div class="row" style="min-height:56px"><${Avatar} p=${p} size="sm" />
          <div class="grow"><div class="name">${p.name}</div></div>
          <${SideToggle} value=${teams[p.id]} onChange=${(v) => setTeams({ ...teams, [p.id]: v })} /></div>`)}</div>
        ${matches[0] && (matches[0].a.length > 1 || matches[0].b.length > 1) && html`<div class="opt-sub" style="padding-top:12px">
          <${Seg} value=${scoring} onChange=${setScoring} options=${[{ value: 'bestball', label: 'Best ball' }, { value: 'aggregate', label: 'Aggregate' }]} />
        </div>`}
        ${matches[0] && matches[0].a.length !== matches[0].b.length && html`<div class="opt-sub note">Uneven sides: each winner collects the stake and the losing side splits the total.</div>`}
        ${!matches.length && html`<div class="opt-sub note neg">Each side needs at least one player.</div>`}
      </div>`}
      ${game.format === 'wheel' && html`<div class="card">
        <div class="opt" style="padding-bottom:4px"><div class="grow"><div class="t">The wheel team</div><div class="d">Pick the two partners. They play a match against every pair of the other three.</div></div></div>
        <div class="rows">${players.map((p) => {
          const on = wheel.includes(p.id);
          return html`<button type="button" class="pick" aria-pressed=${on} onClick=${() => setWheel(on ? wheel.filter((x) => x !== p.id) : [...wheel, p.id].slice(-2))}>
            <${Avatar} p=${p} size="sm" /><div style="flex:1;min-width:0;font-weight:700">${p.name}</div>
            ${on && html`<span class="pill a">Wheel</span>`}<span class="check">${I.check}</span>
          </button>`;
        })}</div>
        ${matches.length > 0 && html`<div class="opt-sub" style="padding-top:12px;display:flex;flex-direction:column;gap:8px">
          ${matches.map((m) => html`<div class="match-head"><span class="sa">${m.a.map(name).join(' & ')}</span><span class="vs">vs</span><span class="sb">${m.b.map(name).join(' & ')}</span></div>`)}
        </div>`}
        <div class="opt-sub" style="padding-top:4px"><${Seg} value=${scoring} onChange=${setScoring} options=${[{ value: 'bestball', label: 'Best ball' }, { value: 'aggregate', label: 'Aggregate' }]} /></div>
        <div class="opt-sub note">${wheel.length === 2 ? 'The wheel team is in all 3 matches; everyone else plays 2.' : 'Pick two players for the wheel.'}</div>
      </div>`}
      ${game.format === 'roundrobin' && html`<div class="card pad"><div class="chips">
        ${matches.map((m) => html`<span class="chip">${name(m.a[0])} <span class="c-n">v</span> ${name(m.b[0])}</span>`)}
      </div><p class="note" style="margin:10px 0 0">Every player has a separate Nassau with every other player.</p></div>`}
      ${game.format === 'custom' && html`
        ${custom.length > 0 && html`<div class="card rows">${custom.map((m) => html`<div class="row" style="min-height:52px">
          <div class="grow match-head"><span class="sa">${m.a.map(name).join(' & ')}</span><span class="vs">vs</span><span class="sb">${m.b.map(name).join(' & ')}</span></div>
          <span class="note">${m.a.length + m.b.length > 2 ? (m.scoring === 'aggregate' ? 'Agg' : 'Best ball') : ''}</span>
          <button type="button" class="x-btn" aria-label="Remove match" onClick=${() => setCustom(custom.filter((x) => x.id !== m.id))}>${I.x}</button>
        </div>`)}</div>`}
        <${CustomMatchBuilder} players=${players} onAdd=${(m) => setCustom([...custom, m])} />
      `}
    </div>

    <div class="section">
      <div class="section-head"><h2>Stakes</h2><span class="meta">per player, per bet</span></div>
      <div class="chips">${[2, 5, 10, 20, 50].map((v) => html`<button type="button" class="chip" aria-pressed=${same && st.front === v}
        onClick=${() => upd({ stakes: { front: v, back: v, overall: v } })}>$${v}</button>`)}</div>
      <div class="card rows">
        ${N.SEGMENT_KEYS.map((k) => html`<${Opt} title=${N.SEGMENTS[k].label} desc=${k === 'overall' ? 'All 18 holes' : k === 'front' ? 'Holes 1–9' : 'Holes 10–18'}>
          <${Stepper} label=${`${k} stake`} value=${st[k]} min=${1} max=${1000} step=${stakeStep} format=${(v) => `$${v}`} onChange=${(v) => upd({ stakes: { ...st, [k]: v } })} />
        </${Opt}>`)}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Handicaps</h2></div>
      <div class="card">
        <div class="opt-sub" style="padding-top:14px"><${Seg} value=${game.handicap.mode} onChange=${(v) => upd({ handicap: { ...game.handicap, mode: v } })}
          options=${[{ value: 'net', label: 'Net' }, { value: 'gross', label: 'Gross' }]} /></div>
        ${game.handicap.mode === 'net' && html`
          <${Opt} title="Allowance" desc="Share of each course handicap used">
            <${Stepper} label="Allowance" value=${game.handicap.allowance} min=${50} max=${100} step=${5} format=${(v) => `${v}%`}
              onChange=${(v) => upd({ handicap: { ...game.handicap, allowance: v } })} />
          </${Opt}>
          <div class="opt-sub"><${Seg} tall value=${game.handicap.strokesOff} onChange=${(v) => upd({ handicap: { ...game.handicap, strokesOff: v } })} options=${[
            { value: 'match', label: 'Low man', sub: 'per match' },
            { value: 'group', label: 'Low in group', sub: 'one baseline' },
            { value: 'full', label: 'Full', sub: 'everyone' },
          ]} /></div>
          <div class="opt-sub"><div class="chips">${players.map((p) => html`<span class="strokes-chip">${first(p.name)} · ${preview[p.id] ?? 0}</span>`)}</div>
            <p class="note" style="margin:8px 0 0">${matches.length > 1 && game.handicap.strokesOff === 'match' ? 'Strokes shown off the group low; each match recalculates off its own low man.' : 'Strokes received, given on the hardest holes first.'}</p></div>
        `}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Presses</h2></div>
      <div class="card rows">
        <div>
          <${Opt} title="Auto press" desc=${game.autoPress.enabled ? `A new bet starts when any bet goes ${game.autoPress.down} down` : 'Off'}>
            <${Switch} label="Auto press" on=${game.autoPress.enabled} onChange=${(v) => upd({ autoPress: { ...game.autoPress, enabled: v } })} />
          </${Opt}>
          ${game.autoPress.enabled && html`<div class="opt-sub"><${Seg} value=${game.autoPress.down} onChange=${(v) => upd({ autoPress: { ...game.autoPress, down: v } })}
            options=${[1, 2, 3, 4].map((n) => ({ value: n, label: `${n} down` }))} /></div>`}
        </div>
        <${Opt} title="Manual presses" desc="The side that's down can press any time">
          <${Switch} label="Manual presses" on=${game.manualPress} onChange=${(v) => upd({ manualPress: v })} />
        </${Opt}>
        <${Opt} title="Press the overall" desc="Allow presses on the 18-hole bet">
          <${Switch} label="Press the overall" on=${game.pressOverall} onChange=${(v) => upd({ pressOverall: v })} />
        </${Opt}>
        <div>
          <${Opt} title="Press limit" desc="Per nine, per match" />
          <div class="opt-sub"><${Seg} value=${game.maxPresses} onChange=${(v) => upd({ maxPresses: v })}
            options=${[{ value: 0, label: 'No limit' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} /></div>
        </div>
      </div>
    </div>

    <div class="summary"><span class="big">${summary[0]}</span>${summary.slice(1).join(' · ')}<br/>${matches.length} ${matches.length === 1 ? 'match' : 'matches'} · ${totalBets} bets before presses</div>
  `;
}

// ---------- Round ----------
function useRoundData(round) {
  return useMemo(() => N.settleRound(round), [round]);
}
function displayStrokes(round) {
  const ids = round.players.map((p) => p.id);
  const m = round.game.matches;
  if (m.length === 1 && [...m[0].a, ...m[0].b].length === ids.length) return N.matchStrokes(round, m[0]);
  const g = round.game.handicap.strokesOff === 'full' ? round.game : { ...round.game, handicap: { ...round.game.handicap, strokesOff: 'group' } };
  return N.matchStrokes({ ...round, game: g }, { a: ids, b: [] });
}

function Round({ round, dispatch, go }) {
  const [tab, setTab] = useState('score');
  const [toast, showToast] = useToast();
  const data = useRoundData(round);
  const thru = Math.min(...round.players.map((p) => { let t = 0; while (t < 18 && round.scores[p.id][t] != null) t++; return t; }));
  const tabs = [['score', 'Score', I.flagO], ['card', 'Card', I.card], ['bets', 'Bets', I.swords], ['settle', 'Settle', I.cash]];
  return html`<div class="app">
    <header class="topbar">
      <button type="button" class="icon-btn" aria-label="All rounds" onClick=${() => go({ view: 'home' })}>${I.back}</button>
      <div class="title"><b>${round.course.name}</b><span>${round.course.tees ? `${round.course.tees} · ` : ''}${round.status === 'final' ? 'Final' : thru === 0 ? 'Not started' : thru === 18 ? 'All 18 in' : `Thru ${thru}`} · ${dateLabel(round.createdAt)}</span></div>
      <span class="icon-btn"></span>
    </header>
    ${tab === 'score' && html`<${ScoreTab} round=${round} data=${data} dispatch=${dispatch} toast=${showToast} onSettle=${() => setTab('settle')} />`}
    ${tab === 'card' && html`<${CardTab} round=${round} data=${data} />`}
    ${tab === 'bets' && html`<${BetsTab} round=${round} data=${data} dispatch=${dispatch} />`}
    ${tab === 'settle' && html`<${SettleTab} round=${round} data=${data} dispatch=${dispatch} go=${go} toast=${showToast} />`}
    ${toast}
    <nav class="tabbar" aria-label="Round"><div class="tabbar-inner">
      ${tabs.map(([k, l, ic]) => html`<button type="button" aria-current=${tab === k ? 'page' : null} onClick=${() => { setTab(k); window.scrollTo(0, 0); }}>${ic}${l}</button>`)}
    </div></nav>
  </div>`;
}

function markFor(gross, par) {
  if (gross == null) return '';
  const d = gross - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'double' : '';
}
function Pops({ n }) {
  if (!n) return null;
  return html`<span class="pops" aria-label=${`${n > 0 ? 'Gets' : 'Gives'} ${Math.abs(n)} ${Math.abs(n) === 1 ? 'stroke' : 'strokes'}`}>${Array.from({ length: Math.abs(n) }, () => html`<i class=${n < 0 ? 'minus' : ''}></i>`)}</span>`;
}

function BetLine({ b, round, match }) {
  const who = b.leader ? sideNames(round, match[b.leader]).split(' & ').map((n) => n.slice(0, 3).toUpperCase()).join('/') : '';
  const cls = b.leader ? `c-${b.leader}` : 'c-n';
  const st = b.started ? b.status.replace('Won ', '') : `#${b.start + 1}`;
  if (b.kind !== 'main') return html`<div class=${`bet-line press ${cls}`}><svg class="flag-ic" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2.5a1 1 0 0 1 1 1V4l11.2 4.3a.8.8 0 0 1 0 1.5L7 14v7.5a1 1 0 1 1-2 0v-18a1 1 0 0 1 1-1z"/></svg>${st}</div>`;
  return html`<div class="bet-main">
    <span class=${`st ${cls}`}>${st}${b.final && b.started ? html` <svg class="flag-ic" style="color:currentColor" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` : ''}</span>
    <span class=${`who ${cls}`}>${who || (b.started ? 'All square' : '')}</span>
  </div>`;
}

function MatchCard({ round, c, dispatch, compact }) {
  const m = c.match;
  return html`<div class="card match">
    <div class="match-head"><span class="sa">${sideNames(round, m.a)}</span><span class="vs">vs</span><span class="sb">${sideNames(round, m.b)}</span>
      <span style="margin-left:auto" class="note">${c.thru ? `thru ${c.thru}` : ''}</span></div>
    <div class="segs">
      ${c.segments.map((s) => {
        const opt = N.pressOption(round, c, s.key);
        return html`<div class="seg-box">
          <div class="lbl"><span>${s.label}</span><span>$${round.game.stakes[s.key]}</span></div>
          ${s.bets.filter((b) => !compact || b.started || b.kind === 'main').map((b) => html`<${BetLine} b=${b} round=${round} match=${m} />`)}
          ${opt && html`<button type="button" class="press-btn" onClick=${() => dispatch({ type: 'addPress', roundId: round.id, press: { id: uid('pr-'), matchId: m.id, segment: s.key, start: opt.start, by: opt.side } })}
            aria-label=${`${sideNames(round, m[opt.side])} press the ${s.label.toLowerCase()} from hole ${opt.start + 1}`}>${I.flag} Press</button>`}
        </div>`;
      })}
    </div>
  </div>`;
}

function ScoreTab({ round, data, dispatch, toast, onSettle }) {
  const h = round.hole;
  const par = round.course.par[h];
  const si = round.course.si[h];
  const strokes = useMemo(() => displayStrokes(round), [round.id]);
  const pillRef = useRef();
  useEffect(() => { pillRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [h]);
  const setHole = (n) => dispatch({ type: 'setHole', roundId: round.id, hole: Math.max(0, Math.min(17, n)) });
  const holeDone = (i) => round.players.every((p) => round.scores[p.id][i] != null);
  const allIn = holeDone(h);
  const prevPresses = useRef(null);

  // Toast when an auto press kicks in.
  const autoCount = data.matches.reduce((t, c) => t + c.segments.reduce((u, s) => u + s.bets.filter((b) => b.kind === 'auto').length, 0), 0);
  useEffect(() => {
    if (prevPresses.current != null && autoCount > prevPresses.current) toast('Auto press on');
    prevPresses.current = autoCount;
  }, [autoCount]);

  const setScore = (pid, v) => dispatch({ type: 'setScore', roundId: round.id, pid, hole: h, value: v });

  return html`<main class="page with-tabs fade-in">
    <div class="holes" role="tablist" aria-label="Holes">
      ${round.course.par.map((p, i) => html`${i === 9 && html`<span class="turn"></span>`}<button type="button" role="tab" ref=${i === h ? pillRef : null}
        class=${`hole-pill ${holeDone(i) ? 'done' : ''}`} aria-current=${i === h} aria-label=${`Hole ${i + 1}`} onClick=${() => setHole(i)}>${i + 1}<small>P${p}</small></button>`)}
    </div>

    <div class="hole-hero">
      <span class="n">${h + 1}</span>
      <div class="facts"><b>Par ${par}</b><span>SI ${si} · ${h < 9 ? 'Front' : 'Back'} 9</span></div>
      <button type="button" class="icon-btn" aria-label="Previous hole" disabled=${h === 0} onClick=${() => setHole(h - 1)}>${I.back}</button>
      <button type="button" class="icon-btn" aria-label="Next hole" disabled=${h === 17} onClick=${() => setHole(h + 1)}>${I.next}</button>
    </div>

    <div class="card rows">
      ${round.players.map((p) => {
        const g = round.scores[p.id][h];
        const pops = N.strokesOnHole(strokes[p.id] ?? 0, si);
        const net = g == null ? null : g - pops;
        return html`<div class="score-row">
          <${Avatar} p=${p} />
          <div class="grow">
            <div class="name">${first(p.name)} <${Pops} n=${pops} /></div>
            <div class="meta num">${g != null && pops ? `Net ${net} · ` : ''}${sum(round.scores[p.id]) || 0} thru ${round.scores[p.id].filter((v) => v != null).length}</div>
          </div>
          <div class="score-ctl">
            <button type="button" class="step" aria-label=${`${first(p.name)} one less`} onClick=${() => setScore(p.id, g == null ? par - 1 : Math.max(1, g - 1))}>${I.minus}</button>
            <button type="button" class=${`score-val ${g == null ? 'empty' : ''}`} aria-label=${`${first(p.name)} score ${g ?? 'not set'}; tap for par`} onClick=${() => setScore(p.id, g == null ? par : null)}>
              <span class=${markFor(g, par) === 'birdie' || markFor(g, par) === 'eagle' ? 'birdie-txt' : ''}>${g ?? par}</span><span class=${`mark ${markFor(g, par)}`}></span>
            </button>
            <button type="button" class="step" aria-label=${`${first(p.name)} one more`} onClick=${() => setScore(p.id, g == null ? par + 1 : Math.min(15, g + 1))}>${I.plus}</button>
          </div>
        </div>`;
      })}
    </div>
    ${!allIn && html`<button type="button" class="btn ghost sm" style="align-self:center" onClick=${() => dispatch({ type: 'fillPar', roundId: round.id, hole: h })}>Par for the rest</button>`}

    <${DayTotal} round=${round} data=${data} />

    <div class="section">
      <div class="section-head"><h2>Matches</h2><span class="meta">${round.game.autoPress.enabled ? `${round.game.autoPress.down}-down autos` : 'No auto presses'}</span></div>
      ${data.matches.map((c) => html`<${MatchCard} round=${round} c=${c} dispatch=${dispatch} compact />`)}
    </div>

    <div class="fab-row"><div class="dock-inner">
      ${h < 17
        ? html`<button type="button" class="btn primary block lg" disabled=${!allIn} onClick=${() => setHole(h + 1)}>${allIn ? html`Hole ${h + 2} ${I.arrow}` : 'Enter every score'}</button>`
        : html`<button type="button" class="btn primary block lg" onClick=${onSettle}>${I.cash} Settle up</button>`}
    </div></div>
  </main>`;
}

function CardTab({ round, data }) {
  const strokes = useMemo(() => displayStrokes(round), [round.id]);
  const { par, si } = round.course;
  const nine = (s) => Array.from({ length: 9 }, (_, i) => s + i);
  const cells = (fn, tot) => html`${nine(0).map(fn)}<td class="tot">${tot(0)}</td>${nine(9).map(fn)}<td class="tot">${tot(9)}</td>`;
  const total = (arr, s) => { const part = arr.slice(s, s + 9); return part.some((v) => v == null) && !part.some((v) => v != null) ? '' : sum(part); };
  return html`<main class="page with-tabs fade-in">
    <div class="sc-wrap"><table class="sc">
      <tbody>
        <tr class="hdr"><th class="stick" scope="col">Hole</th>${nine(0).map((i) => html`<td>${i + 1}</td>`)}<td class="tot">Out</td>${nine(9).map((i) => html`<td>${i + 1}</td>`)}<td class="tot">In</td><td class="tot">Tot</td><td class="tot">Net</td></tr>
        <tr class="par"><td class="stick">Par</td>${cells((i) => html`<td>${par[i]}</td>`, (s) => sum(par.slice(s, s + 9)))}<td class="tot">${sum(par)}</td><td class="tot"></td></tr>
        <tr class="si"><td class="stick">Index</td>${cells((i) => html`<td>${si[i]}</td>`, () => '')}<td class="tot"></td><td class="tot"></td></tr>
        ${round.players.map((p) => {
          const row = round.scores[p.id];
          const gross = sum(row);
          const net = gross - sum(row.map((g, i) => (g == null ? 0 : N.strokesOnHole(strokes[p.id] ?? 0, si[i]))));
          return html`<tr>
            <td class="stick"><span style="display:inline-flex;align-items:center;gap:8px"><${Avatar} p=${p} size="xs" />${first(p.name)}<span class="note">${strokes[p.id] ?? 0}</span></span></td>
            ${cells((i) => {
              const pops = N.strokesOnHole(strokes[p.id] ?? 0, si[i]);
              return html`<td><span class="cell">${row[i] ?? ''}<span class=${`mark ${markFor(row[i], par[i])}`}></span>${pops > 0 && html`<span class="pd">${Array.from({ length: pops }, () => html`<i></i>`)}</span>`}</span></td>`;
            }, (s) => total(row, s))}
            <td class="tot">${gross || ''}</td><td class="tot">${gross ? net : ''}</td>
          </tr>`;
        })}
        ${data.matches.map((c) => {
          let run = 0;
          const ran = c.results.map((r) => (r == null ? null : (run += r)));
          const label = (i) => { const v = ran[i]; if (v == null) return ''; return v === 0 ? 'AS' : `${Math.abs(v)}`; };
          return html`<tr>
            <td class="stick" style="font-size:12px"><span class="c-a">${sideNames(round, c.match.a).split(' & ').map((n) => n[0]).join('')}</span> <span class="c-n">v</span> <span class="c-b">${sideNames(round, c.match.b).split(' & ').map((n) => n[0]).join('')}</span></td>
            ${cells((i) => html`<td class="res"><span class=${ran[i] > 0 ? 'c-a' : ran[i] < 0 ? 'c-b' : 'c-n'}>${label(i)}</span></td>`, () => '')}
            <td class="tot"></td><td class="tot"></td>
          </tr>`;
        })}
      </tbody>
    </table></div>
    <p class="note">Circles are birdies, squares bogeys. Dots mark strokes received. Match rows show the running 18-hole status, colored by the side that's up.</p>
  </main>`;
}

function Ribbon({ b, seg }) {
  const n = seg.end - seg.start + 1;
  return html`<div class="ribbon" style=${{ '--n': n }}>
    ${Array.from({ length: n }, (_, i) => {
      const hole = seg.start + i;
      if (hole < b.start) return html`<span class="off" style="opacity:.35"></span>`;
      const v = b.history[hole - b.start];
      if (v == null) return html`<span class="off">${hole + 1}</span>`;
      return html`<span class=${v > 0 ? 'a' : v < 0 ? 'b' : 'h'} title=${`Hole ${hole + 1}`}>${v === 0 ? '·' : Math.abs(v)}</span>`;
    })}
  </div>`;
}

/** Net across every match in the round: what each player is up or down for the day right now. */
function DayTotal({ round, data }) {
  if (data.matches.length < 2) return null;
  const ranked = [...round.players].sort((a, b) => data.projected[b.id] - data.projected[a.id]);
  const label = `${round.game.format === 'wheel' ? 'Wheel' : 'Day'} net`;
  return html`<div class="board day-total">
    <div class="board-head"><span class="board-title">${label}</span><span class="board-tag">${round.status === 'final' ? 'Final' : 'If it ended now'}</span></div>
    <div class="board-rows">${ranked.map((p) => {
      const parts = data.matches.filter((c) => c.match.a.includes(p.id) || c.match.b.includes(p.id)).map((c) => ({
        v: c.net[p.id] || 0,
        vs: sideNames(round, c.match.a.includes(p.id) ? c.match.b : c.match.a).split(' & ').map((n) => n[0]).join(''),
      }));
      return html`<div class="board-row" style="grid-template-columns:minmax(0,1fr) auto">
        <div style="min-width:0">
          <div class="pname">${first(p.name)}</div>
          <div class="parts">${parts.map((x) => html`<span><i>v ${x.vs}</i> <b class=${x.v < 0 ? 'down' : ''}>${money(x.v)}</b></span>`)}</div>
        </div>
        <span class=${`tile ${data.projected[p.id] < 0 ? 'down' : 'up'}`} style="min-width:84px">${money(data.projected[p.id])}</span>
      </div>`;
    })}</div>
  </div>`;
}

function BetsTab({ round, data, dispatch }) {
  return html`<main class="page with-tabs fade-in">
    <${DayTotal} round=${round} data=${data} />
    ${data.matches.map((c) => {
      const m = c.match;
      return html`<div class="section">
        <div class="card match">
          <div class="match-head" style="flex-wrap:wrap"><span class="sa">${sideNames(round, m.a)}</span><span class="vs">vs</span><span class="sb">${sideNames(round, m.b)}</span></div>
          <div class="chips">
            ${[...m.a, ...m.b].map((id) => html`<span class="strokes-chip"><span class=${m.a.includes(id) ? 'c-a' : 'c-b'}>${first(round.players.find((p) => p.id === id).name)}</span> · ${c.strokes[id]} ${c.strokes[id] === 1 ? 'stroke' : 'strokes'}</span>`)}
            ${[...m.a, ...m.b].length > 2 && html`<span class="strokes-chip">${m.scoring === 'aggregate' ? 'Aggregate' : 'Best ball'}</span>`}
          </div>
          ${c.segments.map((s) => {
            const opt = N.pressOption(round, c, s.key);
            return html`<div>
              <div class="section-head" style="margin-top:4px"><h2>${s.label} · $${round.game.stakes[s.key]}</h2>
                ${opt && html`<button type="button" class="press-btn" style="margin:0" onClick=${() => dispatch({ type: 'addPress', roundId: round.id, press: { id: uid('pr-'), matchId: m.id, segment: s.key, start: opt.start, by: opt.side } })}>${I.flag} ${sideNames(round, m[opt.side]).split(' & ').map((x) => x).join(' & ')} press</button>`}
              </div>
              ${s.bets.map((b) => html`<div class="bet">
                <div class="bet-top">
                  <span class="t">${b.kind !== 'main' && html`<svg class="flag-ic" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2.5a1 1 0 0 1 1 1V4l11.2 4.3a.8.8 0 0 1 0 1.5L7 14v7.5a1 1 0 1 1-2 0v-18a1 1 0 0 1 1-1z"/></svg>`}
                    ${b.label}<small>${b.kind === 'main' ? `holes ${s.start + 1}–${s.end + 1}` : `${b.kind === 'auto' ? 'auto' : sideNames(round, m[b.by])} from #${b.start + 1}`}</small></span>
                  <span class=${`pill ${b.leader ?? 'n'}`}>${b.leader ? `${sideNames(round, m[b.leader]).split(' & ').map((n) => n.slice(0, 3)).join('/')} ` : ''}${b.status}</span>
                  ${b.kind === 'manual' && !b.started && html`<button type="button" class="x-btn" aria-label="Cancel press" onClick=${() => dispatch({ type: 'removePress', roundId: round.id, pressId: b.id })}>${I.x}</button>`}
                </div>
                <${Ribbon} b=${b} seg=${s} />
              </div>`)}
            </div>`;
          })}
          <div class="match-head" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:12px">
            <span class="note">Net if it ended now</span>
            <span style="display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end">${[...m.a, ...m.b].map((id) => html`<span class="num"><span class="note">${first(round.players.find((p) => p.id === id).name)}</span> <b class=${moneyCls(c.net[id] || 0)}>${money(c.net[id] || 0)}</b></span>`)}</span>
          </div>
        </div>
      </div>`;
    })}
    <p class="note">Each cell is the bet's running status after that hole. Ties push. A press runs from its first hole to the end of its nine (or the 18).</p>
  </main>`;
}

function SettleTab({ round, data, dispatch, go, toast }) {
  const final = round.status === 'final';
  const allIn = round.players.every((p) => round.scores[p.id].every((v) => v != null));
  const bal = final ? data.settled : data.projected;
  const ranked = [...round.players].sort((a, b) => bal[b.id] - bal[a.id]);
  const pays = N.settleUp(bal);
  const name = (id) => round.players.find((p) => p.id === id).name;
  const [confirmDel, setConfirmDel] = useState(false);
  const text = () => [
    `${round.course.name} · ${dateLabel(round.createdAt)}`,
    ...ranked.map((p) => `${p.name}: ${money(bal[p.id])}`),
    '',
    ...(pays.length ? pays.map((t) => `${first(name(t.from))} pays ${first(name(t.to))} ${money(t.amount, { sign: false })}`) : ['All square.']),
  ].join('\n');
  return html`<main class="page with-tabs fade-in">
    ${!final && html`<div class="banner">${I.info}<span>${allIn ? 'All 18 are in. Finish the round to lock the numbers.' : 'Live numbers: what everyone wins or owes if the round ended right now.'}</span></div>`}
    <div class="board">
      <div class="board-head"><span class="board-title">${final ? 'Final' : 'Projected'}</span><span class="board-tag">${round.game.matches.length} ${round.game.matches.length === 1 ? 'match' : 'matches'}</span></div>
      <div class="board-rows">${ranked.map((p) => html`<div class="board-row" style="grid-template-columns:1fr auto">
        <span class="pname">${p.name}</span><span class=${`tile ${bal[p.id] < 0 ? 'down' : 'up'}`} style="min-width:84px">${money(bal[p.id])}</span>
      </div>`)}</div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Who pays whom</h2><span class="meta">fewest payments</span></div>
      <div class="card rows">
        ${pays.length ? pays.map((t) => html`<div class="pay">
          <${Avatar} p=${round.players.find((p) => p.id === t.from)} size="sm" /><span>${first(name(t.from))}</span>
          <span class="arrow">${I.arrow}</span>
          <${Avatar} p=${round.players.find((p) => p.id === t.to)} size="sm" /><span>${first(name(t.to))}</span>
          <span class="amt">${money(t.amount, { sign: false })}</span>
        </div>`) : html`<div class="empty-state">All square. Nobody owes anything.</div>`}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>By match</h2></div>
      <div class="card rows">${data.matches.map((c) => {
        const bets = c.segments.flatMap((s) => s.bets.filter((b) => b.started));
        return html`<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
          <div class="match-head"><span class="sa">${sideNames(round, c.match.a)}</span><span class="vs">vs</span><span class="sb">${sideNames(round, c.match.b)}</span></div>
          ${bets.map((b) => html`<div style="display:flex;justify-content:space-between;gap:8px;font-size:13.5px">
            <span>${N.SEGMENTS[b.segment].label}${b.kind !== 'main' ? ` · ${b.label}` : ''} <span class="note">$${b.stake}</span></span>
            <span class=${b.leader ? `c-${b.leader}` : 'c-n'} style="font-weight:750">${b.leader ? `${sideNames(round, c.match[b.leader])} ` : ''}${b.status}</span>
          </div>`)}
        </div>`;
      })}</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px">
      <button type="button" class="btn ghost block" onClick=${() => {
        const t = text();
        navigator.clipboard?.writeText(t).then(() => toast('Copied results'), () => toast('Copy blocked here'));
      }}>${I.copy} Copy results</button>
      ${final
        ? html`<button type="button" class="btn ghost block" onClick=${() => dispatch({ type: 'setStatus', roundId: round.id, status: 'live' })}>Reopen round</button>`
        : html`<button type="button" class="btn primary block" onClick=${() => { dispatch({ type: 'setStatus', roundId: round.id, status: 'final' }); toast('Round finished'); }}>${I.check} Finish round</button>`}
      ${confirmDel
        ? html`<div style="display:flex;gap:10px"><button type="button" class="btn danger" style="flex:1" onClick=${() => { dispatch({ type: 'deleteRound', roundId: round.id }); go({ view: 'home' }); }}>Delete for good</button>
            <button type="button" class="btn ghost" onClick=${() => setConfirmDel(false)}>Keep</button></div>`
        : html`<button type="button" class="btn danger block" onClick=${() => setConfirmDel(true)}>Delete round</button>`}
    </div>
  </main>`;
}

render(html`<${App} />`, document.getElementById('root'));
