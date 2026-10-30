import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applyPerfPreset, withOptions } from '../src/main/perfPreset';
import { partOn, presetEnv, presetMemoryCap, presetOptions, suggestedPreset } from '../src/shared/perfPresets';

describe('presets for slower computers', () => {
  it('suggests the Pi\'s on Linux on ARM, a lighter one for little memory or few cores, none for a strong computer', () => {
    assert.equal(suggestedPreset(4096, 4, 'linux', 'arm64'), 'pi');
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
    assert.deepEqual(presetEnv('pi', [], 'linux'), { MESA_GL_VERSION_OVERRIDE: '3.3', MESA_GLSL_VERSION_OVERRIDE: '330' });
    assert.deepEqual(presetEnv('pi', ['gl'], 'linux'), {});
    assert.deepEqual(presetEnv('pi', [], 'win32'), {});
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
    assert.equal(Object.keys(presetOptions('pi')).includes('enableVsync'), true);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
