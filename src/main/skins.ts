import { fetchJson } from './download';
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(account.name)}`);
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
