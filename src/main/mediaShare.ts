import fs from 'node:fs/promises';
import path from 'node:path';
import { netFetch } from './download';
import { clipFrame, clipInfo, trimClip } from './clipTrim';
import { APP_VERSION } from '../shared/version';
import { t } from '../shared/i18n';

/**
 * Screenshots and clips from the gallery shared by link on the SlashClient website
 * (/media/<id>, server/src/media.ts), like logs: the file goes up as it is, the server answers
 * with the page's address. Needs the SlashClient account (Friends tab), so the owner can take a
 * link down again. Also wires the clip trimming (clipTrim.ts) to the page.
 */

/** The server's limits; checked here first so a too big file is not sent at all. */
export const MEDIA_MAX_IMAGE = 10 * 1024 * 1024;
export const MEDIA_MAX_CLIP = 90 * 1024 * 1024;

export interface SharedMedia {
  id: string;
  kind: 'image' | 'clip';
  url: string;
  size: number;
  width: number;
  height: number;
  durationMs: number;
  title: string;
  views: number;
  createdAt: number;
  expiresAt: number;
}

export type MediaFolder = 'screenshots' | 'clips';

/** The server's error codes in words. */
export function mediaErrorText(code: string | undefined, status: number): string {
  const texts: Record<string, string> = {
    unauthorized: t('Zaloguj się do SlashClient (zakładka Znajomi), żeby udostępniać zrzuty i klipy.'),
    banned: t('To konto SlashClient jest zablokowane.'),
    too_large: t('Plik jest za duży (zrzut do {0} MB, klip do {1} MB). Przytnij klip i spróbuj ponownie.', MEDIA_MAX_IMAGE / 1024 / 1024, MEDIA_MAX_CLIP / 1024 / 1024),
    media_limit: t('Masz już za dużo udostępnionych zrzutów i klipów. Usuń któryś link i spróbuj ponownie.'),
    media_quota: t('Twoje udostępnione zrzuty i klipy zajmują już cały limit miejsca. Usuń któryś link i spróbuj ponownie.'),
    bad_media: t('Serwer nie przyjął tego pliku (zrzut PNG/JPG albo klip z gry).'),
    not_found: t('Nie ma takiego linku albo już wygasł.'),
    rate_limited: t('Za szybko. Odczekaj chwilę.'),
    storage_full: t('Serwerowi SlashClient skończyło się miejsce na pliki. Spróbuj później.'),
    storage_unavailable: t('Miejsce na pliki na serwerze SlashClient jest chwilowo niedostępne. Spróbuj za chwilę.'),
  };
  // a server from before media sharing has no such address at all
  if (!code && status === 404) return t('Serwer SlashClient nie obsługuje jeszcze udostępniania zrzutów i klipów.');
  return (code && texts[code]) || t('Serwer SlashClient zwrócił błąd {0}.', code ?? status);
}

const base = (server: string) => server.replace(/\/$/, '');
const headers = (token: string) => ({ 'X-SlashClient': `launcher/${APP_VERSION}`, Authorization: `Bearer ${token}` });

async function failed(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(mediaErrorText(body.error ?? (res.status === 413 ? 'too_large' : undefined), res.status));
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avi': 'video/x-msvideo' };

/** Sends a screenshot or clip; the answer has the page's full address in `url`. */
export async function uploadMedia(opts: { server: string; token: string; file: string; title?: string }): Promise<SharedMedia> {
  const type = TYPES[path.extname(opts.file).toLowerCase()];
  if (!type) throw new Error(mediaErrorText('bad_media', 400));
  const size = (await fs.stat(opts.file)).size;
  if (size > (type.startsWith('image/') ? MEDIA_MAX_IMAGE : MEDIA_MAX_CLIP)) throw new Error(mediaErrorText('too_large', 413));
  const query = opts.title ? `?${new URLSearchParams({ title: opts.title.slice(0, 80) })}` : '';
  const res = await netFetch(`${base(opts.server)}/v1/media${query}`, {
    method: 'POST',
    headers: { ...headers(opts.token), 'Content-Type': type },
    body: new Uint8Array(await fs.readFile(opts.file)),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  // an older server answers not_found for an address it does not have
  if (res.status === 404) throw new Error(mediaErrorText(undefined, 404));
  if (!res.ok) await failed(res);
  const { media } = (await res.json()) as { media: SharedMedia };
  return { ...media, url: base(opts.server) + media.url };
}

export async function listMedia(server: string, token: string): Promise<SharedMedia[]> {
  const res = await netFetch(`${base(server)}/v1/media`, { headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
  return ((await res.json()) as { media: SharedMedia[] }).media.map((m) => ({ ...m, url: base(server) + m.url }));
}

export async function deleteMedia(server: string, token: string, id: string): Promise<void> {
  if (!/^[A-Za-z0-9]{10}$/.test(id)) throw new Error(mediaErrorText('not_found', 404));
  const res = await netFetch(`${base(server)}/v1/media/${id}`, { method: 'DELETE', headers: headers(token), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) await failed(res);
}

/** Only plain file names of the gallery's kinds, never paths, so nothing outside the folder is read. */
export function galleryFile(gameDir: string, folder: MediaFolder, name: unknown): string {
  const ok = folder === 'clips' ? /\.avi$/i : /\.(png|jpe?g)$/i;
  if (typeof name !== 'string' || !name || name !== path.basename(name) || name.startsWith('.') || !ok.test(name)) throw new Error(t('Nieprawidłowa nazwa'));
  return path.join(gameDir, folder, name);
}

export interface MediaDeps {
  handle: <T extends unknown[], R>(channel: string, fn: (...args: T) => Promise<R> | R) => void;
  gameDirOf: (profileId: string) => string;
  /** The SlashClient server and the signed-in session; throws when not signed in. */
  session: () => { server: string; token: string };
  /** Copies the link where the player can paste it. */
  copy: (text: string) => void;
}

export function registerMediaSharing(d: MediaDeps) {
  const session = () => {
    try {
      return d.session();
    } catch {
      throw new Error(mediaErrorText('unauthorized', 401));
    }
  };
  d.handle('clips:info', (profileId: string, name: string) => clipInfo(galleryFile(d.gameDirOf(profileId), 'clips', name)));
  d.handle('clips:trim', async (profileId: string, name: string, start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(t('Nieprawidłowy zakres.'));
    try {
      return await trimClip(galleryFile(d.gameDirOf(profileId), 'clips', name), start, end);
    } catch (err) {
      throw new Error((err as Error).message === 'too short' ? t('Przycięty klip musi mieć co najmniej dwie klatki.') : t('Nie udało się przyciąć klipu: {0}', (err as Error).message));
    }
  });
  d.handle('media:share', async (profileId: string, folder: MediaFolder, name: string, title?: string) => {
    if (folder !== 'clips' && folder !== 'screenshots') throw new Error(t('Nieprawidłowa nazwa'));
    const file = galleryFile(d.gameDirOf(profileId), folder, name);
    const media = await uploadMedia({ ...session(), file, title: typeof title === 'string' ? title : undefined });
    d.copy(media.url);
    return media;
  });
  d.handle('media:list', () => {
    const { server, token } = session();
    return listMedia(server, token);
  });
  d.handle('media:delete', (id: string) => {
    const { server, token } = session();
    return deleteMedia(server, token, String(id));
  });
}

/** slash-media://clip/?path=…&frame=N: one frame of a clip for the trim window, as a JPEG. */
export async function clipFrameResponse(file: string, frame: number): Promise<Response> {
  const jpeg = /\.avi$/i.test(file) ? await clipFrame(file, frame).catch(() => undefined) : undefined;
  if (!jpeg) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=60' } });
}
