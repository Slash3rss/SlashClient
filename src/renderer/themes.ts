/**
 * The launcher's themes (Settings → "Motyw"): the accent, the background and the glow behind the page,
 * one of the ready ones or the player's own colour; "Jasny" is the light one (its styles: `:root.theme-light`
 * in style.css). A seasonal look (season.ts) covers the colours in its days, as before. The choice is also
 * kept in the page's storage, so the splash at start is drawn in it before the launcher's settings are read.
 */

export interface Theme {
  id: string;
  /** Polish name (English in i18nThemes.ts). */
  name: string;
  accent: string;
  /** The three glows behind the page. */
  orbs: [string, string, string];
  /** The page's background and the one of small things on it (icons, avatars). */
  bg?: string;
  bg2?: string;
  /** The stars of the sky, as "r, g, b". */
  stars: string;
  /** A light theme: dark text on a pale page. */
  light?: boolean;
}

export const THEMES: Theme[] = [
  { id: 'blue', name: 'Niebieski', accent: '#3b82f6', orbs: ['#2563eb', '#7c3aed', '#60a5fa'], stars: '191, 219, 254' },
  { id: 'violet', name: 'Fiolet', accent: '#8b5cf6', orbs: ['#7c3aed', '#db2777', '#a78bfa'], bg: '#0c0a14', bg2: '#16111f', stars: '221, 214, 254' },
  { id: 'emerald', name: 'Szmaragd', accent: '#10b981', orbs: ['#059669', '#0d9488', '#34d399'], bg: '#08110e', bg2: '#0f1a16', stars: '209, 250, 229' },
  { id: 'ocean', name: 'Morski', accent: '#06b6d4', orbs: ['#0891b2', '#2563eb', '#22d3ee'], bg: '#071014', bg2: '#0e1a20', stars: '207, 250, 254' },
  { id: 'red', name: 'Czerwień', accent: '#ef4444', orbs: ['#dc2626', '#9f1239', '#f87171'], bg: '#120a0b', bg2: '#1c1113', stars: '254, 202, 202' },
  { id: 'gold', name: 'Złoto', accent: '#f59e0b', orbs: ['#d97706', '#b45309', '#fbbf24'], bg: '#110e08', bg2: '#1b160e', stars: '253, 230, 138' },
  { id: 'pink', name: 'Róż', accent: '#ec4899', orbs: ['#db2777', '#7c3aed', '#f472b6'], bg: '#120a10', bg2: '#1c111a', stars: '251, 207, 232' },
  { id: 'black', name: 'Czarny', accent: '#3b82f6', orbs: ['#1e3a8a', '#3b0764', '#1e40af'], bg: '#000000', bg2: '#0a0a0c', stars: '203, 213, 225' },
  { id: 'light', name: 'Jasny', accent: '#2563eb', orbs: ['#93c5fd', '#c4b5fd', '#bae6fd'], bg: '#f4f6fb', bg2: '#e6eaf2', stars: '148, 163, 184', light: true },
];

/** The id of the player's own colour (with `themeAccent`). */
export const CUSTOM = 'custom';
const STORAGE = 'slash.theme';

const HEX = /^#[0-9a-f]{6}$/i;
const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  l = Math.min(1, Math.max(0, l));
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** The lighter, darker and pale shades of an accent, as the page's tokens use them. */
export function shades(accent: string) {
  const [h, s, l] = toHsl(rgbOf(accent));
  return { light: fromHsl(h, s, l + 0.1), dark: fromHsl(h, s, l - 0.15), pale: fromHsl(h, Math.min(1, s), l + 0.22) };
}

/** The player's own colour as a whole theme: its glows from the colour and two of its neighbours. */
export function customTheme(accent: string): Theme {
  const color = HEX.test(accent) ? accent.toLowerCase() : '#3b82f6';
  const [h, s, l] = toHsl(rgbOf(color));
  const pale = shades(color).pale;
  return {
    id: CUSTOM, name: 'Własny', accent: color,
    orbs: [fromHsl(h, s, l - 0.1), fromHsl(h + 40, s, l - 0.1), fromHsl(h - 20, s, l + 0.1)],
    bg: fromHsl(h, Math.min(s, 0.35), 0.05), bg2: fromHsl(h, Math.min(s, 0.3), 0.09),
    stars: rgbOf(pale).join(', '),
  };
}

/** The theme of a setting: a ready one, the own colour, or the default (unknown ids from a newer launcher too). */
export function themeOf(id: string | undefined, accent?: string): Theme {
  if (id === CUSTOM) return customTheme(accent ?? '');
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * The CSS of a theme: the tokens on the root (not while a seasonal look is on, which has its own) and the
 * glows. The default theme needs none: style.css is drawn in it.
 */
export function themeCss(theme: Theme): string {
  if (theme.id === 'blue') return '';
  const { light, dark, pale: soft } = shades(theme.accent);
  // on the light page the "pale" accent of texts and badges must be the deep one, or it fades into the white
  const pale = theme.light ? dark : soft;
  const rgb = (hex: string) => rgbOf(hex).join(', ');
  const root = ':root:not([class*="season-"])';
  const vars = [
    `--accent: ${theme.accent}`, `--accent-light: ${light}`, `--accent-dark: ${dark}`, `--accent-pale: ${pale}`,
    `--accent-rgb: ${rgb(theme.accent)}`, `--accent-light-rgb: ${rgb(light)}`, `--accent-dark-rgb: ${rgb(dark)}`,
    `--accent-glow: rgba(${rgb(theme.accent)}, .4)`, `--accent-gradient: linear-gradient(135deg, ${theme.accent}, ${dark})`,
    `--glass-border-focus: rgba(${rgb(theme.accent)}, .4)`,
    ...(theme.bg ? [`--bg-primary: ${theme.bg}`] : []), ...(theme.bg2 ? [`--bg-secondary: ${theme.bg2}`] : []),
  ];
  const orbs = theme.orbs.map((c, i) => `${root} .orb-${i + 1} { background: radial-gradient(circle, ${c} 0%, transparent 70%); }`);
  return `${root} { ${vars.join('; ')}; }\n${orbs.join('\n')}\n`;
}

let sheet: CSSStyleSheet | undefined;

/** Puts a theme on the page (and remembers it for the next start's splash). */
export function applyTheme(id: string | undefined, accent?: string): Theme {
  const theme = themeOf(id, accent);
  // a sheet made in code: the page's security rules (CSP style-src 'self') refuse a <style> written into it
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(themeCss(theme));
  document.documentElement.classList.toggle('theme-light', !!theme.light);
  document.documentElement.style.colorScheme = theme.light ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ id: theme.id, accent: theme.id === CUSTOM ? theme.accent : undefined }));
  } catch {
    // only for the splash
  }
  return theme;
}

/** The theme the launcher was in last time: put on at once, before the settings are read. */
export function applyRememberedTheme(): Theme {
  try {
    const kept = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as { id?: string; accent?: string } | null;
    return applyTheme(kept?.id, kept?.accent);
  } catch {
    return applyTheme(undefined);
  }
}
