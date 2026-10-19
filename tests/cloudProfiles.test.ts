import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  changedSince, cloudAction, cloudErrorText, CloudLinks, installInto, newestChange, settingsHash, validCloudId,
  type CloudLink, type CloudProfile,
} from '../src/main/cloudProfiles';
import { newProfile } from '../src/main/store';
import { setLang } from '../src/shared/i18n';

const link = (revision: number): CloudLink => ({ cloudId: 'abcdefgh-1', revision, syncedAt: 1000, settingsHash: '', auto: true });
const remote = (revision: number): CloudProfile => ({ id: 'abcdefgh-1', name: 'P', gameVersion: '1.21.4', loader: 'fabric', device: 'PC', size: 1, revision, createdAt: 0, updatedAt: 0 });

describe('profiles on the account: what to do', () => {
  it('uploads, downloads, asks or does nothing', () => {
    // never synced, or the account lost its copy
    assert.equal(cloudAction(undefined, undefined, false), 'upload');
    assert.equal(cloudAction(link(2), undefined, false), 'upload');
    // the same revision on both sides
    assert.equal(cloudAction(link(2), remote(2), false), 'none');
    assert.equal(cloudAction(link(2), remote(2), true), 'upload');
    // another computer saved since: newer wins, unless both changed
    assert.equal(cloudAction(link(2), remote(3), false), 'download');
    assert.equal(cloudAction(link(2), remote(3), true), 'conflict');
    // the account's copy was made anew elsewhere
    assert.equal(cloudAction(link(5), remote(1), false), 'download');
    assert.equal(cloudAction(link(5), remote(1), true), 'conflict');
  });

  it('accepts only launcher-made ids and explains server errors', () => {
    assert.equal(validCloudId('0f8e2a4c-1111-4222-8333-944455556666'), true);
    assert.equal(validCloudId('../x'), false);
    setLang('pl');
    assert.match(cloudErrorText('cloud_quota', 409), /limit/);
    assert.match(cloudErrorText('rate_limited', 429), /Za szybko/);
    // the server's file storage full or down (storage backends)
    assert.match(cloudErrorText('storage_full', 507), /skończyło się miejsce/);
    assert.match(cloudErrorText('storage_unavailable', 503), /niedostępne/);
    setLang('en');
    assert.match(cloudErrorText('storage_full', 507), /out of space/);
    setLang('pl');
  });
});

describe('profiles on the account: local changes and links', () => {
  it('notices changed files and settings since the last sync', async () => {
    const game = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-cloud-'));
    await fs.mkdir(path.join(game, 'config'), { recursive: true });
    await fs.writeFile(path.join(game, 'config', 'slashclient-hud.json'), '{}');
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(game, 'config', 'slashclient-hud.json'), old, old);
    await fs.utimes(path.join(game, 'config'), old, old);
    // worlds and logs do not count
    await fs.mkdir(path.join(game, 'saves', 'World'), { recursive: true });
    await fs.writeFile(path.join(game, 'saves', 'World', 'level.dat'), 'x');
    assert.ok(Math.abs((await newestChange(game)) - old.getTime()) < 2000);

    const profile = newProfile({ name: 'Survival', versionId: '1.21.4', loader: 'fabric' });
    const synced: CloudLink = { cloudId: 'abcdefgh-1', revision: 1, syncedAt: Date.now() - 30_000, settingsHash: settingsHash(profile), auto: true };
    assert.equal(await changedSince(game, profile, synced), false);
    profile.memoryMb += 1024;
    assert.equal(await changedSince(game, profile, synced), true);
    profile.memoryMb -= 1024;
    await fs.writeFile(path.join(game, 'config', 'slashclient-hud.json'), '{"modules":{}}');
    assert.equal(await changedSince(game, profile, synced), true);
    await fs.rm(game, { recursive: true, force: true });
  });

  it('keeps links in a file and reads them back', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-links-'));
    const file = path.join(dir, 'cloud-profiles.json');
    const links = new CloudLinks(file);
    assert.equal(await links.get('p1'), undefined);
    await links.set('p1', link(3));
    await links.set('p2', link(1));
    await links.set('p2', undefined);
    const again = new CloudLinks(file);
    assert.deepEqual(await again.get('p1'), link(3));
    assert.deepEqual(Object.keys(await again.all()), ['p1']);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('replaces mods and configs with the account copy and takes its settings', async () => {
    const game = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-restore-'));
    for (const [rel, text] of [['mods/deleted-elsewhere.jar', 'x'], ['config/old.json', '{}'], ['saves/World/level.dat', 'w'], ['resourcepacks/mine.zip', 'r']]) {
      await fs.mkdir(path.dirname(path.join(game, rel)), { recursive: true });
      await fs.writeFile(path.join(game, rel), text);
    }
    const zip = new AdmZip();
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', name: 'Survival', files: [], dependencies: { minecraft: '1.21.4', 'fabric-loader': '0.16.9' } })));
    zip.addFile('overrides/config/slashclient-hud.json', Buffer.from('{"modules":{}}'));
    zip.addFile('overrides/mods/bundled.jar', Buffer.from('jar'));
    zip.addFile('overrides/saves/Other/level.dat', Buffer.from('never'));
    zip.addFile('slashclient.profile.json', Buffer.from(JSON.stringify({ name: 'Survival PC', memoryMb: 6144, loaderVersion: '', loader: 'fabric', icon: 'custom' })));
    const file = path.join(game, '..', `${path.basename(game)}.mrpack`);
    zip.writeZip(file);

    const profile = newProfile({ name: 'Old', versionId: '1.21.1', loader: 'vanilla' });
    await installInto(profile, game, file);
    const ls = async (rel: string) => (await fs.readdir(path.join(game, rel)).catch(() => [])).sort();
    assert.deepEqual(await ls('mods'), ['bundled.jar']);
    assert.deepEqual(await ls('config'), ['slashclient-hud.json']);
    assert.deepEqual(await ls('saves'), ['World']);
    assert.deepEqual(await ls('resourcepacks'), ['mine.zip']);
    assert.equal(profile.versionId, '1.21.4');
    assert.equal(profile.loader, 'fabric');
    assert.equal(profile.name, 'Survival PC');
    assert.equal(profile.memoryMb, 6144);
    // the settings followed the newest loader; the custom icon was not in the pack
    assert.equal(profile.loaderVersion, '');
    assert.equal(profile.icon, '');
    await fs.rm(game, { recursive: true, force: true });
    await fs.rm(file, { force: true });
  });
});
