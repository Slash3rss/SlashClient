import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2023', define: { __APP_VERSION__: JSON.stringify(version) } };

mkdirSync('dist/renderer', { recursive: true });
await Promise.all([
  build({ ...common, platform: 'node', format: 'cjs', external: ['electron', 'electron-updater', 'original-fs'],
    entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts', cli: 'src/main/cli.ts' }, outdir: 'dist' }),
  build({ ...common, platform: 'browser', format: 'iife',
    entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js' }),
]);
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/style.css', 'dist/renderer/style.css');
cpSync('build/icons/256x256.png', 'dist/renderer/logo.png');
cpSync('src/renderer/img', 'dist/renderer/img', { recursive: true });
for (const [from, to] of [['cape', 'capes'], ['wings', 'wings'], ['elytra', 'elytra'], ['clothing', 'clothing'], ['pet', 'pets'], ['suit', 'suits'], ['item/held', 'held'], ['gear', 'gear'], ['ring', 'rings'], ['spray', 'spray'], ['prop', 'props']]) {
  cpSync(`hud/src/main/resources/assets/slashclient-hud/textures/${from}`, `dist/renderer/img/${to}`, { recursive: true });
}

// SlashClient HUD (hud/, built with Gradle for every game version): bundled when it has been built
mkdirSync('dist/hud', { recursive: true });
const hudBundle = 'hud/build/bundle';
if (existsSync(hudBundle)) {
  for (const f of readdirSync(hudBundle)) if (/^slashclient-hud-.+\.jar$/.test(f)) cpSync(`${hudBundle}/${f}`, `dist/hud/${f}`);
} else console.warn('hud/build/bundle is missing: the launcher is built without the SlashClient mod (hud/build-all.sh)');

// Fonts and icons are bundled locally so the launcher looks right offline too.
const fonts = {
  'outfit-latin.woff2': '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2',
  'outfit-latin-ext.woff2': '@fontsource-variable/outfit/files/outfit-latin-ext-wght-normal.woff2',
  'jetbrains-mono-latin-400.woff2': '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  'jetbrains-mono-latin-ext-400.woff2': '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff2',
};
mkdirSync('dist/renderer/fonts', { recursive: true });
for (const [name, src] of Object.entries(fonts)) cpSync(`node_modules/${src}`, `dist/renderer/fonts/${name}`);
cpSync('node_modules/@fortawesome/fontawesome-free/css/all.min.css', 'dist/renderer/fa/css/all.min.css');
cpSync('node_modules/@fortawesome/fontawesome-free/webfonts', 'dist/renderer/fa/webfonts', { recursive: true });

// the website (server/web) uses the same fonts, icons, logo and capes; it is served on its own, so it keeps copies
const web = 'server/web/vendor';
mkdirSync(`${web}/fonts`, { recursive: true });
for (const name of ['outfit-latin.woff2', 'outfit-latin-ext.woff2']) cpSync(`node_modules/${fonts[name]}`, `${web}/fonts/${name}`);
cpSync('node_modules/@fortawesome/fontawesome-free/css/all.min.css', `${web}/fa/css/all.min.css`);
cpSync('node_modules/@fortawesome/fontawesome-free/webfonts', `${web}/fa/webfonts`, { recursive: true });
cpSync('build/icons/256x256.png', `${web}/logo.png`);
for (const [from, to] of [['cape', 'capes'], ['wings', 'wings'], ['elytra', 'elytra'], ['clothing', 'clothing'], ['pet', 'pets'], ['suit', 'suits'], ['item/held', 'held'], ['gear', 'gear'], ['ring', 'rings'], ['spray', 'spray'], ['prop', 'props']]) {
  cpSync(`hud/src/main/resources/assets/slashclient-hud/textures/${from}`, `${web}/${to}`, { recursive: true });
}

