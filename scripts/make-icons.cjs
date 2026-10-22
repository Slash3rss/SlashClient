// Renders scripts/icon/icon.html into build/icon.png, icon.icns and icon.ico.
// Run with: npm run icons
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'build');

/** Packs PNG images into a Windows .ico (Vista+ allows PNG payloads). */
function writeIco(file, pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...pngs.map((p) => p.data)]));
}

app.disableHardwareAcceleration();
// Rendering destroys each window; don't let Electron quit in between.
app.on('window-all-closed', () => {});
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function render(variant, query = {}) {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(1);
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[${variant}] ${e.message} (wiersz ${e.lineNumber})`);
  });
  await win.loadFile(path.join(__dirname, 'icon', 'icon.html'), { query: { variant, ...query } });
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))');
  const image = await win.webContents.capturePage();
  win.destroy();
  return image.getSize().width === 1024 ? image : image.resize({ width: 1024, height: 1024, quality: 'best' });
}

app.whenReady().then(async () => {
  // --preview=<dir> renders every variant there for comparison and stops.
  const preview = arg('preview');
  if (preview) {
    fs.mkdirSync(preview, { recursive: true });
    for (const v of (arg('variants') ?? 'ring').split(',')) fs.writeFileSync(path.join(preview, `${v}.png`), (await render(v)).toPNG());
    app.quit();
    return;
  }
  // --app: only the phone app's icons (server/web/app/icon-*.png, named in its manifest.webmanifest)
  if (process.argv.includes('--app')) {
    const img = path.join(root, 'server', 'web', 'app');
    const tile = await render(arg('variant') ?? 'slashS');
    const bleed = await render(arg('variant') ?? 'slashS', { bleed: '1' });
    for (const size of [192, 512]) fs.writeFileSync(path.join(img, `icon-${size}.png`), tile.resize({ width: size, quality: 'best' }).toPNG());
    fs.writeFileSync(path.join(img, 'icon-maskable-512.png'), bleed.resize({ width: 512, quality: 'best' }).toPNG());
    // iOS rounds the corners itself and shows transparency as black
    fs.writeFileSync(path.join(img, 'icon-apple-180.png'), bleed.resize({ width: 180, quality: 'best' }).toPNG());
    console.log(`Ikony aplikacji zapisane w ${img}`);
    app.quit();
    return;
  }
  const image = await render(arg('variant') ?? 'slashS');

  fs.mkdirSync(out, { recursive: true });
  const master = path.join(out, 'icon.png');
  fs.writeFileSync(master, image.toPNG());

  // macOS .icns via the system's iconutil.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slashclient-icon-'));
  const iconset = path.join(tmp, 'icon.iconset');
  fs.mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), image.resize({ width: size, quality: 'best' }).toPNG());
    fs.writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), image.resize({ width: size * 2, quality: 'best' }).toPNG());
  }
  if (process.platform === 'darwin') {
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(out, 'icon.icns')]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // Windows .ico and a few PNG sizes for Linux.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  writeIco(path.join(out, 'icon.ico'), sizes.map((size) => ({ size, data: image.resize({ width: size, quality: 'best' }).toPNG() })));
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const size of [...sizes, 512]) {
    fs.writeFileSync(path.join(out, 'icons', `${size}x${size}.png`), image.resize({ width: size, quality: 'best' }).toPNG());
  }

  console.log(`Ikony zapisane w ${out}`);
  app.quit();
});
