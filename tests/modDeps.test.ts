import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildModGraph, inspectModsFolder, readModMeta, type ModMeta, type ModOrigin } from '../src/main/modcheck';
import { binContent, emptyBin, restoreContent } from '../src/main/contentBin';
import { dependencyMark, readManifest, writeManifest, type ManifestEntry } from '../src/main/modrinth';
import { brokenBy, neededBy, orphansAfter, planChange, type ModNode } from '../src/shared/modDeps';
import { selectAllVisible, selectRange, visibleSelection } from '../src/shared/selection';
import { lookup, setLang } from '../src/shared/i18n';

function jar(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(files)) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return zip.toBuffer();
}
const fabricJar = (id: string, extra: Record<string, unknown> = {}, files: Record<string, Buffer> = {}) =>
  jar({ 'fabric.mod.json': JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', name: id, ...extra }), ...files });
const fabric = (id: string, extra: Record<string, unknown> = {}) => readModMeta(fabricJar(id, extra), `${id}.jar`)!;
const entry = (meta: ModMeta, origin: ModOrigin = 'direct', enabled = true) => ({ meta, enabled, origin });

/** A small Fabric profile: Fabric API (a library with a bundled module), Cloth Config on it, mods on both. */
function fabricProfile() {
  const api = readModMeta(fabricJar('fabric-api', { name: 'Fabric API', version: '0.100.0', provides: ['fabric'], custom: { modmenu: { badges: ['library'] } }, jars: [{ file: 'META-INF/jars/base.jar' }] }, {
    'META-INF/jars/base.jar': jar({ 'fabric.mod.json': JSON.stringify({ id: 'fabric-api-base', version: '0.4.0' }) }),
  }), 'fabric-api.jar')!;
  const cloth = fabric('cloth-config', { name: 'Cloth Config', version: '15.0.0', depends: { 'fabric-api': '*' } });
  const sodium = fabric('sodium', { name: 'Sodium', version: '0.6.0', recommends: { 'fabric-api': '*' } });
  const minimap = fabric('minimap', { name: 'Minimap', depends: { 'fabric-api-base': '*', 'cloth-config': '>=15', fabricloader: '>=0.15', minecraft: '1.21.x' } });
  const zoom = fabric('zoom', { name: 'Zoom', depends: { fabric: '*', 'cloth-config': '>=16' }, suggests: { modmenu: '*' } });
  return { api, cloth, sodium, minimap, zoom };
}

describe('dependency tree', () => {
  setLang('pl');
  it('lists required and optional dependencies with versions, marking missing ones', () => {
    const { api, cloth, sodium, minimap, zoom } = fabricProfile();
    const nodes = buildModGraph([entry(api, 'dependency'), entry(cloth, 'dependency'), entry(sodium), entry(minimap), entry(zoom)], 'fabric');
    const of = (file: string) => nodes.find((n) => n.file === file)!;
    // the bundled module and the "provides" alias both lead to the Fabric API jar; loader and game are not mods
    assert.deepEqual(of('minimap.jar').requires.map((r) => [r.id, r.provider, r.state, r.ranges]),
      [['fabric-api-base', 'fabric-api.jar', 'ok', ''], ['cloth-config', 'cloth-config.jar', 'ok', '>=15']]);
    assert.deepEqual(of('zoom.jar').requires.map((r) => [r.id, r.state, r.optional]),
      [['fabric', 'ok', false], ['cloth-config', 'version', false], ['modmenu', 'missing', true]]);
    assert.deepEqual(of('sodium.jar').requires.map((r) => [r.id, r.optional]), [['fabric-api', true]]);
    assert.equal(of('fabric-api.jar').library, true);
    assert.equal(of('cloth-config.jar').library, true, 'known library without a badge');
    assert.equal(of('sodium.jar').library, false);
    assert.deepEqual(neededBy(nodes, 'fabric-api.jar').map((u) => [u.node.file, u.optional]),
      [['cloth-config.jar', false], ['minimap.jar', false], ['zoom.jar', false], ['sodium.jar', true]]);
  });

  it('reads Quilt, Forge and NeoForge dependencies, and Fabric mods through Connector', () => {
    const quilt = readModMeta(jar({ 'quilt.mod.json': JSON.stringify({ quilt_loader: { id: 'qmod', version: '1.0', depends: ['qsl', { id: 'emi', optional: true }, { id: 'cloth-config', versions: '>=10' }] } }) }), 'qmod.jar')!;
    const qsl = readModMeta(jar({ 'quilt.mod.json': JSON.stringify({ quilt_loader: { id: 'qsl', version: '8.0' }, modmenu: { badges: ['library'] } }) }), 'qsl.jar')!;
    const q = buildModGraph([entry(quilt), entry(qsl, 'dependency')], 'quilt');
    assert.deepEqual(q[0].requires.map((r) => [r.id, r.state, r.optional]), [['qsl', 'ok', false], ['cloth-config', 'missing', false], ['emi', 'missing', true]]);
    assert.equal(q[1].library, true);

    const toml = (id: string, deps: string) => `modLoader="javafml"\n[[mods]]\nmodId="${id}"\nversion="2.0"\ndisplayName="${id}"\n${deps}`;
    const forgeMod = readModMeta(jar({ 'META-INF/mods.toml': toml('create', `[[dependencies.create]]\nmodId="flywheel"\nmandatory=true\nversionRange="[1.0,)"\n[[dependencies.create]]\nmodId="jei"\nmandatory=false\nversionRange="[15,)"\n[[dependencies.create]]\nmodId="minecraft"\nmandatory=true\nversionRange="[1.20.1,1.20.2)"\n`) }), 'create.jar')!;
    const flywheel = readModMeta(jar({ 'META-INF/mods.toml': toml('flywheel', '') }), 'flywheel.jar')!;
    const f = buildModGraph([entry(forgeMod), entry(flywheel, 'unknown', false)], 'forge');
    assert.deepEqual(f[0].requires.map((r) => [r.id, r.state, r.optional, r.ranges]), [['flywheel', 'disabled', false, '[1.0,)'], ['jei', 'missing', true, '[15,)']]);

    const neo = readModMeta(jar({ 'META-INF/neoforge.mods.toml': toml('neomod', `[[dependencies.neomod]]\nmodId="geckolib"\ntype="required"\n[[dependencies.neomod]]\nmodId="jade"\ntype="optional"\n[[dependencies.neomod]]\nmodId="optifine"\ntype="incompatible"\n`) }), 'neomod.jar')!;
    assert.deepEqual(buildModGraph([entry(neo)], 'neoforge')[0].requires.map((r) => [r.id, r.optional]), [['geckolib', false], ['jade', true]]);

    // Connector: a Fabric mod on NeoForge needs fabric_api (Forgified Fabric API), with "_" for "-"
    const connector = readModMeta(jar({ 'META-INF/neoforge.mods.toml': toml('connectormod', '') }), 'connector.jar')!;
    const ffapi = readModMeta(jar({ 'META-INF/neoforge.mods.toml': toml('fabric_api', '') }), 'ffapi.jar')!;
    const fab = fabric('fabmod', { depends: { 'fabric-api': '*' } });
    const c = buildModGraph([entry(connector), entry(ffapi, 'dependency'), entry(fab)], 'neoforge');
    assert.deepEqual(c[2].requires.map((r) => [r.id, r.provider, r.state]), [['fabric_api', 'ffapi.jar', 'ok']]);
  });

  it('reads a profile folder: disabled jars too, and the check of the enabled ones', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'modgraph-'));
    await fs.mkdir(path.join(dir, 'mods'));
    await fs.writeFile(path.join(dir, 'mods', 'cloth.jar.disabled'), fabricJar('cloth-config'));
    await fs.writeFile(path.join(dir, 'mods', 'minimap.jar'), fabricJar('minimap', { depends: { 'cloth-config': '*' } }));
    const { nodes, problems } = await inspectModsFolder(dir, 'fabric', '1.21.4', (f) => (f === 'cloth.jar' ? 'dependency' : 'direct'));
    assert.deepEqual(nodes.map((n) => [n.file, n.enabled, n.origin]).sort(), [['cloth.jar', false, 'dependency'], ['minimap.jar', true, 'direct']]);
    assert.equal(nodes.find((n) => n.file === 'minimap.jar')!.requires[0].state, 'disabled');
    assert.deepEqual(problems.map((p) => p.missingId), ['cloth-config']);
  });
});

const node = (file: string, o: Partial<ModNode> = {}): ModNode => ({ file, enabled: true, name: file, version: '1', ids: [file], library: false, origin: 'direct', requires: [], ...o });
const req = (id: string, optional = false, state: ModNode['requires'][number]['state'] = 'ok') => ({ id, ranges: '', optional, provider: id, state });

describe('disabling a mod others need', () => {
  const nodes = [
    node('fapi', { library: true, origin: 'dependency' }),
    node('cloth', { library: true, origin: 'dependency', requires: [req('fapi')] }),
    node('a', { requires: [req('fapi'), req('cloth')] }),
    node('b', { requires: [req('cloth')] }),
    node('c', { requires: [req('fapi', true)] }),
    node('d', { enabled: false, requires: [req('fapi')] }),
    node('e', { requires: [req('gone', false, 'missing')] }),
  ];
  it('counts the mods that stop working, also through a library, but not optional or already broken ones', () => {
    assert.deepEqual(brokenBy(nodes, ['fapi']).map((n) => n.file).sort(), ['a', 'b', 'cloth']);
    assert.deepEqual(brokenBy(nodes, ['b']), []);
    // another jar with the same id keeps it working
    assert.deepEqual(brokenBy([...nodes, node('fapi2', { ids: ['fapi'] })], ['fapi']), []);
  });
  it('plans "anyway" and "together", never removing the dependants', () => {
    assert.deepEqual(planChange(nodes, 'disable', ['cloth'], 'anyway'), { disable: ['cloth'], remove: [], away: ['cloth'] });
    assert.deepEqual(planChange(nodes, 'disable', ['cloth'], 'together'), { disable: ['cloth', 'a', 'b'], remove: [], away: ['cloth', 'a', 'b'] });
    assert.deepEqual(planChange(nodes, 'remove', ['cloth'], 'together'), { disable: ['a', 'b'], remove: ['cloth'], away: ['cloth', 'a', 'b'] });
  });
});

describe('leftover libraries', () => {
  it('offers libraries only removed mods needed, also libraries of libraries', () => {
    const nodes = [
      node('fapi', { library: true, origin: 'dependency' }),
      node('cloth', { library: true, origin: 'dependency', requires: [req('fapi')] }),
      node('arch', { library: true, origin: 'dependency', requires: [req('fapi')] }),
      node('menu', { requires: [req('cloth')] }),
      node('other', { requires: [req('arch')] }),
    ];
    assert.deepEqual(orphansAfter(nodes, ['menu']).map((o) => [o.node.file, o.ticked]), [['cloth', true]]);
    assert.deepEqual(orphansAfter(nodes, ['menu', 'other']).map((o) => o.node.file).sort(), ['arch', 'cloth', 'fapi']);
    // nothing changes for a mod no library served
    assert.deepEqual(orphansAfter(nodes, ['fapi']), []);
  });
  it('never offers what the player put there, and asks carefully about older profiles', () => {
    const nodes = [
      node('kotlin', { library: true, origin: 'direct' }),
      node('old-lib', { library: true, origin: 'unknown' }),
      node('old-mod', { library: false, origin: 'unknown' }),
      node('dep-mod', { library: false, origin: 'dependency' }),
      node('mod', { requires: [req('kotlin'), req('old-lib'), req('old-mod'), req('dep-mod')] }),
      node('shelved', { enabled: false, requires: [req('shared')] }),
      node('shared', { library: true, origin: 'dependency' }),
      node('user', { requires: [req('shared')] }),
    ];
    const offered = orphansAfter(nodes, ['mod']);
    assert.deepEqual(offered.map((o) => [o.node.file, o.ticked]), [['old-lib', false], ['dep-mod', false]]);
    // a library a disabled mod still needs comes unticked, with a note
    const shared = orphansAfter(nodes, ['user']);
    assert.deepEqual(shared.map((o) => [o.node.file, o.ticked, o.neededByDisabled]), [['shared', false, ['shelved']]]);
  });
  it('marks what an install pulls in as a dependency, and keeps the mark through updates', () => {
    const dep: ManifestEntry = { type: 'mod', filename: 'cloth.jar', projectId: 'c', versionId: '1', versionNumber: '1', title: 'Cloth', dependency: true };
    assert.deepEqual(dependencyMark(true, 'direct', undefined), { dependency: false });
    assert.deepEqual(dependencyMark(false, 'direct', undefined), { dependency: true });
    assert.deepEqual(dependencyMark(false, 'direct', { ...dep, dependency: false }), { dependency: false });
    assert.deepEqual(dependencyMark(true, 'keep', dep), { dependency: true });
    assert.deepEqual(dependencyMark(true, 'keep', { ...dep, dependency: undefined }), {});
    // picked from the search after coming in as a dependency: the player's own now
    assert.deepEqual(dependencyMark(true, 'direct', dep), { dependency: false });
    assert.deepEqual(dependencyMark(true, 'dependency', undefined), { dependency: true });
  });
});

describe('selecting many', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  it('selects ranges with Shift and only acts on the visible rows', () => {
    let sel = selectRange(order, new Set(), 'b', 'b', true);
    sel = selectRange(order, sel, 'b', 'd', true);
    assert.deepEqual([...sel].sort(), ['b', 'c', 'd']);
    sel = selectRange(order, sel, 'd', 'c', false);
    assert.deepEqual([...sel].sort(), ['b']);
    // the search hides "b": the bar and the actions see nothing of it
    assert.deepEqual(visibleSelection(['a', 'c'], sel), []);
    const all = selectAllVisible(['a', 'c'], sel);
    assert.deepEqual(visibleSelection(['a', 'c'], all), ['a', 'c']);
    assert.ok(all.has('b'), 'hidden rows keep their state');
  });
});

describe('removing with a way back', () => {
  it('moves files aside, restores them as they were, then sends them to the trash', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'bin-'));
    await fs.mkdir(path.join(dir, 'mods'));
    await fs.mkdir(path.join(dir, 'shaderpacks'));
    await fs.writeFile(path.join(dir, 'mods', 'a.jar'), 'A');
    await fs.writeFile(path.join(dir, 'mods', 'b.jar.disabled'), 'B');
    await fs.writeFile(path.join(dir, 'shaderpacks', 's.zip'), 'S');
    const entryA: ManifestEntry = { type: 'mod', filename: 'a.jar', projectId: 'pa', versionId: '1', versionNumber: '1', title: 'A', dependency: true };
    await writeManifest(dir, [entryA]);

    const { id, removed } = await binContent(dir, [{ type: 'mod', filename: 'a.jar' }, { type: 'mod', filename: 'b.jar' }, { type: 'shader', filename: 's.zip' }, { type: 'mod', filename: 'none.jar' }]);
    assert.equal(removed, 3);
    assert.deepEqual(await fs.readdir(path.join(dir, 'mods')), []);
    assert.deepEqual(await readManifest(dir), []);

    const back = await restoreContent(dir, id);
    assert.deepEqual(back, { restored: 3, skipped: [] });
    assert.deepEqual((await fs.readdir(path.join(dir, 'mods'))).sort(), ['a.jar', 'b.jar.disabled']);
    assert.deepEqual(await readManifest(dir), [entryA]);

    // a second removal; meanwhile a new a.jar arrives: undo leaves the new one alone
    const second = await binContent(dir, [{ type: 'mod', filename: 'a.jar' }, { type: 'mod', filename: 'b.jar' }]);
    await fs.writeFile(path.join(dir, 'mods', 'a.jar'), 'new');
    assert.deepEqual((await restoreContent(dir, second.id)).skipped, ['a.jar']);
    assert.equal(readFileSync(path.join(dir, 'mods', 'a.jar'), 'utf8'), 'new');

    // the old copy goes to the trash (file by file), and a trash that refuses keeps it in the profile
    const refused = await emptyBin(dir, async () => { throw new Error('no trash'); }, { id: second.id });
    assert.equal(refused, 0);
    const trashed: string[] = [];
    assert.equal(await emptyBin(dir, async (f) => { trashed.push(path.basename(f)); await fs.rm(f); }, { id: second.id }), 1);
    assert.deepEqual(trashed, ['a.jar']);
    assert.deepEqual(await fs.readdir(path.join(dir, '.slashclient', 'removed')), []);
    await assert.rejects(restoreContent(dir, '../../x'));
  });
});

describe('texts', () => {
  it('has English for every new text', () => {
    setLang('en');
    const sources = ['src/renderer/modDepsUi.ts', 'src/renderer/app.ts'].map((f) => readFileSync(f, 'utf8'));
    const ui = sources[0];
    const texts = [...ui.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]);
    // the dependency states are looked up through a table
    // the app's new texts in the Installed list
    const app = sources[1];
    const start = app.indexOf('const itemKey = ');
    texts.push(...[...app.slice(start, app.indexOf('function renderContent()', start)).matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]));
    texts.push('Odznacz', 'Wyłącz', 'Włącz', 'Aktualizuj', 'Usuń', 'brak', 'wyłączony', 'inna wersja');
    const missing = [...new Set(texts)].filter((x) => lookup(x) === undefined);
    setLang('pl');
    assert.deepEqual(missing, []);
  });
});
