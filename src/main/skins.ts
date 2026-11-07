import { t } from '../shared/i18n';
import { fetchJson, httpMessage, netFetch } from './download';
import type { Account } from './store';

export interface SkinData {
  /** data:image/png;base64,… */
  dataUrl: string;
  model: 'default' | 'slim';
  /** True when the player has no skin of their own and the default one is shown. */
  isDefault: boolean;
  /** data:image/png;base64,… of the cape, if the player has one. */
  cape?: string;
  capeSource?: 'Mojang' | 'OptiFine';
  /** An offline account's skin set in the launcher for SlashClient players (not Mojang's). */
  slashSkin?: boolean;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

async function toDataUrl(url: string): Promise<string> {
  const res = await netFetch(url);
  if (!res.ok) throw new Error(httpMessage(res.status, url));
  const buf = Buffer.from(await res.arrayBuffer());
  // only ever hand real PNGs to the page
  if (!buf.subarray(0, 4).equals(PNG_MAGIC)) throw new Error('To nie jest obrazek PNG');
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** OptiFine capes are only served over plain HTTP; the PNG check above guards what comes back. */
async function optifineCape(name: string): Promise<string | undefined> {
  return toDataUrl(`http://s.optifine.net/capes/${encodeURIComponent(name)}.png`).catch(() => undefined);
}

/** Skin of a premium profile, from Mojang's session server. */
async function premiumSkin(uuid: string): Promise<Omit<SkinData, 'capeSource'> | undefined> {
  const profile = await fetchJson<{ properties: { name: string; value: string }[] }>(
    `https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`,
  );
  const textures = JSON.parse(Buffer.from(profile.properties.find((p) => p.name === 'textures')?.value ?? '', 'base64').toString());
  const official = (t: { url?: string } | undefined) => /^https?:\/\/textures\.minecraft\.net\//.test(t?.url ?? '');
  const skin = textures.textures?.SKIN;
  if (!official(skin)) return undefined;
  const capeTex = textures.textures?.CAPE;
  return {
    dataUrl: await toDataUrl(skin.url.replace('http://', 'https://')),
    model: skin.metadata?.model === 'slim' ? 'slim' : 'default',
    isDefault: false,
    cape: official(capeTex) ? await toDataUrl(capeTex.url.replace('http://', 'https://')).catch(() => undefined) : undefined,
  };
}

/** Adds an OptiFine cape when there is no Mojang one. */
async function withCape(data: Omit<SkinData, 'capeSource'>, name: string): Promise<SkinData> {
  if (data.cape) return { ...data, capeSource: 'Mojang' };
  const cape = await optifineCape(name);
  return cape ? { ...data, cape, capeSource: 'OptiFine' } : data;
}

// ---------- the skin an offline account shows to SlashClient players (server's offlineSkins) ----------

/** A skin the player put on an offline nick, as the SlashClient server keeps it. */
export interface OfflineSkin { name: string; hash: string; slim: boolean }

/** Nicks the server takes a skin for: what a vanilla server lets an offline player use. */
export const OFFLINE_SKIN_NAME = /^[A-Za-z0-9_]{1,16}$/;
/** The server's own limit for one skin file. */
export const OFFLINE_SKIN_MAX_BYTES = 64 * 1024;

/** The skin uploaded for this nick (nicks are matched without case, as the game does). */
export function offlineSkinOf(list: readonly OfflineSkin[], name: string): OfflineSkin | undefined {
  const lower = name.toLowerCase();
  return list.find((s) => s.name.toLowerCase() === lower);
}

/** What tells the mod the player's own skin (its picture is fetched by hash); nothing without a saved one. */
export function offlineSkinArgs(skin: OfflineSkin | undefined): string[] {
  if (!skin || !/^[0-9a-f]{8,64}$/.test(skin.hash)) return [];
  return [`-Dslashclient.offlineSkin=${skin.hash}`, ...(skin.slim ? ['-Dslashclient.offlineSkinSlim=true'] : [])];
}

/** The PUT body for /v1/me/offline-skins/:name, checked here so the player gets a clear message, not a server code. */
export function offlineSkinUpload(name: string, png: Buffer, slim: boolean): { png: string; slim: boolean } {
  if (!OFFLINE_SKIN_NAME.test(name)) throw new Error(t('Skin dla graczy SlashClient można ustawić tylko dla nicku z liter, cyfr i _ (najwyżej 16 znaków).'));
  readSkinFile(png);
  if (png.length > OFFLINE_SKIN_MAX_BYTES) throw new Error(t('Plik skina jest za duży (najwyżej 64 KB).'));
  return { png: png.toString('base64'), slim: !!slim };
}

/** The server's refusal of an offline skin in plain words; undefined = a general error, said as usual. */
export function offlineSkinError(code: string, status?: number): string | undefined {
  if (code === 'bad_name') return t('Skin dla graczy SlashClient można ustawić tylko dla nicku z liter, cyfr i _ (najwyżej 16 znaków).');
  if (code === 'bad_skin') return t('Serwer nie przyjął pliku: skin musi być obrazkiem PNG 64×64 albo 64×32.');
  if (code === 'too_large' || status === 413) return t('Plik skina jest za duży (najwyżej 64 KB).');
  if (code === 'too_many') return t('Masz już najwięcej skinów dla kont offline. Usuń skin z innego konta offline, żeby dodać nowy.');
  if (code === 'feature_disabled') return t('Skiny kont offline są chwilowo wyłączone przez administratora.');
  if (status === 429 || code === 'rate_limited' || code.startsWith('slow_down')) return t('Za dużo zmian skina naraz. Odczekaj minutę.');
  return undefined;
}

/**
 * What the launcher tells the server while a game runs, so SlashClient players around see who it is:
 * a Microsoft account by its uuid (as before), an offline one with its nick, marked offline (the server
 * checks the uuid against the nick and shows its skin and cosmetics only on the same server).
 */
export function mcLinkBody(account: Pick<Account, 'type' | 'uuid' | 'name'>): { uuid: string; name?: string; offline?: true } {
  return account.type === 'msa' ? { uuid: account.uuid } : { uuid: account.uuid, name: account.name, offline: true };
}

/**
 * Skin for an account. Offline accounts have no skin of their own, so this shows the skin
 * uploaded for SlashClient players (`uploaded`, its address and arm model), else the premium
 * player with the same nick, or the default skin.
 */
export async function skinFor(account: Account, uploaded?: { url: string; slim: boolean }): Promise<SkinData> {
  try {
    if (account.type !== 'msa' && uploaded) {
      return withCape({ dataUrl: await toDataUrl(uploaded.url), model: uploaded.slim ? 'slim' : 'default', isDefault: false, slashSkin: true }, account.name);
    }
  } catch {
    // the server could not be reached: the premium or default skin below, as without one
  }
  try {
    if (account.type === 'msa') {
      const s = await premiumSkin(account.uuid);
      if (s) return withCape(s, account.name);
    } else {
      const res = await netFetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(account.name)}`);
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        const s = await premiumSkin(id);
        if (s) return withCape(s, account.name);
      }
    }
  } catch {
    // fall back to the default skin below
  }
  return withCape({ dataUrl: await toDataUrl(`https://mc-heads.net/skin/${encodeURIComponent(account.name)}`), model: 'default', isDefault: true }, account.name);
}

// ---------- changing the skin and cape of a Microsoft account ----------

const SERVICES = 'https://api.minecraftservices.com/minecraft/profile';

export interface OwnedCape {
  id: string;
  alias: string;
  active: boolean;
  /** data:image/png;base64,… of the cape texture, for the preview */
  texture?: string;
}

async function servicesCall(token: string, path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  const url = `${SERVICES}${path}`;
  const res = await netFetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errorMessage?: string; error?: string };
    // Mojang explains rejected skins in errorMessage (e.g. wrong size)
    throw new Error(body.errorMessage ? t('Mojang odrzucił zmianę: {0}', body.errorMessage) : httpMessage(res.status, url));
  }
  return res.status === 204 ? {} : ((await res.json()) as Record<string, any>);
}

/** The capes this account owns, with their textures for the preview. */
export async function ownedCapes(token: string): Promise<OwnedCape[]> {
  const profile = await servicesCall(token, '');
  return Promise.all(
    ((profile.capes ?? []) as { id: string; alias: string; state: string; url: string }[]).map(async (c) => ({
      id: c.id,
      alias: c.alias,
      active: c.state === 'ACTIVE',
      texture: /^https?:\/\/textures\.minecraft\.net\//.test(c.url) ? await toDataUrl(c.url.replace('http://', 'https://')).catch(() => undefined) : undefined,
    })),
  );
}

/** Checks a skin file before anything is sent: a PNG of 64×64 (or legacy 64×32) pixels. */
export function readSkinFile(png: Buffer): string {
  if (!png.subarray(0, 4).equals(PNG_MAGIC)) throw new Error(t('Skin musi być plikiem PNG.'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) throw new Error(t('Skin musi mieć 64×64 albo 64×32 piksele (ten ma {0}×{1}).', width, height));
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function uploadSkin(token: string, png: Buffer, variant: 'classic' | 'slim'): Promise<void> {
  readSkinFile(png);
  const form = new FormData();
  form.append('variant', variant);
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'skin.png');
  await servicesCall(token, '/skins', { method: 'POST', body: form });
}

/** Back to the default Steve/Alex skin. */
export async function resetSkin(token: string): Promise<void> {
  await servicesCall(token, '/skins/active', { method: 'DELETE' });
}

/** Shows one of the owned capes, or hides the cape with null. */
export async function setCape(token: string, capeId: string | null): Promise<void> {
  if (capeId) {
    await servicesCall(token, '/capes/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId }) });
  } else {
    await servicesCall(token, '/capes/active', { method: 'DELETE' });
  }
}
