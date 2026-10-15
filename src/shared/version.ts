// Replaced with package.json's version by esbuild (build.mjs / scripts/test.mjs).
declare const __APP_VERSION__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

/** Identifies the launcher to the APIs it talks to (Modrinth asks every client for one). */
export const USER_AGENT = `slash3rss/SlashClient/${APP_VERSION} (https://slash3rss.dev)`;
