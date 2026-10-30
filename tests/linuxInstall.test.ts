import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DESKTOP_NAME, desktopEntry, install, installState, linuxPlaces } from '../src/main/linuxInstall';

describe('installing the Linux AppImage', () => {
  it('writes a menu entry that starts the AppImage, quoting a path with spaces', () => {
    assert.match(desktopEntry('/home/a/Applications/SlashClient.AppImage', 'x'), /^Exec=\/home\/a\/Applications\/SlashClient\.AppImage %U$/m);
    assert.match(desktopEntry('/home/a b/Applications/SlashClient.AppImage', 'x'), /^Exec="\/home\/a b\/Applications\/SlashClient\.AppImage" %U$/m);
    assert.match(desktopEntry('/x', 'x'), /^Icon=slashclient$/m);
  });

  it('moves the AppImage from Downloads to Applications with its entry and icons, and then says it is installed', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'linux-install-'));
    const places = linuxPlaces(home, {});
    const downloaded = path.join(home, 'Downloads', 'SlashClient-0.9.64-arm64.AppImage');
    await fs.mkdir(path.dirname(downloaded), { recursive: true });
    await fs.writeFile(downloaded, 'appimage');
    const icons = path.join(home, 'mount', 'usr', 'share', 'icons', 'hicolor');
    await fs.mkdir(path.join(icons, '256x256', 'apps'), { recursive: true });
    await fs.writeFile(path.join(icons, '256x256', 'apps', 'slashclient.png'), 'png');

    assert.equal(await installState(downloaded, places), 'not-installed');
    assert.equal(await installState(undefined, places), undefined);
    const target = await install(downloaded, places, icons, 'SlashClient');
    assert.equal(target, path.join(home, 'Applications', 'SlashClient.AppImage'));
    assert.equal(await fs.readFile(target, 'utf8'), 'appimage');
    await assert.rejects(fs.stat(downloaded));
    assert.match(await fs.readFile(path.join(places.entries, DESKTOP_NAME), 'utf8'), /^Exec=.*SlashClient\.AppImage.* %U$/m);
    assert.equal(await fs.readFile(path.join(places.icons, '256x256', 'apps', 'slashclient.png'), 'utf8'), 'png');
    assert.equal(await installState(target, places), 'installed');

    // a newer download installed over it replaces the old one
    await fs.writeFile(downloaded, 'newer');
    await install(downloaded, places, undefined, 'SlashClient');
    assert.equal(await fs.readFile(target, 'utf8'), 'newer');
    await fs.rm(home, { recursive: true, force: true });
  });
});
