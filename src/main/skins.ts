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

/**
 * Skin for an account. Offline accounts have no skin of their own, so this
 * shows the premium player with the same nick, or the default skin.
 */
export async function skinFor(account: Account): Promise<SkinData> {
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
