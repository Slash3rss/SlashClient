import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Linux: SlashClient comes as one AppImage file, mostly started from Downloads, with no menu entry.
 * As the Mac's "move to Applications", it offers to install itself: the file goes to ~/Applications
 * (where it keeps updating itself, as an AppImage replaces its own file), with an entry in the
 * system's menu of applications and its icons, and the launcher starts again from there.
 */

export const DESKTOP_NAME = 'slashclient.desktop';

export interface LinuxPlaces {
  /** ~/Applications: where the AppImage goes. */
  apps: string;
  /** ~/.local/share/applications: the menu's entries. */
  entries: string;
  /** ~/.local/share/icons/hicolor: the icons, by size. */
  icons: string;
}

export function linuxPlaces(home = os.homedir(), env: NodeJS.ProcessEnv = process.env): LinuxPlaces {
  const data = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return { apps: path.join(home, 'Applications'), entries: path.join(data, 'applications'), icons: path.join(data, 'icons', 'hicolor') };
}

/** The menu entry starting this AppImage (a path with spaces quoted, as the desktop entry spec wants). */
export function desktopEntry(appImage: string, comment: string): string {
  const exec = /[\s"'\\$`]/.test(appImage) ? `"${appImage.replace(/(["\\$`])/g, '\\$1')}"` : appImage;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=SlashClient',
    `Comment=${comment}`,
    `Exec=${exec} %U`,
    'Icon=slashclient',
    'Terminal=false',
    'StartupWMClass=SlashClient',
    'Categories=Game;',
    '',
  ].join('\n');
}

/**
 * Whether SlashClient is installed as it would install itself: the running AppImage in ~/Applications
 * with a menu entry that starts it. Undefined when it does not run from an AppImage (a package, a dev run).
 */
export async function installState(appImage: string | undefined, places: LinuxPlaces): Promise<'installed' | 'not-installed' | undefined> {
  if (!appImage) return undefined;
  const inApps = path.dirname(path.resolve(appImage)) === path.resolve(places.apps);
  const entry = await fs.readFile(path.join(places.entries, DESKTOP_NAME), 'utf8').catch(() => '');
  // the entry's Exec line as install() writes it for this file (quoted when the path needs it)
  const exec = desktopEntry(appImage, '').split('\n').find((l) => l.startsWith('Exec='))!;
  return inApps && entry.split('\n').includes(exec) ? 'installed' : 'not-installed';
}

/**
 * Installs the running AppImage: moved to ~/Applications/SlashClient.AppImage (an older one there is
 * replaced; across disks it is copied), the menu entry written and the icons copied from the AppImage's
 * own (`iconsFrom`, its usr/share/icons/hicolor). Returns the AppImage's new path.
 */
export async function install(appImage: string, places: LinuxPlaces, iconsFrom: string | undefined, comment: string): Promise<string> {
  await fs.mkdir(places.apps, { recursive: true });
  const target = path.join(places.apps, 'SlashClient.AppImage');
  if (path.resolve(appImage) !== path.resolve(target)) {
    await fs.rm(target, { force: true });
    await fs.rename(appImage, target).catch(async (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EXDEV') throw err;
      await fs.copyFile(appImage, target);
      await fs.rm(appImage, { force: true });
    });
  }
  await fs.chmod(target, 0o755);
  if (iconsFrom) {
    for (const size of await fs.readdir(iconsFrom).catch(() => [] as string[])) {
      const from = path.join(iconsFrom, size, 'apps', 'slashclient.png');
      if (!(await fs.stat(from).then((s) => s.isFile(), () => false))) continue;
      await fs.mkdir(path.join(places.icons, size, 'apps'), { recursive: true });
      await fs.copyFile(from, path.join(places.icons, size, 'apps', 'slashclient.png'));
    }
  }
  await fs.mkdir(places.entries, { recursive: true });
  await fs.writeFile(path.join(places.entries, DESKTOP_NAME), desktopEntry(target, comment), { mode: 0o755 });
  return target;
}
