// Renders Font Awesome icons (the same set the launcher uses) into white 64×64 PNGs for
// SlashClient HUD: hud/src/main/resources/assets/slashclient-hud/textures/icon/<name>.png.
// The game tints them when drawing. Run with: npx electron scripts/make-hud-icons.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'hud/src/main/resources/assets/slashclient-hud/textures/icon');
const fa = path.join(root, 'node_modules/@fortawesome/fontawesome-free/svgs');

/** HUD icon name → Font Awesome icon (solid unless "regular/…"). */
const ICONS = {
  // modules
  'm-fps': 'gauge-high', 'm-ping': 'wifi', 'm-cps': 'computer-mouse', 'm-coords': 'location-crosshairs',
  'm-speed': 'person-running', 'm-clock': 'clock', 'm-server': 'server', 'm-players': 'users', 'm-memory': 'memory',
  'm-biome': 'tree', 'm-daytime': 'sun', 'm-light': 'lightbulb', 'm-session': 'hourglass-half', 'm-combo': 'fire',
  'm-reach': 'ruler-horizontal', 'm-movement': 'shoe-prints', 'm-saturation': 'drumstick-bite', 'm-items': 'boxes-stacked',
  'm-target': 'bullseye', 'm-armor': 'shield-halved', 'm-effects': 'flask', 'm-keystrokes': 'keyboard',
  // extras and chat
  'm-zoom': 'magnifying-glass-plus', 'm-fullbright': 'circle-half-stroke', 'm-lowfire': 'fire-flame-simple',
  'm-crosshair': 'crosshairs', 'm-appearance': 'palette', 'm-badges': 'id-badge', 'm-menu': 'house',
  'm-chattimestamps': 'comment-dots', 'm-chattabs': 'table-columns',
};

/** Size of the glyph inside the 64×64 square, matching the icons already there. */
const PAD = Number(process.argv.find((a) => a.startsWith('--pad='))?.split('=')[1] ?? 3);

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

/** The box the non-transparent pixels of an existing icon take up, to keep new ones the same size. */
function measure(file) {
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  const px = img.toBitmap();
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (px[(y * width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { width, height, box: [x0, y0, x1, y1] };
}

app.whenReady().then(async () => {
  if (process.argv.includes('--measure')) {
    for (const n of ['gear', 'user', 'server', 'chat', 'power']) console.log(n, JSON.stringify(measure(path.join(out, `${n}.png`))));
    app.exit(0);
    return;
  }
  const win = new BrowserWindow({ width: 64, height: 64, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<canvas id=c width=64 height=64></canvas>');
  for (const [name, icon] of Object.entries(ICONS)) {
    const [set, file] = icon.includes('/') ? icon.split('/') : ['solid', icon];
    // Font Awesome 7 paints with currentColor, which is black in an image: make it white (the game tints it)
    const svg = fs.readFileSync(path.join(fa, set, `${file}.svg`), 'utf8')
      .replaceAll('currentColor', '#ffffff')
      .replace('<svg ', '<svg fill="#ffffff" color="#ffffff" ');
    const png = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
      await img.decode();
      const c = document.getElementById('c'), ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 64, 64);
      // keep the icon's own proportions, centred in the square
      const size = 64 - ${PAD} * 2, r = img.width / img.height;
      const w = r >= 1 ? size : size * r, h = r >= 1 ? size / r : size;
      ctx.drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      return c.toDataURL('image/png');
    })()`);
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(out, `${name}.png.mcmeta`), '{\n\t"texture": { "blur": true }\n}\n');
  }
  console.log(`${Object.keys(ICONS).length} icons → ${path.relative(root, out)}`);
  app.exit(0);
});
