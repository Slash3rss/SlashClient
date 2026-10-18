import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const hud = path.join(__dirname, '..', 'hud', 'src', 'main');
const icons = path.join(hud, 'resources', 'assets', 'slashclient-hud', 'textures', 'icon');

function javaSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? javaSources(path.join(dir, e.name)) : e.name.endsWith('.java') ? [path.join(dir, e.name)] : []);
}

describe('HUD icons', () => {
  it('has a texture for every module and every icon named in the code', () => {
    const code = javaSources(path.join(hud, 'java')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    // every module's card shows m-<id>
    const modules = [...code.matchAll(/String id\(\)\s*\{\s*return "([A-Za-z]+)";/g)].map((m) => 'm-' + m[1].toLowerCase());
    const named = [...code.matchAll(/"(m-[a-z]+)"/g)].map((m) => m[1]);
    assert.ok(modules.length > 30, 'modules found');
    const missing = [...new Set([...modules, ...named])].filter((n) => !fs.existsSync(path.join(icons, n + '.png')));
    assert.deepEqual(missing, []);
  });

  it('has a name in every language for every module, the game parts too', () => {
    const code = javaSources(path.join(hud, 'java')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const ids = [
      ...[...code.matchAll(/String id\(\)\s*\{\s*return "([A-Za-z]+)";/g)].map((m) => m[1]),
      ...[...code.matchAll(/new Part\("([A-Za-z]+)"/g)].map((m) => m[1]),
    ];
    assert.ok(ids.includes('scoreboard') && ids.includes('fps'), 'modules found');
    for (const lang of ['pl_pl', 'en_us']) {
      const names = JSON.parse(fs.readFileSync(path.join(hud, 'resources', 'assets', 'slashclient-hud', 'lang', `${lang}.json`), 'utf8'));
      const missing = [...new Set(ids)].filter((id) => !names[`slashclient-hud.module.${id}`]);
      assert.deepEqual(missing, [], lang);
    }
  });
});
