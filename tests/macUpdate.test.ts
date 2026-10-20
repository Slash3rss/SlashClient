import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { appBundle, bundleState, pickMacZip, swapScript, unpackApp, unpackRelease } from '../src/main/macUpdate';

const FILES = [
  { url: 'SlashClient-0.9.2-mac.zip', sha512: 'intel' },
  { url: 'SlashClient-0.9.2-arm64-mac.zip', sha512: 'arm' },
  { url: 'SlashClient-0.9.2.dmg', sha512: 'dmg' },
  { url: 'SlashClient-0.9.2-arm64.dmg', sha512: 'dmg-arm' },
];

describe('macOS updates', () => {
  it('downloads the zip for this Mac’s processor', () => {
    assert.equal(pickMacZip(FILES, 'arm64')?.sha512, 'arm');
    assert.equal(pickMacZip(FILES, 'x64')?.sha512, 'intel');
    assert.equal(pickMacZip([{ url: 'SlashClient.dmg', sha512: 'x' }], 'x64'), undefined);
  });

  it('replaces itself only from a place it may write to', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-macup-'));
    const exe = path.join(root, 'SlashClient.app', 'Contents', 'MacOS', 'SlashClient');
    await fs.mkdir(path.dirname(exe), { recursive: true });
    assert.equal(await appBundle(exe), path.join(root, 'SlashClient.app'));
    // opened from the disk image, or from the read-only copy macOS makes of a fresh download
    assert.equal(await appBundle('/Volumes/SlashClient/SlashClient.app/Contents/MacOS/SlashClient'), undefined);
    assert.equal(await appBundle('/private/var/folders/x/AppTranslocation/1/d/SlashClient.app/Contents/MacOS/SlashClient'), undefined);
    // the reason, so the launcher can offer moving it to Applications
    assert.deepEqual(await bundleState('/private/var/folders/x/AppTranslocation/1/d/SlashClient.app/Contents/MacOS/SlashClient'), { problem: 'translocated' });
    assert.deepEqual(await bundleState('/Volumes/SlashClient/SlashClient.app/Contents/MacOS/SlashClient'), { problem: 'disk-image' });
    assert.deepEqual(await bundleState('/usr/bin/node'), { problem: 'not-packaged' });
    assert.equal(await appBundle('/usr/local/bin/node'), undefined);
    await fs.rm(root, { recursive: true });
  });

  it('unpacks the app under a name that is not an app yet, with its links and permissions', { skip: process.platform === 'win32' }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-unpack-'));
    const app = path.join(root, 'src', 'SlashClient.app', 'Contents');
    await fs.mkdir(path.join(app, 'MacOS'), { recursive: true });
    await fs.writeFile(path.join(app, 'MacOS', 'SlashClient'), '#!/bin/sh\n', { mode: 0o755 });
    await fs.mkdir(path.join(app, 'Frameworks', 'X.framework', 'Versions', 'A'), { recursive: true });
    await fs.writeFile(path.join(app, 'Frameworks', 'X.framework', 'Versions', 'A', 'X'), 'lib');
    await fs.symlink('A', path.join(app, 'Frameworks', 'X.framework', 'Versions', 'Current'));
    const zip = path.join(root, 'update.zip');
    execFileSync('/usr/bin/zip', ['-qry', zip, 'SlashClient.app'], { cwd: path.join(root, 'src') });
    assert.equal(await unpackApp(zip, path.join(root, 'out')), 'SlashClient.next');
    const out = path.join(root, 'out', 'SlashClient.next', 'Contents');
    assert.equal(await fs.readlink(path.join(out, 'Frameworks', 'X.framework', 'Versions', 'Current')), 'A');
    assert.equal((await fs.stat(path.join(out, 'MacOS', 'SlashClient'))).mode & 0o777, 0o755);
    assert.equal(await fs.readFile(path.join(out, 'Frameworks', 'X.framework', 'Versions', 'Current', 'X'), 'utf8'), 'lib');
    await fs.rm(root, { recursive: true });
  });

  it('makes the links last: one before the folder it points to, or where files under it made a folder', { skip: process.platform === 'win32' }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-unpack-'));
    const versions = path.join(root, 'src', 'SlashClient.app', 'Contents', 'Frameworks', 'X.framework', 'Versions');
    await fs.mkdir(path.join(versions, 'A'), { recursive: true });
    await fs.writeFile(path.join(versions, 'A', 'X'), 'lib');
    await fs.symlink('A', path.join(versions, 'Current'));
    // zip keeps the order given: the link first, then a file through it, then the folder it points to
    const v = 'SlashClient.app/Contents/Frameworks/X.framework/Versions';
    const zip = path.join(root, 'update.zip');
    execFileSync('/usr/bin/zip', ['-qy', zip, `${v}/Current`, `${v}/Current/X`, `${v}/A`, `${v}/A/X`], { cwd: path.join(root, 'src') });
    assert.equal(await unpackApp(zip, path.join(root, 'out')), 'SlashClient.next');
    const out = path.join(root, 'out', 'SlashClient.next', 'Contents', 'Frameworks', 'X.framework', 'Versions');
    assert.equal(await fs.readlink(path.join(out, 'Current')), 'A');
    assert.equal(await fs.readFile(path.join(out, 'Current', 'X'), 'utf8'), 'lib');
    // and the system's ditto (macOS) gives the same app under the same name
    if (process.platform === 'darwin') assert.equal(await unpackRelease(zip, path.join(root, 'out2')), 'SlashClient.next');
    await fs.rm(root, { recursive: true });
  });

  it('puts the new app in place once the launcher has quit', { skip: process.platform === 'win32' }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'slash-swap-'));
    const current = path.join(root, "Slash'Client.app");
    const next = path.join(root, 'update', 'SlashClient.app');
    await fs.mkdir(current, { recursive: true });
    await fs.writeFile(path.join(current, 'version'), 'old');
    await fs.mkdir(next, { recursive: true });
    await fs.writeFile(path.join(next, 'version'), 'new');
    const opened = path.join(root, 'opened');
    // a process that has already ended stands for the launcher; "open" only notes what it would open
    const done = Number(execFileSync('/bin/sh', ['-c', 'true & echo $!']).toString());
    execFileSync('/bin/sh', ['-c', swapScript(done, current, next, `echo > '${opened}'; true`)]);
    assert.equal(await fs.readFile(path.join(current, 'version'), 'utf8'), 'new');
    await assert.rejects(fs.access(`${current}.old`));
    await fs.access(opened);
    await fs.rm(root, { recursive: true });
  });
});
