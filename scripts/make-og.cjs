// Renders scripts/og/card.html into server/web/img/og.jpg: the picture shown when a link to the
// site is shared (OpenGraph, 1200×630). Run: npx electron scripts/make-og.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 630, show: false, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(1);
  await win.loadFile(path.join(__dirname, 'og', 'card.html'));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode()))).then(() => new Promise((r) => setTimeout(r, 400)))');
  let image = await win.webContents.capturePage();
  win.destroy();
  if (image.getSize().width !== 1200) image = image.resize({ width: 1200, height: 630, quality: 'best' });
  const out = path.join(__dirname, '..', 'server', 'web', 'img', 'og.jpg');
  fs.writeFileSync(out, image.toJPEG(88));
  console.log(`Obrazek do udostępniania: ${out}`);
  app.quit();
});
