import { randomBytes } from 'node:crypto';
import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Db, Person } from './db.ts';
import { EDIT_WINDOW_MS, editRefusal } from './chatLimits.ts';
import { withDefaults } from './settings.ts';

/**
 * Group chats: one conversation with several friends at once, and a clan's own chat (clans.ts
 * keeps that one's members in step with the clan).
 *
 * Messages are end-to-end encrypted by the launchers the same way as direct ones (chatCrypto.ts):
 * each message gets a fresh key, wrapped for the current members' launchers. The server only hands
 * out who is in the group and their public keys (`/keys`), and stores the envelope. Someone added
 * later cannot read what was written before; someone who left is not in the next message's keys.
 *
 * What happened in the group (created, added, left, renamed) is a message too, with `event` and
 * no text, so every launcher and HUD shows the same history. Changes are pushed as `groups`
 * (fetch the list again), new messages as `group-message`.
 *
 * The author may edit a text message for a while (encrypted again for the members of now) and delete
 * their messages; the group's owner (in a clan's chat its owner and officers) may delete others'.
 * Pushed as `group-message-edit` / `group-message-delete` to those who see the message (0.9.23+).
 */

/** Members of a group chat, the creator included. */
export const GROUP_SIZE = 16;
/** A clan's chat holds the whole clan. */
export const CLAN_CHAT_SIZE = 50;
export const MAX_GROUPS = 30;
const MAX_NAME = 32;
const MAX_MESSAGE = 2000;
/** An encrypted message: the text plus the message key wrapped for up to KEYS_PER_MEMBER launchers of every member. */
const MAX_ENCRYPTED = 64_000;
/** Launchers per member a message is encrypted for: their most recently used ones. */
export const KEYS_PER_MEMBER = 4;
/** Request bodies here may carry such a message (the usual limit is 16 KB). */
const MAX_BODY = 80_000;

/** What happened, as a message: who did it and to whom (names as they were then), or the new name. */
/** A clan chat also says who was made an officer (promoted), a member again (demoted), who got the clan (owner) or took it over when the owner's account went (heir). */
/** And who changed the clan's logo (logo; `removed` when it was taken off). */
export interface GroupEvent { kind: 'created' | 'added' | 'removed' | 'left' | 'renamed' | 'joined' | 'promoted' | 'demoted' | 'owner' | 'heir' | 'logo'; by: string; users?: string[]; name?: string; removed?: boolean }
/** `editedAt`: when the author last changed the text; `deleted`: taken back by the author or a moderator, no text left (server 0.9.23+). */
export interface GroupMessage { id: number; group: string; from: string; text: string; at: number; event?: GroupEvent; editedAt?: number; deleted?: true }
type GroupMessageRow = Omit<GroupMessage, 'event' | 'editedAt' | 'deleted'> & { event: string | null; editedAt: number | null; deletedAt: number | null };
const GROUP_MESSAGE_COLUMNS = 'id, group_id AS "group", from_uuid AS "from", text, event, created_at AS at, edited_at AS editedAt, deleted_at AS deletedAt';
const toGroupMessage = ({ event, editedAt, deletedAt, ...m }: GroupMessageRow): GroupMessage => (deletedAt ? { ...m, text: '', deleted: true }
  : { ...m, ...(event ? { event: JSON.parse(event) as GroupEvent } : {}), ...(editedAt ? { editedAt } : {}) });
export interface GroupMember extends Person { joinedAt: number }
export interface GroupView {
  id: string; name: string; owner: string; createdAt: number;
  /** a clan's chat: its tag (clans.ts manages the members), and its logo's version when it has one */
  clan?: { id: string; tag: string; logo?: number };
  members: GroupMember[]; unread: number; lastMessageAt: number;
}

/** A group's name from a request, or undefined when it is empty, too long or has control characters. */
export function cleanGroupName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().replace(/\s+/g, ' ');
  return name && name.length <= MAX_NAME && !/[\u0000-\u001f\u007f]/.test(name) ? name : undefined;
}

export class GroupStore {
  private sql: DatabaseSync;
  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS chat_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, clan TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chat_group_members (group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, joined_at INTEGER NOT NULL, read_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, uuid));
CREATE INDEX IF NOT EXISTS chat_group_members_user ON chat_group_members(uuid);
CREATE TABLE IF NOT EXISTS chat_group_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE, from_uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, text TEXT NOT NULL, event TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_group_messages_group ON chat_group_messages(group_id, id);
`);
    // where a member's history starts: what was written before they came is not theirs
    const columns = sql.prepare('PRAGMA table_info(chat_group_members)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'since_id')) sql.exec('ALTER TABLE chat_group_members ADD COLUMN since_id INTEGER NOT NULL DEFAULT 0');
    // edited and deleted messages (chatLimits.ts): only the latest text is kept, a deleted one keeps none
    const messageColumns = sql.prepare('PRAGMA table_info(chat_group_messages)').all() as { name: string }[];
    if (!messageColumns.some((c) => c.name === 'edited_at')) sql.exec('ALTER TABLE chat_group_messages ADD COLUMN edited_at INTEGER');
    if (!messageColumns.some((c) => c.name === 'deleted_at')) sql.exec('ALTER TABLE chat_group_messages ADD COLUMN deleted_at INTEGER');
  }

  create(name: string, owner: string, members: string[], clan = ''): string {
    const id = randomBytes(9).toString('base64url');
    const now = Date.now();
    this.sql.prepare('INSERT INTO chat_groups (id, name, owner, clan, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, owner, clan, now);
    for (const m of new Set([owner, ...members])) this.addMember(id, m);
    return id;
  }

  group(id: string): { id: string; name: string; owner: string; clan: string; createdAt: number } | undefined {
    return this.sql.prepare('SELECT id, name, owner, clan, created_at AS createdAt FROM chat_groups WHERE id = ?').get(id) as never;
  }

  remove(id: string) {
    this.sql.prepare('DELETE FROM chat_groups WHERE id = ?').run(id);
  }

  rename(id: string, name: string) {
    this.sql.prepare('UPDATE chat_groups SET name = ? WHERE id = ?').run(name, id);
  }

  setOwner(id: string, owner: string) {
    this.sql.prepare('UPDATE chat_groups SET owner = ? WHERE id = ?').run(owner, id);
  }

  /** A new member reads from now on: what came before counts as read. */
  addMember(id: string, uuid: string) {
    const last = (this.sql.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM chat_group_messages WHERE group_id = ?').get(id) as { n: number }).n;
    this.sql.prepare('INSERT OR IGNORE INTO chat_group_members (group_id, uuid, joined_at, read_id, since_id) VALUES (?, ?, ?, ?, ?)').run(id, uuid, Date.now(), last, last);
  }

  removeMember(id: string, uuid: string): boolean {
    return Number(this.sql.prepare('DELETE FROM chat_group_members WHERE group_id = ? AND uuid = ?').run(id, uuid).changes) > 0;
  }

  isMember(id: string, uuid: string): boolean {
    return !!this.sql.prepare('SELECT 1 FROM chat_group_members WHERE group_id = ? AND uuid = ?').get(id, uuid);
  }

  /** Members, longest-standing first. */
  memberIds(id: string): string[] {
    return (this.sql.prepare('SELECT uuid FROM chat_group_members WHERE group_id = ? ORDER BY joined_at, rowid').all(id) as { uuid: string }[]).map((r) => r.uuid);
  }

  members(id: string): { uuid: string; joinedAt: number }[] {
    return this.sql.prepare('SELECT uuid, joined_at AS joinedAt FROM chat_group_members WHERE group_id = ? ORDER BY joined_at, rowid').all(id) as never;
  }

  /** The groups a player is in (clan chats too), the newest conversation first. */
  groupsOf(uuid: string): string[] {
    return (this.sql.prepare(`SELECT g.id FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.uuid = ?
      ORDER BY COALESCE((SELECT MAX(created_at) FROM chat_group_messages x WHERE x.group_id = g.id), g.created_at) DESC`).all(uuid) as { id: string }[]).map((r) => r.id);
  }

  /** Plain groups a player is in (not clan chats), for the limit. */
  countOwnGroups(uuid: string): number {
    return (this.sql.prepare("SELECT COUNT(*) AS n FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.uuid = ? AND g.clan = ''").get(uuid) as { n: number }).n;
  }

  addMessage(group: string, from: string, text: string, event?: GroupEvent): GroupMessage {
    const at = Date.now();
    const { lastInsertRowid } = this.sql.prepare('INSERT INTO chat_group_messages (group_id, from_uuid, text, event, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(group, from, text, event ? JSON.stringify(event) : null, at);
    const id = Number(lastInsertRowid);
    // what one writes oneself is read
    this.sql.prepare('UPDATE chat_group_members SET read_id = ? WHERE group_id = ? AND uuid = ? AND read_id < ?').run(id, group, from, id);
    return { id, group, from, text, at, ...(event ? { event } : {}) };
  }

  /** What `reader` may see since they came, newest last; `before` pages back by message id. */
  messages(group: string, reader: string, limit: number, before?: number): GroupMessage[] {
    const since = (this.sql.prepare('SELECT since_id AS n FROM chat_group_members WHERE group_id = ? AND uuid = ?').get(group, reader) as { n: number } | undefined)?.n ?? 0;
    const rows = this.sql.prepare(`SELECT ${GROUP_MESSAGE_COLUMNS} FROM chat_group_messages
      WHERE group_id = ? AND id < ? AND id > ? ORDER BY id DESC LIMIT ?`).all(group, before ?? Number.MAX_SAFE_INTEGER, since, limit) as unknown as GroupMessageRow[];
    return rows.reverse().map(toGroupMessage);
  }

  /** One message of the group, or undefined. */
  message(group: string, id: number): GroupMessage | undefined {
    const row = this.sql.prepare(`SELECT ${GROUP_MESSAGE_COLUMNS} FROM chat_group_messages WHERE group_id = ? AND id = ?`).get(group, id) as unknown as GroupMessageRow | undefined;
    return row && toGroupMessage(row);
  }

  /** The author's new text; the old one is not kept. */
  editMessage(id: number, text: string, at = Date.now()) {
    this.sql.prepare('UPDATE chat_group_messages SET text = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL').run(text, at, id);
    // keys handed over for the old text cannot open the new one (chatKeys.ts)
    this.sql.prepare("DELETE FROM chat_wraps WHERE kind = 'g' AND msg = ? AND field = 'text'").run(id);
  }

  /** Takes a message back: only that there was one stays. */
  deleteMessage(id: number, at = Date.now()) {
    this.sql.prepare("UPDATE chat_group_messages SET text = '', edited_at = NULL, deleted_at = ? WHERE id = ?").run(at, id);
    this.sql.prepare("DELETE FROM chat_wraps WHERE kind = 'g' AND msg = ?").run(id);
  }

  /** Members who see a message (they were there when it came). */
  readersOf(group: string, id: number): string[] {
    return (this.sql.prepare('SELECT uuid FROM chat_group_members WHERE group_id = ? AND since_id < ?').all(group, id) as { uuid: string }[]).map((r) => r.uuid);
  }

  markRead(group: string, uuid: string) {
    this.sql.prepare('UPDATE chat_group_members SET read_id = (SELECT COALESCE(MAX(id), 0) FROM chat_group_messages WHERE group_id = ?) WHERE group_id = ? AND uuid = ?').run(group, group, uuid);
  }

  unread(group: string, uuid: string): number {
    return (this.sql.prepare(`SELECT COUNT(*) AS n FROM chat_group_messages x JOIN chat_group_members m ON m.group_id = x.group_id AND m.uuid = ?
      WHERE x.group_id = ? AND x.id > m.read_id AND x.from_uuid != ? AND x.event IS NULL AND x.deleted_at IS NULL`).get(uuid, group, uuid) as { n: number }).n;
  }

  lastMessageAt(group: string): number {
    return (this.sql.prepare('SELECT COALESCE(MAX(created_at), 0) AS n FROM chat_group_messages WHERE group_id = ?').get(group) as { n: number }).n;
  }
}

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  push: (userId: string, event: unknown) => void;
  /** One per message, as for direct ones. */
  limitMessages: (key: string) => void;
  /** Creating groups and changing members. */
  limitChanges: (key: string) => void;
  fail: (status: number, code: string) => never;
  /** A clan chat's tag (clans.ts), for the list. */
  clanTag?: (clanId: string) => string | undefined;
  /** A clan's logo version (clans.ts), when it has one. */
  clanLogo?: (clanId: string) => number | undefined;
  /** Pictures in the chat (chatImages.ts), checked and attached like in direct messages. */
  images?: () => {
    forMessage: (from: string, to: string, image: unknown) => { id: string; key: string; size: number } | undefined;
    attach: (image: { id: string; key: string; size: number }, messageId: number) => void;
    decorate: <M extends { id: number }>(messages: M[], group?: string) => M[];
    has: (messageId: number, group?: string) => boolean;
    remove: (messageId: number, group?: string) => Promise<void>;
    /** A group chat went: its pictures go too (0.9.36+). */
    removeChat?: (group: string) => Promise<void>;
  };
  /** Too many messages in a row in one conversation ("g:<id>"): throws (chatLimits.ts). */
  limitBurst?: (user: string, conversation: string) => void;
  /** A message to a real conversation, for the achievements (chatLimits.ts MessageCounter). */
  countMessage?: (user: string) => void;
  /** Someone's role in a clan (clans.ts), for who may delete others' messages in its chat. */
  clanRole?: (clanId: string, uuid: string) => 'owner' | 'officer' | 'member' | undefined;
  /** Edits and deletions (the per-minute limit). */
  limitEdits?: (key: string) => void;
  /** How long a message may be edited now (the admin panel's setting; EDIT_WINDOW_MS by default). */
  editWindowMs?: () => number;
  /** Members of a group and groups a player may make (the admin panel's settings; may be live). */
  limits?: Partial<GroupLimits>;
}

export interface GroupLimits { size: number; maxGroups: number }
export const GROUP_LIMITS: GroupLimits = { size: GROUP_SIZE, maxGroups: MAX_GROUPS };

export function createGroups(deps: Deps) {
  const { db, authed, push, fail } = deps;
  const store = new GroupStore(db.sql);
  const limits = withDefaults(GROUP_LIMITS, deps.limits);
  const editWindow = () => deps.editWindowMs?.() ?? EDIT_WINDOW_MS;

  /** JSON body with room for an encrypted message for a whole clan. */
  async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) fail(413, 'too_large');
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return fail(400, 'bad_request');
    }
  }

  const person = (id: string): Person => {
    const u = db.user(id);
    return { id, handle: u?.handle ?? '', name: u?.name ?? '', avatar: u?.avatar ?? '' };
  };
  const nameOf = (id: string) => db.user(id)?.name || '?';

  /** The group's owner is still a member; if they are gone (account deleted), the longest-standing member takes over. */
  function ownerOf(id: string): string | undefined {
    const g = store.group(id);
    if (!g) return undefined;
    const members = store.memberIds(id);
    if (members.includes(g.owner) || !members.length) return g.owner;
    store.setOwner(id, members[0]);
    return members[0];
  }

  function view(id: string, me: string): GroupView {
    const g = store.group(id)!;
    const tag = g.clan ? deps.clanTag?.(g.clan) : undefined;
    const logo = g.clan ? deps.clanLogo?.(g.clan) : undefined;
    return {
      id: g.id, name: g.name, owner: ownerOf(id) ?? g.owner, createdAt: g.createdAt,
      ...(g.clan ? { clan: { id: g.clan, tag: tag ?? '', ...(logo !== undefined ? { logo } : {}) } } : {}),
      members: store.members(id).map((m) => ({ ...person(m.uuid), joinedAt: m.joinedAt })),
      unread: store.unread(id, me), lastMessageAt: store.lastMessageAt(id),
    };
  }

  /** The group, if `me` is in it; otherwise as if it did not exist. */
  function groupOf(me: string, id: string) {
    const g = store.group(id);
    if (!g || !store.isMember(id, me)) fail(404, 'not_found');
    return g!;
  }
  /** A clan's chat changes with the clan, not here. */
  function plainGroup(me: string, id: string) {
    const g = groupOf(me, id);
    if (g.clan) fail(400, 'clan_chat');
    return g;
  }

  /** Everyone in it (and those just taken out) fetches the list again. */
  function changed(id: string, also: string[] = []) {
    for (const m of new Set([...store.memberIds(id), ...also])) push(m, { type: 'groups', id });
  }

  /**
   * Whose messages `me` may delete besides their own (moderation), by the rules that already say who
   * may take people out: in a group its owner everyone's ('all'); in a clan's chat the owner
   * everyone's, officers those of plain members and of people who left ('members').
   */
  function moderation(id: string, me: string): 'all' | 'members' | undefined {
    const g = store.group(id);
    if (!g) return undefined;
    if (!g.clan) return ownerOf(id) === me ? 'all' : undefined;
    const role = deps.clanRole?.(g.clan, me);
    return role === 'owner' ? 'all' : role === 'officer' ? 'members' : undefined;
  }

  /** An edited text as the send route takes it; an encrypted message stays encrypted. */
  function cleanText(raw: unknown, encryptedBefore: boolean): string {
    if (typeof raw !== 'string' || !raw.trim()) fail(400, 'empty');
    const t = raw as string;
    const encrypted = t.startsWith('e2e1:');
    if (t.length > (encrypted ? MAX_ENCRYPTED : MAX_MESSAGE)) fail(400, 'too_long');
    if ((encrypted && !/^e2e1:[A-Za-z0-9+/=]+$/.test(t)) || (encryptedBefore && !encrypted)) fail(400, 'bad_request');
    return t.trim();
  }

  function post(id: string, message: GroupMessage) {
    for (const m of store.memberIds(id)) push(m, { type: 'group-message', message });
  }

  function event(id: string, by: string, e: Omit<GroupEvent, 'by'>) {
    post(id, store.addMessage(id, by, '', { by: nameOf(by), ...e }));
  }

  /** Friend ids from a request: distinct friends of `me`, not `me`. */
  function friendIds(me: string, raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id))) fail(400, 'bad_request');
    const ids = [...new Set(raw as string[])];
    if (ids.includes(me)) fail(400, 'self');
    if (ids.some((id) => !db.areFriends(me, id))) fail(403, 'not_friends');
    return ids;
  }

  /** Someone leaves (or is taken out): the group goes when it is empty, the owner's role passes on. */
  function dropMember(id: string, uuid: string) {
    store.removeMember(id, uuid);
    const left = store.memberIds(id);
    if (!left.length) {
      store.remove(id);
      void deps.images?.().removeChat?.(id);
      return;
    }
    if (store.group(id)?.owner === uuid) store.setOwner(id, left[0]);
  }

  type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/v1\/groups$/, (req) => {
      const me = authed(req);
      return { groups: store.groupsOf(me).map((id) => view(id, me)) };
    }],
    // a new group with some of one's friends
    ['POST', /^\/v1\/groups$/, async (req) => {
      const me = authed(req);
      const raw = await body(req);
      const name = cleanGroupName(raw.name);
      if (!name) fail(400, 'bad_group_name');
      const members = friendIds(me, raw.members);
      if (!members.length) fail(400, 'bad_request');
      if (members.length + 1 > limits.size) fail(400, 'too_many');
      if (store.countOwnGroups(me) >= limits.maxGroups) fail(400, 'too_many_groups');
      deps.limitChanges(me);
      const id = store.create(name!, me, members);
      event(id, me, { kind: 'created', name: name!, users: members.map(nameOf) });
      changed(id);
      return { group: view(id, me) };
    }],
    ['GET', /^\/v1\/groups\/([\w-]{1,32})\/messages$/, (req, [id], url) => {
      const me = authed(req);
      groupOf(me, id);
      const before = Number(url.searchParams.get('before')) || undefined;
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const messages = store.messages(id, me, limit, before);
      // how long one's own messages may be edited, and whose others' this member may delete (server 0.9.23+)
      const moderator = moderation(id, me);
      return { messages: deps.images ? deps.images().decorate(messages, id) : messages, editWindowMs: editWindow(), ...(moderator ? { moderator } : {}) };
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/messages$/, async (req, [id]) => {
      const me = authed(req);
      groupOf(me, id);
      deps.limitMessages(me);
      const { text, image } = await body(req);
      // a picture's message was counted with its upload
      if (image === undefined) deps.limitBurst?.(me, `g:${id}`);
      if (typeof text !== 'string' || !text.trim()) fail(400, 'empty');
      const t = text as string;
      const encrypted = t.startsWith('e2e1:');
      if (t.length > (encrypted ? MAX_ENCRYPTED : MAX_MESSAGE)) fail(400, 'too_long');
      if (encrypted && !/^e2e1:[A-Za-z0-9+/=]+$/.test(t)) fail(400, 'bad_request');
      // a picture uploaded for this group by the sender (its key, encrypted for the members, in the message)
      const picture = image === undefined ? undefined : deps.images ? deps.images().forMessage(me, `g:${id}`, image) : fail(400, 'bad_image');
      const added = store.addMessage(id, me, t.trim());
      if (picture) deps.images!().attach(picture, added.id);
      const message = picture ? { ...added, image: picture } : added;
      post(id, message);
      // for the achievements only a real conversation counts: at least two others in it
      if (store.memberIds(id).length >= 3) deps.countMessage?.(me);
      return { message };
    }],
    // the author changes their text within EDIT_WINDOW_MS, encrypted again for the members now (not pictures or the group's lines)
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/messages\/(\d{1,15})\/edit$/, async (req, [id, raw]) => {
      const me = authed(req);
      groupOf(me, id);
      (deps.limitEdits ?? deps.limitMessages)(me);
      const old = store.message(id, Number(raw));
      if (!old || !store.readersOf(id, old.id).includes(me)) fail(404, 'not_found');
      const refusal = editRefusal(old!, me, !!deps.images?.().has(old!.id, id), Date.now(), editWindow());
      if (refusal) fail(...refusal);
      const t = cleanText((await body(req)).text, old!.text.startsWith('e2e1:'));
      store.editMessage(old!.id, t);
      const message = store.message(id, old!.id)!;
      for (const m of store.readersOf(id, message.id)) push(m, { type: 'group-message-edit', message });
      return { message };
    }],
    // the author takes it back, or a moderator (moderation): no text stays, its picture goes too
    ['DELETE', /^\/v1\/groups\/([\w-]{1,32})\/messages\/(\d{1,15})$/, async (req, [id, raw]) => {
      const me = authed(req);
      const g = groupOf(me, id);
      (deps.limitEdits ?? deps.limitMessages)(me);
      const old = store.message(id, Number(raw));
      if (!old || !store.readersOf(id, old.id).includes(me)) fail(404, 'not_found');
      if (old!.event) fail(400, 'not_editable');
      if (old!.from !== me) {
        const mod = moderation(id, me);
        const authorRole = g.clan ? deps.clanRole?.(g.clan, old!.from) : undefined;
        if (!mod || (mod === 'members' && authorRole !== undefined && authorRole !== 'member')) fail(403, 'not_allowed');
      }
      if (old!.deleted) return { message: old };
      store.deleteMessage(old!.id);
      await deps.images?.().remove(old!.id, id);
      const message = store.message(id, old!.id)!;
      for (const m of store.readersOf(id, message.id)) push(m, { type: 'group-message-delete', message, by: me });
      return { message };
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/read$/, (req, [id]) => {
      const me = authed(req);
      groupOf(me, id);
      store.markRead(id, me);
      return { ok: true };
    }],
    // the public keys of every member's most recent launchers, to encrypt a message for the group
    ['GET', /^\/v1\/groups\/([\w-]{1,32})\/keys$/, (req, [id]) => {
      const me = authed(req);
      groupOf(me, id);
      return { keys: store.memberIds(id).flatMap((user) => db.deviceKeysFor(user, KEYS_PER_MEMBER).map((k) => ({ user, ...k }))) };
    }],
    // any member may bring in their own friends
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/members$/, async (req, [id]) => {
      const me = authed(req);
      plainGroup(me, id);
      const raw = await body(req);
      const members = friendIds(me, raw.members).filter((m) => !store.isMember(id, m));
      if (!members.length) return { group: view(id, me) };
      if (store.memberIds(id).length + members.length > limits.size) fail(400, 'too_many');
      deps.limitChanges(me);
      for (const m of members) store.addMember(id, m);
      event(id, me, { kind: 'added', users: members.map(nameOf) });
      changed(id);
      return { group: view(id, me) };
    }],
    // only the owner takes others out; anyone may take themselves out (that is leaving)
    ['DELETE', /^\/v1\/groups\/([\w-]{1,32})\/members\/([\w-]{1,64})$/, (req, [id, user]) => {
      const me = authed(req);
      plainGroup(me, id);
      if (user !== me && ownerOf(id) !== me) fail(403, 'not_owner');
      if (!store.isMember(id, user)) fail(404, 'not_found');
      const name = nameOf(user);
      dropMember(id, user);
      if (store.group(id)) {
        event(id, me, user === me ? { kind: 'left' } : { kind: 'removed', users: [name] });
        changed(id, [user]);
      } else push(user, { type: 'groups', id });
      return { ok: true };
    }],
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/leave$/, (req, [id]) => {
      const me = authed(req);
      plainGroup(me, id);
      dropMember(id, me);
      if (store.group(id)) {
        event(id, me, { kind: 'left' });
        changed(id, [me]);
      } else push(me, { type: 'groups', id });
      return { ok: true };
    }],
    // any member may rename it (as in most chats)
    ['POST', /^\/v1\/groups\/([\w-]{1,32})\/name$/, async (req, [id]) => {
      const me = authed(req);
      const g = plainGroup(me, id);
      const name = cleanGroupName((await body(req)).name);
      if (!name) fail(400, 'bad_group_name');
      if (name === g.name) return { group: view(id, me) };
      deps.limitChanges(me);
      store.rename(id, name!);
      event(id, me, { kind: 'renamed', name: name! });
      changed(id);
      return { group: view(id, me) };
    }],
  ];

  /**
   * For the Multimedia panel (chatImages.ts): whether `me` may take down `author`'s pictures in the
   * group by the rules of deleting messages (`author` empty: whether they moderate it at all), and
   * whether they set its own limits (a group's owner, a clan's owner).
   */
  function mayModerate(id: string, me: string, author: string): boolean {
    const mod = moderation(id, me);
    if (!mod) return false;
    if (mod === 'all' || !author) return true;
    const g = store.group(id);
    const role = g?.clan ? deps.clanRole?.(g.clan, author) : undefined;
    return role === undefined || role === 'member';
  }
  const manages = (id: string, me: string) => moderation(id, me) === 'all';
  const sinceOf = (id: string, me: string) => (db.sql.prepare('SELECT since_id AS n FROM chat_group_members WHERE group_id = ? AND uuid = ?').get(id, me) as { n: number } | undefined)?.n ?? 0;

  return {
    routes,
    store,
    mayModerate,
    manages,
    sinceOf,
    /** For clans.ts: the clan's chat follows its members and name. */
    clanChat: {
      create: (clanId: string, name: string, owner: string) => {
        const id = store.create(name, owner, [], clanId);
        changed(id);
        return id;
      },
      join: (id: string, user: string) => {
        if (!store.group(id) || store.isMember(id, user)) return;
        store.addMember(id, user);
        event(id, user, { kind: 'joined' });
        changed(id);
      },
      leave: (id: string, user: string, by?: string) => {
        if (!store.isMember(id, user)) return;
        const name = nameOf(user);
        dropMember(id, user);
        if (!store.group(id)) return push(user, { type: 'groups', id });
        event(id, by ?? user, by && by !== user ? { kind: 'removed', users: [name] } : { kind: 'left' });
        changed(id, [user]);
      },
      rename: (id: string, name: string, by: string) => {
        if (!store.group(id)) return;
        store.rename(id, name);
        event(id, by, { kind: 'renamed', name });
        changed(id);
      },
      setOwner: (id: string, owner: string) => store.setOwner(id, owner),
      /** A line from the system in the clan's chat (a role changed). */
      note: (id: string, by: string, e: Omit<GroupEvent, 'by'>) => {
        if (store.group(id)) event(id, by, e);
      },
      remove: (id: string) => {
        const members = store.memberIds(id);
        store.remove(id);
        void deps.images?.().removeChat?.(id);
        for (const m of members) push(m, { type: 'groups', id });
      },
      /** Pushes a fresh list (the clan's tag changed). */
      changed: (id: string) => changed(id),
    },
  };
}
