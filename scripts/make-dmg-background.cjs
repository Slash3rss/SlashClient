// Renders scripts/dmg/background.html into build/background.png (+@2x) and a
// Retina-aware build/background.tiff for the macOS DMG window. Run: npm run dmg-background
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'build');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

async function render(scale) {
  const win = new BrowserWindow({ width: 540 * scale, height: 380 * scale, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(1);
  await win.loadFile(path.join(__dirname, 'dmg', 'background.html'), { query: { scale: String(scale) } });
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(r => setTimeout(r, 300)))');
  let image = await win.webContents.capturePage();
  win.destroy();
  if (image.getSize().width !== 540 * scale) image = image.resize({ width: 540 * scale, height: 380 * scale, quality: 'best' });
  return image.toPNG();
}

app.whenReady().then(async () => {
  const one = path.join(out, 'background.png');
  const two = path.join(out, 'background@2x.png');
  fs.writeFileSync(one, await render(1));
  fs.writeFileSync(two, await render(2));
  // one TIFF with both resolutions, so Finder picks the sharp one on Retina screens
  if (process.platform === 'darwin') execFileSync('tiffutil', ['-cathidpicheck', one, two, '-out', path.join(out, 'background.tiff')]);
  console.log('Tło DMG zapisane w build/');
  app.quit();
});
