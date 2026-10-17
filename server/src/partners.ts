import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { Db } from './db.ts';

/**
 * Partner servers: an address (as players type it) with a background picture that SlashClient HUD
 * draws behind that server in the game's server list. The admin adds them; a partner account set as
 * the owner may change the picture itself. Pictures are files next to the database.
 */

export interface Partner { id: string; address: string; name: string; owner: string; background: string; updatedAt: number }

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

async function rawBody(req: http.IncomingMessage, fail: (status: number, code: string) => never): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  // the rest of a too big upload is read and dropped, so the sender gets the answer instead of a broken connection
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_PICTURE) chunks.push(chunk);
  }
  if (size > MAX_PICTURE) fail(413, 'too_large');
  return Buffer.concat(chunks);
}

export interface PartnerContext {
  db: Db;
  dir: string;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string) => never;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function partnerRoutes(ctx: PartnerContext): { routes: [string, RegExp, Handler][]; picture: (id: string) => Promise<{ data: Buffer; type: string } | undefined> } {
  const { db } = ctx;
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (p: Partner) => path.join(ctx.dir, p.background);
  /** What the game and the pages see; the picture's address changes with it, so it can be kept long. */
  const view = (p: Partner) => ({
    id: p.id, address: p.address, name: p.name,
    background: p.background ? `/v1/partners/${p.id}/background?v=${p.updatedAt}` : null,
  });
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

  const ownerFrom = (handle: unknown): string => {
    if (typeof handle !== 'string' || !handle.trim()) return '';
    return db.userByHandle(handle.trim().replace(/^@/, ''))?.id ?? ctx.fail(404, 'no_such_user');
  };

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/partners$/, () => ({ partners: db.partners().map(view) })],

    // -- the admin --
    ['GET', /^\/v1\/admin\/partners$/, (req) => {
      ctx.admin(req);
      return { partners: db.partners().map(withOwner) };
    }],
    ['POST', /^\/v1\/admin\/partners$/, async (req) => {
      const me = ctx.admin(req);
      const { address, name, owner } = await ctx.body(req);
      if (typeof address !== 'string' || !ADDRESS.test(address.trim())) ctx.fail(400, 'bad_server');
      const norm = normalizeAddress(address);
      if (db.partnerByAddress(norm)) ctx.fail(409, 'exists');
      const id = randomBytes(6).toString('hex');
      db.addPartner({ id, address: norm, name: typeof name === 'string' ? name.trim().slice(0, 48) : '', owner: ownerFrom(owner), background: '', updatedAt: Date.now() });
      db.log(me, 'partner_add', norm);
      return withOwner(db.partner(id)!);
    }],
    ['POST', /^\/v1\/admin\/partners\/(\w+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const p = partnerOr404(id);
      const { name, owner } = await ctx.body(req);
      db.updatePartner(id, typeof name === 'string' ? name.trim().slice(0, 48) : p.name, owner === undefined ? p.owner : ownerFrom(owner));
      db.log(me, 'partner_edit', p.address);
      return withOwner(db.partner(id)!);
    }],
    ['DELETE', /^\/v1\/admin\/partners\/(\w+)$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const p = partnerOr404(id);
      if (p.background) await rm(fileOf(p), { force: true });
      db.removePartner(id);
      db.log(me, 'partner_remove', p.address);
      return { ok: true };
    }],
    ['PUT', /^\/v1\/admin\/partners\/(\w+)\/background$/, (req, [id]) => setPicture(req, partnerOr404(id), ctx.admin(req))],
    ['DELETE', /^\/v1\/admin\/partners\/(\w+)\/background$/, (req, [id]) => clearPicture(partnerOr404(id), ctx.admin(req))],

    // -- the server's owner (a partner account) --
    ['GET', /^\/v1\/me\/partners$/, (req) => {
      const me = ctx.authed(req);
      return { partners: db.partners().filter((p) => p.owner === me).map(withOwner) };
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
  ];

  async function picture(id: string) {
    const p = db.partner(id);
    if (!p?.background) return undefined;
    const data = await readFile(fileOf(p)).catch(() => undefined);
    return data && { data, type: TYPES[path.extname(p.background).slice(1)] ?? 'application/octet-stream' };
  }

  return { routes, picture };
}
