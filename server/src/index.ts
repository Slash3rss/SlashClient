import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.ts';

/**
 * Settings come from environment variables:
 *   PORT                    default 8787
 *   DB_FILE                 default ./data/social.db
 *   PUBLIC_URL              default http://localhost:PORT (Discord redirects back here)
 *   DISCORD_CLIENT_ID       with DISCORD_CLIENT_SECRET: enables "Sign in with Discord"
 *   DISCORD_CLIENT_SECRET
 *   ALLOW_DEV_LOGIN=1       sign-in with just a name; local testing only
 */
const port = Number(process.env.PORT) || 8787;
const dbFile = process.env.DB_FILE ?? path.resolve('data/social.db');
mkdirSync(path.dirname(dbFile), { recursive: true });

const { server } = createApp({
  dbFile,
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
  discord: process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
    ? { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET }
    : undefined,
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === '1',
});

server.listen(port, () => {
  console.log(`SlashClient social: http://localhost:${port}/v1/health (baza: ${dbFile})`);
  if (process.env.ALLOW_DEV_LOGIN === '1') console.log('Uwaga: logowanie samym nickiem jest włączone (ALLOW_DEV_LOGIN=1), tylko do testów.');
});
