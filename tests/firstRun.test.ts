import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLowEndMachine, isPristineProfile, markExistingUser, needsFirstRun, newestRelease, wizardVersions } from '../src/shared/firstRun';
import { newProfile } from '../src/main/store';
import { recommendedMemoryMb } from '../src/main/jvm';

const fresh = () => ({ accounts: [] as unknown[], profiles: [newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release' })], settings: {} as { firstRunDone?: boolean } });

describe('first-run wizard', () => {
  it('shows on a brand new installation', () => {
    assert.equal(needsFirstRun(fresh()), true);
  });
  it('never shows once done or skipped', () => {
    const s = fresh();
    s.settings.firstRunDone = true;
    assert.equal(needsFirstRun(s), false);
  });
  it('never shows to players who already have an account or their own profiles', () => {
    const withAccount = fresh();
    withAccount.accounts.push({ id: 'a', type: 'offline', name: 'Steve' });
    assert.equal(needsFirstRun(withAccount), false);
    const twoProfiles = fresh();
    twoProfiles.profiles.push(newProfile({ name: 'Moje mody', versionId: '1.21.4', loader: 'fabric' }));
    assert.equal(needsFirstRun(twoProfiles), false);
    const played = fresh();
    played.profiles[0].playTimeMs = 60_000;
    assert.equal(needsFirstRun(played), false);
    const changed = fresh();
    changed.profiles[0].versionId = '1.8.9';
    assert.equal(needsFirstRun(changed), false);
    // only a profile of their own (the starting one deleted)
    const own = fresh();
    own.profiles = [newProfile({ name: 'PvP', versionId: '1.8.9' })];
    assert.equal(needsFirstRun(own), false);
  });
  it('tells the starting profile apart', () => {
    assert.equal(isPristineProfile(newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release' })), true);
    assert.equal(isPristineProfile(newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release', lastPlayedAt: 1 })), false);
    assert.equal(isPristineProfile(newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release', gameDir: 'C:\\gry' })), false);
  });
  it('marks existing users on upgrade, once, and leaves new ones alone', () => {
    const existing = fresh();
    existing.accounts.push({ id: 'a' });
    assert.equal(markExistingUser(existing), true);
    assert.equal(existing.settings.firstRunDone, true);
    assert.equal(markExistingUser(existing), false);
    const brandNew = fresh();
    assert.equal(markExistingUser(brandNew), false);
    assert.equal(brandNew.settings.firstRunDone, undefined);
    // skipped by the player earlier (false would mean "not done"): left as it is
    const skipped = fresh();
    skipped.settings.firstRunDone = false;
    skipped.accounts.push({ id: 'a' });
    assert.equal(markExistingUser(skipped), false);
  });
});

describe('slower computers', () => {
  it('counts 8 GB of memory or 4 cores as low-end', () => {
    assert.equal(isLowEndMachine(8192, 12), true);
    assert.equal(isLowEndMachine(7900, 16), true);
    assert.equal(isLowEndMachine(4096, 8), true);
    assert.equal(isLowEndMachine(16384, 4), true);
    assert.equal(isLowEndMachine(16384, 2), true);
  });
  it('does not count stronger or unknown machines', () => {
    assert.equal(isLowEndMachine(16384, 8), false);
    assert.equal(isLowEndMachine(32768, 16), false);
    assert.equal(isLowEndMachine(undefined, undefined), false);
    assert.equal(isLowEndMachine(0, 0), false);
    assert.equal(isLowEndMachine(16384, undefined), false);
  });
});

describe('the first profile', () => {
  const manifest = [
    { id: '25w44a', type: 'snapshot' }, { id: '1.21.11', type: 'release' }, { id: '1.21.10', type: 'release' },
    { id: '1.21.9', type: 'release' }, { id: '1.20.1', type: 'release' }, { id: '1.8.9', type: 'release' },
  ];
  it('offers the newest release first', () => {
    assert.equal(newestRelease(manifest), '1.21.11');
    assert.equal(newestRelease([]), undefined);
  });
  it('lists the newest releases and every HUD version, marked', () => {
    const list = wizardVersions(manifest, ['1.21.10', '1.20.1'], 2);
    assert.deepEqual(list, [{ id: '1.21.11', hud: false }, { id: '1.21.10', hud: true }, { id: '1.20.1', hud: true }]);
  });
  it('suggests memory from the computer (the launcher\'s own recommendation)', () => {
    assert.equal(recommendedMemoryMb(16384, 'fabric', 7), 6144);
    assert.equal(recommendedMemoryMb(8192, 'fabric', 7), 4096);
    assert.equal(recommendedMemoryMb(4096, 'vanilla', 0), 2048);
  });
});
