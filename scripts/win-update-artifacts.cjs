// electron-builder's afterAllArtifactBuild hook: the files Windows launchers update themselves with
// in place (src/main/winUpdate.ts), published with the release next to the installer.
//   <name>-<version>-win.zip      the whole unpacked app (electron-builder's "zip" target)
//   <name>-<version>-win-app.zip  only its resources folder (the launcher's own code), enough when
//                                 the installed launcher runs the same Electron
//   win-update-<version>.json     both files' names, SHA-512 and sizes, and the Electron version
// latest.yml stays as electron-builder writes it (the installer first), so launchers that update
// with the installer keep working; the description is a file of its own because latest.yml is
// written only after this hook.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { archive } = require('app-builder-lib/out/targets/archive');

function sha512(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('error', reject).on('end', () => resolve(hash.digest('base64')));
  });
}

async function describe(file) {
  return { url: path.basename(file), sha512: await sha512(file), size: fs.statSync(file).size };
}

exports.default = async function winUpdateArtifacts(result) {
  const full = result.artifactPaths.find((p) => /-win\.zip$/.test(p));
  if (!full) return [];
  // a beta's too: SlashClient-0.9.57-beta.1-win.zip
  const version = /-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)-win\.zip$/.exec(path.basename(full))?.[1];
  const unpacked = path.join(result.outDir, 'win-unpacked');
  if (!version || !fs.existsSync(path.join(unpacked, 'resources', 'app.asar'))) throw new Error(`win-update-artifacts: no app next to ${full}`);
  // the executable carries the hash of app.asar; with Electron's integrity check turned on, a new
  // app.asar under the old executable would not start, so then only the whole app is published
  const integrity = result.configuration.electronFuses?.enableEmbeddedAsarIntegrityValidation;
  const appOnly = integrity ? undefined : full.replace(/-win\.zip$/, '-win-app.zip');
  if (appOnly) await archive('zip', appOnly, path.join(unpacked, 'resources'), { compression: 'normal' });
  const manifest = {
    version,
    electronVersion: result.configuration.electronVersion || require('electron/package.json').version,
    full: await describe(full),
    ...(appOnly ? { app: await describe(appOnly) } : {}),
  };
  const json = path.join(result.outDir, `win-update-${version}.json`);
  fs.writeFileSync(json, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  • win-update-artifacts  full=${manifest.full.size} app=${manifest.app?.size ?? '-'} electron=${manifest.electronVersion}`);
  return appOnly ? [appOnly, json] : [json];
};
