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
};
const PAGES: Record<string, string> = { '/': 'index.html', '/konto': 'konto.html', '/account': 'konto.html', '/admin': 'admin.html', '/admin/': 'admin.html' };

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
  return undefined;
}

/** Serves a file of the site; false when there is none (the caller answers 404). */
export async function serveWeb(webDir: string, pathname: string, res: http.ServerResponse, ifModifiedSince?: string): Promise<boolean> {
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
    // every file is checked on each visit (a cheap 304 when unchanged), so an update reaches everyone at once
    const rewritten = type.startsWith('text/html') || type.startsWith('text/javascript');
    // a rewritten file changes with the version too, so never older than the server's start
    const modified = new Date(Math.max(Math.floor(info.mtimeMs / 1000) * 1000, rewritten ? STARTED : 0));
    if (ifModifiedSince && !Number.isNaN(Date.parse(ifModifiedSince)) && Date.parse(ifModifiedSince) >= modified.getTime()) {
      res.writeHead(304, { 'Cache-Control': 'no-cache', 'Last-Modified': modified.toUTCString() });
      res.end();
      return true;
    }
    let data: Buffer | string = await readFile(file);
    if (rewritten) data = versioned(data.toString('utf8'), type);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
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
