import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { Db } from './db.ts';
import { IconError, makeIcon, type Icon } from './partnerIcons.ts';

/**
 * Partner servers: an address (as players type it) with a background picture that SlashClient HUD
 * draws behind that server in the game's server list. The admin adds them; a partner account set as
 * the owner may change the picture itself. Pictures are files next to the database.
 */

/**
 * `icon`: the file of the animated icon's sprite sheet (partnerIcons.ts), '' for none; `iconSize` a
 * frame's side, `iconDelays` each frame's delay in ms; `iconUpdatedAt` versions its address.
 */
export interface Partner {
  id: string; address: string; name: string; owner: string; background: string; pinned: boolean; rotate: boolean; updatedAt: number;
  icon: string; iconSize: number; iconDelays: number[]; iconUpdatedAt: number;
  /** Other addresses players add the same server under (another domain, a raw IP), normalized; pins stay on `address`. */
  aliases: string[];
}

const MAX_PICTURE = 3 * 1024 * 1024;
// PNG and JPEG only: the game reads those itself (no WebP)
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' };

/** "SkyUp.pl:25565 " → "skyup.pl": the form both sides compare. */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\.$/, '').replace(/:25565$/, '');
}
const ADDRESS = /^[\w.-]{1,253}(:\d{1,5})?$/;

/** The picture's kind from its first bytes; anything else is refused. */
function pictureType(data: Buffer): string | undefined {
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  return undefined;
}

async function rawBody(req: http.IncomingMessage, fail: (status: number, code: string) => never, max = MAX_PICTURE): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  // the rest of a too big upload is read and dropped, so the sender gets the answer instead of a broken connection
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= max) chunks.push(chunk);
  }
  if (size > max) fail(413, 'too_large');
  return Buffer.concat(chunks);
}

export interface PartnerContext {
  db: Db;
  dir: string;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string, detail?: Record<string, string | number>) => never;
  /** A number from the admin panel's settings (the icon's limits, how many other addresses). */
  setting: (key: string) => number;
}

/** The animated icon's limits, from the admin panel ("Lista serwerów"). */
export const ICON_SETTING_DEFAULTS = { bytes: 2 * 1024 * 1024, frames: 64, side: 128 };
/** How many other addresses a partner may have, by default (admin panel: "Lista serwerów"). */
export const ALIASES_DEFAULT = 20;

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function partnerRoutes(ctx: PartnerContext): {
  routes: [string, RegExp, Handler][];
  picture: (id: string) => Promise<{ data: Buffer; type: string } | undefined>;
  icon: (id: string) => Promise<{ data: Buffer; etag: string } | undefined>;
} {
  const { db } = ctx;
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (p: Partner) => path.join(ctx.dir, p.background);
  const iconFileOf = (p: Partner) => path.join(ctx.dir, p.icon);
  /**
   * What the game and the pages see; the pictures' addresses change with them, so they can be kept long.
   * The animated icon is a PNG with the frames stacked top to bottom, `iconSize` pixels square each,
   * shown for `iconDelays` ms each (older mods ignore these fields).
   */
  const view = (p: Partner) => ({
    id: p.id, address: p.address, name: p.name, pinned: p.pinned, rotate: p.rotate,
    background: p.background ? `/v1/partners/${p.id}/background?v=${p.updatedAt}` : null,
    icon: p.icon ? `/v1/partners/${p.id}/icon?v=${p.iconUpdatedAt}` : null,
    iconSize: p.icon ? p.iconSize : 0,
    iconDelays: p.icon ? p.iconDelays : [],
    aliases: p.aliases,
  });
  const iconLimits = () => ({ bytes: ctx.setting('partners.iconBytes'), frames: ctx.setting('partners.iconFrames'), side: ctx.setting('partners.iconSide') });
  const withOwner = (p: Partner) => ({ ...view(p), owner: p.owner ? db.user(p.owner)?.handle ?? '' : '' });
  const partnerOr404 = (id: string) => db.partner(id) ?? ctx.fail(404, 'not_found');

  async function setPicture(req: http.IncomingMessage, p: Partner, who: string) {
    const data = await rawBody(req, ctx.fail);
    const kind = pictureType(data);
    if (!kind) ctx.fail(400, 'bad_picture');
    const name = `${p.id}-${Date.now()}.${kind}`;
    await writeFile(path.join(ctx.dir, name), data);
    if (p.background) await rm(fileOf(p), { force: true });
    db.setPartnerBackground(p.id, name);
    db.log(who, 'partner_background', p.address);
    return withOwner(db.partner(p.id)!);
  }

  async function clearPicture(p: Partner, who: string) {
    if (p.background) await rm(fileOf(p), { force: true });
    db.setPartnerBackground(p.id, '');
    db.log(who, 'partner_background', p.address, '—');
    return withOwner(db.partner(p.id)!);
  }

  /** Turns the upload into the sprite sheet once, so neither the mod nor the pages decode GIFs. */
  async function setIcon(req: http.IncomingMessage, p: Partner, who: string) {
    const limits = iconLimits();
    const data = await rawBody(req, ctx.fail, limits.bytes);
    let made: Icon;
    try {
      made = makeIcon(data, limits);
    } catch (e) {
      if (e instanceof IconError) ctx.fail(400, e.message);
      throw e;
    }
    const name = `${p.id}-icon-${Date.now()}.png`;
    await writeFile(path.join(ctx.dir, name), made!.png);
    if (p.icon) await rm(iconFileOf(p), { force: true });
    db.setPartnerIcon(p.id, name, made!.size, made!.delays);
    db.log(who, 'partner_icon', p.address);
    return withOwner(db.partner(p.id)!);
  }

  async function clearIcon(p: Partner, who: string) {
    if (p.icon) await rm(iconFileOf(p), { force: true });
    db.setPartnerIcon(p.id, '', 0, []);
    db.log(who, 'partner_icon', p.address, '—');
    return withOwner(db.partner(p.id)!);
  }

  /** Only the server's owner (a partner account) may change its pictures from the account page. */
  const ownedBy = (req: http.IncomingMessage, id: string) => {
    const me = ctx.authed(req);
    const p = partnerOr404(id);
    if (p.owner !== me) ctx.fail(403, 'not_owner');
    return { me, p };
  };

  /** The partner (other than `except`) that already claims this address, as its own or as another of its addresses. */
  const claimedBy = (address: string, except?: string) =>
    db.partners().find((q) => q.id !== except && (q.address === address || q.aliases.includes(address)));

  /**
   * The admin's list of other addresses (an array, or one per line): each one checked and normalized,
   * repeats and the partner's own address dropped, none another partner's.
   */
  const aliasesFrom = (raw: unknown, p: Partner): string[] => {
    const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : ctx.fail(400, 'bad_alias');
    const out: string[] = [];
    for (const item of items) {
      if (typeof item !== 'string') ctx.fail(400, 'bad_alias');
      const text = (item as string).trim();
      if (!text) continue;
      if (!ADDRESS.test(text)) ctx.fail(400, 'bad_alias', { alias: text.slice(0, 80) });
      const norm = normalizeAddress(text);
      if (norm === p.address || out.includes(norm)) continue;
      const other = claimedBy(norm, p.id);
      if (other) ctx.fail(409, 'alias_taken', { alias: norm, partner: other.name || other.address });
      out.push(norm);
    }
    const max = ctx.setting('partners.aliases');
    if (out.length > max) ctx.fail(400, 'too_many_aliases', { max });
    return out;
  };

  const ownerFrom = (handle: unknown): string => {
    if (typeof handle !== 'string' || !handle.trim()) return '';
    return db.userByHandle(handle.trim().replace(/^@/, ''))?.id ?? ctx.fail(404, 'no_such_user');
  };

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/partners$/, () => ({ partners: db.partners().map(view) })],

    // -- the admin --
    ['GET', /^\/v1\/admin\/partners$/, (req) => {
      ctx.admin(req);
      return { partners: db.partners().map(withOwner), iconLimits: iconLimits() };
    }],
    ['POST', /^\/v1\/admin\/partners$/, async (req) => {
      const me = ctx.admin(req);
      const { address, name, owner } = await ctx.body(req);
      if (typeof address !== 'string' || !ADDRESS.test(address.trim())) ctx.fail(400, 'bad_server');
      const norm = normalizeAddress(address);
      if (db.partnerByAddress(norm)) ctx.fail(409, 'exists');
      const other = claimedBy(norm);
      if (other) ctx.fail(409, 'alias_taken', { alias: norm, partner: other.name || other.address });
      const id = randomBytes(6).toString('hex');
      db.addPartner({ id, address: norm, name: typeof name === 'string' ? name.trim().slice(0, 48) : '', owner: ownerFrom(owner), background: '', pinned: false, rotate: false, updatedAt: Date.now(), icon: '', iconSize: 0, iconDelays: [], iconUpdatedAt: 0, aliases: [] });
      db.log(me, 'partner_add', norm);
      return withOwner(db.partner(id)!);
    }],
    ['POST', /^\/v1\/admin\/partners\/(\w+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const p = partnerOr404(id);
      const { name, owner, pinned, rotate } = await ctx.body(req);
      db.updatePartner(id, typeof name === 'string' ? name.trim().slice(0, 48) : p.name, owner === undefined ? p.owner : ownerFrom(owner));
      if (typeof pinned === 'boolean' || typeof rotate === 'boolean') {
        const pin = typeof pinned === 'boolean' ? pinned : p.pinned;
        // only a pinned server can take turns at the top
        db.setPartnerPinning(id, pin, pin && (typeof rotate === 'boolean' ? rotate : p.rotate));
      }
      db.log(me, 'partner_edit', p.address);
      return withOwner(db.partner(id)!);
    }],
    // other addresses only the admin sets: each one claims an address for the partner in every player's list
    ['PUT', /^\/v1\/admin\/partners\/(\w+)\/aliases$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const p = partnerOr404(id);
      const aliases = aliasesFrom((await ctx.body(req)).aliases, p);
      db.setPartnerAliases(id, aliases);
      db.log(me, 'partner_aliases', p.address, aliases.join(', ') || '—');
      return withOwner(db.partner(id)!);
    }],
    ['DELETE', /^\/v1\/admin\/partners\/(\w+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const p = partnerOr404(id);
      if (p.background) await rm(fileOf(p), { force: true });
      if (p.icon) await rm(iconFileOf(p), { force: true });
      db.removePartner(id);
      db.log(me, 'partner_remove', p.address);
      return { ok: true };
    }],
    ['PUT', /^\/v1\/admin\/partners\/(\w+)\/background$/, (req, [id]) => setPicture(req, partnerOr404(id), ctx.admin(req))],
    ['DELETE', /^\/v1\/admin\/partners\/(\w+)\/background$/, (req, [id]) => clearPicture(partnerOr404(id), ctx.admin(req))],
    ['PUT', /^\/v1\/admin\/partners\/(\w+)\/icon$/, (req, [id]) => setIcon(req, partnerOr404(id), ctx.admin(req))],
    ['DELETE', /^\/v1\/admin\/partners\/(\w+)\/icon$/, (req, [id]) => clearIcon(partnerOr404(id), ctx.admin(req))],

    // -- the server's owner (a partner account) --
    ['GET', /^\/v1\/me\/partners$/, (req) => {
      const me = ctx.authed(req);
      return { partners: db.partners().filter((p) => p.owner === me).map(withOwner), iconLimits: iconLimits() };
    }],
    ['PUT', /^\/v1\/me\/partners\/(\w+)\/background$/, (req, [id]) => {
      const me = ctx.authed(req);
      const p = partnerOr404(id);
      if (p.owner !== me) ctx.fail(403, 'not_owner');
      return setPicture(req, p, me);
    }],
    ['DELETE', /^\/v1\/me\/partners\/(\w+)\/background$/, (req, [id]) => {
      const me = ctx.authed(req);
      const p = partnerOr404(id);
      if (p.owner !== me) ctx.fail(403, 'not_owner');
      return clearPicture(p, me);
    }],
    ['PUT', /^\/v1\/me\/partners\/(\w+)\/icon$/, (req, [id]) => {
      const { me, p } = ownedBy(req, id);
      return setIcon(req, p, me);
    }],
    ['DELETE', /^\/v1\/me\/partners\/(\w+)\/icon$/, (req, [id]) => {
      const { me, p } = ownedBy(req, id);
      return clearIcon(p, me);
    }],
  ];

  async function picture(id: string) {
    const p = db.partner(id);
    if (!p?.background) return undefined;
    const data = await readFile(fileOf(p)).catch(() => undefined);
    return data && { data, type: TYPES[path.extname(p.background).slice(1)] ?? 'application/octet-stream' };
  }

  /**
   * The sprite sheet with a strong ETag (its hash), so the game asks again cheaply and gets a 304. Every
   * game asks for it, so it is read and hashed once per version of the icon, not on every request.
   */
  const icons = new Map<string, { version: string; data: Buffer; etag: string }>();
  async function icon(id: string) {
    const p = db.partner(id);
    if (!p?.icon) return undefined;
    const version = `${p.icon}:${p.iconUpdatedAt}`;
    const kept = icons.get(id);
    if (kept?.version === version) return kept;
    const data = await readFile(iconFileOf(p)).catch(() => undefined);
    if (!data) return undefined;
    const found = { version, data, etag: `"${createHash('sha256').update(data).digest('hex').slice(0, 32)}"` };
    icons.set(id, found);
    return found;
  }

  return { routes, picture, icon };
}
