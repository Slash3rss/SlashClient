// Animated SlashClient logo emoji for the Discord server (128x128 GIF and WebP, under Discord's 256 KB).
// Renders frames of the app icon (scripts/icon/icon.html, variant slashS), then
// scripts/make-discord-emoji.py scales and encodes them.
// Run: npx electron scripts/make-discord-emoji.cjs [--out=<dir>] [shine slash pulse spin bounce]
// (default output: <system temp>/slashclient-emoji/out)
// The variant `loading` is the logo of the loading screens instead: the whole icon as the app icon draws it,
// starting and ending as the usual logo; scripts/make-loading-logo.py turns it into the launcher's
// build/icons/logo-slash.webp and the HUD's icon-slash.png (npx electron scripts/make-discord-emoji.cjs loading).
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outRoot = args.find((a) => a.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), 'slashclient-emoji');
const only = args.filter((a) => !a.startsWith('-') && !a.endsWith('.cjs') && a !== '.');
const outDir = path.join(outRoot, 'frames');
const FPS = 25;
const VARIANTS = { shine: 2.4, slash: 2.8, pulse: 1.6, spin: 2.4, bounce: 1.6, loading: 3.2 };

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

// Page-side code: builds handles on the drawn logo and exposes frame(variant, t) with t in [0, 1).
const PAGE = String.raw`
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.querySelector('svg');
  const defsEl = document.querySelector('defs');
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };
  const art = document.getElementById('art');
  const glowG = art.querySelector('g');
  const [A, B] = glowG.querySelectorAll('path');
  const d = A.getAttribute('d');
  const wrap = mk('g', {}); art.parentNode.insertBefore(wrap, art); wrap.appendChild(art);
  const cutA = document.querySelector('#cutA polygon'), cutB = document.querySelector('#cutB polygon');
  const glowMatrix = document.querySelector('#softglow feColorMatrix');
  const glowBlur = document.querySelector('#softglow feGaussianBlur');

  // Mask with the letter's shape (both halves), used to keep the shine inside the S.
  const mask = mk('mask', { id: 'sMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1024, height: 1024 }, defsEl);
  const mA = mk('path', { d, fill: '#fff', 'clip-path': 'url(#cutA)' }, mask);
  const mB = mk('path', { d, fill: '#fff', 'clip-path': 'url(#cutB)' }, mask);
  const band = mk('linearGradient', { id: 'band', x1: 0, y1: 0, x2: 1, y2: 0 }, defsEl);
  [[0, 0], [0.35, 0.25], [0.5, 0.95], [0.65, 0.25], [1, 0]].forEach(([o, a]) => mk('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }, band));
  const shineG = mk('g', { mask: 'url(#sMask)' }, art);
  const shine = mk('g', {}, shineG);
  mk('rect', { x: -130, y: -900, width: 260, height: 1800, fill: 'url(#band)' }, shine);
  mk('rect', { x: 170, y: -900, width: 70, height: 1800, fill: 'url(#band)', opacity: 0.7 }, shine);

  // Four-point sparkle.
  const sparkle = mk('path', { d: 'M0 -60 Q6 -6 60 0 Q6 6 0 60 Q-6 6 -60 0 Q-6 -6 0 -60Z', fill: '#fff', filter: 'url(#softglow)' }, art);

  // The bright "slash" stroke along the cut line.
  const blade = mk('g', { filter: 'url(#glow)' }, art);
  const bladeLine = mk('polygon', { fill: '#eff6ff' }, blade);

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (x) => 1 - (1 - x) ** 3;
  const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
  const backOut = (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
  const TAU = Math.PI * 2;

  function setCut(gap, shift) {
    const cx = 512, cy = 512, far = 2000;
    const half = (sign) => {
      const o = sign * gap / 2 / Math.SQRT2;
      return [[cx - far + o, cy + far + o], [cx + far + o, cy - far + o], [cx + far + sign * far, cy - far + sign * far], [cx - far + sign * far, cy + far + sign * far]].map((p) => p.join(',')).join(' ');
    };
    cutA.setAttribute('points', half(-1));
    cutB.setAttribute('points', half(1));
    const ta = 'translate(' + (-shift / 2) + ' ' + (shift / 2) + ')', tb = 'translate(' + (shift / 2) + ' ' + (-shift / 2) + ')';
    A.setAttribute('transform', ta); mA.setAttribute('transform', ta);
    B.setAttribute('transform', tb); mB.setAttribute('transform', tb);
  }
  function reset() {
    setCut(30, 18);
    wrap.removeAttribute('transform');
    shine.setAttribute('transform', 'translate(-2000 0)');
    sparkle.setAttribute('opacity', 0);
    bladeLine.setAttribute('points', '');
    glowMatrix.setAttribute('values', '0 0 0 0 0.231  0 0 0 0 0.51  0 0 0 0 0.965  0 0 0 .35 0');
    glowBlur.setAttribute('stdDeviation', 10);
    glowG.removeAttribute('opacity');
    art.removeAttribute('style');
  }
  function glow(alpha, blur) {
    glowMatrix.setAttribute('values', '0 0 0 0 0.231  0 0 0 0 0.51  0 0 0 0 0.965  0 0 0 ' + alpha.toFixed(3) + ' 0');
    glowBlur.setAttribute('stdDeviation', blur.toFixed(2));
  }
  function showSparkle(x, y, k) {
    sparkle.setAttribute('opacity', k.toFixed(3));
    sparkle.setAttribute('transform', 'translate(' + x + ' ' + y + ') rotate(' + (k * 45) + ') scale(' + (0.2 + 0.8 * k).toFixed(3) + ')');
  }

  const V = {
    // A glossy highlight sweeps across the letter, then a sparkle pops on the top-right corner.
    shine(t) {
      const p = easeInOut(seg(t, 0.08, 0.6));
      shine.setAttribute('transform', 'translate(512 512) rotate(45) translate(' + (-700 + 1400 * p) + ' 0)');
      const k = seg(t, 0.5, 0.62) * (1 - seg(t, 0.62, 0.85));
      if (k > 0) showSparkle(640, 300, Math.sin(k * Math.PI / 2));
      glow(0.35 + 0.35 * Math.sin(Math.PI * seg(t, 0.2, 0.7)), 10);
    },
    // The whole S gets cut by a glowing blade, the halves slide apart, hold, then heal back.
    slash(t) {
      const draw = easeOut(seg(t, 0.2, 0.32));
      const split = backOut(seg(t, 0.3, 0.42));
      const heal = easeInOut(seg(t, 0.84, 1));
      const k = clamp(split - heal, -0.2, 1.5);
      setCut(30 * clamp(k, 0, 1.2), 18 * k);
      // blade: a long thin diamond growing from bottom-left to top-right along "/"
      const fade = 1 - seg(t, 0.36, 0.5);
      if (draw > 0 && fade > 0) {
        const L = 720, w = 14 * fade;
        const s0 = -L / 2, s1 = -L / 2 + L * draw;
        const pt = (s, n) => [512 + s / Math.SQRT2 + n / Math.SQRT2, 512 - s / Math.SQRT2 + n / Math.SQRT2].map((v) => v.toFixed(1)).join(',');
        const mid = (s0 + s1) / 2;
        bladeLine.setAttribute('points', [pt(s0, 0), pt(mid, -w), pt(s1, 0), pt(mid, w)].join(' '));
        bladeLine.setAttribute('opacity', fade.toFixed(3));
      }
      // small kick on impact
      const hit = seg(t, 0.3, 0.4);
      const shake = hit > 0 && hit < 1 ? Math.sin(hit * Math.PI * 5) * 10 * (1 - hit) : 0;
      wrap.setAttribute('transform', 'translate(' + shake.toFixed(2) + ' ' + (-shake).toFixed(2) + ')');
      glow(0.35 + 0.5 * Math.sin(Math.PI * seg(t, 0.28, 0.6)), 10 + 8 * Math.sin(Math.PI * seg(t, 0.28, 0.6)));
    },
    // The loading screens' logo: the usual cut S rests, its halves come together, then the blade cuts it
    // again and the halves spring back apart - ending exactly as the usual logo, so the loop has no seam.
    loading(t) {
      const join = easeInOut(seg(t, 0.2, 0.36));
      const draw = easeOut(seg(t, 0.42, 0.54));
      const split = backOut(seg(t, 0.52, 0.64));
      const k = clamp(1 - join + split, -0.2, 1.5);
      setCut(30 * clamp(k, 0, 1.2), 18 * k);
      const fade = 1 - seg(t, 0.58, 0.72);
      if (draw > 0 && fade > 0) {
        const L = 720, w = 14 * fade;
        const s0 = -L / 2, s1 = -L / 2 + L * draw;
        const pt = (s, n) => [512 + s / Math.SQRT2 + n / Math.SQRT2, 512 - s / Math.SQRT2 + n / Math.SQRT2].map((v) => v.toFixed(1)).join(',');
        const mid = (s0 + s1) / 2;
        bladeLine.setAttribute('points', [pt(s0, 0), pt(mid, -w), pt(s1, 0), pt(mid, w)].join(' '));
        bladeLine.setAttribute('opacity', fade.toFixed(3));
      }
      const hit = seg(t, 0.52, 0.62);
      const shake = hit > 0 && hit < 1 ? Math.sin(hit * Math.PI * 5) * 10 * (1 - hit) : 0;
      wrap.setAttribute('transform', 'translate(' + shake.toFixed(2) + ' ' + (-shake).toFixed(2) + ')');
      const flare = Math.sin(Math.PI * seg(t, 0.5, 0.8));
      glow(0.35 + 0.5 * flare, 10 + 8 * flare);
    },
    // Heartbeat: two quick beats with the glow flaring up.
    pulse(t) {
      const beat = (c) => Math.exp(-(((t - c) / 0.06) ** 2));
      const b = beat(0.15) + 0.7 * beat(0.38);
      const s = 1 + 0.09 * b;
      wrap.setAttribute('transform', 'translate(512 512) scale(' + s.toFixed(4) + ') translate(-512 -512)');
      glow(0.35 + 0.6 * b, 10 + 12 * b);
    },
    // Coin flip: two quick turns around the vertical axis, then a rest.
    spin(t) {
      const a = easeInOut(seg(t, 0.05, 0.6)) * TAU * 2;
      const c = Math.cos(a);
      const sx = Math.max(0.04, Math.abs(c));
      wrap.setAttribute('transform', 'translate(512 512) scale(' + sx.toFixed(4) + ' 1) translate(-512 -512)');
      art.setAttribute('style', 'filter: brightness(' + (0.65 + 0.35 * sx).toFixed(3) + ')');
      const k = seg(t, 0.6, 0.7) * (1 - seg(t, 0.7, 0.9));
      if (k > 0) showSparkle(640, 300, Math.sin(k * Math.PI / 2));
    },
    // Jump with squash and stretch, landing on the bottom edge of the letter.
    bounce(t) {
      const base = 720;
      const air = seg(t, 0.12, 0.62);
      const h = 4 * air * (1 - air) * 150;
      let sx = 1, sy = 1;
      const squash = (c, k) => { const x = Math.exp(-(((t - c) / 0.05) ** 2)) * k; sx += x; sy -= x; };
      squash(0.06, 0.12); // crouch before jumping
      squash(0.66, 0.14); // landing
      squash(0.78, -0.05); // small rebound
      if (air > 0 && air < 1) { const st = 0.08 * Math.sin(air * Math.PI); sy += st * (air < 0.5 ? 1 : 0.6); sx -= st * 0.6; }
      wrap.setAttribute('transform', 'translate(512 ' + (base - h).toFixed(2) + ') scale(' + sx.toFixed(4) + ' ' + sy.toFixed(4) + ') translate(-512 -' + base + ')');
    },
  };

  window.frame = (variant, t) => {
    // The stars stay still on purpose: anything moving across the whole tile makes every GIF frame
    // a full redraw and the file goes far over Discord's limit.
    reset();
    V[variant](t);
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
})();
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (e) => { if (e.level === 'error') console.error(e.message); });
  await win.loadFile(path.join(repo, 'scripts', 'icon', 'icon.html'), { query: { variant: 'slashS' } });
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))');
  await win.webContents.executeJavaScript(PAGE);
  for (const [name, seconds] of Object.entries(VARIANTS)) {
    if (only.length && !only.includes(name)) continue;
    // the loading logo keeps the whole icon (as the app icon is drawn) and is encoded by its own script
    const loading = name === 'loading';
    const dir = loading ? path.join(outRoot, 'loading') : path.join(outDir, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) {
      await win.webContents.executeJavaScript(`frame(${JSON.stringify(name)}, ${i / n})`);
      await new Promise((r) => setTimeout(r, 30));
      let img = await win.webContents.capturePage();
      if (img.getSize().width !== 1024) img = img.resize({ width: 1024, height: 1024, quality: 'best' });
      fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), (loading ? img : img.crop({ x: 100, y: 100, width: 824, height: 824 })).toPNG());
    }
    console.log(name, n, 'klatek');
  }
  win.destroy();
  const python = process.platform === 'win32' ? 'python' : 'python3';
  if (!only.length || only.some((v) => v !== 'loading')) execFileSync(python, [path.join(__dirname, 'make-discord-emoji.py'), outRoot], { stdio: 'inherit' });
  if (!only.length || only.includes('loading')) execFileSync(python, [path.join(__dirname, 'make-loading-logo.py'), path.join(outRoot, 'loading')], { stdio: 'inherit' });
  app.exit(0);
});
