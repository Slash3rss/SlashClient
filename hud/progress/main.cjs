// A small window that shows how the game tests run (gametest.sh starts it): each game's share with its
// progress bar and the test running now, the whole run's progress and time left, and what failed.
// It reads the shares' logs (build/gametest-N.log); closing it changes nothing in the tests. A share's
// "Restart" closes only that share's test game (never a real one) and runs the share again.
const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');

const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `=${fallback}`).split('=')[1];

app.whenReady().then(() => {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 440, height = 450;
  const win = new BrowserWindow({
    width, height, x: workArea.x + workArea.width - width - 16, y: workArea.y + workArea.height - height - 16,
    alwaysOnTop: true, resizable: true, minimizable: true, maximizable: false, autoHideMenuBar: true,
    title: 'Testy SlashClient', backgroundColor: '#0a0d14', show: false,
    // a local page of our own reading local logs: no remote content ever loads here
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'), {
    query: { mc: arg('mc', '?'), n: arg('n', '4'), logs: path.resolve(__dirname, '..', 'build'), hud: path.resolve(__dirname, '..') },
  });
  // shown without taking the focus from what the player is doing
  win.once('ready-to-show', () => win.showInactive());
});
app.on('window-all-closed', () => app.quit());
