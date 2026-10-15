import { fetchJson } from './download';
import type { Account } from './store';

export interface SkinData {
  /** data:image/png;base64,… */
  dataUrl: string;
  model: 'default' | 'slim';
  /** True when the player has no skin of their own and the default one is shown. */
  isDefault: boolean;
}

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

/** Skin of a premium profile, from Mojang's session server. */
async function premiumSkin(uuid: string): Promise<SkinData | undefined> {
  const profile = await fetchJson<{ properties: { name: string; value: string }[] }>(
    `https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, '')}`,
  );
  const textures = JSON.parse(Buffer.from(profile.properties.find((p) => p.name === 'textures')?.value ?? '', 'base64').toString());
  const skin = textures.textures?.SKIN;
  if (!skin?.url?.startsWith('http://textures.minecraft.net/') && !skin?.url?.startsWith('https://textures.minecraft.net/')) return undefined;
  return { dataUrl: await toDataUrl(skin.url.replace('http://', 'https://')), model: skin.metadata?.model === 'slim' ? 'slim' : 'default', isDefault: false };
}

/**
 * Skin for an account. Offline accounts have no skin of their own, so this
 * shows the premium player with the same nick, or the default skin.
 */
export async function skinFor(account: Account): Promise<SkinData> {
  try {
    if (account.type === 'msa') {
      const s = await premiumSkin(account.uuid);
      if (s) return s;
    } else {
      const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(account.name)}`);
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        const s = await premiumSkin(id);
        if (s) return s;
      }
    }
  } catch {
    // fall back to the default skin below
  }
  return { dataUrl: await toDataUrl(`https://mc-heads.net/skin/${encodeURIComponent(account.name)}`), model: 'default', isDefault: true };
}
