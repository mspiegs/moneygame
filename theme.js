// Appearance: light, dark, or match the phone. Remembered per device.
// index.html applies the saved choice before the page draws (no flash); this
// module changes it and keeps the iPhone app's status bar readable.

const KEY = 'dormie.theme';
export const THEMES = ['light', 'dark', 'system'];
const DEFAULT = 'light';

const dark = window.matchMedia('(prefers-color-scheme: dark)');

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.includes(t) ? t : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Is the app showing dark right now, given a choice? */
const isDark = (t) => t === 'dark' || (t === 'system' && dark.matches);

export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  // iPhone app: light text on a dark app, dark text on a light one, whatever the phone's own setting.
  globalThis.Capacitor?.Plugins?.StatusBar?.setStyle({ style: isDark(t) ? 'DARK' : 'LIGHT' }).catch?.(() => {});
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch {}
  applyTheme(t);
}

// "Match phone" follows the phone switching between light and dark.
dark.addEventListener?.('change', () => { if (getTheme() === 'system') applyTheme('system'); });
