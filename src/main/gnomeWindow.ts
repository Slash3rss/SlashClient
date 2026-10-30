import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The game's window on GNOME (Wayland). Minecraft 26.x opens it with SDL, on Wayland, and GNOME draws
 * no title bar for Wayland windows: the window's own comes from libdecor's plugins. Its GTK plugin
 * draws nothing in the game, so the minimise, maximise and close buttons were missing; through XWayland
 * (0.9.63) they were there, but the camera snapped back with every turn of the mouse. Now the window
 * stays on Wayland and libdecor gets only its Cairo plugin (a folder of the launcher's own with a link to
 * the system's); without that plugin installed the player is told the one command that adds it.
 */

/** Where distributions keep libdecor's plugins (Debian and Ubuntu by architecture, Fedora, Arch). */
export const PLUGIN_DIRS = [
  '/usr/lib/x86_64-linux-gnu/libdecor/plugins-1',
  '/usr/lib/aarch64-linux-gnu/libdecor/plugins-1',
  '/usr/lib64/libdecor/plugins-1',
  '/usr/lib/libdecor/plugins-1',
];
const CAIRO = 'libdecor-cairo.so';

/** A GNOME desktop on Wayland (the game's window opens on Wayland there). */
export function isGnomeWayland(env: NodeJS.ProcessEnv, platform: string): boolean {
  return platform === 'linux' && !!env.WAYLAND_DISPLAY && /gnome/i.test(env.XDG_CURRENT_DESKTOP ?? '');
}

/** The system's Cairo plugin, or undefined when it is not installed. */
export async function findCairoPlugin(dirs = PLUGIN_DIRS): Promise<string | undefined> {
  for (const dir of dirs) {
    const file = path.join(dir, CAIRO);
    if (await fs.stat(file).then((s) => s.isFile(), () => false)) return file;
  }
  return undefined;
}

/**
 * The environment for the game's window on GNOME: libdecor pointed at a folder with only the Cairo
 * plugin (`ownDir`, made here), or nothing when the plugin is missing (`missing`: tell the player).
 * The player's own LIBDECOR_PLUGIN_DIR is left alone.
 */
export async function gnomeWindowEnv(env: NodeJS.ProcessEnv, platform: string, ownDir: string, dirs = PLUGIN_DIRS): Promise<{ env: Record<string, string>; missing: boolean }> {
  if (!isGnomeWayland(env, platform) || env.LIBDECOR_PLUGIN_DIR) return { env: {}, missing: false };
  const plugin = await findCairoPlugin(dirs);
  if (!plugin) return { env: {}, missing: true };
  try {
    await fs.mkdir(ownDir, { recursive: true });
    const link = path.join(ownDir, CAIRO);
    const now = await fs.readlink(link).catch(() => undefined);
    if (now !== plugin) {
      await fs.rm(link, { force: true });
      await fs.symlink(plugin, link);
    }
    return { env: { LIBDECOR_PLUGIN_DIR: ownDir }, missing: false };
  } catch {
    return { env: {}, missing: false };
  }
}

/** The command that installs the plugin, for the player's distribution (by its package manager's files). */
export async function installCommand(exists = (p: string) => fs.stat(p).then(() => true, () => false)): Promise<string> {
  if (await exists('/usr/bin/apt')) return 'sudo apt install libdecor-0-plugin-1-cairo';
  if (await exists('/usr/bin/dnf')) return 'sudo dnf install libdecor';
  if (await exists('/usr/bin/pacman')) return 'sudo pacman -S libdecor';
  return 'libdecor-0-plugin-1-cairo';
}
