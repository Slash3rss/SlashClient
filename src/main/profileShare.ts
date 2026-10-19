import fs from 'node:fs/promises';
import path from 'node:path';
import { netFetch } from './download';
import { CONFIG_ITEMS, OPTION_FILES, partOf, type PackPart } from './profilePack';
import { APP_VERSION } from '../shared/version';
import { t } from '../shared/i18n';

/**
 * Sharing a profile by code: the profile is exported as a .mrpack (profilePack.ts), uploaded
 * to the SlashClient server, and a friend types the short code to get the same file back and
 * import it like a picked one. Before uploading, the files that would go into the pack are
 * searched for things that look like passwords or tokens, so the player can leave them out.
 */

/** The server's limit; checked here first so a too big pack is not sent at all. */
export const SHARE_MAX_BYTES = 50 * 1024 * 1024;

export interface SharedProfile {
  code: string;
  name: string;
  gameVersion: string;
  loader: string;
  size: number;
  downloads: number;
  createdAt: number;
  expiresAt: number;
  ownerHandle?: string | null;
}

/** No 0/O, 1/I/L, like the server's codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A code as the player typed or pasted it ("abcd-efgh", spaces, a whole sentence around it…), or undefined. */
export function normalizeCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 200) return undefined;
  const direct = raw.toUpperCase().replace(/[\s-]/g, '');
  if (direct.length === 8 && [...direct].every((c) => ALPHABET.includes(c))) return direct;
  // pasted with words around it: "Mój profil: ABCD-EFGH"
  const found = raw.toUpperCase().match(/(?:^|[^A-Z0-9])([A-Z0-9]{4})-?([A-Z0-9]{4})(?![A-Z0-9])/);
  const code = found ? found[1] + found[2] : '';
  return code && [...code].every((c) => ALPHABET.includes(c)) ? code : undefined;
}

/** "ABCDEFGH" → "ABCD-EFGH", easier to read out. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

// ---------- looking for secrets ----------

/** Text files a mod keeps its settings in; others (jars, images, NBT) are not searched. */
const TEXT_FILES = /\.(json5?|jsonc|toml|properties|cfg|conf|ini|ya?ml|txt|js|snbt)$/i;
const MAX_SCANNED = 1024 * 1024;
/** Setting names that usually hold a secret: password, token, apiKey, client_secret, webhook… */
const SECRET_KEY = /(pass(word|wd|phrase)?|token|secret|api[_-]?key|apikey|private[_-]?key|access[_-]?key|auth[_-]?key|webhook|credentials?)/i;
/** A key and its value in JSON, TOML, .properties, YAML, INI or a script. */
const ASSIGNMENT = /["']?([\w.-]{2,64})["']?\s*[:=]\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s,;#}\]"']+))/g;
/** Values that are clearly not a secret: switches, empty or placeholder texts, plain numbers. */
const HARMLESS = /^(true|false|null|none|nil|undefined|yes|no|on|off|default|changeme|your[\w-]*|<[^>]*>|\$\{[^}]*\}|-?\d+(\.\d+)?)$/i;

/** Names of the settings in a text that look like they hold a password or token (never the values). */
export function findSecrets(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(ASSIGNMENT)) {
    const key = m[1];
    const value = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!SECRET_KEY.test(key) || value.length < 4 || HARMLESS.test(value)) continue;
    // "tokenCount", "passwordLength" and the like are settings about secrets, not secrets
    if (/(count|length|size|enabled|visible|timeout|duration|limit|max|min)$/i.test(key)) continue;
    keys.add(key);
  }
  if (/https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(text)) keys.add('webhook URL');
  return [...keys].slice(0, 6);
}

export interface SecretHit { rel: string; part: PackPart; keys: string[] }

/** Files of the folder that a pack with these parts would carry as they are (the configs and game settings). */
async function packedTextFiles(gameDir: string, parts: PackPart[]): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string, depth: number) => {
    if (out.length >= 5000 || depth > 12) return;
    const stat = await fs.stat(path.join(gameDir, rel)).catch(() => undefined);
    if (stat?.isFile()) {
      if (TEXT_FILES.test(rel) && stat.size <= MAX_SCANNED) out.push(rel);
      return;
    }
    if (!stat?.isDirectory()) return;
    for (const name of await fs.readdir(path.join(gameDir, rel)).catch(() => [] as string[])) {
      // the same files the export leaves out
      if (name.startsWith('.') || name.endsWith('.disabled')) continue;
      await walk(`${rel}/${name}`, depth + 1);
    }
  };
  if (parts.includes('config')) for (const item of CONFIG_ITEMS) await walk(item, 0);
  if (parts.includes('options')) for (const file of OPTION_FILES) await walk(file, 0);
  return out;
}

/** The files to be shared that seem to hold a secret, with the names of those settings. */
export async function scanSecrets(gameDir: string, parts: PackPart[]): Promise<SecretHit[]> {
  const hits: SecretHit[] = [];
  for (const rel of await packedTextFiles(gameDir, parts)) {
    const text = await fs.readFile(path.join(gameDir, rel), 'utf8').catch(() => '');
    const keys = findSecrets(text);
    if (keys.length) hits.push({ rel, part: partOf(rel), keys });
  }
  return hits;
}

// ---------- talking to the server ----------

/** The server's error codes in words. */
export function shareErrorText(code: string | undefined, status: number): string {
  const texts: Record<string, string> = {
    unauthorized: t('Zaloguj się do SlashClient (zakładka Znajomi), żeby udostępniać profile.'),
    banned: t('To konto SlashClient jest zablokowane.'),
    too_large: t('Paczka jest za duża (do {0} MB). Odznacz światy albo duże pliki.', SHARE_MAX_BYTES / 1024 / 1024),
    share_limit: t('Masz już za dużo udostępnionych profili. Usuń któryś kod i spróbuj ponownie.'),
    share_quota: t('Twoje udostępnione profile zajmują już cały limit miejsca. Usuń któryś kod i spróbuj ponownie.'),
    not_a_pack: t('Serwer nie przyjął paczki profilu.'),
    not_found: t('Nie ma takiego kodu albo już wygasł.'),
    rate_limited: t('Za szybko. Odczekaj chwilę.'),
  };
  return (code && texts[code]) || t('Serwer SlashClient zwrócił błąd {0}.', code ?? status);
}

const base = (server: string) => server.replace(/\/$/, '');
const headers = (token?: string) => ({ 'X-SlashClient': `launcher/${APP_VERSION}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function failed(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(shareErrorText(body.error ?? (res.status === 413 ? 'too_large' : undefined), res.status));
}

/** Sends a pack file; the answer is the new code. */
export async function uploadShare(opts: { server: string; token: string; file: string; name: string; gameVersion: string; loader: string }): Promise<SharedProfile> {
  const data = await fs.readFile(opts.file);
  if (data.length > SHARE_MAX_BYTES) throw new Error(shareErrorText('too_large', 413));
  const query = new URLSearchParams({ name: opts.name, game: opts.gameVersion, loader: opts.loader });
  const res = await netFetch(`${base(opts.server)}/v1/profile-shares?${query}`, {
    method: 'POST',
    headers: { ...headers(opts.token), 'Content-Type': 'application/x-modrinth-modpack+zip' },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) await failed(res);
  return ((await res.json()) as { share: SharedProfile }).share;
}

export async function listShares(server: string, token: string): Promise<SharedProfile[]> {
  const res = await netFetch(`${base(server)}/v1/profile-shares`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
  return ((await res.json()) as { shares: SharedProfile[] }).shares;
}

export async function deleteShare(server: string, token: string, code: string): Promise<void> {
  const res = await netFetch(`${base(server)}/v1/profile-shares/${code}`, { method: 'DELETE', headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
}

/** What a code holds (no sign-in needed). */
export async function shareInfo(server: string, code: string): Promise<SharedProfile> {
  const res = await netFetch(`${base(server)}/v1/profile-shares/${code}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
  return ((await res.json()) as { share: SharedProfile }).share;
}

/** Downloads the pack behind a code into `dest`, refusing more than the server would ever hold. */
export async function downloadShare(server: string, code: string, dest: string): Promise<void> {
  const res = await netFetch(`${base(server)}/v1/profile-shares/${code}/file`, { headers: headers(), signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) await failed(res);
  if (Number(res.headers.get('content-length')) > SHARE_MAX_BYTES) throw new Error(shareErrorText('too_large', 413));
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > SHARE_MAX_BYTES) throw new Error(shareErrorText('too_large', 413));
    chunks.push(chunk);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.concat(chunks));
}

/** Removes downloaded and uploaded packs older than a day from the launcher's temporary folder. */
export async function cleanShareTemp(dir: string): Promise<void> {
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const file = path.join(dir, name);
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat && Date.now() - stat.mtimeMs > 86_400_000) await fs.rm(file, { force: true }).catch(() => {});
  }
}
