import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jumpLists, jumpTarget, MAX_RECENT } from '../src/main/jumpList';

const texts = { profile: (v: string) => `profile ${v}`, server: (p: string) => `server on ${p}` };

describe('Windows jump list', () => {
  it('reads the clicked profile and server from the command line, nothing odd', () => {
    assert.deepEqual(jumpTarget(['SlashClient.exe', '--play=abc-123']), { profileId: 'abc-123' });
    assert.deepEqual(jumpTarget(['electron.exe', 'D:\\app', '--play=abc', '--server=mc.skyup.pl:25566']), { profileId: 'abc', server: 'mc.skyup.pl:25566' });
    assert.deepEqual(jumpTarget(['x', '--play=abc', '--server=bad server;rm']), { profileId: 'abc' });
    assert.equal(jumpTarget(['x']), undefined);
    assert.equal(jumpTarget(['x', '--play=../../etc']), undefined);
  });

  it('lists the profiles last played and each server once for every profile it was played from', () => {
    const profiles = [
      { id: 'a', name: 'Fabric', versionId: '26.3', lastPlayedAt: 300 },
      { id: 'b', name: 'Vanilla', versionId: '1.21.4', lastPlayedAt: 500 },
      { id: 'c', name: 'Never', versionId: '1.20.1' },
    ];
    const sessions = [
      { profileId: 'a', servers: [{ address: 'SkyUp.pl:25565', at: 100 }, { address: 'mc.example.com', at: 150 }] },
      { profileId: 'b', servers: [{ address: 'skyup.pl', at: 400 }] },
      // a deleted profile's servers are left out
      { profileId: 'gone', servers: [{ address: 'old.example.com', at: 900 }] },
    ];
    const lists = jumpLists(profiles, sessions, new Set(), texts);
    assert.deepEqual(lists.profiles.map((e) => [e.title, e.args, e.description]), [['Vanilla', '--play=b', 'profile 1.21.4'], ['Fabric', '--play=a', 'profile 26.3']]);
    assert.deepEqual(lists.servers.map((e) => [e.title, e.args, e.description]), [
      ['skyup.pl · Vanilla', '--play=b --server=skyup.pl', 'server on Vanilla'],
      ['mc.example.com', '--play=a --server=mc.example.com', 'server on Fabric'],
      ['skyup.pl · Fabric', '--play=a --server=skyup.pl', 'server on Fabric'],
    ]);
  });

  it('leaves out what the player removed from the list, and keeps it short', () => {
    const profiles = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, versionId: '26.3', lastPlayedAt: i + 1 }));
    const lists = jumpLists(profiles, [], new Set(['--play=p7']), texts);
    assert.equal(lists.profiles.length, MAX_RECENT);
    assert.equal(lists.profiles[0].args, '--play=p6');
  });
});
