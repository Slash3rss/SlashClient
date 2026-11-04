import { readFile, stat } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';

/**
 * The website from web/: the page for players at /, the admin panel at /admin. Plain files,
 * nothing rendered on the server; the pages talk to the same /v1 API the launcher uses.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const PAGES: Record<string, string> = { '/': 'index.html', '/konto': 'konto.html', '/account': 'konto.html', '/admin': 'admin.html', '/admin/': 'admin.html',
  // supporting the project (payments/support.ts): the page, where the payment providers send players back, the terms
  '/wsparcie': 'wsparcie.html', '/support': 'wsparcie.html', '/wsparcie/dziekujemy': 'wsparcie.html', '/wsparcie/anulowano': 'wsparcie.html',
  '/support/thanks': 'wsparcie.html', '/support/cancelled': 'wsparcie.html',
  '/wsparcie/regulamin': 'wsparcie-regulamin.html', '/support/terms': 'wsparcie-regulamin.html',
  // the phone app (installed from the browser), its own pages under /app/
  '/app': 'app/index.html', '/app/': 'app/index.html' };

/**
 * Cloudflare keeps .css and .js in browsers for hours whatever we answer, so the site's own
 * links to them carry the server's start (every deploy restarts it): a new version is a new address.
 */
const STARTED = Math.floor(Date.now() / 1000) * 1000;
const VERSION = STARTED.toString(36);
export const versioned = (text: string, type: string): string =>
  type.startsWith('text/html')
    ? text.replace(/((?:href|src)=")((?!\w+:|\/\/)[^"?#]+\.(?:css|js))"/g, `$1$2?v=${VERSION}"`)
    : text.replace(/((?:\bfrom\s*|\bimport\s*\(\s*)')(\.{0,2}\/[^'?#]+\.js)'/g, `$1$2?v=${VERSION}'`);

/** Pages with an id in the address: a shared log, one bug report. */
function pageOf(pathname: string): string | undefined {
  // each under its Polish and its English name
  if (/^\/(logi|logs)\/[A-Za-z0-9]{10}$/.test(pathname)) return 'logi.html';
  if (/^\/(zgloszenia|bugs)(\/\d+)?\/?$/.test(pathname)) return 'zgloszenia.html';
  // a public community's page (communities.ts), by its tag or id
  if (/^\/(s|spolecznosc|community)\/[\w-]{1,32}\/?$/.test(pathname)) return 'spolecznosc.html';
  // an invite link to a community (communityLinks.ts)
  if (/^\/c\/[A-Za-z0-9]{6,16}\/?$/.test(pathname)) return 'zaproszenie.html';
  return undefined;
}

/**
 * How long a browser keeps a file. Everything is checked on each visit (a cheap 304 when unchanged),
 * so an update reaches everyone at once, except: the CSS and JS the site links with this server's
 * version (`?v=`, a new address after every deploy) are kept for good, and the pictures and fonts
 * under /img and /vendor a day (then shown while checked again in the background for a week).
 */
function cacheControl(rel: string, type: string, version: string | undefined): string {
  if (version === VERSION && (type.startsWith('text/css') || type.startsWith('text/javascript'))) return 'public, max-age=31536000, immutable';
  if (/^(img|vendor)[\\/]/.test(rel) && /^(image|font)\//.test(type)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return 'no-cache';
}

/** Files as served (rewritten ones after the rewrite), by path, while their time and size on disk stay the same. */
const kept = new Map<string, { mtimeMs: number; size: number; data: Buffer | string }>();
let keptBytes = 0;
/** At most so much in memory, and no file bigger than this (those are read each time, as before). */
const KEEP_BYTES = 64 * 1024 * 1024;
const KEEP_FILE_BYTES = 2 * 1024 * 1024;

async function contentOf(file: string, info: { mtimeMs: number; size: number }, rewritten: boolean, type: string): Promise<Buffer | string> {
  const hit = kept.get(file);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.data;
  let data: Buffer | string = await readFile(file);
  if (rewritten) data = versioned(data.toString('utf8'), type);
  if (hit) {
    kept.delete(file);
    keptBytes -= hit.size;
  }
  if (info.size <= KEEP_FILE_BYTES && keptBytes + info.size <= KEEP_BYTES) {
    kept.set(file, { mtimeMs: info.mtimeMs, size: info.size, data });
    keptBytes += info.size;
  }
  return data;
}

/**
 * Serves a file of the site; false when there is none (the caller answers 404). `version`: the
 * address's `?v=` (the site's links carry this server's, see `versioned`).
 */
export async function serveWeb(webDir: string, pathname: string, res: http.ServerResponse, ifModifiedSince?: string, version?: string): Promise<boolean> {
  const root = path.resolve(webDir);
  let rel: string;
  try {
    rel = PAGES[pathname] ?? pageOf(pathname) ?? decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return false;
  }
  const file = path.resolve(root, rel);
  // nothing outside web/, and no hidden files
  if (!file.startsWith(root + path.sep) || rel.split(/[\\/]/).some((part) => part.startsWith('.'))) return false;
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const rewritten = type.startsWith('text/html') || type.startsWith('text/javascript');
    const cache = cacheControl(rel, type, version);
    // a rewritten file changes with the version too, so never older than the server's start
    const modified = new Date(Math.max(Math.floor(info.mtimeMs / 1000) * 1000, rewritten ? STARTED : 0));
    if (ifModifiedSince && !Number.isNaN(Date.parse(ifModifiedSince)) && Date.parse(ifModifiedSince) >= modified.getTime()) {
      res.writeHead(304, { 'Cache-Control': cache, 'Last-Modified': modified.toUTCString() });
      res.end();
      return true;
    }
    const data = await contentOf(file, info, rewritten, type);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cache,
      'Last-Modified': modified.toUTCString(),
    };
    if (type.startsWith('text/html')) {
      // avatars come from the sign-in providers
      headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
      headers['Referrer-Policy'] = 'no-referrer';
    }
    res.writeHead(200, headers);
    res.end(data);
    return true;
  } catch {
    return false;
  }
}
