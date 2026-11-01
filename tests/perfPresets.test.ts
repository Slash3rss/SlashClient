import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applyPerfPreset, piSodiumChecks, withOptions } from '../src/main/perfPreset';
import { lookup, setLang } from '../src/shared/i18n';
import { partOn, presetEnv, presetMemoryCap, presetNiceness, presetOptions, suggestedPreset } from '../src/shared/perfPresets';

describe('presets for slower computers', () => {
  it('suggests the Pi\'s on a Raspberry Pi, a lighter one on other ARM boards and for little memory or few cores, none for a strong computer', () => {
    assert.equal(suggestedPreset(4096, 4, 'linux', 'arm64', 'Raspberry Pi 5 Model B Rev 1.1'), 'pi');
    assert.equal(suggestedPreset(8192, 4, 'linux', 'arm64', 'Raspberry Pi 4 Model B Rev 1.4'), 'pi');
    // RK3588 boards draw with their own Vulkan: no forced OpenGL there
    assert.equal(suggestedPreset(16384, 8, 'linux', 'arm64', 'Radxa ROCK 5B+'), 'lighter');
    assert.equal(suggestedPreset(16384, 8, 'linux', 'arm64', 'Xunlong Orange Pi 5 Plus'), 'lighter');
    assert.equal(suggestedPreset(16384, 8, 'linux', 'arm64'), 'lighter');
    assert.equal(suggestedPreset(4096, 4, 'win32', 'x64'), 'lighter');
    assert.equal(suggestedPreset(8192, 8, 'win32', 'x64'), 'light');
    assert.equal(suggestedPreset(16384, 4, 'win32', 'x64'), 'light');
    assert.equal(suggestedPreset(32768, 16, 'darwin', 'arm64'), 'off');
  });

  it('switches each part off on its own; the graphics driver fix only with the Pi\'s preset, on Linux', () => {
    assert.equal(partOn('lighter', [], 'graphics'), true);
    assert.equal(partOn('lighter', ['graphics'], 'graphics'), false);
    assert.equal(partOn('off', [], 'memory'), false);
    assert.equal(partOn('lighter', [], 'gl'), false);
    assert.equal(partOn('pi', [], 'gl'), true);
    // the Pi's 30 FPS: on by default, 60 with it switched off; no such part for the other presets
    assert.equal(partOn('pi', [], 'fps30'), true);
    assert.equal(partOn('lighter', [], 'fps30'), false);
    assert.equal(presetOptions('pi').maxFps, '30');
    assert.equal(presetOptions('pi', ['fps30']).maxFps, '60');
    assert.equal(presetOptions('lighter', ['fps30']).maxFps, '60');
    assert.equal(presetOptions('light', ['fps30']).maxFps, undefined);
    assert.deepEqual(presetEnv('pi', [], 'linux'), { MESA_GL_VERSION_OVERRIDE: '3.3', MESA_GLSL_VERSION_OVERRIDE: '330' });
    assert.deepEqual(presetEnv('pi', ['gl'], 'linux'), {});
    assert.deepEqual(presetEnv('pi', [], 'win32'), {});
    // on a Wayland desktop the game's window opens on Wayland itself (through XWayland the Pi has no OpenGL)
    assert.equal(presetEnv('pi', [], 'linux', true).SDL_VIDEO_DRIVER, 'wayland');
    assert.equal(presetEnv('pi', [], 'linux', false).SDL_VIDEO_DRIVER, undefined);
  });

  it('starts the game with a lower priority with the Pi preset on Linux only', () => {
    assert.equal(presetNiceness('pi', 'linux'), 10);
    assert.equal(presetNiceness('pi', 'win32'), undefined);
    assert.equal(presetNiceness('lighter', 'linux'), undefined);
    assert.equal(presetNiceness(undefined, 'linux'), undefined);
  });

  it('gives the game less memory on a small computer, as the profile says otherwise', () => {
    assert.equal(presetMemoryCap('pi', 4096), 1536);
    assert.equal(presetMemoryCap('pi', 8192), 2048);
    assert.equal(presetMemoryCap('lighter', 8192), 2048);
    assert.equal(presetMemoryCap('light', 8192), undefined);
  });

  it('sets options.txt keys in place, adds new ones at the end and takes others out', () => {
    assert.equal(withOptions('version:4000\nrenderDistance:12\nfov:0.5\n', { renderDistance: '6', maxFps: '60' }), 'version:4000\nrenderDistance:6\nfov:0.5\nmaxFps:60\n');
    assert.equal(withOptions('a:1\nmaxFps:60\n', {}, ['maxFps']), 'a:1\n');
  });

  it('writes the preset once, keeps what the player changes after, and puts their own settings back when it is off', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-preset-'));
    const options = path.join(dir, 'options.txt');
    await fs.writeFile(options, 'version:4000\nrenderDistance:16\nparticles:0\nfov:0.5\n');
    assert.equal(await applyPerfPreset(dir, 'lighter', []), true);
    let text = await fs.readFile(options, 'utf8');
    assert.match(text, /^renderDistance:6$/m);
    assert.match(text, /^maxFps:60$/m);
    assert.match(text, /^fov:0\.5$/m);
    // the player turns the view up in the game: the same preset at the next launch leaves it
    await fs.writeFile(options, text.replace('renderDistance:6', 'renderDistance:8'));
    assert.equal(await applyPerfPreset(dir, 'lighter', []), false);
    assert.match(await fs.readFile(options, 'utf8'), /^renderDistance:8$/m);
    // off: the player's own settings back, the settings the preset added gone
    assert.equal(await applyPerfPreset(dir, 'off', []), true);
    text = await fs.readFile(options, 'utf8');
    assert.match(text, /^renderDistance:16$/m);
    assert.match(text, /^particles:0$/m);
    assert.doesNotMatch(text, /maxFps/);
    // the graphics part switched off is the same as no preset for the game's settings
    assert.equal(await applyPerfPreset(dir, 'pi', ['graphics']), false);
    assert.equal(presetOptions('pi').enableVsync, 'true');
    // OpenGL on the Pi: its driver's Vulkan lacks what the game needs
    assert.equal(presetOptions('pi').preferredGraphicsBackend, '"opengl"');
    // 26.x's own graphics preset would set the view distance back at start
    assert.equal(presetOptions('light').graphicsPreset, '"custom"');
    assert.deepEqual(presetOptions('off'), {});
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("the Raspberry Pi's frame limit", () => {
  it('writes 30 FPS, 60 once its limit is switched off, and 30 again when it is back on', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-fps-'));
    const options = path.join(dir, 'options.txt');
    await fs.writeFile(options, 'maxFps:120\nrenderDistance:12\n');
    assert.equal(await applyPerfPreset(dir, 'pi', []), true);
    assert.match(await fs.readFile(options, 'utf8'), /^maxFps:30$/m);
    assert.equal(await applyPerfPreset(dir, 'pi', []), false);
    assert.equal(await applyPerfPreset(dir, 'pi', ['fps30']), true);
    assert.match(await fs.readFile(options, 'utf8'), /^maxFps:60$/m);
    assert.equal(await applyPerfPreset(dir, 'pi', ['fps30']), false);
    assert.equal(await applyPerfPreset(dir, 'pi', []), true);
    assert.match(await fs.readFile(options, 'utf8'), /^maxFps:30$/m);
    // off: the player's own limit back
    assert.equal(await applyPerfPreset(dir, 'off', []), true);
    assert.match(await fs.readFile(options, 'utf8'), /^maxFps:120$/m);
    // a preset written by an older launcher (no limit noted) counts as its own 30
    await applyPerfPreset(dir, 'pi', []);
    const state = path.join(dir, '.slashclient', 'perf-preset.json');
    const old = JSON.parse(await fs.readFile(state, 'utf8'));
    delete old.maxFps;
    await fs.writeFile(state, JSON.stringify(old));
    assert.equal(await applyPerfPreset(dir, 'pi', []), false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("Sodium on the Raspberry Pi", () => {
  it('keeps the driver error checks on with the Pi graphics fix, the rest of Sodium settings as they were', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-sodium-'));
    const file = path.join(dir, 'config', 'sodium-options.json');
    // no file yet (Sodium not started once): only our setting, Sodium fills in its defaults
    assert.equal(await piSodiumChecks(dir, 'pi', []), true);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { performance: { use_no_error_g_l_context: false } });
    // the player's own settings stay
    await fs.writeFile(file, JSON.stringify({ quality: { pixel_filtering_mode: 'NEAREST' }, performance: { chunk_builder_threads: 2, use_no_error_g_l_context: true } }));
    assert.equal(await piSodiumChecks(dir, 'pi', []), true);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { quality: { pixel_filtering_mode: 'NEAREST' }, performance: { chunk_builder_threads: 2, use_no_error_g_l_context: false } });
    assert.equal(await piSodiumChecks(dir, 'pi', []), false);
    // not with another preset or with the graphics fix switched off
    await fs.writeFile(file, '{"performance":{"use_no_error_g_l_context":true}}');
    assert.equal(await piSodiumChecks(dir, 'lighter', []), false);
    assert.equal(await piSodiumChecks(dir, 'pi', ['gl']), false);
    assert.equal(await piSodiumChecks(dir, undefined, []), false);
    // a broken file: Sodium starts it over from its defaults anyway
    await fs.writeFile(file, '{oops');
    assert.equal(await piSodiumChecks(dir, 'pi', []), true);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { performance: { use_no_error_g_l_context: false } });
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('Raspberry Pi notes in English', () => {
  it('every text of the notes and their window has a translation', () => {
    const keys = new Set<string>();
    for (const m of readFileSync('src/renderer/piNotes.ts', 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    assert.ok(readFileSync('src/renderer/index.html', 'utf8').includes('Raspberry Pi – co warto wiedzieć'));
    keys.add('Raspberry Pi – co warto wiedzieć');
    for (const k of ['Limit 30 FPS', 'odznaczony: 60 FPS – płynniej (Pi 5 na serwerze ok. 45–50 FPS), ale procesor pracuje więcej i Pi mocniej się grzeje']) {
      assert.ok(readFileSync('src/renderer/index.html', 'utf8').includes(k), k);
      keys.add(k);
    }
    setLang('en');
    const missing = [...keys].filter((k) => !lookup(k));
    setLang('pl');
    assert.equal(keys.size, 29);
    assert.deepEqual(missing, []);
  });
});
