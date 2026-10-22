import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkMods, parseModsToml, readModMeta, satisfies, type ModMeta } from '../src/main/modcheck';
import { setLang } from '../src/shared/i18n';

function jar(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(files)) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return zip.toBuffer();
}
const fabric = (id: string, extra: Record<string, unknown> = {}, files: Record<string, Buffer> = {}) =>
  readModMeta(jar({ 'fabric.mod.json': JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', name: id, ...extra }), ...files }), `${id}.jar`)!;

describe('version ranges', () => {
  const sv = (v: string, ...ranges: string[]) => satisfies(v, { ranges, style: 'semver' });
  const mv = (v: string, range: string) => satisfies(v, { ranges: [range], style: 'maven' });
  it('reads Fabric ranges', () => {
    assert.equal(sv('1.21.4', '>=1.21 <1.22'), true);
    assert.equal(sv('1.22', '>=1.21 <1.22'), false);
    assert.equal(sv('1.21.4', '~1.21'), true);
    assert.equal(sv('1.20.6', '~1.21'), false);
    assert.equal(sv('1.21.4', '1.21.x'), true);
    assert.equal(sv('26.1.2', '1.21.x'), false);
    assert.equal(sv('1.21.4', '1.20.1', '1.21.4'), true);
    assert.equal(sv('0.163.0+1.21.4', '>=0.100.0'), true);
    assert.equal(sv('1.21.4', '>=1.21.2- <1.21.5'), true);
    assert.equal(sv('1.21.4', '*'), true);
  });
  it('reads maven ranges', () => {
    assert.equal(mv('1.21.1', '[1.21,1.22)'), true);
    assert.equal(mv('1.22', '[1.21,1.22)'), false);
    assert.equal(mv('47.3.0', '[47,)'), true);
    assert.equal(mv('1.21.1', '[1.21.1]'), true);
    assert.equal(mv('1.21', '[1.21.1]'), false);
  });
});

describe('mod checks', () => {
  setLang('pl');
  it('finds missing dependencies, but not ones bundled inside another jar', () => {
    const api = fabric('fabric-api', { provides: ['fabric'], jars: [{ file: 'META-INF/jars/base.jar' }] }, {
      'META-INF/jars/base.jar': jar({ 'fabric.mod.json': JSON.stringify({ id: 'fabric-api-base', version: '0.4.0' }) }),
    });
    const mod = fabric('coolmod', { depends: { 'fabric-api-base': '*', fabricloader: '>=0.15', cloth_config: '*' } });
    const problems = checkMods([api, mod], 'fabric', '1.21.4');
    assert.deepEqual(problems.map((p) => [p.kind, p.missingId]), [['missing', 'cloth_config']]);
  });
  it('flags the wrong loader and game version, duplicates and conflicts', () => {
    const forgeMod = readModMeta(jar({ 'META-INF/mods.toml': 'modLoader="javafml"\n[[mods]]\nmodId="forgy"\nversion="1.0"\ndisplayName="Forgy"\n' }), 'forgy.jar')!;
    const old = fabric('oldmod', { depends: { minecraft: '~1.20' } });
    const a = fabric('sodium');
    const b = { ...fabric('sodium'), file: 'sodium-2.jar' };
    const breaker = fabric('optifabric', { breaks: { sodium: '*' } });
    const kinds = checkMods([forgeMod, old, a, b, breaker], 'fabric', '1.21.4').map((p) => p.kind).sort();
    assert.deepEqual(kinds, ['breaks', 'duplicate', 'loader', 'minecraft']);
  });
  it('lets Quilt run Fabric mods and warns when there is no loader', () => {
    const mods: ModMeta[] = [fabric('sodium')];
    assert.deepEqual(checkMods(mods, 'quilt', '1.21.4'), []);
    assert.equal(checkMods(mods, 'vanilla', '1.21.4')[0].kind, 'noloader');
  });
  it('reads Forge dependencies from mods.toml', () => {
    const toml = parseModsToml(`modLoader="javafml"
[[mods]]
modId="mymod"
version="2.0"
description='''A long
description'''
[[dependencies.mymod]]
modId="minecraft"
mandatory=true
versionRange="[1.20.1,1.20.2)"
[[dependencies.mymod]]
modId="jei"
type="required"
versionRange="[15,)"
`);
    assert.equal(toml.mods[0].description, 'A long\ndescription');
    assert.equal(toml['dependencies.mymod'].length, 2);
    const meta = readModMeta(jar({ 'META-INF/mods.toml': `modLoader="javafml"\n[[mods]]\nmodId="mymod"\nversion="2.0"\n[[dependencies.mymod]]\nmodId="minecraft"\nmandatory=true\nversionRange="[1.20.1,1.20.2)"\n[[dependencies.mymod]]\nmodId="jei"\nmandatory=true\nversionRange="[15,)"\n` }), 'mymod.jar')!;
    assert.deepEqual(checkMods([meta], 'forge', '1.21.1').map((p) => p.kind).sort(), ['minecraft', 'missing']);
  });

  it('reads only the loader the profile runs: a jar for Forge 1.20.1 that also carries NeoForge 1.21.1 and Fabric metadata', () => {
    const toml = (mc: string, loader: string) => `modLoader="javafml"
[[mods]]
modId="incision"
version="1.0"
[[dependencies.incision]]
modId="minecraft"
type="required"
versionRange="${mc}"
[[dependencies.incision]]
modId="${loader}"
type="required"
versionRange="[1,)"
`;
    const meta = readModMeta(jar({
      'META-INF/mods.toml': toml('[1.20.1]', 'forge'),
      'META-INF/neoforge.mods.toml': toml('[1.21.1]', 'neoforge'),
      'fabric.mod.json': JSON.stringify({ id: 'incision', version: '1.0', depends: { 'fabric-api': '*', minecraft: '1.19.3' } }),
    }), 'incision.jar')!;
    assert.deepEqual(checkMods([meta], 'forge', '1.20.1'), []);
    // on NeoForge its NeoForge list counts
    assert.deepEqual(checkMods([meta], 'neoforge', '1.20.1').map((p) => p.kind), ['minecraft']);
  });

  it('runs Fabric mods through Sinytra Connector on Forge, with Forgified Fabric API for fabric-api', () => {
    // Connector has no metadata of its own: its mod is bundled inside
    const connector = readModMeta(jar({
      'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n',
      'META-INF/jarjar/connector-mod.jar': jar({ 'META-INF/mods.toml': 'modLoader="javafml"\n[[mods]]\nmodId="connectormod"\nversion="1.0"\n' }),
    }), 'Connector.jar')!;
    assert.ok(connector.ids.includes('connectormod'));
    const forgifiedApi = readModMeta(jar({ 'META-INF/mods.toml': 'modLoader="javafml"\n[[mods]]\nmodId="fabric_api"\nversion="0.92.6"\n' }), 'fabric-api.jar')!;
    const fabricOnly = fabric('ambientsounds', { depends: { 'fabric-api': '*', fabricloader: '>=0.14' } });
    assert.deepEqual(checkMods([connector, forgifiedApi, fabricOnly], 'forge', '1.20.1'), []);
    // without Connector a Fabric mod still does not run on Forge
    assert.deepEqual(checkMods([forgifiedApi, fabricOnly], 'forge', '1.20.1').map((p) => p.kind), ['loader']);
  });
});
