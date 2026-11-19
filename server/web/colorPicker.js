// The admin panel's colour picker, in place of the browser's own: a swatch button that opens a panel
// with a saturation/brightness square, a hue bar, a hex field, ready colours and the last used ones.
// Works with the mouse, a finger and the keyboard; on a phone it opens as a sheet at the bottom.
// The value stays what the browser's picker gave: "#rrggbb" in small letters.
import { L, el, icon } from './common.js';

const PRESETS = ['#ef4444', '#f97316', '#facc15', '#4ade80', '#10b981', '#06b6d4', '#60a5fa', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f3f4f6', '#9ca3af', '#4b5563'];
const RECENT_KEY = 'slashclient-admin-recent-colors';
const RECENT_MAX = 7;

/** "#abc" or "abc123" → "#aabbcc"; undefined when it is not a colour. */
export function normalizeHex(text) {
  let h = String(text ?? '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.replace(/./g, '$&$&');
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : undefined;
}

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }) {
  const f = (k) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

function recentColors() {
  try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []).map(normalizeHex).filter(Boolean).slice(0, RECENT_MAX); } catch { return []; }
}
function rememberColor(hex) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recentColors().filter((c) => c !== hex)].slice(0, RECENT_MAX))); } catch { /* private mode: no history */ }
}

/** Follows a press (mouse or finger) on `area` and its drag, with x and y from 0 to 1 inside it. */
function dragOn(area, move, done) {
  area.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    area.focus({ preventScroll: true });
    area.setPointerCapture(e.pointerId);
    const at = (ev) => {
      const r = area.getBoundingClientRect();
      move(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const up = () => { area.removeEventListener('pointermove', at); area.removeEventListener('pointerup', up); area.removeEventListener('pointercancel', up); done(); };
    area.addEventListener('pointermove', at);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  });
}

/** The one picker open at a time (opening another closes it). */
let openPicker;

/**
 * A colour field: acts like `<input type="color">` for the code around it – `.value` reads and sets
 * "#rrggbb", "input" fires while picking and "change" once a colour is picked.
 */
export function colorField(value = '#60a5fa', { title = L('Kolor', 'Colour') } = {}) {
  let hex = normalizeHex(value) ?? '#60a5fa';
  let hsv = hexToHsv(hex);
  let atOpen = hex;
  const swatch = el('span', { class: 'cp-swatch' });
  const code = el('span', { class: 'cp-code' });
  const root = el('button', { type: 'button', class: 'cp-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, swatch, code, icon('fa-solid fa-chevron-down cp-caret'));

  // the panel itself, built once and put on the page only while open
  const sv = el('div', { class: 'cp-sv', tabIndex: 0, role: 'slider', 'aria-label': L('Nasycenie i jasność', 'Saturation and brightness') }, el('span', { class: 'cp-thumb' }));
  const hue = el('div', { class: 'cp-hue', tabIndex: 0, role: 'slider', 'aria-label': L('Odcień', 'Hue'), 'aria-valuemin': 0, 'aria-valuemax': 360 }, el('span', { class: 'cp-thumb' }));
  const big = el('span', { class: 'cp-preview' });
  const hexIn = el('input', { type: 'text', class: 'cp-hex', maxLength: 7, spellcheck: false, autocomplete: 'off', 'aria-label': L('Kolor w zapisie hex', 'Colour as hex') });
  const eyedrop = 'EyeDropper' in window ? el('button', { type: 'button', class: 'icon-btn', title: L('Pobierz kolor z ekranu', 'Pick a colour from the screen'), onclick: async () => {
    try { const r = await new window.EyeDropper().open(); const c = normalizeHex(r.sRGBHex); if (c) setHex(c, true); } catch { /* cancelled */ }
  } }, icon('fa-solid fa-eye-dropper')) : '';
  const swatches = (list) => list.map((c) => el('button', { type: 'button', class: 'cp-chip', title: c, 'aria-label': c, style: `--c:${c}`, onclick: () => { setHex(c, true); commit(); } }));
  const recentRow = el('div', { class: 'cp-chips' });
  const panel = el('div', { class: 'cp-panel glass', role: 'dialog', 'aria-label': title },
    el('div', { class: 'cp-head' }, el('b', { textContent: title }), el('button', { type: 'button', class: 'icon-btn cp-close', title: L('Zamknij', 'Close'), onclick: () => close(true) }, icon('fa-solid fa-xmark'))),
    sv, hue,
    el('div', { class: 'cp-row' }, big, el('span', { class: 'cp-hash', textContent: '#' }), hexIn, eyedrop),
    el('div', { class: 'cp-label', textContent: L('Gotowe kolory', 'Ready colours') }), el('div', { class: 'cp-chips' }, ...swatches(PRESETS)),
    el('div', { class: 'cp-label cp-recent-label', textContent: L('Ostatnio używane', 'Recently used') }), recentRow,
    el('div', { class: 'cp-actions' },
      el('button', { type: 'button', onclick: () => { setHex(atOpen, true); close(true); } }, L('Anuluj', 'Cancel')),
      el('button', { type: 'button', class: 'primary', onclick: () => close(true) }, icon('fa-solid fa-check'), L('Gotowe', 'Done'))));
  const backdrop = el('div', { class: 'cp-backdrop', onclick: () => close(false) });

  /** Draws the button, the square, the bar and the field from the current colour. */
  function draw(keepField = false) {
    root.style.setProperty('--c', hex);
    code.textContent = hex;
    panel.style.setProperty('--c', hex);
    panel.style.setProperty('--hue', `hsl(${hsv.h} 100% 50%)`);
    sv.firstChild.style.left = `${hsv.s * 100}%`;
    sv.firstChild.style.top = `${(1 - hsv.v) * 100}%`;
    sv.setAttribute('aria-valuetext', L(`nasycenie ${Math.round(hsv.s * 100)}%, jasność ${Math.round(hsv.v * 100)}%`, `saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`));
    hue.firstChild.style.left = `${hsv.h / 3.6}%`;
    hue.setAttribute('aria-valuenow', Math.round(hsv.h));
    if (!keepField) hexIn.value = hex.slice(1);
    hexIn.classList.remove('bad');
  }
  const emit = (type) => root.dispatchEvent(new Event(type, { bubbles: true }));
  function setHsv(next) {
    hsv = next;
    const was = hex;
    hex = hsvToHex(hsv);
    draw();
    if (hex !== was) emit('input');
  }
  function setHex(next, fire, keepField = false) {
    const was = hex;
    hex = next;
    hsv = hexToHsv(hex);
    draw(keepField);
    if (fire && hex !== was) emit('input');
  }
  /** A colour is picked: the code around hears "change" and the colour goes to the recent ones. */
  function commit() {
    if (hex !== atOpen) { rememberColor(hex); emit('change'); atOpen = hex; }
    drawRecent();
  }
  function drawRecent() {
    const list = recentColors();
    recentRow.replaceChildren(...swatches(list));
    recentRow.hidden = panel.querySelector('.cp-recent-label').hidden = !list.length;
  }

  dragOn(sv, (x, y) => setHsv({ ...hsv, s: x, v: 1 - y }), () => {});
  dragOn(hue, (x) => setHsv({ ...hsv, h: Math.min(359.9, x * 360) }), () => {});
  const keys = (node, apply) => node.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step], PageUp: [0, 10], PageDown: [0, -10] }[e.key];
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); apply(null, e.key === 'Home' ? -Infinity : Infinity); return; }
    if (!d) return;
    e.preventDefault();
    apply(d);
  });
  const clamp = (n) => Math.min(1, Math.max(0, n));
  keys(sv, (d, edge) => (d ? setHsv({ ...hsv, s: clamp(hsv.s + d[0] / 100), v: clamp(hsv.v + d[1] / 100) }) : setHsv({ ...hsv, s: edge < 0 ? 0 : 1 })));
  keys(hue, (d, edge) => (d ? setHsv({ ...hsv, h: Math.min(359.9, Math.max(0, hsv.h + (d[0] || d[1]))) }) : setHsv({ ...hsv, h: edge < 0 ? 0 : 359.9 })));
  hexIn.addEventListener('input', () => {
    const c = normalizeHex(hexIn.value);
    // a full six-digit colour is taken while typing; three digits wait for Enter or leaving the field
    if (c && hexIn.value.replace(/^#/, '').length === 6) setHex(c, true, true);
    else hexIn.classList.toggle('bad', hexIn.value.length > 0 && !/^#?[0-9a-f]{0,6}$/i.test(hexIn.value));
  });
  const takeField = () => {
    const c = normalizeHex(hexIn.value);
    if (c) setHex(c, true); else draw();
  };
  hexIn.addEventListener('blur', takeField);
  hexIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); takeField(); close(true); } });
  hexIn.addEventListener('paste', () => setTimeout(takeField));

  /** Puts the panel under the button (or over it, when there is no room below); a sheet on a phone. */
  function place() {
    const sheet = innerWidth < 560;
    panel.classList.toggle('sheet', sheet);
    backdrop.classList.toggle('sheet', sheet);
    if (sheet) { panel.style.left = panel.style.top = ''; return; }
    const r = root.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const below = r.bottom + 8 + h <= innerHeight - 8 || r.top - 8 - h < 8;
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    panel.style.top = `${below ? Math.min(r.bottom + 8, innerHeight - h - 8) : r.top - 8 - h}px`;
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); setHex(atOpen, true); close(true); } };
  const onScroll = (e) => { if (!panel.contains(e.target)) place(); };
  function open() {
    if (openPicker) openPicker(false);
    openPicker = close;
    atOpen = hex;
    hsv = hexToHsv(hex);
    draw();
    drawRecent();
    document.body.append(backdrop, panel);
    place();
    root.setAttribute('aria-expanded', 'true');
    addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    addEventListener('scroll', onScroll, true);
    sv.focus({ preventScroll: true });
  }
  function close(refocus) {
    if (!panel.isConnected) return;
    takeField();
    commit();
    panel.remove();
    backdrop.remove();
    openPicker = undefined;
    root.setAttribute('aria-expanded', 'false');
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    removeEventListener('scroll', onScroll, true);
    if (refocus) root.focus({ preventScroll: true });
  }
  root.addEventListener('click', (e) => { e.preventDefault(); if (panel.isConnected) close(true); else open(); });
  Object.defineProperty(root, 'value', { get: () => hex, set: (v) => { const c = normalizeHex(v); if (c) setHex(c, false); } });
  draw();
  return root;
}
