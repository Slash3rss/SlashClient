import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  applyMove, checkMove, missingDependencies, modLoaders, moveCounts, moveTargets, planMove, readMoveReport, saveMoveReport,
  type ModFile, type MoveSource, type MoveVersion,
} from '../src/main/versionMove';
import { readManifest } from '../src/main/modrinth';

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

function version(id: string, project: string, games: string[], opts: Partial<MoveVersion> = {}): MoveVersion {
  return {
    id, project_id: project, version_number: id, version_type: 'release', game_versions: games, loaders: ['fabric'],
    files: [{ url: `https://cdn.modrinth.com/${id}.jar`, filename: `${id}.jar`, primary: true, size: 3, hashes: { sha1: sha1(id) } }],
    ...opts,
  };
}

describe('moving a profile to another Minecraft version: the plan', () => {
  const files: ModFile[] = [
    { filename: 'sodium.jar', enabled: true, sha1: 'a' },
    { filename: 'lib.jar', enabled: true, sha1: 'b' },
    { filename: 'old.jar', enabled: true, sha1: 'c' },
    { filename: 'mine.jar', enabled: true, sha1: 'd' },
    { filename: 'off.jar', enabled: false, sha1: 'e' },
  ];
  const current = {
    a: version('sod-1', 'sodium', ['1.21.1']),
    b: version('lib-1', 'lib', ['1.21.1', '1.21.4']),
    c: version('old-1', 'old', ['1.21.1']),
    e: version('off-1', 'off', ['1.21.1']),
  };

  it('sorts every mod into ready, same, missing and unknown', () => {
    const target = {
      a: version('sod-2', 'sodium', ['1.21.4']),
      // Modrinth answers with the file's own version when nothing newer fits
      b: version('lib-1', 'lib', ['1.21.1', '1.21.4']),
      e: version('off-2', 'off', ['1.21.4'], { version_type: 'beta' }),
    };
    const items = planMove(files, current, target, '1.21.4', 'fabric', new Map([['sodium', { title: 'Sodium', iconUrl: 'https://cdn.modrinth.com/s.png' }]]));
    const by = Object.fromEntries(items.map((i) => [i.filename, i]));
    assert.equal(by['sodium.jar'].status, 'ready');
    assert.equal(by['sodium.jar'].title, 'Sodium');
    assert.equal(by['sodium.jar'].currentVersion, 'sod-1');
    assert.equal(by['sodium.jar'].targetVersion, 'sod-2');
    assert.equal(by['lib.jar'].status, 'same');
    assert.equal(by['old.jar'].status, 'missing');
    assert.equal(by['mine.jar'].status, 'unknown');
    assert.equal(by['mine.jar'].title, 'mine');
    assert.equal(by['off.jar'].status, 'ready');
    assert.equal(by['off.jar'].prerelease, true);
    assert.equal(by['off.jar'].enabled, false);
    // what needs attention comes first
    assert.deepEqual(items.map((i) => i.status), ['missing', 'unknown', 'ready', 'ready', 'same']);
    assert.deepEqual(moveCounts(items), { ready: 2, same: 1, missing: 1, unknown: 1 });
  });

  it('does not trust an answer for another game version or loader', () => {
    const target = {
      a: version('sod-2', 'sodium', ['1.21.3']),
      c: version('old-2', 'old', ['1.21.4'], { loaders: ['forge'] }),
    };
    const items = planMove(files.slice(0, 3), current, target, '1.21.4', 'fabric');
    assert.deepEqual(items.map((i) => [i.filename, i.status]), [['old.jar', 'missing'], ['sodium.jar', 'missing'], ['lib.jar', 'same']]);
  });

  it('lets Quilt profiles use Fabric mods', () => {
    assert.deepEqual(modLoaders('quilt'), ['quilt', 'fabric']);
    assert.deepEqual(modLoaders('neoforge'), ['neoforge']);
    const items = planMove(files.slice(0, 1), current, { a: version('sod-2', 'sodium', ['1.21.4']) }, '1.21.4', 'quilt');
    assert.equal(items[0].status, 'ready');
  });

  it('finds required dependencies the profile lacks', () => {
    const v = version('x', 'x', ['1.21.4'], { dependencies: [
      { project_id: 'fabric-api', dependency_type: 'required' },
      { project_id: 'modmenu', dependency_type: 'optional' },
      { project_id: 'lib', dependency_type: 'required' },
      { project_id: null, dependency_type: 'required' },
    ] });
    assert.deepEqual(missingDependencies([v, v], new Set(['lib'])), ['fabric-api']);
  });

  it('offers the other releases as targets', () => {
    const versions = [{ id: '1.21.5-pre1', type: 'snapshot' }, { id: '1.21.4', type: 'release' }, { id: '1.21.1', type: 'release' }, { id: 'b1.7', type: 'old_beta' }];
    assert.deepEqual(moveTargets(versions, '1.21.1'), ['1.21.4']);
  });
});

describe('moving a profile to another Minecraft version: the files', () => {
  async function setup() {
    const game = await fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-move-'));
    await fs.mkdir(path.join(game, 'mods'), { recursive: true });
    for (const [name, text] of [['sodium-1.jar', 'sod-1'], ['old.jar', 'old-1'], ['mine.jar', 'mine'], ['off-1.jar.disabled', 'off-1']]) {
      await fs.writeFile(path.join(game, 'mods', name), text);
    }
    await fs.mkdir(path.join(game, '.slashclient'), { recursive: true });
    await fs.writeFile(path.join(game, '.slashclient', 'content.json'), JSON.stringify([
      { type: 'mod', filename: 'sodium-1.jar', projectId: 'sodium', versionId: 'sod-1', versionNumber: 'sod-1', title: 'Sodium' },
    ]));
    return game;
  }
  const known: Record<string, MoveVersion> = {
    [sha1('sod-1')]: version('sod-1', 'sodium', ['1.21.1']),
    [sha1('old-1')]: version('old-1', 'old', ['1.21.1']),
    [sha1('off-1')]: version('off-1', 'off', ['1.21.1']),
  };
  const newest: Record<string, MoveVersion> = {
    [sha1('sod-1')]: version('sod-2', 'sodium', ['1.21.4'], { dependencies: [{ project_id: 'fabric-api', dependency_type: 'required' }] }),
    [sha1('off-1')]: version('off-2', 'off', ['1.21.4']),
  };
  const asked: string[][] = [];
  const source: MoveSource = {
    identify: async (h) => Object.fromEntries(h.filter((x) => known[x]).map((x) => [x, known[x]])),
    newest: async (h, _g, _l, types) => {
      asked.push(types);
      return Object.fromEntries(h.filter((x) => newest[x]).map((x) => [x, newest[x]]));
    },
    projects: async (ids) => ids.map((id) => ({ id, title: id === 'old' ? 'Old Mod' : id })),
  };
  // "downloads" write the version id, so the new file's hash is what Modrinth listed
  const download = async (tasks: { url: string; dest: string }[]) => {
    for (const task of tasks) await fs.writeFile(task.dest, path.basename(task.url, '.jar'));
  };

  it('swaps ready mods, disables the rest and remembers what waits', async () => {
    const game = await setup();
    const checked = await checkMove(game, '1.21.1', '1.21.4', 'fabric', source);
    // releases first, then betas for the ones without a release
    assert.deepEqual(asked.slice(-2), [['release'], ['release', 'beta', 'alpha']]);
    assert.deepEqual(moveCounts(checked.plan.items), { ready: 2, same: 0, missing: 1, unknown: 1 });
    const deps: string[] = [];
    const report = await applyMove({ gameDir: game, checked, disableUnknown: true, download, installDependency: async (id) => (deps.push(id), id) });
    const mods = (await fs.readdir(path.join(game, 'mods'))).sort();
    assert.deepEqual(mods, ['mine.jar.disabled', 'off-2.jar.disabled', 'old.jar.disabled', 'sod-2.jar']);
    assert.equal(report.moved, 2);
    assert.deepEqual(report.pending.map((p) => [p.filename, p.status]), [['old.jar', 'missing'], ['mine.jar', 'unknown']]);
    assert.deepEqual(deps, ['fabric-api']);
    const manifest = await readManifest(game);
    assert.equal(manifest.find((m) => m.projectId === 'sodium')?.filename, 'sod-2.jar');
    assert.equal(manifest.find((m) => m.projectId === 'off')?.versionId, 'off-2');

    await saveMoveReport(game, report);
    assert.equal((await readMoveReport(game))?.pending.length, 2);

    // later: the old mod got a version, the player's own one is still unknown
    known[sha1('old-1')] = version('old-1', 'old', ['1.21.1']);
    newest[sha1('old-1')] = version('old-2', 'old', ['1.21.4']);
    const again = await checkMove(game, '1.21.1', '1.21.4', 'fabric', source, new Set(['old.jar', 'mine.jar']));
    assert.equal(again.plan.items.length, 2);
    const next = await applyMove({ gameDir: game, checked: again, disableUnknown: true, enable: new Set(['old.jar', 'mine.jar']), download, installDependency: async (id) => id });
    const saved = await saveMoveReport(game, next, report);
    assert.deepEqual(saved.pending.map((p) => p.filename), ['mine.jar']);
    assert.equal(saved.moved, 3);
    assert.ok((await fs.readdir(path.join(game, 'mods'))).includes('old-2.jar'));

    // nothing left to wait for: the report is gone
    await saveMoveReport(game, { ...saved, pending: [] });
    assert.equal(await readMoveReport(game), undefined);
    delete newest[sha1('old-1')];
    await fs.rm(game, { recursive: true, force: true });
  });

  it('keeps unknown mods on when the player says so, and a failed download changes nothing', async () => {
    const game = await setup();
    const checked = await checkMove(game, '1.21.1', '1.21.4', 'fabric', source);
    await assert.rejects(applyMove({
      gameDir: game, checked, disableUnknown: false, installDependency: async (id) => id,
      download: async () => {
        throw new Error('offline');
      },
    }));
    assert.ok((await fs.readdir(path.join(game, 'mods'))).includes('sodium-1.jar'));
    const report = await applyMove({ gameDir: game, checked, disableUnknown: false, download, installDependency: async (id) => id });
    assert.ok((await fs.readdir(path.join(game, 'mods'))).includes('mine.jar'));
    assert.deepEqual(report.pending.map((p) => p.filename), ['old.jar']);
    await fs.rm(game, { recursive: true, force: true });
  });
});
