// Makes SlashClient HUD's Halloween logo (the menus' and the loading screen's, ui/Season): the mod's
// icon.png with the blue turned orange and a carved pumpkin in its corner, as the launcher draws it
// (src/renderer/season.ts). Run with: npx electron scripts/make-season-logo.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'hud/src/main/resources/assets/slashclient-hud');
const source = fs.readFileSync(path.join(dir, 'icon.png')).toString('base64');

const draw = `(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,${source}';
  await img.decode();
  const size = img.naturalWidth;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.filter = 'hue-rotate(170deg) saturate(1.25)';
  x.drawImage(img, 0, 0, size, size);
  x.filter = 'none';
  const px = size * 0.8, py = size * 0.8, r = size * 0.14;
  for (const [dx, w] of [[-0.45, 0.6], [0.45, 0.6], [0, 0.7]]) {
    x.beginPath();
    x.ellipse(px + dx * r, py, r * w, r * 0.8, 0, 0, Math.PI * 2);
    x.fillStyle = dx === 0 ? '#f97316' : '#ea580c';
    x.fill();
  }
  x.fillStyle = '#4d7c0f';
  x.fillRect(px - r * 0.08, py - r * 1.05, r * 0.16, r * 0.3);
  x.fillStyle = 'rgba(254, 240, 138, .9)';
  x.beginPath();
  x.moveTo(px - r * 0.42, py - r * 0.2); x.lineTo(px - r * 0.22, py - r * 0.42); x.lineTo(px - r * 0.12, py - r * 0.15);
  x.moveTo(px + r * 0.42, py - r * 0.2); x.lineTo(px + r * 0.22, py - r * 0.42); x.lineTo(px + r * 0.12, py - r * 0.15);
  x.moveTo(px - r * 0.45, py + r * 0.15); x.lineTo(px - r * 0.2, py + r * 0.4); x.lineTo(px, py + r * 0.25);
  x.lineTo(px + r * 0.2, py + r * 0.4); x.lineTo(px + r * 0.45, py + r * 0.15);
  x.closePath();
  x.fill();
  return c.toDataURL('image/png');
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const url = await win.webContents.executeJavaScript(draw);
  const out = path.join(dir, 'icon-halloween.png');
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${out}`);
  app.quit();
});
