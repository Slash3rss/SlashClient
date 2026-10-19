import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { formatOf, highlight, validateConfig } from '../src/shared/configFormats';
import { CHANGED_ON_DISK, listConfigFiles, readConfigFile, resolveConfigPath, restoreDefaultConfig, writeConfigFile } from '../src/main/configFiles';
import { removeItems, scanDisk, type CleanupProfile, type DiskLayout } from '../src/main/diskUsage';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'slashclient-test-'));
async function put(file: string, content: string | Buffer = 'x', mtime?: number) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  if (mtime) await fs.utimes(file, mtime / 1000, mtime / 1000);
}

describe('config formats', () => {
  it('knows the format from the extension', () => {
    assert.equal(formatOf('sodium-options.json'), 'json');
    assert.equal(formatOf('a/b/iris.JSON5'), 'json5');
    assert.equal(formatOf('create-common.toml'), 'toml');
    assert.equal(formatOf('optifine.properties'), 'properties');
    assert.equal(formatOf('forge.cfg'), 'properties');
    assert.equal(formatOf('settings.ini'), 'properties');
    assert.equal(formatOf('config.yml'), 'yaml');
    assert.equal(formatOf('readme.txt'), 'text');
    assert.equal(formatOf('noext'), 'text');
  });

  it('highlights without changing the text', () => {
    const samples: [string, Parameters<typeof highlight>[1]][] = [
      ['{\n  // comment\n  "key": "value", "n": -1.5e3, "b": true, "x": null\n}\n', 'json'],
      ["{ unquoted: 'single', trailing: [1, 2,], }", 'json5'],
      ['# c\n[server.general]\nname = "x" # tail\nlist = [\n  1, 2\n]\nwhen = 1979-05-27T07:32:00Z\nml = """\nline\n"""\n', 'toml'],
      ['# c\n[section]\nkey=value\nnum: 12\ngeneral {\n    S:name=hello\n}\n', 'properties'],
      ['# c\nroot:\n  - item: 1\n  key: "v" # tail\n  on: yes\n---\n', 'yaml'],
      ['just text', 'text'],
      ['', 'json'],
    ];
    for (const [text, format] of samples) assert.equal(highlight(text, format).map((tk) => tk.text).join(''), text, format);
    const json = highlight('{"a": "b", "n": 2}', 'json');
    assert.deepEqual(json.filter((tk) => tk.cls === 'key').map((tk) => tk.text), ['"a"', '"n"']);
    assert.deepEqual(json.filter((tk) => tk.cls === 'string').map((tk) => tk.text), ['"b"']);
    assert.deepEqual(json.filter((tk) => tk.cls === 'number').map((tk) => tk.text), ['2']);
    const toml = highlight('[a.b]\nkey = true\n', 'toml');
    assert.equal(toml.find((tk) => tk.cls === 'section')?.text, '[a.b]');
    assert.equal(toml.find((tk) => tk.cls === 'key')?.text, 'key');
    assert.equal(toml.find((tk) => tk.cls === 'keyword')?.text, 'true');
    const props = highlight('render.distance=12\nname=Steve\n', 'properties');
    assert.deepEqual(props.filter((tk) => tk.cls === 'key').map((tk) => tk.text), ['render.distance', 'name']);
    assert.deepEqual(props.filter((tk) => tk.cls).map((tk) => tk.cls), ['key', 'punct', 'number', 'key', 'punct', 'string']);
    assert.equal(highlight('a: 1\n', 'yaml')[0].cls, 'key');
  });

  it('checks JSON and says where the error is', () => {
    assert.equal(validateConfig('{"a": [1, 2.5, -3e2], "b": {"c": null, "d": "\\u00e9\\n"}}', 'json'), undefined);
    assert.equal(validateConfig('', 'json'), undefined);
    assert.equal(validateConfig('\ufeff{}', 'json'), undefined);
    // many mods write comments in .json
    assert.equal(validateConfig('{\n  // on\n  "a": 1 /* x */\n}', 'json'), undefined);
    const comma = validateConfig('{\n  "a": 1,\n}', 'json');
    assert.equal(comma?.line, 3);
    assert.equal(comma?.column, 1);
    const missing = validateConfig('{\n  "a": 1\n  "b": 2\n}', 'json');
    assert.equal(missing?.line, 3);
    assert.ok(validateConfig('{a: 1}', 'json'));
    assert.ok(validateConfig("{'a': 1}", 'json'));
    assert.ok(validateConfig('{"a": 01}', 'json'));
    assert.ok(validateConfig('{"a": "x}', 'json'));
    assert.ok(validateConfig('[1, 2', 'json'));
    assert.ok(validateConfig('{} {}', 'json'));
    assert.ok(validateConfig('{"a": tru}', 'json'));
  });

  it('checks JSON5', () => {
    assert.equal(validateConfig("{\n  // c\n  unquoted: 'single',\n  hex: 0xFF, inf: Infinity, half: .5, plus: +1,\n  list: [1, 2,],\n}", 'json5'), undefined);
    assert.ok(validateConfig('{a 1}', 'json5'));
    assert.ok(validateConfig('{a: [1, 2}', 'json5'));
  });

  it('checks TOML', () => {
    const ok = [
      '# Create config',
      '[client]',
      'enabled = true',
      'name = "Steve" # nick',
      "path = 'C:\\games'",
      'dotted.key = 1_000',
      'float = -3.14e2',
      'list = [',
      '  "a", # first',
      '  "b",',
      ']',
      'inline = { x = 1, y = "two" }',
      'date = 1979-05-27 07:32:00',
      'multi = """',
      'line one',
      '"""',
      '',
      '[client.sub]',
      'x = inf',
      '[[entries]]',
      'id = 1',
      '[[entries]]',
      'id = 2',
    ].join('\n');
    assert.equal(validateConfig(ok, 'toml'), undefined);
    assert.equal(validateConfig('a = 1\r\nb = 2\r\n', 'toml'), undefined);
    const bare = validateConfig('[a]\nname = Steve\n', 'toml');
    assert.equal(bare?.line, 2);
    assert.match(bare!.message, /Steve/);
    assert.equal(validateConfig('a = 1\na = 2\n', 'toml')?.line, 2);
    assert.equal(validateConfig('[a]\n[a]\n', 'toml')?.line, 2);
    assert.ok(validateConfig('a = "open\n', 'toml'));
    assert.ok(validateConfig('a = [1, 2\n', 'toml'));
    assert.ok(validateConfig('[a\n', 'toml'));
    assert.ok(validateConfig('a = 1 b = 2\n', 'toml'));
    assert.ok(validateConfig('just words\n', 'toml'));
    assert.equal(validateConfig('anything: goes', 'yaml'), undefined);
  });
});

describe('config files', () => {
  it('only resolves paths inside config/', async () => {
    const dir = await tmp();
    await fs.mkdir(path.join(dir, 'config'));
    assert.equal(await resolveConfigPath(dir, 'a/b.json'), path.join(dir, 'config', 'a', 'b.json'));
    for (const bad of ['../options.txt', 'a/../../x', '/etc/passwd', 'C:\\Windows\\x', '', '.', 'a/./b', 'x\0y']) {
      await assert.rejects(resolveConfigPath(dir, bad), Error, bad);
    }
    // a link inside config/ that leads out of it
    const outside = path.join(dir, 'outside');
    await fs.mkdir(outside);
    const linked = await fs.symlink(outside, path.join(dir, 'config', 'link'), 'junction').then(() => true, () => false);
    if (linked) await assert.rejects(resolveConfigPath(dir, 'link/file.txt'));
  });

  it('lists, reads and saves keeping line ends and BOM', async () => {
    const dir = await tmp();
    await put(path.join(dir, 'config', 'b.toml'), '\ufeffa = 1\r\nb = 2\r\n');
    await put(path.join(dir, 'config', 'sub', 'a.json'), '{}');
    const { files } = await listConfigFiles(dir);
    assert.deepEqual(files.map((f) => f.path), ['b.toml', 'sub/a.json']);
    const file = await readConfigFile(dir, 'b.toml');
    assert.equal(file.text, 'a = 1\nb = 2\n');
    assert.ok(file.crlf && file.bom);
    await writeConfigFile(dir, 'b.toml', 'a = 3\nb = 2\n', { crlf: file.crlf, bom: file.bom, modifiedAt: file.modifiedAt });
    assert.equal(await fs.readFile(path.join(dir, 'config', 'b.toml'), 'utf8'), '\ufeffa = 3\r\nb = 2\r\n');
    // changed on disk since it was opened: refused unless forced
    await assert.rejects(writeConfigFile(dir, 'b.toml', 'x', { modifiedAt: file.modifiedAt - 60_000 }), new RegExp(CHANGED_ON_DISK));
    await writeConfigFile(dir, 'b.toml', 'x', { modifiedAt: file.modifiedAt - 60_000, force: true });
    assert.equal(await fs.readFile(path.join(dir, 'config', 'b.toml'), 'utf8'), 'x');
    assert.deepEqual((await fs.readdir(path.join(dir, 'config'))).sort(), ['b.toml', 'sub']);
  });

  it('refuses big and binary files', async () => {
    const dir = await tmp();
    await put(path.join(dir, 'config', 'big.json'), Buffer.alloc(2 * 1024 * 1024 + 1, 32));
    await put(path.join(dir, 'config', 'data.dat'), Buffer.from([1, 0, 2]));
    await assert.rejects(readConfigFile(dir, 'big.json'));
    await assert.rejects(readConfigFile(dir, 'data.dat'));
    await assert.rejects(readConfigFile(dir, 'missing.json'));
  });

  it('restores defaults through the trash, or a .bak without one', async () => {
    const dir = await tmp();
    const file = path.join(dir, 'config', 'mod.toml');
    await put(file, 'a = 1');
    const trashed: string[] = [];
    assert.equal(await restoreDefaultConfig(dir, 'mod.toml', async (f) => { trashed.push(f); await fs.rm(f); }), 'trash');
    assert.deepEqual(trashed, [file]);
    await put(file, 'a = 2');
    await put(`${file}.bak`, 'older');
    assert.equal(await restoreDefaultConfig(dir, 'mod.toml', async () => { throw new Error('no trash'); }), 'bak');
    assert.equal(await fs.readFile(`${file}.2.bak`, 'utf8'), 'a = 2');
    assert.equal(await fs.stat(file).catch(() => undefined), undefined);
  });
});

describe('disk cleanup', () => {
  const DAY = 24 * 3_600_000;
  const now = Date.now();
  const old = now - 60 * DAY;

  async function setup() {
    const root = await tmp();
    const layout: DiskLayout = {
      root, versions: path.join(root, 'versions'), libraries: path.join(root, 'libraries'), assets: path.join(root, 'assets'),
      runtimes: path.join(root, 'runtimes'), instances: path.join(root, 'instances'), console: path.join(root, 'console'),
      hudCache: path.join(root, 'hud'), tmp: path.join(root, 'tmp'),
    };
    const version = (id: string, json: object) => put(path.join(layout.versions, id, `${id}.json`), JSON.stringify({ id, ...json }));
    await version('1.21.1', { javaVersion: { component: 'java-runtime-delta' }, libraries: [{ name: 'org.lwjgl:lwjgl:3.3.3', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar' } } }] });
    await version('fabric-loader-0.16.0-1.21.1', { inheritsFrom: '1.21.1', libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.0' }] });
    await version('1.16.5', { libraries: [{ name: 'org.lwjgl:lwjgl:3.2.2', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.2.2/lwjgl-3.2.2.jar' } } }] });
    await put(path.join(layout.versions, '1.16.5', '1.16.5.jar'), 'jar');
    await put(path.join(layout.libraries, 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar'), 'used');
    await put(path.join(layout.libraries, 'net/fabricmc/fabric-loader/0.16.0/fabric-loader-0.16.0.jar'), 'used');
    await put(path.join(layout.libraries, 'org/lwjgl/lwjgl/3.2.2/lwjgl-3.2.2.jar'), 'unused!!');
    await put(path.join(layout.libraries, 'com/old/thing/1.0/thing-1.0.jar'), 'unused');
    await put(path.join(layout.libraries, 'net/minecraftforge/forge/1.0/forge-1.0-client.jar'), 'forge keeps');
    await put(path.join(layout.runtimes, 'java-runtime-delta', 'windows-x64', 'bin', 'java'), 'java');
    await put(path.join(layout.runtimes, 'jre-legacy', 'windows-x64', 'bin', 'java'), 'java8');
    const game = path.join(layout.instances, 'p1');
    await put(path.join(game, 'logs', '2024-01-01-1.log.gz'), 'old log', old);
    await put(path.join(game, 'logs', 'latest.log'), 'latest', old);
    await put(path.join(game, 'logs', 'new.log.gz'), 'new');
    await put(path.join(game, 'crash-reports', 'crash-old.txt'), 'crash', old);
    await put(path.join(layout.console, 'p1', '1.log'), 'console', old);
    await put(path.join(layout.console, 'gone', '1.log'), 'deleted profile');
    await put(path.join(game, 'backups', 'World_2024-01-01-10-00-00.zip'), 'b1', old - DAY);
    await put(path.join(game, 'backups', 'World_2024-01-02-10-00-00.zip'), 'b2', old);
    await put(path.join(game, 'backups', 'Other_2024-01-01-10-00-00.zip'), 'only one', old);
    await put(path.join(layout.hudCache, 'fabric-api', '1.21.1', 'fabric-api.jar'), 'keep');
    await put(path.join(layout.hudCache, 'fabric-api', '1.20.4', 'fabric-api.jar'), 'old');
    await put(path.join(layout.tmp, 'slashclient-forge-1.20.1-47.1.0-installer.jar'), 'installer');
    await put(path.join(layout.tmp, 'unrelated.jar'), 'not ours');
    await put(path.join(layout.instances, 'deleted-profile', 'saves', 'w', 'level.dat'), 'world');
    await put(path.join(layout.assets, 'objects', 'aa', 'aabb'), 'asset');
    const profiles: CleanupProfile[] = [{ id: 'p1', name: 'Fabric', gameDir: game, gameVersion: '1.21.1', javaComponent: 'java-runtime-delta', running: false }];
    return { layout, profiles, game };
  }

  it('offers only what no profile needs', async () => {
    const { layout, profiles, game } = await setup();
    const report = await scanDisk(layout, profiles, 30, now);
    const ids = report.items.map((i) => i.id).sort();
    assert.deepEqual(ids, ['backups:p1', 'cache:fabric-api:1.20.4', 'cache:installer:slashclient-forge-1.20.1-47.1.0-installer.jar', 'libraries', 'logs:deleted', 'logs:p1', 'orphan:deleted-profile', 'runtime:jre-legacy', 'version:1.16.5']);
    const item = (id: string) => report.items.find((i) => i.id === id)!;
    assert.deepEqual(item('libraries').paths.sort(), [path.join(layout.libraries, 'com'), path.join(layout.libraries, 'org', 'lwjgl', 'lwjgl', '3.2.2')].sort());
    assert.equal(item('libraries').bytes, 'unused!!'.length + 'unused'.length);
    assert.deepEqual(item('logs:p1').paths.map((p) => path.basename(p)).sort(), ['1.log', '2024-01-01-1.log.gz', 'crash-old.txt']);
    // the newest backup of each world stays
    assert.deepEqual(item('backups:p1').paths.map((p) => path.basename(p)), ['World_2024-01-01-10-00-00.zip']);
    // a folder that may hold worlds is offered, but not ticked
    assert.equal(item('orphan:deleted-profile').selected, false);
    assert.equal(item('version:1.16.5').selected, true);
    assert.ok(report.categories.find((c) => c.key === 'assets')!.bytes > 0);
    assert.equal(report.notes.length, 0);
    // a running game's logs are left alone
    const whilePlaying = await scanDisk(layout, [{ ...profiles[0], running: true }], 30, now);
    assert.ok(!whilePlaying.items.some((i) => i.id === 'logs:p1'));
    assert.ok(game);
  });

  it('keeps versions, libraries and Java when a profile\'s version is unknown', async () => {
    const { layout, profiles } = await setup();
    const report = await scanDisk(layout, [...profiles, { id: 'p2', name: 'Latest', gameDir: path.join(layout.instances, 'p2'), running: false }], 30, now);
    assert.ok(!report.items.some((i) => ['versions', 'libraries', 'runtimes', 'caches'].includes(i.group)));
    assert.ok(report.items.some((i) => i.group === 'logs'));
    assert.ok(report.notes.length > 0);
  });

  it('a profile on an old version keeps it', async () => {
    const { layout, profiles } = await setup();
    const report = await scanDisk(layout, [...profiles, { id: 'p2', name: 'Old', gameDir: path.join(layout.instances, 'p2'), gameVersion: '1.16.5', javaComponent: 'jre-legacy', running: false }], 30, now);
    const ids = report.items.map((i) => i.id);
    assert.ok(!ids.includes('version:1.16.5'));
    assert.ok(!ids.includes('runtime:jre-legacy'));
    assert.deepEqual(report.items.find((i) => i.id === 'libraries')!.paths, [path.join(layout.libraries, 'com')]);
  });

  it('removes to the trash, never outside the allowed folders', async () => {
    const { layout, profiles } = await setup();
    const report = await scanDisk(layout, profiles, 30, now);
    const version = report.items.find((i) => i.id === 'version:1.16.5')!;
    const outside = await tmp();
    const sneaky = { ...version, id: 'x', paths: [outside] };
    const trashed: string[] = [];
    const res = await removeItems([version, sneaky], [layout.root], async (p) => {
      trashed.push(p);
      await fs.rm(p, { recursive: true });
    });
    assert.deepEqual(trashed, [path.join(layout.versions, '1.16.5')]);
    assert.deepEqual(res.failed, [outside]);
    assert.equal(res.bytes, version.bytes);
    assert.ok(await fs.stat(outside));
  });
});
