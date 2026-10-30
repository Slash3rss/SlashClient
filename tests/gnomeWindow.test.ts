import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { gnomeWindowEnv, installCommand, isGnomeWayland } from '../src/main/gnomeWindow';

const gnome = { WAYLAND_DISPLAY: 'wayland-0', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };

describe('the game window on GNOME', () => {
  it('is about GNOME on Wayland only', () => {
    assert.equal(isGnomeWayland(gnome, 'linux'), true);
    assert.equal(isGnomeWayland({ ...gnome, XDG_CURRENT_DESKTOP: 'KDE' }, 'linux'), false);
    assert.equal(isGnomeWayland({ XDG_CURRENT_DESKTOP: 'GNOME' }, 'linux'), false);
    assert.equal(isGnomeWayland(gnome, 'win32'), false);
  });

  it('points libdecor at its Cairo plugin alone, or says it is missing', { skip: process.platform === 'win32' && 'symlinks need rights on Windows' }, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gnome-window-'));
    const system = path.join(dir, 'system');
    await fs.mkdir(system);
    const own = path.join(dir, 'own');
    assert.deepEqual(await gnomeWindowEnv(gnome, 'linux', own, [system]), { env: {}, missing: true });
    await fs.writeFile(path.join(system, 'libdecor-cairo.so'), '');
    await fs.writeFile(path.join(system, 'libdecor-gtk.so'), '');
    const found = await gnomeWindowEnv(gnome, 'linux', own, [system]);
    assert.deepEqual(found, { env: { LIBDECOR_PLUGIN_DIR: own }, missing: false });
    assert.deepEqual(await fs.readdir(own), ['libdecor-cairo.so']);
    // the player's own plugin folder wins, and other desktops are left alone
    assert.deepEqual(await gnomeWindowEnv({ ...gnome, LIBDECOR_PLUGIN_DIR: '/x' }, 'linux', own, [system]), { env: {}, missing: false });
    assert.deepEqual(await gnomeWindowEnv({ ...gnome, XDG_CURRENT_DESKTOP: 'KDE' }, 'linux', own, [system]), { env: {}, missing: false });
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('says the install command for the distribution', async () => {
    assert.equal(await installCommand(async (p) => p === '/usr/bin/apt'), 'sudo apt install libdecor-0-plugin-1-cairo');
    assert.equal(await installCommand(async (p) => p === '/usr/bin/dnf'), 'sudo dnf install libdecor');
    assert.equal(await installCommand(async () => false), 'libdecor-0-plugin-1-cairo');
  });
});
