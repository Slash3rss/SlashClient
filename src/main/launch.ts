import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogParser } from './gamelog';
import { installLoader } from './loaders';
import { installVersion, libraryClasspath, type StageFn } from './install';
import { ensureJava } from './java';
import { paths } from './paths';
import { classpathSeparator, osName } from './platform';
import { rulesAllow, type Features } from './rules';
import { profileGameDir, type Account, type Profile } from './store';
import { resolveAddress } from './servers';
import { getManifest, type Argument } from './versions';

export const LAUNCHER_NAME = 'SlashClient';
export const LAUNCHER_VERSION = '0.1.0';

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
}

export async function launch({ profile, account, onStage, onLog, server, world }: LaunchOptions): Promise<ChildProcess> {
  const gameVersion = await resolveVersionId(profile.versionId);
  const gameDir = profileGameDir(profile);
  await fs.mkdir(gameDir, { recursive: true });
  if (profile.loader !== 'vanilla') {
    onStage(`Instalowanie ${profile.loader === 'fabric' ? 'Fabric' : 'Quilt'}`, 0, 1);
    await fs.mkdir(path.join(gameDir, 'mods'), { recursive: true });
  }
  const versionId = await installLoader(profile.loader, gameVersion, profile.loaderVersion);

  const { version, clientJar, assetsDir, loggingConfig } = await installVersion(versionId, gameDir, onStage);
  const java = profile.javaPath || (await ensureJava(version, (d, t, s) => onStage('Java', d, t, s)));

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
    ...splitArgs(profile.jvmArgs),
    ...jvmArgs.map((a) => substitute(a, vars)),
    ...(loggingConfig && version.logging?.client ? [substitute(version.logging.client.argument, { path: loggingConfig })] : []),
    version.mainClass,
    ...gameArgs.map((a) => substitute(a, vars)),
  ];

  onStage('Uruchamianie gry', 1, 1);
  onLog(`> ${java} (wersja ${versionId}, ${profile.memoryMb} MB RAM${server ? `, serwer ${server}` : ''})`);
  const child = spawn(java, args, { cwd: gameDir, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.setEncoding('utf8').on('data', createLogParser(onLog));
  child.stderr?.setEncoding('utf8').on('data', createLogParser(onLog));
  return child;
}

