// Renders the emote icons (Font Awesome, in colour with a dark outline so they read over any
// background) into hud/.../textures/emote/<id>.png, and the font that shows them next to names
// above heads (font/emote.json: one private-use character per emote, U+E100 onwards).
// Run with: npx electron scripts/make-emotes.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'hud/src/main/resources/assets/slashclient-hud');
const fa = path.join(root, 'node_modules/@fortawesome/fontawesome-free/svgs/solid');

/** id → Font Awesome icon and colour; the order is the order on the emote wheel (and Emotes.IDS). */
const EMOTES = {
  wave: ['hand', '#facc15'],
  heart: ['heart', '#f87171'],
  laugh: ['face-laugh-squint', '#fde047'],
  gg: ['trophy', '#fbbf24'],
  like: ['thumbs-up', '#60a5fa'],
  angry: ['face-angry', '#fb923c'],
  question: ['question', '#c4b5fd'],
  fire: ['fire', '#f97316'],
};

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 64, height: 64, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<canvas id=c width=64 height=64></canvas>');
  fs.mkdirSync(path.join(assets, 'textures/emote'), { recursive: true });
  const providers = [];
  for (const [i, [id, [icon, color]]] of Object.entries(EMOTES).entries()) {
    const svg = (c) => fs.readFileSync(path.join(fa, `${icon}.svg`), 'utf8').replaceAll('currentColor', c).replace('<svg ', `<svg fill="${c}" color="${c}" `);
    const b64 = (c) => Buffer.from(svg(c)).toString('base64');
    const png = await win.webContents.executeJavaScript(`(async () => {
      const load = async (src) => { const img = new Image(); img.src = 'data:image/svg+xml;base64,' + src; await img.decode(); return img; };
      const dark = await load(${JSON.stringify(b64('#0a0d14'))}), main = await load(${JSON.stringify(b64(color))});
      const c = document.getElementById('c'), ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 64, 64);
      const size = 48, r = main.width / main.height;
      const w = r >= 1 ? size : size * r, h = r >= 1 ? size / r : size, x = (64 - w) / 2, y = (64 - h) / 2;
      // a dark outline: the icon drawn around itself, then the colour on top
      for (let a = 0; a < 16; a++) ctx.drawImage(dark, x + Math.cos(a / 8 * Math.PI) * 4, y + Math.sin(a / 8 * Math.PI) * 4, w, h);
      ctx.drawImage(main, x, y, w, h);
      return c.toDataURL('image/png');
    })()`);
    fs.writeFileSync(path.join(assets, 'textures/emote', `${id}.png`), Buffer.from(png.split(',')[1], 'base64'));
    providers.push({ type: 'bitmap', file: `slashclient-hud:emote/${id}.png`, ascent: 10, height: 12, chars: [String.fromCharCode(0xe100 + i)] });
  }
  fs.writeFileSync(path.join(assets, 'font/emote.json'), JSON.stringify({ providers }, null, '\t') + '\n');
  console.log(`${providers.length} emotes`);
  app.exit(0);
});
