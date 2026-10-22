import type http from 'node:http';
import { bannerOf, featuresOf } from './features.ts';
import { SettingError, formatSetting, type Settings } from './settings.ts';
import { CATEGORIES } from './settingsDefs.ts';

/**
 * The admin panel's "Ustawienia" (settings.ts): every setting with its value, default and who
 * changed it, saving a group of them at once (each change in the admin log, old → new), and the
 * public GET /v1/features the launcher and the website read (switches and the banner).
 */

export interface SettingsAdminContext {
  settings: Settings;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  audit: (admin: string, action: string, target: string, detail?: string) => void;
  /** Handles of who changed what, for the panel. */
  handleOf: (userId: string) => string;
  fail: (status: number, code: string) => never;
  /** This server's address, put where a description says {publicUrl} (an address to register with a provider). */
  publicUrl?: string;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function settingsAdminRoutes(ctx: SettingsAdminContext): [string, RegExp, Handler][] {
  const { settings } = ctx;
  const view = () => ({
    categories: CATEGORIES,
    settings: settings.view().map((s) => ({
      ...s, description: s.description.replaceAll('{publicUrl}', (ctx.publicUrl ?? '').replace(/\/$/, '')),
      updatedByHandle: s.updatedBy ? ctx.handleOf(s.updatedBy) || null : null,
    })),
    // what clients see now
    features: featuresOf(settings), banner: bannerOf(settings),
  });

  return [
    // the switches and the banner, for everyone (no sign-in): launchers and the website ask on start
    ['GET', /^\/v1\/features$/, () => ({ features: featuresOf(settings), banner: bannerOf(settings) })],

    ['GET', /^\/v1\/admin\/settings$/, (req) => {
      ctx.admin(req);
      return view();
    }],
    // { values: { key: value | null } }: null (or the default) goes back to the default; all or nothing
    ['POST', /^\/v1\/admin\/settings$/, async (req) => {
      const me = ctx.admin(req);
      const { values } = await ctx.body(req);
      if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) ctx.fail(400, 'bad_request');
      let changes;
      try {
        changes = settings.set(values as Record<string, unknown>, me);
      } catch (err) {
        if (err instanceof SettingError) {
          // "<code>:<key>": the panel shows which field is wrong
          ctx.fail(400, `${err.message}:${err.key}`);
        }
        throw err;
      }
      for (const c of changes) {
        const def = settings.defs.get(c.key);
        ctx.audit(me, c.reset ? 'setting_reset' : 'setting', c.key, `${formatSetting(def, c.old)} → ${formatSetting(def, c.new)}`);
      }
      return { ...view(), changed: changes.map((c) => c.key) };
    }],
  ];
}
