import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * The browser part of a Discord/Google/GitHub sign-in ends here, on this computer (server 0.9.59+):
 * the server sends the browser back to 127.0.0.1 with a one-time key, and only this launcher holds the
 * secret (PKCE verifier) that turns it into a session. A sign-in link someone else started and sent round
 * cannot end on their side, and the player has nothing to confirm.
 */
export interface Loopback {
  port: number;
  /** What the server keeps: the verifier's SHA-256. */
  challenge: string;
  close(): void;
}

/**
 * Listens on a free port of 127.0.0.1 for the browser. `finish` ends the sign-in with the key and the
 * verifier; the browser then goes to `donePage` (the server's "Zalogowano" page) whatever came of it.
 */
export async function openLoopback(state: () => string | undefined, finish: (key: string, verifier: string) => Promise<boolean>, donePage: (ok: boolean, lang: string) => string): Promise<Loopback> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let used = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const expected = state();
    // only the one sign-in this launcher started, once; anything else on this port is turned away
    if (url.pathname !== '/slashclient-login' || used || !expected || url.searchParams.get('state') !== expected || !url.searchParams.get('key')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('SlashClient');
      return;
    }
    used = true;
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'pl';
    finish(url.searchParams.get('key')!, verifier).catch(() => false).then((ok) => {
      res.writeHead(302, { Location: donePage(ok, lang), 'Cache-Control': 'no-store' });
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    challenge,
    close: () => server.close(),
  };
}
