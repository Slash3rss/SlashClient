import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2023', define: { __APP_VERSION__: JSON.stringify(version) } };

mkdirSync('dist/renderer', { recursive: true });
await Promise.all([
  build({ ...common, platform: 'node', format: 'cjs', external: ['electron', 'electron-updater'],
    entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts', cli: 'src/main/cli.ts' }, outdir: 'dist' }),
  build({ ...common, platform: 'browser', format: 'iife',
    entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js' }),
]);
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/style.css', 'dist/renderer/style.css');
cpSync('build/icons/256x256.png', 'dist/renderer/logo.png');
cpSync('src/renderer/img', 'dist/renderer/img', { recursive: true });

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
