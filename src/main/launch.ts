import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '../shared/version';
import { createLogParser } from './gamelog';
import { installLoader, LOADER_NAMES } from './loaders';
import { presetArgs } from './jvm';
import { installVersion, libraryClasspath, type StageFn } from './install';
import { resolveJava, type JavaChoice } from './javaVendors';
import { paths } from './paths';
import { classpathSeparator, osName } from './platform';
import { rulesAllow, type Features } from './rules';
import { profileGameDir, type Account, type Profile } from './store';
import { resolveAddress } from './servers';
import { getManifest, type Argument } from './versions';
import { t } from '../shared/i18n';
import type { JavaVendor } from '../shared/javaVendors';

export const LAUNCHER_NAME = 'SlashClient';
export const LAUNCHER_VERSION = APP_VERSION;

/** Turns the "latest-release" / "latest-snapshot" aliases into a real version id. */
export async function resolveVersionId(id: string): Promise<string> {
  if (id !== 'latest-release' && id !== 'latest-snapshot') return id;
  const { latest } = await getManifest();
  return id === 'latest-release' ? latest.release : latest.snapshot;
}

function expandArgs(args: Argument[], features: Features): string[] {
  const out: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') out.push(arg);
    else if (rulesAllow(arg.rules, features)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]));
  }
  return out;
}

function substitute(arg: string, vars: Record<string, string>): string {
  return arg.replace(/\$\{([^}]+)\}/g, (match, key: string) => vars[key] ?? match);
}

/**
 * Forge and NeoForge (1.17+) leave the vanilla game jar out by name: `-DignoreList=…,${version_name}.jar`.
 * The official launcher copies that jar under the loader version's name; this launcher keeps the one
 * shared jar (versions/1.20.1/1.20.1.jar), so its own name is added too. Without it the game loads
 * Minecraft twice ("Modules minecraft and _1._20._1 export package net.minecraft.data").
 */
export function withClientJarIgnored(arg: string, clientJar: string): string {
  if (!arg.startsWith('-DignoreList=')) return arg;
  const jar = clientJar.split(/[\\/]/).pop() ?? '';
  const list = arg.slice('-DignoreList='.length).split(',');
  return !jar || list.includes(jar) ? arg : `${arg},${jar}`;
}

/** Splits user-supplied JVM arguments, honouring double quotes. */
function splitArgs(text: string): string[] {
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

export interface LaunchOptions {
  profile: Profile;
  account: Account;
  onStage: StageFn;
  onLog: (line: string) => void;
  /** "host" or "host:port" to join right after the game starts. */
  server?: string;
  /** Folder name in saves/ to open right after the game starts (1.20+). */
  world?: string;
  /** More JVM arguments from the launcher itself (e.g. -Dfabric.addMods for SlashClient HUD). */
  extraJvmArgs?: string[];
  /** More environment variables for the game (e.g. PRIME offload for the dedicated GPU on Linux). */
  extraEnv?: Record<string, string>;
  /** Runs with the Java path right before the game starts (e.g. the Windows GPU preference for it). */
  prepareJava?: (java: string) => Promise<unknown>;
  /** Whose Java to play on when the profile has no Java path of its own; missing = Mojang's. */
  javaVendor?: JavaVendor;
  /** Something the player should know, e.g. that the chosen Java was not available and Mojang's is used. */
  onNotice?: (message: string) => void;
  /** The Java the game starts with, once it is known. */
  onJava?: (choice: JavaChoice) => void;
}

export async function launch({ profile, account, onStage, onLog, server, world, extraJvmArgs = [], extraEnv, prepareJava, javaVendor = 'mojang', onNotice, onJava }: LaunchOptions): Promise<ChildProcess> {
  const gameVersion = await resolveVersionId(profile.versionId);
  const gameDir = profileGameDir(profile);
  await fs.mkdir(gameDir, { recursive: true });
  if (profile.loader !== 'vanilla') {
    onStage(t('Przygotowanie {0}', LOADER_NAMES[profile.loader]), 0, 1);
    await fs.mkdir(path.join(gameDir, 'mods'), { recursive: true });
  }
  const versionId = await installLoader(profile.loader, gameVersion, profile.loaderVersion, { gameDir, onStage, onLog });

  const { version, clientJar, assetsDir, loggingConfig } = await installVersion(versionId, gameDir, onStage);
  const choice: JavaChoice = profile.javaPath ? { java: profile.javaPath, vendor: 'mojang' } : await resolveJava(javaVendor, version, (d, t, s) => onStage('Java', d, t, s), (message) => {
    onLog(`> ${message}`);
    onNotice?.(message);
  });
  const java = choice.java;
  onJava?.(choice);

  const classpath = [...libraryClasspath(version), clientJar].join(classpathSeparator);
  // 1.20+ joins a server through Quick Play; older versions take --server/--port.
  const quickPlay = JSON.stringify(version.arguments?.game ?? []).includes('is_quick_play_multiplayer');
  const features: Features = {
    has_custom_resolution: true,
    is_quick_play_multiplayer: Boolean(server && quickPlay),
    is_quick_play_singleplayer: Boolean(world && quickPlay && !server),
  };
  const vars: Record<string, string> = {
    auth_player_name: account.name,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: paths.assets,
    game_assets: assetsDir,
    assets_index_name: version.assetIndex.id,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.type === 'msa' ? account.accessToken : randomBytes(16).toString('hex'),
    auth_session: account.type === 'msa' ? `token:${account.accessToken}:${account.uuid.replace(/-/g, '')}` : '-',
    auth_xuid: account.type === 'msa' ? account.xuid : '0',
    clientid: '',
    user_type: account.type === 'msa' ? 'msa' : 'legacy',
    user_properties: '{}',
    version_type: version.type,
    resolution_width: String(profile.width),
    resolution_height: String(profile.height),
    natives_directory: paths.natives(version.id),
    library_directory: paths.libraries,
    classpath_separator: classpathSeparator,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    quickPlayMultiplayer: server ?? '',
    quickPlaySingleplayer: world ?? '',
    classpath,
  };

  let jvmArgs: string[];
  let gameArgs: string[];
  if (version.arguments?.jvm?.length) {
    jvmArgs = expandArgs(version.arguments.jvm, features);
    gameArgs = expandArgs(version.arguments.game ?? [], features);
  } else {
    // Pre-1.13 versions only describe game arguments; JVM arguments are implied.
    jvmArgs = [
      ...(osName === 'osx' ? ['-XstartOnFirstThread'] : []),
      '-Djava.library.path=${natives_directory}',
      '-cp',
      '${classpath}',
    ];
    gameArgs = [...(version.minecraftArguments ?? '').split(' ').filter(Boolean), '--width', '${resolution_width}', '--height', '${resolution_height}'];
  }

  if (server && !quickPlay) {
    // old clients don't follow SRV records, so resolve the real host and port here
    const { host, port } = await resolveAddress(server);
    gameArgs.push('--server', host, '--port', String(port));
  }

  const args = [
    `-Xmx${profile.memoryMb}M`,
    ...(osName === 'osx' ? [`-Xdock:name=Minecraft ${versionId}`] : []),
    ...presetArgs(profile.jvmPreset, version.javaVersion?.majorVersion ?? 8),
    ...splitArgs(profile.jvmArgs),
    ...extraJvmArgs,
    ...jvmArgs.map((a) => withClientJarIgnored(substitute(a, vars), clientJar)),
    ...(loggingConfig && version.logging?.client ? [substitute(version.logging.client.argument, { path: loggingConfig })] : []),
    version.mainClass,
    ...gameArgs.map((a) => substitute(a, vars)),
  ];

  onStage(t('Uruchamianie gry'), 1, 1);
  onLog(`> ${java} (wersja ${versionId}, ${profile.memoryMb} MB RAM${server ? `, serwer ${server}` : ''})`);
  // a failed preparation (e.g. the registry) never stops the game
  await prepareJava?.(java).catch((err) => onLog(`> ${String((err as Error)?.message ?? err)}`));
  const env = extraEnv && Object.keys(extraEnv).length ? { ...process.env, ...extraEnv } : undefined;
  // on Windows a child of the launcher is closed together with it (Node puts it in a job that ends
  // with the launcher): the game is started on its own, so quitting the launcher (to update it, say)
  // never takes a running game down with it; without a console window of its own
  const child = spawn(java, args, { cwd: gameDir, stdio: ['ignore', 'pipe', 'pipe'], env, detached: process.platform === 'win32', windowsHide: true });
  child.stdout?.setEncoding('utf8').on('data', createLogParser(onLog));
  child.stderr?.setEncoding('utf8').on('data', createLogParser(onLog));
  return child;
}

