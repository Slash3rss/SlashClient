// The website's share of the launcher: the 3D cosmetics preview bundled for the page, and the game's
// pictures it shows (spawn eggs, particles, the pets' skins) copied out of a Minecraft jar.
// Run with: node scripts/build-web.mjs [minecraft-client.jar]
import AdmZip from 'adm-zip';
import { build } from 'esbuild';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COSMETIC_TEXTURES } from '../src/shared/cosmeticTextures.ts';

const web = 'server/web/vendor';
await build({ bundle: true, minify: true, logLevel: 'info', target: 'es2022', platform: 'browser', format: 'iife',
  entryPoints: ['src/web/preview3d.ts'], outfile: `${web}/preview3d.js` });

const jar = process.argv[2] ?? [
  path.join(os.homedir(), '.gradle/caches/fabric-loom/26.3/minecraft-client.jar'),
  path.join(os.homedir(), '.gradle/caches/fabric-loom/26.2/minecraft-client.jar'),
].find(existsSync);
if (!jar) throw new Error('No Minecraft jar: pass one, or build the mod for 26.3 first');
const zip = new AdmZip(jar);
const found = [];
for (const p of COSMETIC_TEXTURES) {
  const entry = zip.getEntry(`assets/minecraft/textures/${p}.png`);
  if (!entry) continue;
  const out = path.join(web, 'mc', `${p}.png`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, entry.getData());
  found.push(p);
}
writeFileSync(path.join(web, 'mc', 'index.json'), JSON.stringify(found));
console.log(`${found.length} of ${COSMETIC_TEXTURES.length} game pictures -> ${web}/mc (from ${jar})`);
