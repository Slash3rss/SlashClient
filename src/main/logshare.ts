import os from 'node:os';
import { httpMessage, netFetch } from './download';
import { t } from '../shared/i18n';

/**
 * Removes things a public log shouldn't show: the home folder (it contains the
 * system user name) and anything that looks like a session token.
 */
export function redactLog(text: string): string {
  const home = os.homedir();
  return text
    .split(home).join('~')
    .replace(/(--accessToken\s+)\S+/g, '$1[ukryte]')
    .replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, '[ukryty token]');
}

/** Uploads a log to the SlashClient server (kept 90 days) and returns its page and id. */
export async function shareLog(text: string, serverUrl: string): Promise<{ url: string; id: string }> {
  const base = serverUrl.replace(/\/$/, '');
  const endpoint = `${base}/v1/logs`;
  const res = await netFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: redactLog(text),
  });
  if (!res.ok) throw new Error(res.status === 413 ? t('Log jest za duży (do 4 MB).') : httpMessage(res.status, endpoint));
  const body = (await res.json()) as { id?: string; url?: string; error?: string };
  if (!body.id || !body.url) throw new Error(t('Nie udało się udostępnić logu: {0}', body.error ?? '?'));
  return { url: base + body.url, id: body.id };
}
