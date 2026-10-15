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

/** Uploads a log to mclo.gs (a paste service for Minecraft logs) and returns its link. */
export async function shareLog(text: string, endpoint = 'https://api.mclo.gs/1/log'): Promise<string> {
  const res = await netFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ content: redactLog(text) }),
  });
  if (!res.ok) throw new Error(httpMessage(res.status, endpoint));
  const body = (await res.json()) as { success: boolean; url?: string; error?: string };
  if (!body.success || !body.url) throw new Error(t('Nie udało się udostępnić logu: {0}', body.error ?? '?'));
  return body.url;
}
