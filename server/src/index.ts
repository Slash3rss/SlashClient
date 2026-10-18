import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';

/**
 * Settings come from environment variables:
 *   PORT                    default 8787
 *   DB_FILE                 default ./data/social.db
 *   PUBLIC_URL              default http://localhost:PORT (sign-in redirects come back here)
 *   DISCORD_CLIENT_ID       with DISCORD_CLIENT_SECRET: enables "Sign in with Discord"
 *   DISCORD_CLIENT_SECRET
 *   MICROSOFT_CLIENT_ID     with MICROSOFT_CLIENT_SECRET: enables "Sign in with Microsoft"
 *   MICROSOFT_CLIENT_SECRET
 *   GOOGLE_CLIENT_ID        with GOOGLE_CLIENT_SECRET: enables "Sign in with Google"
 *   GOOGLE_CLIENT_SECRET
 *   GITHUB_CLIENT_ID        with GITHUB_CLIENT_SECRET: enables "Sign in with GitHub"
 *   GITHUB_CLIENT_SECRET
 *   ALLOW_DEV_LOGIN=1       sign-in with just a name; local testing only
 *   ADMIN_HANDLES           comma-separated handles that are admins (the panel at /admin)
 *   WEB_DIR                 the website's files, default ./web
 *   CURSEFORGE_API_KEY      key from console.curseforge.com: enables CurseForge in the launcher
 */
const port = Number(process.env.PORT) || 8787;
const dbFile = process.env.DB_FILE ?? path.resolve('data/social.db');
mkdirSync(path.dirname(dbFile), { recursive: true });

/** A provider is on when both its id and secret are set (Microsoft signs in with a code and needs only the id). */
const app = (prefix: string, secretNeeded = true) => {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] ?? '';
  return clientId && (clientSecret || !secretNeeded) ? { clientId, clientSecret } : undefined;
};

const { server } = createApp({
  dbFile,
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  oauth: {
    discord: app('DISCORD'),
    microsoft: app('MICROSOFT', false),
    google: app('GOOGLE'),
    github: app('GITHUB'),
  },
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === '1',
  adminHandles: (process.env.ADMIN_HANDLES ?? '').split(','),
  webDir: process.env.WEB_DIR ?? path.resolve('web'),
  trustProxy: process.env.TRUST_PROXY === '1',
  releasesRepo: process.env.RELEASES_REPO,
  releasesToken: process.env.RELEASES_TOKEN || undefined,
  curseforgeKey: process.env.CURSEFORGE_API_KEY || undefined,
});

server.listen(port, () => {
  console.log(`SlashClient social: http://localhost:${port}/ (strona), /admin (panel), /v1/health (baza: ${dbFile})`);
  if (process.env.ALLOW_DEV_LOGIN === '1') console.log('Uwaga: logowanie samym nickiem jest włączone (ALLOW_DEV_LOGIN=1), tylko do testów.');
});
