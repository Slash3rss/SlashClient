import type http from 'node:http';
import type { Db, User } from './db.ts';
import { ITEMS, SLOTS, mayWear, type Slot } from './cosmetics.ts';
import { collectRows, restoreRows, type Rows } from './adminAccountData.ts';

/**
 * Managing one account from the admin panel's "Konta" tab, so nobody edits the database by hand:
 * its name, nick, avatar and what it wears; its ways to sign in; its sessions and phones; its own
 * admin log; a copy of its data (GDPR); and deleting it with a snapshot kept for a while, so a
 * deletion can be undone (the "Usunięte konta" list). Bans with a reason and an end are in admin.ts.
 */

/** A nick as accounts get them when they start (Db.freeHandle): letters, digits, _ and dots. */
export const HANDLE = /^[A-Za-z0-9_.]{1,24}$/;
/** The longest name shown next to the nick. */
const MAX_NAME = 32;

export interface AccountContext {
  db: Db;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string, detail?: Record<string, string | number>) => never;
  /** Handles that are admins by configuration: their nick stays, nobody gets theirs, and they cannot be deleted. */
  configAdmins: Set<string>;
  /** Ends every live connection of an account. */
  kick: (userId: string) => void;
  /** Ends the live connections signed in with one session. */
  closeSession: (tokenHash: string) => void;
  /** What a player wears changed (the game is told). */
  cosmeticsChanged: (userId: string) => void;
  /** The name, nick, avatar or shown server changed: friends' lists and the player's own launcher are told. */
  profileChanged: (userId: string) => void;
  /** The ranks a player holds (for rank items) and their supporter level, as POST /v1/me checks them. */
  badge: (u: User) => string | readonly string[];
  supporterLevel: (userId: string) => number;
  /** The phones that get the account's notifications (push.ts). */
  phones?: { of: (uuid: string) => { id: string; label: string; lang: string; createdAt: number; usedAt: number }[]; remove: (id: string) => void };
  /** Files the account left (chat pictures, shared profiles and logs, screenshots, cloud profiles): removed after the rows. */
  removeFiles?: (userId: string) => Promise<void>;
  /** How many days a deleted account can be restored (the admin panel's setting). */
  keepDays: () => number;
  now?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

export function createAccountAdmin(ctx: AccountContext) {
  const { db } = ctx;
  const sql = db.sql;
  const now = () => ctx.now?.() ?? Date.now();
  const userOr404 = (id: string) => db.user(id) ?? ctx.fail(404, 'not_found');
  const isConfig = (u: { handle: string }) => ctx.configAdmins.has(u.handle.toLowerCase());

  /** What a player may wear in each slot now: owned, free, their rank's or their tier's (the same check as POST /v1/me). */
  function wearable(u: User): { id: string; name: string; slot: Slot }[] {
    const settings = db.cosmeticSettings();
    const granted = db.grants(u.id);
    const badge = ctx.badge(u);
    const level = ctx.supporterLevel(u.id);
    return ITEMS.filter((i) => mayWear(settings, granted, i.id, i.slot, badge, level)).map((i) => ({ id: i.id, name: i.name, slot: i.slot }));
  }

  /**
   * A set with the panel's changes ({ slot: id }, '' takes it off), each checked like the player's own
   * choice: an admin puts on only what the player owns or may wear, never more. Throws on the first bad one.
   */
  function changedSet(u: User, base: Record<string, string>, changes: unknown): Record<string, string> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) ctx.fail(400, 'bad_request');
    const settings = db.cosmeticSettings();
    const granted = db.grants(u.id);
    const badge = ctx.badge(u);
    const level = ctx.supporterLevel(u.id);
    const next = { ...base };
    for (const [slot, id] of Object.entries(changes as Record<string, unknown>)) {
      if (!SLOTS.includes(slot as Slot) || typeof id !== 'string') ctx.fail(400, 'bad_item');
      if (id === '') delete next[slot];
      else if (mayWear(settings, granted, id, slot as Slot, badge, level)) next[slot] = id;
      else ctx.fail(400, slot === 'cape' ? 'bad_cape' : 'bad_item', { slot, item: id });
    }
    return next;
  }

  /** Everything the drawer shows about an account beyond the list's row. */
  function details(id: string) {
    const u = userOr404(id);
    const choice = db.avatarChoice(id);
    const minecraft = db.minecraftAccounts(id);
    return {
      id, name: u.name, handle: u.handle, formerHandles: db.formerHandles(id), showServer: u.showServer,
      // what is picked: 'provider', the Minecraft account whose face it is, or '' (the first one's)
      avatarSource: choice.source === 'provider' ? 'provider' : choice.source.startsWith('mc:') ? choice.source.slice(3) : '',
      avatars: { provider: choice.provider, minecraft: minecraft.map((m) => ({ uuid: m.uuid, name: m.name })) },
      loadout: { ...u.loadout, ...(u.cape ? { cape: u.cape } : {}) },
      characters: minecraft,
      wearable: wearable(u),
      identities: db.identitiesOf(id).map(({ provider, subject, label }) => ({ provider, subject, label })),
      sessions: db.sessionsOf(id),
      phones: (ctx.phones?.of(id) ?? []).map(({ id: pid, label, lang, createdAt, usedAt }) => ({ id: pid, label, lang, createdAt, usedAt })),
      chatDevices: db.deviceKeyCount(id),
      ban: db.banInfo(id) ?? null,
      log: db.logFor(id, 100),
    };
  }

  /** Recounts the members of these communities (deleting or restoring an account changes them). */
  function recountCommunities(ids: Set<string>) {
    if (!ids.size || !sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'communities'").get()) return;
    const columns = (sql.prepare('PRAGMA table_info(communities)').all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes('member_count')) return;
    for (const c of ids) sql.prepare('UPDATE communities SET member_count = (SELECT COUNT(*) FROM community_members WHERE community_id = ?) WHERE id = ?').run(c, c);
  }

  /**
   * Deletes an account: a snapshot of its rows first (deleted_accounts, restorable for keepDays), then
   * the account with everything that hangs on it, then the files it left. Clans, groups and communities
   * it owned pass to their longest-standing member the next time anyone looks at them (clans.ts,
   * groups.ts, communities.ts), as when an account is gone for any other reason.
   */
  async function remove(id: string, by: string) {
    const u = userOr404(id);
    const rows = collectRows(sql, id, 'snapshot');
    const communities = new Set((rows.community_members ?? []).map((r) => String(r.community_id)));
    ctx.kick(id);
    sql.exec('BEGIN IMMEDIATE');
    try {
      sql.prepare('INSERT INTO deleted_accounts (uuid, handle, name, data, deleted_at, by_uuid) VALUES (?, ?, ?, ?, ?, ?)').run(id, u.handle, u.name, JSON.stringify(rows), now(), by);
      db.deleteUser(id);
      sql.exec('COMMIT');
    } catch (err) {
      sql.exec('ROLLBACK');
      throw err;
    }
    recountCommunities(communities);
    db.log(by, 'delete', u.handle, u.name, id);
    await ctx.removeFiles?.(id).catch((err) => console.error('usuwanie konta, pliki:', (err as Error).message));
  }

  type DeletedRow = { id: number; uuid: string; handle: string; name: string; data: string; deleted_at: number; by_uuid: string };
  const deletedRow = (id: string) => sql.prepare('SELECT * FROM deleted_accounts WHERE id = ?').get(Number(id)) as DeletedRow | undefined;

  /** Puts a deleted account back as it was, unless its nick or a way to sign in is someone else's now. */
  function restore(row: DeletedRow, by: string) {
    const rows = JSON.parse(row.data) as Rows;
    if (db.user(row.uuid)) ctx.fail(409, 'exists');
    const handle = String(rows.users?.[0]?.handle ?? row.handle);
    if (db.handleTaken(handle)) ctx.fail(409, 'handle_taken', { handle });
    for (const i of rows.identities ?? []) {
      const owner = db.owner(i.provider as never, String(i.subject));
      if (owner && owner !== row.uuid) ctx.fail(409, 'identity_taken', { provider: String(i.provider), label: String(i.label || i.subject), handle: db.user(owner)?.handle ?? '' });
    }
    let result: { restored: number; skipped: number };
    sql.exec('BEGIN IMMEDIATE');
    try {
      result = restoreRows(sql, rows);
      // a clan or community that passed to someone else meanwhile keeps its new owner: the old one comes back one step lower
      sql.prepare("UPDATE clan_members SET role = 'officer' WHERE uuid = ? AND role = 'owner' AND clan_id IN (SELECT id FROM clans WHERE owner != ?)").run(row.uuid, row.uuid);
      if (rows.community_members) {
        sql.prepare("UPDATE community_members SET role = 'admin' WHERE uuid = ? AND role = 'owner' AND community_id IN (SELECT id FROM communities WHERE owner != ?)").run(row.uuid, row.uuid);
      }
      sql.prepare('DELETE FROM deleted_accounts WHERE id = ?').run(row.id);
      sql.exec('COMMIT');
    } catch (err) {
      sql.exec('ROLLBACK');
      throw err;
    }
    recountCommunities(new Set((rows.community_members ?? []).map((r) => String(r.community_id))));
    db.log(by, 'restore', handle, `${result.restored} wierszy${result.skipped ? `, pominięto ${result.skipped}` : ''}`, row.uuid);
    ctx.cosmeticsChanged(row.uuid);
    ctx.profileChanged(row.uuid);
    return result;
  }

  /** Once a minute: bans past their end are lifted (written in the log), old snapshots of deleted accounts go. */
  function tick(at = now()) {
    for (const u of db.liftExpiredBans(at)) {
      db.log('', 'unban_auto', u.handle, '', u.id);
      ctx.cosmeticsChanged(u.id);
    }
    sql.prepare('DELETE FROM deleted_accounts WHERE deleted_at < ?').run(at - ctx.keepDays() * 86_400_000);
  }

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/admin\/users\/([\w-]+)\/account$/, (req, [id]) => {
      ctx.admin(req);
      return details(id);
    }],
    // { name?, handle?, showServer?, avatarSource?, loadout? } for the account; { character, loadout? | own: false } for one Minecraft account
    ['POST', /^\/v1\/admin\/users\/([\w-]+)\/account$/, async (req, [id]) => {
      const me = ctx.admin(req);
      const u = userOr404(id);
      const { name, handle, showServer, avatarSource, loadout, character, own } = await ctx.body(req);
      // everything is checked before anything is saved
      let nextName: string | undefined;
      if (name !== undefined) {
        nextName = typeof name === 'string' ? name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
        if (!nextName || [...nextName].length > MAX_NAME) ctx.fail(400, 'bad_name');
      }
      let nextHandle: string | undefined;
      if (handle !== undefined) {
        nextHandle = typeof handle === 'string' ? handle.trim().replace(/^@/, '') : '';
        if (!HANDLE.test(nextHandle)) ctx.fail(400, 'bad_handle');
        if (nextHandle !== u.handle) {
          // an admin from ADMIN_HANDLES is one by the nick: theirs stays, and nobody else gets admin by taking one
          if (isConfig(u)) ctx.fail(400, 'config_admin');
          if (ctx.configAdmins.has(nextHandle.toLowerCase())) ctx.fail(409, 'handle_reserved');
          if (db.handleTaken(nextHandle, id)) ctx.fail(409, 'handle_taken', { handle: nextHandle });
        }
      }
      let source: string | undefined;
      if (avatarSource !== undefined) {
        const mc = typeof avatarSource === 'string' ? avatarSource.toLowerCase().replace(/-/g, '') : '';
        if (avatarSource === 'provider') source = 'provider';
        else if (avatarSource === '' || avatarSource === 'minecraft') source = '';
        else if (db.minecraftAccounts(id).some((m) => m.uuid === mc)) source = `mc:${mc}`;
        else ctx.fail(400, 'bad_avatar');
      }
      if (showServer !== undefined && typeof showServer !== 'boolean') ctx.fail(400, 'bad_request');
      let subject: string | undefined;
      let characterSet: Record<string, string> | null | undefined;
      let accountSet: Record<string, string> | undefined;
      if (character !== undefined) {
        subject = typeof character === 'string' ? character.toLowerCase().replace(/-/g, '') : '';
        if (!db.minecraftAccounts(id).some((m) => m.uuid === subject)) ctx.fail(404, 'not_linked');
        characterSet = own === false ? null : changedSet(u, db.characterLoadout(id, subject) ?? { ...u.loadout, ...(u.cape ? { cape: u.cape } : {}) }, loadout ?? {});
      } else if (loadout !== undefined) {
        accountSet = changedSet(u, { ...u.loadout, ...(u.cape ? { cape: u.cape } : {}) }, loadout);
      }

      const changes: string[] = [];
      if (nextName !== undefined && nextName !== u.name) {
        db.setName(id, nextName);
        changes.push(`nazwa: ${u.name} → ${nextName}`);
      }
      if (nextHandle !== undefined && nextHandle !== u.handle) {
        db.setHandle(id, nextHandle, now());
        changes.push(`nick: @${u.handle} → @${nextHandle}`);
      }
      if (source !== undefined && source !== db.avatarChoice(id).source) {
        db.setAvatarSource(id, source);
        changes.push(`awatar: ${source === 'provider' ? 'z logowania' : source ? `Minecraft ${db.minecraftAccounts(id).find((m) => `mc:${m.uuid}` === source)?.name ?? ''}` : 'domyślny'}`);
      }
      if (typeof showServer === 'boolean' && showServer !== u.showServer) {
        db.setShowServer(id, showServer);
        changes.push(showServer ? 'serwer widoczny' : 'serwer ukryty');
      }
      if (changes.length) {
        db.log(me, 'account_edit', nextHandle ?? u.handle, changes.join(', '), id);
        ctx.profileChanged(id);
      }
      const describe = (set: Record<string, string> | null) => (set ? Object.entries(set).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nic' : 'jak konto');
      if (subject !== undefined && characterSet !== undefined) {
        db.setCharacterLoadout(id, subject, characterSet);
        db.log(me, 'set_loadout', db.user(id)!.handle, `${db.minecraftAccounts(id).find((m) => m.uuid === subject)?.name ?? subject}: ${describe(characterSet)}`, id);
        ctx.cosmeticsChanged(id);
      }
      if (accountSet) {
        const { cape = '', ...rest } = accountSet;
        db.setCape(id, cape);
        db.setLoadout(id, rest);
        db.log(me, 'set_loadout', db.user(id)!.handle, describe(accountSet), id);
        ctx.cosmeticsChanged(id);
      }
      return details(id);
    }],
    // one way to sign in less; never the last one (the account could not be opened any more)
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)\/identities\/(\w+)\/([^/]+)$/, (req, [id, provider, rawSubject]) => {
      const me = ctx.admin(req);
      const u = userOr404(id);
      if (id === me) ctx.fail(400, 'self');
      if (isConfig(u)) ctx.fail(400, 'config_admin');
      const subject = decodeURIComponent(rawSubject);
      const found = db.identitiesOf(id).find((i) => i.provider === provider && i.subject === subject) ?? ctx.fail(404, 'not_found');
      if (db.identityCount(id) < 2) ctx.fail(400, 'last_provider');
      db.unlinkIdentity(id, provider as never, subject);
      db.log(me, 'unlink', u.handle, `${provider}${found.label ? `: ${found.label}` : ''}`, id);
      if (provider === 'minecraft') ctx.cosmeticsChanged(id);
      ctx.profileChanged(id);
      return details(id);
    }],
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)\/sessions\/(\d{1,15})$/, (req, [id, sid]) => {
      const me = ctx.admin(req);
      const u = userOr404(id);
      const hash = db.removeSessionById(id, Number(sid)) ?? ctx.fail(404, 'not_found');
      ctx.closeSession(hash);
      db.log(me, 'session_revoke', u.handle, '', id);
      return details(id);
    }],
    ['DELETE', /^\/v1\/admin\/users\/([\w-]+)\/phones\/([\w-]{1,32})$/, (req, [id, pid]) => {
      const me = ctx.admin(req);
      const u = userOr404(id);
      const phone = ctx.phones?.of(id).find((p) => p.id === pid) ?? ctx.fail(404, 'not_found');
      ctx.phones!.remove(phone.id);
      db.log(me, 'push_revoke', u.handle, phone.label, id);
      return details(id);
    }],
    // a copy of everything the account has here (GDPR art. 15 and 20), without secrets and message contents
    ['GET', /^\/v1\/admin\/users\/([\w-]+)\/export$/, (req, [id]) => {
      const me = ctx.admin(req);
      const u = userOr404(id);
      const tables = collectRows(sql, id, 'export');
      db.log(me, 'export', u.handle, '', id);
      return {
        format: 'slashclient-account-export', version: 1, exportedAt: now(), account: { id, handle: u.handle, name: u.name },
        note: 'Treści wiadomości są zaszyfrowane lub należą też do rozmówców: eksport ma tylko ich metadane. Bez tokenów sesji, kluczy i adresów powiadomień.',
        tables,
      };
    }],

    // -- deleted accounts, restorable for a while --
    ['GET', /^\/v1\/admin\/deleted-accounts$/, (req) => {
      ctx.admin(req);
      const days = ctx.keepDays();
      const rows = sql.prepare(`SELECT d.id, d.uuid, d.handle, d.name, d.deleted_at AS deletedAt, d.by_uuid AS by, u.handle AS byHandle, length(d.data) AS size
        FROM deleted_accounts d LEFT JOIN users u ON u.uuid = d.by_uuid ORDER BY d.deleted_at DESC LIMIT 200`).all() as { deletedAt: number }[];
      return { days, accounts: rows.map((r) => ({ ...r, expiresAt: r.deletedAt + days * 86_400_000 })) };
    }],
    ['POST', /^\/v1\/admin\/deleted-accounts\/(\d{1,15})\/restore$/, (req, [rid]) => {
      const me = ctx.admin(req);
      const row = deletedRow(rid) ?? ctx.fail(404, 'not_found');
      const result = restore(row, me);
      return { ok: true, id: row.uuid, ...result };
    }],
    // gone for good now, without waiting for the end of its time
    ['DELETE', /^\/v1\/admin\/deleted-accounts\/(\d{1,15})$/, (req, [rid]) => {
      const me = ctx.admin(req);
      const row = deletedRow(rid) ?? ctx.fail(404, 'not_found');
      sql.prepare('DELETE FROM deleted_accounts WHERE id = ?').run(row.id);
      db.log(me, 'deleted_purge', row.handle, row.name, row.uuid);
      return { ok: true };
    }],
  ];

  return { routes, remove, tick, details };
}
