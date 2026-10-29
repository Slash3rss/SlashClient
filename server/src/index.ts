import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';
import { Leader, Replica, failoverFromEnv } from './failover.ts';

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
 *   SHARES_DIR              profiles shared by code, default ./profiles next to DB_FILE
 *   MEDIA_DIR               screenshots and clips shared by link, default ./media next to DB_FILE
 *   CLOUD_DIR               profiles kept on accounts, default ./cloud-profiles next to DB_FILE
 *   STORAGE_SECRET_KEY      32 bytes, base64 (openssl rand -base64 32): seals the keys of the buckets added in the panel
 *   STORAGE_MIN_FREE_MB     the server's disk takes no new files below this much free space, default 2048
 *   LEGAL_DRAFT=0           the legal documents' "draft, to be checked by a lawyer" banner off by default (the admin panel's choice per document wins)
 *   CHAT_IMAGES_DIR         pictures sent in the chat (encrypted), default ./chat-images next to DB_FILE
 *
 * A spare server ready to take over (failover.ts, deploy/failover/README.md), all of these or none:
 *   FAILOVER_NODE           this server's name, different on each ("pl1", "de1")
 *   FAILOVER_S3_ENDPOINT    the bucket for the lease and the copies: https://<account>.r2.cloudflarestorage.com
 *   FAILOVER_S3_BUCKET
 *   FAILOVER_S3_KEY_ID
 *   FAILOVER_S3_SECRET
 *   FAILOVER_S3_REGION      default auto (R2)
 *   FAILOVER_S3_PREFIX      default slashclient-failover/
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

// with failover on, only the server holding the lease starts; another one holding it fresh: this one stays off
// (exit code 75, which systemd is told not to restart on: a server taken over from must not come back by itself)
const failover = failoverFromEnv();
let leader: Leader | undefined;
if (failover) {
  leader = new Leader({
    node: failover.node,
    store: failover.store,
    log: (m) => console.error(m),
    onLost: (holder) => {
      console.error(`Awaryjność: dzierżawę przejął serwer ${holder?.node ?? '?'} – ten kończy pracę, żeby nie zapisywać obok niego.`);
      process.exit(75);
    },
  });
  const got = await leader.acquire().catch((err: Error) => {
    console.error(`Awaryjność: magazyn nie odpowiada (${err.message}) – serwer nie startuje, żeby nie działać obok zapasowego.`);
    process.exit(1);
  });
  if (!got.ok) {
    console.error(`Awaryjność: główny jest teraz serwer ${got.holder?.node ?? '?'} – ten (${failover.node}) nie startuje.`);
    process.exit(75);
  }
  console.log(`Awaryjność: ${failover.node} jest głównym serwerem (kadencja ${got.term}).`);
}

const { server, db, close } = createApp({
  node: failover?.node,
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
  sharesDir: process.env.SHARES_DIR || undefined,
  mediaDir: process.env.MEDIA_DIR || undefined,
  cloudDir: process.env.CLOUD_DIR || undefined,
  storage: {
    secretKey: process.env.STORAGE_SECRET_KEY || undefined,
    minFreeBytes: Number(process.env.STORAGE_MIN_FREE_MB) > 0 ? Number(process.env.STORAGE_MIN_FREE_MB) * 1024 * 1024 : undefined,
  },
  imagesDir: process.env.CHAT_IMAGES_DIR || undefined,
  legalDraft: process.env.LEGAL_DRAFT !== '0',
});

let replica: Replica | undefined;
if (failover && leader) {
  leader.start();
  replica = new Replica({ node: failover.node, store: failover.store, db: db.sql, dbFile, dataDir: path.dirname(dbFile), leader, log: (m) => console.error(m) });
  replica.start();
}
// stopped by systemd (a restart, a deploy): a last copy of the database first, so the spare has everything
process.once('SIGTERM', async () => {
  replica?.stop();
  leader?.stop();
  await Promise.race([replica?.copyDb(true), new Promise((r) => setTimeout(r, 10_000))]).catch(() => undefined);
  await close().catch(() => undefined);
  process.exit(0);
});

server.listen(port, () => {
  console.log(`SlashClient social: http://localhost:${port}/ (strona), /admin (panel), /v1/health (baza: ${dbFile})`);
  if (process.env.ALLOW_DEV_LOGIN === '1') console.log('Uwaga: logowanie samym nickiem jest włączone (ALLOW_DEV_LOGIN=1), tylko do testów.');
});
