import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import type { PluginBuild } from 'esbuild';

// Run in Electron too: ordinary Node tests cannot see Electron's virtual ASAR filesystem.
const electron = process.env.ELECTRON_TEST_EXECUTABLE;
// macOS updates only; on Windows the probe's own read keeps app.asar open, and Windows cannot delete an open file
it('removes real update archives without leaving ASAR folders behind in Electron', { skip: !electron || process.platform === 'win32' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-electron-update-'));
  try {
    const require = createRequire(path.join(process.cwd(), 'package.json'));
    const source = path.join(root, 'source');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'package.json'), '{"name":"update-fixture"}');
    const archive = path.join(root, 'fixture.asar');
    await require('@electron/asar').createPackage(source, archive);
    const module = path.join(root, 'macUpdate.cjs');
    await require('esbuild').build({
      entryPoints: ['src/main/macUpdate.ts'], outfile: module, bundle: true,
      platform: 'node', format: 'cjs', external: ['original-fs'],
      plugins: [{ name: 'headless-app', setup(build: PluginBuild) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'headless' }));
        build.onLoad({ filter: /.*/, namespace: 'headless' }, () => ({ contents: 'export const app = {};' }));
      } }],
      define: { __APP_VERSION__: '"test"' },
    });
    // ASAR support is active in Electron's RUN_AS_NODE mode as well.
    const probe = `
      const assert = require('node:assert/strict');
      const raw = require('original-fs').promises;
      const fs = require('node:fs/promises');
      const { clearDir } = require(${JSON.stringify(module)});
      (async () => {
        const root = ${JSON.stringify(root)};
        const dir = root + '/update';
        await raw.mkdir(dir + '/app/SlashClient.next/Contents/Resources', { recursive: true });
        await raw.copyFile(${JSON.stringify(archive)}, dir + '/app/SlashClient.next/Contents/Resources/app.asar');
        // Prove this test actually exercises Electron's virtual archive handling.
        assert.match(await fs.readFile(dir + '/app/SlashClient.next/Contents/Resources/app.asar/package.json', 'utf8'), /update-fixture/);
        console.log("ASAR fixture readable; starting cleanup");
        await clearDir(dir);
        assert.equal((await raw.readdir(root)).some(n => n === 'update' || n.startsWith('update.old-')), false);
      })().catch(err => { console.error(err); process.exitCode = 1; });
    `;
    const result = spawnSync(electron!, ['-e', probe], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(result.status, 0, JSON.stringify({ stderr: result.stderr, error: result.error?.message, signal: result.signal, stdout: result.stdout }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
