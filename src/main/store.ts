import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths';

export interface OfflineAccount {
  id: string;
  type: 'offline';
  name: string;
  uuid: string;
}

export interface MicrosoftAccount {
  id: string;
  type: 'msa';
  name: string;
  uuid: string;
  xuid: string;
  accessToken: string;
  /** Epoch ms after which the Minecraft access token must be refreshed. */
  expiresAt: number;
  /** Microsoft refresh token, encrypted with the OS keychain when available. */
  refreshToken: string;
}

export type Account = OfflineAccount | MicrosoftAccount;

export interface Profile {
  id: string;
  name: string;
  versionId: string;
  /** Game directory; empty means instances/<id>. */
  gameDir: string;
  memoryMb: number;
  jvmArgs: string;
  /** Overrides the automatically installed Java; empty means automatic. */
  javaPath: string;
  width: number;
  height: number;
}

export interface Settings {
  /** Azure application (client) ID used for Microsoft sign-in. */
  msClientId: string;
  selectedProfileId?: string;
  selectedAccountId?: string;
  closeOnLaunch: boolean;
}

export interface StoreData {
  accounts: Account[];
  profiles: Profile[];
  settings: Settings;
}

export interface SecretCodec {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/** Plain base64 fallback, used outside Electron (CLI) where no keychain is available. */
let codec: SecretCodec = {
  encrypt: (s) => `b64:${Buffer.from(s).toString('base64')}`,
  decrypt: (s) => Buffer.from(s.replace(/^b64:/, ''), 'base64').toString(),
};

export function setSecretCodec(c: SecretCodec): void {
  codec = c;
}

export const secrets = {
  encrypt: (s: string) => codec.encrypt(s),
  decrypt: (s: string) => codec.decrypt(s),
};

const FILE = () => path.join(paths.config, 'launcher.json');

export function newProfile(partial: Partial<Profile> = {}): Profile {
  return {
    id: randomUUID(),
    name: 'Nowy profil',
    versionId: '',
    gameDir: '',
    memoryMb: 4096,
    jvmArgs: '',
    javaPath: '',
    width: 854,
    height: 480,
    ...partial,
  };
}

function defaults(): StoreData {
  return {
    accounts: [],
    profiles: [newProfile({ name: 'Najnowsza wersja', versionId: 'latest-release' })],
    settings: { msClientId: process.env.SLASHCLIENT_MS_CLIENT_ID ?? '', closeOnLaunch: false },
  };
}

export async function loadStore(): Promise<StoreData> {
  try {
    const data = JSON.parse(await fs.readFile(FILE(), 'utf8')) as Partial<StoreData>;
    const base = defaults();
    return {
      accounts: data.accounts ?? base.accounts,
      profiles: data.profiles?.length ? data.profiles.map((p) => newProfile(p)) : base.profiles,
      settings: { ...base.settings, ...data.settings },
    };
  } catch {
    return defaults();
  }
}

/** Writes atomically so a crash never leaves a half-written config behind. */
export async function saveStore(data: StoreData): Promise<void> {
  await fs.mkdir(paths.config, { recursive: true });
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, FILE());
}

export function profileGameDir(profile: Profile): string {
  return profile.gameDir || path.join(paths.instances, profile.id);
}
