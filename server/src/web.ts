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
};
const PAGES: Record<string, string> = { '/': 'index.html', '/konto': 'konto.html', '/admin': 'admin.html', '/admin/': 'admin.html' };

/** Serves a file of the site; false when there is none (the caller answers 404). */
export async function serveWeb(webDir: string, pathname: string, res: http.ServerResponse): Promise<boolean> {
  const root = path.resolve(webDir);
  let rel: string;
  try {
    rel = PAGES[pathname] ?? decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return false;
  }
  const file = path.resolve(root, rel);
  // nothing outside web/, and no hidden files
  if (!file.startsWith(root + path.sep) || rel.split(/[\\/]/).some((part) => part.startsWith('.'))) return false;
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
    const data = await readFile(file);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      // pages, scripts and styles are checked on every visit, so an update reaches everyone at once
      'Cache-Control': /^text\/(html|css|javascript)/.test(type) ? 'no-cache' : 'public, max-age=86400',
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
