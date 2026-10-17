import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { t } from '../shared/i18n';

/**
 * Share codes of SlashClient HUD settings, the same format the mod uses (ShareCode.java):
 * "SCHUD1:" + base64url (no padding) of the raw-deflated JSON.
 */

const PREFIX = 'SCHUD1:';

export function encodeHud(json: string): string {
  return PREFIX + zlib.deflateRawSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64url');
}

/** The settings JSON in a code; throws with a message for the player when it is not one. */
export function decodeHud(code: string): Record<string, unknown> {
  const s = code.trim();
  if (!s.startsWith(PREFIX)) throw new Error(t('To nie jest kod ustawień SlashClient.'));
  let json: unknown;
  try {
    // a real code is a few kB; the limit keeps a crafted one from filling memory
    json = JSON.parse(zlib.inflateRawSync(Buffer.from(s.slice(PREFIX.length), 'base64url'), { maxOutputLength: 256 * 1024 }).toString('utf8'));
  } catch {
    throw new Error(t('Kod ustawień SlashClient jest uszkodzony.'));
  }
  if (!json || typeof json !== 'object' || typeof (json as { modules?: unknown }).modules !== 'object') throw new Error(t('Kod ustawień SlashClient jest uszkodzony.'));
  return json as Record<string, unknown>;
}

const file = (gameDir: string) => path.join(gameDir, 'config', 'slashclient-hud.json');

export async function exportHud(gameDir: string): Promise<string> {
  const json = await fs.readFile(file(gameDir), 'utf8').catch(() => {
    throw new Error(t('Ten profil nie ma jeszcze ustawień HUD. Uruchom w nim grę z HUD albo wklej kod.'));
  });
  // re-serialised compactly, so the code stays short
  return encodeHud(JSON.stringify(JSON.parse(json)));
}

export async function importHud(gameDir: string, code: string): Promise<void> {
  const settings = decodeHud(code);
  await fs.mkdir(path.dirname(file(gameDir)), { recursive: true });
  await fs.writeFile(file(gameDir), JSON.stringify(settings, null, 2));
}
