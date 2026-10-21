import type http from 'node:http';
import type { Db, Person } from './db.ts';
import { LogoStore, serveLogo, takeLogo } from './clanLogos.ts';
import { EDIT_WINDOW_MS, editRefusal } from './chatLimits.ts';
import { withDefaults } from './settings.ts';
import {
  COMMUNITY_LIMITS, CommunityStore, NOTIFY, RANK, ROLES, SLOW_MODES, cleanCommunityName, cleanDescription, communityTagProblem, isReaction, mentionedHandles, may, offensiveText, permissions,
  type ChannelRow, type CommunityLimits, type CommunityRole, type CommunityRow, type JoinMode, type MemberRow, type MessageRow, type Notify, type ReactionCount, type Visibility,
} from './communityStore.ts';
import { CommunityRoleStore, LOG_GROUPS, allowed, allowedOn, canPost, canRead, permissionsOf, type Actor } from './communityRoles.ts';
import { communityManageRoutes } from './communityManage.ts';

/**
 * Communities ("Społeczności"): big groups of players with roles, a directory of the public ones,
 * join requests, bans and mutes, a chat with channels (the general one and announcements), reports
 * of messages for the moderators and the site's admins, and an audit log. The data and the rules
 * are in communityStore.ts; this file has the routes and who hears about what.
 *
 * The chat is server-stored and NOT end-to-end encrypted (see communityStore.ts): the API says so
 * with `encrypted: false` and the clients show it where one writes.
 *
 * Scale: members come in pages; a new message goes only to the members connected right now
 * (`pushMany` picks the smaller of the two sets), with no other work per member; unread counts stop
 * at UNREAD_CAP. Pushed events (server 0.9.24+; older clients ignore them):
 * - `communities` (my list changed: fetch /v1/communities/mine again), with the community's `id`;
 * - `community-message`, `community-message-edit`, `community-message-delete` with `message`;
 * - `community` with `invite`, `kicked`, `banned`, `accepted`, `request`, `report` or `muted` (a toast).
 * Since 0.9.27 (all optional, older clients ignore them):
 * - `community-reaction` with `community`, `channel`, `message` (its id), `emoji`, `user`, `on` and
 *   the emoji's `count` after it;
 * - `community-pin` with `community`, `channel`, `message` (the whole message), `pinned` and `by`.
 * Messages may carry `replyTo` (a short quote of the one answered, `deleted` when it is gone),
 * `reactions` ([{ emoji, count, me? }]; pushed ones have no `me`) and `pinned`. Channels carry
 * `slowMode` (seconds) when it is on; a message too soon is a 429 'slow_mode' with `retryAfter`.
 * A timeout is the mute that was there before: `mutedUntil`, no writing, editing or reacting.
 * Since 0.9.30 (communityRoles.ts, communityManage.ts; all optional, older clients ignore them):
 * own channels (`kind: 'custom'`) with who reads and writes them, a channel one may not read is
 * left out of one's list and its events never come; custom roles (`roles` in a community, a
 * member's and an author's `customRole` { id, name, color }); `permissions` with a custom role's;
 * the log for moderators too, in pages (`before`, `limit`, `group`).
 */

interface Deps {
  db: Db;
  authed: (req: http.IncomingMessage) => string;
  admin: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  push: (userId: string, event: unknown) => void;
  /** One event to every connected launcher of these accounts (serialised once). */
  pushMany: (users: ReadonlySet<string>, event: unknown) => void;
  /** 'offline' for players not connected or invisible. */
  status: (userId: string) => string;
  /** `retryAfter`: seconds to wait (slow mode), sent as Retry-After and in the body. */
  fail: (status: number, code: string, retryAfter?: number) => never;
  /** Founding communities; joining and asking to join; other changes (roles, settings, invites). */
  limitCreate: (key: string) => void;
  limitJoin: (key: string) => void;
  limitChanges: (key: string) => void;
  limitLogos: (key: string) => void;
  limitMessages: (key: string) => void;
  limitEdits: (key: string) => void;
  limitReports: (key: string) => void;
  /** Reactions added or taken off (none: no limit, the tests). */
  limitReactions?: (key: string) => void;
  /** The public page's API, per address. */
  limitViews: (key: string) => void;
  clientIp: (req: http.IncomingMessage) => string;
  /** Too many messages in a row in one channel ("c:<id>"): throws (chatLimits.ts). */
  limitBurst?: (user: string, conversation: string) => void;
  /** A message to a real conversation, for the achievements. */
  countMessage?: (user: string) => void;
  /** Looks at a player's achievements again (joined, founded, the community grew). */
  checkAchievements?: (user: string) => void;
  /** Sizes an achievement asks a community to reach (everyone in it is looked at when it gets there). */
  sizeGoals?: () => number[];
  /** Lower limits (tests). */
  limits?: Partial<CommunityLimits>;
  /** How long a message may be edited now (the admin panel's setting; EDIT_WINDOW_MS by default). */
  editWindowMs?: () => number;
}

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;

const VISIBILITIES: Visibility[] = ['public', 'private'];
const JOIN_MODES: JoinMode[] = ['open', 'request'];
const ID = '([\\w-]{1,32})';
const USER = '([\\w-]{1,64})';
const MID = '(\\d{1,15})';
const route = (path: string) => new RegExp(`^/v1/communities${path}$`);

export function createCommunities(deps: Deps) {
  const { db, authed, body, push, pushMany, fail } = deps;
  // live: the admin panel's settings are read when used
  const L: CommunityLimits = withDefaults(COMMUNITY_LIMITS, deps.limits);
  const editWindow = () => deps.editWindowMs?.() ?? EDIT_WINDOW_MS;
  const store = new CommunityStore(db.sql);
  const roles = new CommunityRoleStore(db.sql);
  const logos = new LogoStore(db.sql, 'community_logos', 'communities', '/v1/communities');

  const person = (id: string): Person => {
    const u = db.user(id);
    return { id, handle: u?.handle ?? '', name: u?.name ?? '', avatar: u?.avatar ?? '' };
  };
  const nameOf = (id: string) => db.user(id)?.name || '?';
  const logoField = (id: string) => {
    const v = logos.version(id);
    return v === undefined ? {} : { logo: v };
  };
  const page = (url: URL, max: number, def: number) => ({
    offset: Math.max(0, Math.min(1_000_000, Number(url.searchParams.get('offset')) || 0)),
    limit: Math.min(max, Math.max(1, Number(url.searchParams.get('limit')) || def)),
  });
  const query = (url: URL) => (url.searchParams.get('q') ?? '').trim().slice(0, 40);

  /**
   * The community with an owner still in it: an owner whose account is gone is followed by the
   * highest role that has been there longest; a community nobody is left in goes away.
   */
  function communityOf(id: string): CommunityRow | undefined {
    const c = store.community(id);
    if (!c) return undefined;
    if (store.roleOf(id, c.owner) === 'owner') return c;
    const heir = store.heir(id);
    if (!heir) {
      remove(c, '');
      return undefined;
    }
    store.setRole(id, heir.uuid, 'owner');
    store.setOwner(id, heir.uuid);
    store.log(id, heir.uuid, 'heir', heir.uuid);
    return store.community(id);
  }

  /** The community, if it exists and `me` may know of it (a member, invited, or it is public); 404 otherwise. */
  function visible(id: string, me: string): CommunityRow {
    const c = communityOf(id);
    if (!c || (c.visibility === 'private' && !store.member(id, me) && !store.hasInvite(id, me))) return fail(404, 'not_found');
    return c;
  }

  /** The community and my membership, or 404 when I am not in it. */
  function membership(id: string, me: string): { c: CommunityRow; m: MemberRow } {
    const c = communityOf(id);
    const m = c && store.member(id, me);
    if (!c || !m) return fail(404, 'not_found');
    return { c, m };
  }

  /** A member (or anyone: a plain member) as the rules of communityRoles.ts see them. */
  const actorOf = (id: string, m: MemberRow | undefined): Actor => roles.actor(id, m);
  /** The channel, if this member may read it; 404 otherwise (a hidden one is not there for them). */
  function readable(id: string, ch: string, a: Actor): ChannelRow {
    const channel = store.channel(id, ch);
    if (!channel || !canRead(a, channel)) return fail(404, 'not_found');
    return channel;
  }
  /** A custom role as the clients show it by a name. */
  const roleTag = (id: string, rid: string | null | undefined) => {
    const r = roles.role(id, rid);
    return r ? { customRole: { id: r.id, name: r.name, color: r.color } } : {};
  };
  /** Those who handle requests and reports: moderators and up, and custom roles allowed to. */
  const staffOf = (id: string) => [...new Set([...store.staff(id), ...roles.holdersWith(id, ['requests', 'reports'])])];

  function remove(c: CommunityRow, by: string, action = 'delete') {
    const members = [...store.memberSet(c.id)];
    const invited = store.sentInvites(c.id).map((i) => i.uuid);
    const asked = store.requests(c.id, 10_000).map((r) => r.uuid);
    logos.remove(c.id);
    store.remove(c.id);
    store.log(c.id, by, action, '', c.name);
    pushMany(new Set([...members, ...invited, ...asked]), { type: 'communities', id: c.id, removed: true });
  }

  /** What anyone may see of a community (the directory, an invite, the public page). */
  function summary(c: CommunityRow) {
    return {
      id: c.id, name: c.name, tag: c.tag, slug: c.tag || c.id, description: c.description, visibility: c.visibility, joinMode: c.joinMode,
      members: c.members, owner: person(c.owner), createdAt: c.createdAt, ...logoField(c.id),
    };
  }

  function channelView(ch: ChannelRow, me: string, a: Actor) {
    return {
      id: ch.id, kind: ch.kind, name: ch.name, canPost: canPost(a, ch), ...store.unread(ch.id, me), ...(ch.slowMode ? { slowMode: ch.slowMode } : {}),
      // who reads and writes it (0.9.30)
      readRole: ch.readRole, postRole: ch.postRole, ...(ch.readRoles.length ? { readRoles: ch.readRoles } : {}), ...(ch.writeRoles.length ? { writeRoles: ch.writeRoles } : {}),
    };
  }

  /** When `me` may write in this channel again (slow mode; moderators and up any time); 0: now. */
  function nextPostAt(ch: ChannelRow, me: string, role: CommunityRole, now = Date.now()): number {
    if (!ch.slowMode || RANK[role] >= RANK.moderator) return 0;
    const at = store.lastMessageAt(ch.id, me) + ch.slowMode * 1000;
    return at > now ? at : 0;
  }

  /** A community as one of its members sees it in their list. */
  function memberView(c: CommunityRow, m: MemberRow, me: string) {
    const a = actorOf(c.id, m);
    const channels = store.channels(c.id).filter((ch) => canRead(a, ch)).map((ch) => channelView(ch, me, a));
    return {
      ...summary(c), role: m.role, notify: m.notify, onProfile: m.onProfile, joinedAt: m.joinedAt, lastMessageAt: c.lastMessageAt,
      ...(m.mutedUntil > Date.now() ? { mutedUntil: m.mutedUntil } : {}),
      unread: Math.min(channels.reduce((n, ch) => n + ch.unread, 0), 99), mentions: channels.reduce((n, ch) => n + ch.mentions, 0),
      channels, permissions: { ...permissions(m.role), ...permissionsOf(a) }, encrypted: false,
      ...(allowed(a, 'requests') ? { pending: store.requestCount(c.id) } : {}),
      ...(allowed(a, 'reports') ? { reports: store.openReportCount(c.id) } : {}),
      // custom roles (0.9.30): the community's, the highest first, and mine
      roles: roles.list(c.id).map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions })), ...roleTag(c.id, m.customRole),
    };
  }

  function mine(me: string) {
    return {
      communities: store.membershipsOf(me).flatMap((x) => {
        const c = communityOf(x.id);
        const m = c && store.member(x.id, me);
        return c && m ? [memberView(c, m, me)] : [];
      }),
      invites: store.invitesFor(me).flatMap((i) => {
        const c = store.community(i.community);
        return c ? [{ community: summary(c), by: person(i.by), at: i.at }] : [];
      }),
      requests: store.requestsBy(me).flatMap((r) => {
        const c = store.community(r.community);
        return c ? [{ community: summary(c), at: r.at }] : [];
      }),
      limits: { members: L.members, perPlayer: L.perPlayer, owned: L.owned, message: L.message, description: L.description },
    };
  }

  /** How I may get in: already a member, invited, open, by request, only by invite, banned, or it is full. */
  function joinState(c: CommunityRow, me: string): 'member' | 'invited' | 'open' | 'request' | 'requested' | 'invite' | 'banned' | 'full' {
    if (store.member(c.id, me)) return 'member';
    if (store.isBanned(c.id, me)) return 'banned';
    if (store.hasInvite(c.id, me)) return 'invited';
    if (c.members >= L.members) return 'full';
    if (c.visibility === 'private') return 'invite';
    if (store.hasRequest(c.id, me)) return 'requested';
    return c.joinMode;
  }

  type Authors = Map<string, { name: string; handle: string; role?: CommunityRole; customRole?: { id: string; name: string; color: string } }>;
  function authorOf(community: string, from: string, authors: Authors) {
    let author = authors.get(from);
    if (!author) {
      const p = person(from);
      // the role now (for who may delete it, and a mark by the name); none for someone who left
      const member = store.member(community, from);
      author = { name: p.name, handle: p.handle, ...(member ? { role: member.role, ...roleTag(community, member.customRole) } : {}) };
      authors.set(from, author);
    }
    return author;
  }

  /** The answered message as a reply shows it: who, and its first line (or that it is gone). */
  function quoteOf(m: MessageRow, authors: Authors) {
    const q = m.replyTo ? store.message(m.community, m.replyTo) : undefined;
    if (!q) return m.replyTo ? { replyTo: { id: m.replyTo, deleted: true as const } } : {};
    const { name, handle } = authorOf(q.community, q.from, authors);
    if (q.deletedAt) return { replyTo: { id: q.id, from: q.from, author: { name, handle }, text: '', deleted: true as const } };
    const line = q.text.split('\n', 1)[0];
    return { replyTo: { id: q.id, from: q.from, author: { name, handle }, text: line.length > 120 ? `${line.slice(0, 119)}…` : line } };
  }

  /**
   * A message as the clients get it: who wrote it (name and handle: big rooms have no member list at
   * hand), deleted ones empty; the quote it answers, its reactions (`me` only for the reader of a
   * page) and whether it is pinned.
   */
  function messageView(m: MessageRow, authors: Authors = new Map(), reactions?: ReactionCount[]) {
    const author = authorOf(m.community, m.from, authors);
    const base = { id: m.id, community: m.community, channel: m.channel, from: m.from, author, text: m.text, at: m.at, ...quoteOf(m, authors) };
    if (m.deletedAt) return { ...base, text: '', deleted: true as const, ...(m.deletedBy && m.deletedBy !== m.from ? { moderated: true } : {}) };
    const r = reactions ?? store.reactionsOf([m.id]).get(m.id);
    return {
      ...base, ...(m.editedAt ? { editedAt: m.editedAt } : {}), ...(m.mentions.length ? { mentions: m.mentions } : {}),
      ...(r?.length ? { reactions: r } : {}), ...(m.pinnedAt ? { pinned: true } : {}),
    };
  }

  /** A page of messages as `me` sees them (their own reactions marked), the reactions in one query. */
  function messageViews(list: MessageRow[], me: string) {
    const authors: Authors = new Map();
    const reactions = store.reactionsOf(list.filter((m) => !m.deletedAt).map((m) => m.id), me);
    return list.map((m) => messageView(m, authors, reactions.get(m.id) ?? []));
  }

  /** Every connected member hears it. */
  function toMembers(id: string, event: unknown) {
    pushMany(store.memberSet(id), event);
  }
  /** Those who read the channel hear it (everyone, unless it is closed to some). */
  function toReaders(id: string, ch: string, event: unknown) {
    const channel = store.channel(id, ch);
    const readers = channel && roles.readers(id, channel);
    pushMany(readers ?? store.memberSet(id), event);
  }
  /** Members whose list shows something new (name, logo, role…): they fetch /mine again. */
  function listChanged(id: string, users: Iterable<string> = store.memberSet(id)) {
    pushMany(new Set(users), { type: 'communities', id });
  }
  /** The moderators hear of a request or a report. */
  function toStaff(id: string, event: unknown) {
    pushMany(new Set(staffOf(id)), event);
  }

  /** A plain text from a request: not empty, not too long (no encryption here). */
  function cleanText(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim()) return fail(400, 'empty');
    const t = raw.trim();
    if (t.length > L.message) fail(400, 'too_long');
    return t;
  }

  /** The members a text mentions (@handle), as their account ids; in a closed channel only those who read it. */
  function mentionsIn(id: string, text: string, channel?: ChannelRow): string[] {
    const members = (channel && roles.readers(id, channel)) ?? store.memberSet(id);
    return mentionedHandles(text, L.mentions).flatMap((h) => {
      const u = db.userByHandle(h);
      return u && members.has(u.id) ? [u.id] : [];
    });
  }

  /** A new member: the limits, then in; their achievements, and everyone's when the community reached a size an achievement asks for. */
  function admit(c: CommunityRow, user: string, by: string) {
    if (store.isBanned(c.id, user)) fail(403, 'community_banned');
    if (store.member(c.id, user)) fail(409, 'already_member');
    if (c.members >= L.members) fail(400, 'community_full');
    if (store.countOf(user) >= L.perPlayer) fail(400, 'too_many_communities');
    store.addMember(c.id, user);
    store.log(c.id, by, user === by ? 'join' : 'accept', user);
    push(user, { type: 'communities', id: c.id });
    const size = store.community(c.id)?.members ?? 0;
    if (deps.sizeGoals?.().includes(size)) {
      // rare: everyone in it may have reached an achievement now; after this answer
      const everyone = [...store.memberSet(c.id)];
      setImmediate(() => everyone.forEach((u) => deps.checkAchievements?.(u)));
    } else deps.checkAchievements?.(user);
  }

  function leave(c: CommunityRow, user: string) {
    store.removeMember(c.id, user);
    push(user, { type: 'communities', id: c.id });
  }

  /** A target member and their role (404 when not a member). */
  function targetOf(c: CommunityRow, user: string): MemberRow {
    return store.member(c.id, user) ?? fail(404, 'not_found');
  }

  /** The settings from a request, over the current ones; 400 with the first problem. */
  function settingsFrom(raw: Record<string, unknown>, current?: CommunityRow) {
    const name = raw.name === undefined && current ? current.name : cleanCommunityName(raw.name, L);
    if (!name) fail(400, 'bad_community_name');
    if (offensiveText(name!)) fail(400, 'offensive_name');
    const tag = raw.tag === undefined ? current?.tag ?? '' : typeof raw.tag === 'string' ? raw.tag.trim() : raw.tag;
    const problem = communityTagProblem(tag);
    if (problem) fail(400, problem);
    const description = raw.description === undefined ? current?.description ?? '' : cleanDescription(raw.description, L);
    if (description === undefined) fail(400, 'bad_description');
    if (offensiveText(description!)) fail(400, 'offensive_description');
    const visibility = raw.visibility === undefined ? current?.visibility ?? 'public' : raw.visibility;
    const joinMode = raw.joinMode === undefined ? current?.joinMode ?? 'open' : raw.joinMode;
    if (!VISIBILITIES.includes(visibility as Visibility) || !JOIN_MODES.includes(joinMode as JoinMode)) fail(400, 'bad_request');
    if (store.tagTaken(tag as string, current?.id)) fail(409, 'tag_taken');
    return { name: name!, tag: tag as string, description: description!, visibility: visibility as Visibility, joinMode: joinMode as JoinMode };
  }

  /** A user from a request: { user: id } or { handle }. */
  function userFrom(raw: Record<string, unknown>) {
    const u = typeof raw.user === 'string' ? db.user(raw.user) : typeof raw.handle === 'string' ? db.userByHandle(raw.handle.trim().replace(/^@/, '')) : undefined;
    return u ?? fail(404, 'not_found');
  }

  function deleteMessage(c: CommunityRow, m: MessageRow, by: string) {
    store.deleteMessage(m.id, by);
    // a deleted message's reports are settled with it
    if (store.resolveReports(m.id, by, 'deleted')) listChanged(c.id, staffOf(c.id));
    const message = messageView(store.message(c.id, m.id)!);
    toReaders(c.id, m.channel, { type: 'community-message-delete', message, by });
    return message;
  }

  /** Who may delete this message: its author, or someone above the author (who left: a member). */
  function mayDelete(c: CommunityRow, a: Actor, m: MessageRow, me: string): boolean {
    return m.from === me || allowedOn(a, 'deleteMessage', actorOf(c.id, store.member(c.id, m.from)));
  }

  /** The reports as moderators and admins see them: the message as it was reported, who wrote it, who reported it. */
  function reportsView(list: ReturnType<CommunityStore['openReports']>) {
    return list.map((r) => {
      const m = store.message(r.community, r.message);
      return {
        id: r.id, community: r.community, reason: r.reason, at: r.at, count: r.count, reporter: person(r.reporter),
        message: { id: r.message, text: r.text, current: m ? messageView(m) : null, author: m ? person(m.from) : null },
      };
    });
  }

  function logView(id: string, limit: number, before?: number, actions?: string[]) {
    return (before || actions ? roles.logPage(id, limit, before, actions) : store.logOf(id, limit)).map((e) => ({ ...e, byName: e.by ? nameOf(e.by) : '', targetName: /^[\w-]{20,64}$/.test(e.target) ? nameOf(e.target) : e.target }));
  }

  const routes: [string, RegExp, Handler][] = [
    // mine, the invites to me and my requests
    ['GET', route('/mine'), (req) => mine(authed(req))],
    // the directory of public communities (the biggest first, or by name/tag)
    ['GET', route('/discover'), (req, _p, url) => {
      const me = authed(req);
      const { offset, limit } = page(url, 50, 20);
      const { list, total } = store.directory(query(url), offset, limit);
      return { communities: list.map((c) => ({ ...summary(c), state: joinState(c, me) })), total, offset };
    }],
    // the public page's data (no sign-in): public communities only
    ['GET', /^\/v1\/public\/communities\/([\w-]{1,32})$/, (req, [slug]) => {
      deps.limitViews(`community:${deps.clientIp(req)}`);
      const c = store.bySlug(slug);
      if (!c || c.visibility !== 'public' || !communityOf(c.id)) fail(404, 'not_found');
      const { owner, ...rest } = summary(store.community(c!.id)!);
      return { community: { ...rest, owner: { name: owner.name, handle: owner.handle }, logoUrl: rest.logo ? logos.url(c!.id, rest.logo) : null } };
    }],
    ['POST', route(''), async (req) => {
      const me = authed(req);
      const s = settingsFrom(await body(req));
      if (store.ownedBy(me) >= L.owned) fail(400, 'too_many_owned');
      if (store.countOf(me) >= L.perPlayer) fail(400, 'too_many_communities');
      deps.limitCreate(me);
      const id = store.create(s, me);
      store.log(id, me, 'create', '', s.name);
      deps.checkAchievements?.(me);
      push(me, { type: 'communities', id });
      const c = store.community(id)!;
      return { community: memberView(c, store.member(id, me)!, me), ...mine(me) };
    }],
    // one community: in full for members, its summary and how to get in for the rest
    ['GET', route(`/${ID}`), (req, [id]) => {
      const me = authed(req);
      const c = visible(id, me);
      const m = store.member(id, me);
      return { community: m ? memberView(c, m, me) : { ...summary(c), state: joinState(c, me) } };
    }],
    // joining: an open community at once, one by request asks, an invite is taken (private ones only so)
    ['POST', route(`/${ID}/join`), (req, [id]) => {
      const me = authed(req);
      const c = visible(id, me);
      deps.limitJoin(me);
      const state = joinState(c, me);
      if (state === 'member') fail(409, 'already_member');
      if (state === 'banned') fail(403, 'community_banned');
      if (state === 'requested') fail(409, 'already_requested');
      if (state === 'invite') fail(403, 'invite_only');
      if (state === 'request') {
        if (store.countOf(me) >= L.perPlayer) fail(400, 'too_many_communities');
        if (store.requestCount(id) >= L.requests) fail(400, 'too_many_requests');
        store.request(id, me);
        toStaff(id, { type: 'community', id, request: { name: nameOf(me), community: c.name } });
        listChanged(id, staffOf(id));
        push(me, { type: 'communities', id });
        return { status: 'requested', ...mine(me) };
      }
      admit(c, me, me);
      return { status: 'joined', ...mine(me) };
    }],
    ['POST', route(`/${ID}/invites/accept`), (req, [id]) => {
      const me = authed(req);
      const c = communityOf(id);
      if (!c || !store.hasInvite(id, me)) fail(404, 'not_found');
      deps.limitJoin(me);
      admit(c!, me, me);
      return { status: 'joined', ...mine(me) };
    }],
    ['POST', route(`/${ID}/invites/decline`), (req, [id]) => {
      const me = authed(req);
      if (!store.removeInvite(id, me)) fail(404, 'not_found');
      listChanged(id, staffOf(id));
      return mine(me);
    }],
    // my own request taken back
    ['DELETE', route(`/${ID}/requests/mine`), (req, [id]) => {
      const me = authed(req);
      if (!store.removeRequest(id, me)) fail(404, 'not_found');
      listChanged(id, staffOf(id));
      return mine(me);
    }],
    // the owner cannot just walk out of a community with others in it: they hand it over or delete it
    ['POST', route(`/${ID}/leave`), (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (m.role === 'owner' && c.members > 1) fail(400, 'owner_must_transfer');
      if (m.role === 'owner') remove(c, me);
      else {
        leave(c, me);
        store.log(id, me, 'leave', me);
      }
      return mine(me);
    }],
    // how I hear about it (all / mentions / none) and whether my profile shows it
    ['POST', route(`/${ID}/notify`), async (req, [id]) => {
      const me = authed(req);
      membership(id, me);
      const { notify } = await body(req);
      if (!NOTIFY.includes(notify as Notify)) fail(400, 'bad_request');
      store.setNotify(id, me, notify as Notify);
      push(me, { type: 'communities', id });
      return mine(me);
    }],
    ['POST', route(`/${ID}/profile`), async (req, [id]) => {
      const me = authed(req);
      membership(id, me);
      const { show } = await body(req);
      if (typeof show !== 'boolean') fail(400, 'bad_request');
      store.setOnProfile(id, me, show as boolean);
      return mine(me);
    }],

    // -- members --
    ['GET', route(`/${ID}/members`), (req, [id], url) => {
      const me = authed(req);
      const { m } = membership(id, me);
      const { offset, limit } = page(url, 100, 50);
      const { list, total } = store.members(id, query(url), offset, limit);
      const staff = allowed(actorOf(id, m), 'mute');
      return {
        members: list.map((x) => {
          const status = deps.status(x.uuid);
          // a timeout: the moderators see it, and so does the one timed out
          return { ...person(x.uuid), role: x.role, ...roleTag(id, x.customRole), joinedAt: x.joinedAt, status, online: status !== 'offline', ...((staff || x.uuid === me) && x.mutedUntil > Date.now() ? { mutedUntil: x.mutedUntil } : {}) };
        }),
        total, offset,
      };
    }],
    ['DELETE', route(`/${ID}/members/${USER}`), (req, [id, user]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const t = targetOf(c, user);
      if (!allowedOn(actorOf(id, m), 'kick', actorOf(id, t))) fail(403, 'not_allowed');
      deps.limitChanges(me);
      leave(c, user);
      store.log(id, me, 'kick', user);
      push(user, { type: 'community', id, kicked: { name: c.name } });
      return { ok: true };
    }],
    ['POST', route(`/${ID}/members/${USER}/role`), async (req, [id, user]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const { role } = await body(req);
      if (!ROLES.includes(role as CommunityRole)) fail(400, 'bad_request');
      const t = targetOf(c, user);
      if (!may(m.role, 'setRole', t.role, role as CommunityRole)) fail(403, 'not_allowed');
      deps.limitChanges(me);
      if (t.role !== role) {
        store.setRole(id, user, role as CommunityRole);
        store.log(id, me, 'role', user, role as string);
        push(user, { type: 'communities', id });
      }
      return { ok: true };
    }],
    // muted ("timeout"): may read, not write, edit or react, for `minutes` (0 lifts it); ends by itself
    ['POST', route(`/${ID}/members/${USER}/mute`), async (req, [id, user]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const { minutes } = await body(req);
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes > L.muteMinutes) fail(400, 'bad_request');
      const t = targetOf(c, user);
      if (!allowedOn(actorOf(id, m), 'mute', actorOf(id, t))) fail(403, 'not_allowed');
      deps.limitChanges(me);
      const until = minutes ? Date.now() + (minutes as number) * 60_000 : 0;
      store.setMuted(id, user, until);
      store.log(id, me, minutes ? 'mute' : 'unmute', user, minutes ? `${minutes} min` : '');
      push(user, { type: 'communities', id });
      push(user, { type: 'community', id, muted: { name: c.name, until } });
      return { ok: true, mutedUntil: until };
    }],
    // the owner hands it over and stays on as an admin
    ['POST', route(`/${ID}/owner`), async (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const { user } = await body(req);
      const t = typeof user === 'string' ? store.member(id, user) : undefined;
      if (!t) fail(404, 'not_found');
      if (!may(m.role, 'transfer', t!.role)) fail(403, 'not_allowed');
      store.setRole(id, t!.uuid, 'owner');
      store.setRole(id, me, 'admin');
      store.setOwner(id, t!.uuid);
      store.log(id, me, 'transfer', t!.uuid);
      listChanged(c.id, [me, t!.uuid]);
      deps.checkAchievements?.(t!.uuid);
      return mine(me);
    }],

    // -- invites, requests, bans --
    ['GET', route(`/${ID}/invites`), (req, [id]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'invite')) fail(403, 'not_allowed');
      return { invites: store.sentInvites(id).map((i) => ({ ...person(i.uuid), at: i.at, by: person(i.by) })) };
    }],
    ['POST', route(`/${ID}/invites`), async (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'invite')) fail(403, 'not_allowed');
      const other = userFrom(await body(req));
      if (other.id === me) fail(400, 'self');
      if (store.member(id, other.id)) fail(409, 'already_member');
      if (store.isBanned(id, other.id)) fail(409, 'banned_user');
      if (store.sentInvites(id).length >= L.invites) fail(400, 'too_many');
      deps.limitChanges(me);
      store.invite(id, other.id, me);
      store.log(id, me, 'invite', other.id);
      push(other.id, { type: 'community', id, invite: { name: c.name, tag: c.tag, by: person(me) } });
      push(other.id, { type: 'communities', id });
      return { ok: true };
    }],
    ['DELETE', route(`/${ID}/invites/${USER}`), (req, [id, user]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'invite')) fail(403, 'not_allowed');
      if (!store.removeInvite(id, user)) fail(404, 'not_found');
      push(user, { type: 'communities', id });
      return { ok: true };
    }],
    ['GET', route(`/${ID}/requests`), (req, [id]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'requests')) fail(403, 'not_allowed');
      return { requests: store.requests(id).map((r) => ({ ...person(r.uuid), at: r.at })), total: store.requestCount(id) };
    }],
    ['POST', route(`/${ID}/requests/${USER}/(accept|decline)`), (req, [id, user, answer]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'requests')) fail(403, 'not_allowed');
      if (!store.hasRequest(id, user)) fail(404, 'not_found');
      if (answer === 'accept') {
        admit(c, user, me);
        push(user, { type: 'community', id, accepted: { name: c.name } });
      } else {
        store.removeRequest(id, user);
        store.log(id, me, 'decline', user);
        push(user, { type: 'communities', id });
      }
      listChanged(id, staffOf(id));
      return { ok: true, pending: store.requestCount(id) };
    }],
    ['GET', route(`/${ID}/bans`), (req, [id]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'ban')) fail(403, 'not_allowed');
      return { bans: store.bans(id).map((b) => ({ ...person(b.uuid), by: person(b.by), reason: b.reason, at: b.at })) };
    }],
    // a ban: out (if in), and kept out (no joining, no requests) until lifted
    ['POST', route(`/${ID}/bans`), async (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const raw = await body(req);
      const other = userFrom(raw);
      const t = store.member(id, other.id);
      if (other.id === me || !allowedOn(actorOf(id, m), 'ban', actorOf(id, t))) fail(403, 'not_allowed');
      deps.limitChanges(me);
      const reason = typeof raw.reason === 'string' ? raw.reason.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) : '';
      if (t) leave(c, other.id);
      store.ban(id, other.id, me, reason);
      store.log(id, me, 'ban', other.id, reason);
      push(other.id, { type: 'community', id, banned: { name: c.name } });
      return { ok: true };
    }],
    ['DELETE', route(`/${ID}/bans/${USER}`), (req, [id, user]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'ban')) fail(403, 'not_allowed');
      if (!store.unban(id, user)) fail(404, 'not_found');
      store.log(id, me, 'unban', user);
      return { ok: true };
    }],

    // -- settings --
    ['POST', route(`/${ID}/settings`), async (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!may(m.role, 'edit')) fail(403, 'not_allowed');
      const s = settingsFrom(await body(req), c);
      deps.limitChanges(me);
      const changed = (['name', 'tag', 'description', 'visibility', 'joinMode'] as const).filter((k) => s[k] !== c[k]);
      if (changed.length) {
        store.update(id, s);
        store.log(id, me, 'edit', '', changed.join(', '));
        listChanged(id);
      }
      return { community: memberView(store.community(id)!, m, me) };
    }],
    // the logo: a 64×64 PNG as the raw body (the launcher makes it), or DELETE to take it off
    ...(['POST', 'PUT'] as const).map((method): [string, RegExp, Handler] => [method, route(`/${ID}/logo`), async (req, [id]) => {
      const me = authed(req);
      const png = await takeLogo(req, fail, () => {
        const { m } = membership(id, me);
        if (!may(m.role, 'edit')) fail(403, 'not_allowed');
        deps.limitLogos(me);
      });
      logos.set(id, png);
      store.log(id, me, 'logo');
      listChanged(id);
      return { community: memberView(store.community(id)!, store.member(id, me)!, me) };
    }]),
    ['DELETE', route(`/${ID}/logo`), (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!may(m.role, 'edit')) fail(403, 'not_allowed');
      if (logos.remove(id)) {
        store.log(id, me, 'logo_remove');
        listChanged(id);
      }
      return { community: memberView(c, m, me) };
    }],
    ['DELETE', route(`/${ID}`), (req, [id]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!may(m.role, 'delete')) fail(403, 'not_allowed');
      remove(c, me);
      return mine(me);
    }],
    ['GET', route(`/${ID}/log`), (req, [id], url) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'log')) fail(403, 'not_allowed');
      // pages (0.9.30): `before` an entry's id, `group` one of LOG_GROUPS; an older launcher asks with neither and gets the newest 100
      const paged = url.searchParams.has('before') || url.searchParams.has('limit') || url.searchParams.has('group');
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || (paged ? 50 : 100)));
      const before = Number(url.searchParams.get('before')) || undefined;
      const group = url.searchParams.get('group') ?? '';
      if (group && !LOG_GROUPS[group]) fail(400, 'bad_request');
      const log = logView(id, limit + 1, before, group ? LOG_GROUPS[group] : undefined);
      return { log: log.slice(0, limit), more: log.length > limit, groups: Object.keys(LOG_GROUPS) };
    }],

    // -- the chat --
    ['GET', route(`/${ID}/channels/${ID}/messages`), (req, [id, ch], url) => {
      const me = authed(req);
      const { m } = membership(id, me);
      const a = actorOf(id, m);
      const channel = readable(id, ch, a);
      const before = Number(url.searchParams.get('before')) || undefined;
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const authors = new Map<string, { name: string; handle: string; role?: CommunityRole }>();
      const next = nextPostAt(channel, me, m.role);
      return {
        messages: messageViews(store.messages(ch, limit, before), me),
        editWindowMs: editWindow(), canPost: canPost(a, channel), encrypted: false,
        ...(allowed(a, 'deleteMessage') ? { moderator: true } : {}),
        ...(m.mutedUntil > Date.now() ? { mutedUntil: m.mutedUntil } : {}),
        ...(channel.slowMode ? { slowMode: channel.slowMode } : {}), ...(next ? { nextPostAt: next } : {}),
        pins: store.pinCount(ch),
      };
    }],
    // `replyTo`: a message of the same channel this one answers (its author hears of it as of a mention)
    ['POST', route(`/${ID}/channels/${ID}/messages`), async (req, [id, ch]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      const a = actorOf(id, m);
      const channel = readable(id, ch, a);
      if (!canPost(a, channel)) fail(403, 'read_only_channel');
      if (m.mutedUntil > Date.now()) fail(403, 'community_muted');
      const now = Date.now();
      const next = nextPostAt(channel, me, m.role, now);
      if (next) fail(429, 'slow_mode', Math.ceil((next - now) / 1000));
      const raw = await body(req);
      let replyTo: MessageRow | undefined;
      if (raw.replyTo !== undefined && raw.replyTo !== null) {
        if (typeof raw.replyTo !== 'number' || !Number.isSafeInteger(raw.replyTo)) fail(400, 'bad_request');
        replyTo = store.message(id, raw.replyTo as number);
        // only in the same channel of the same community, and not to a message that is gone
        if (!replyTo || replyTo.channel !== ch) fail(400, 'bad_reply');
        if (replyTo!.deletedAt) fail(404, 'reply_deleted');
      }
      const text = cleanText(raw.text);
      deps.limitMessages(me);
      deps.limitBurst?.(me, `c:${ch}`);
      const mentions = mentionsIn(id, text, channel);
      const readers = roles.readers(id, channel) ?? store.memberSet(id);
      if (replyTo && replyTo.from !== me && readers.has(replyTo.from) && !mentions.includes(replyTo.from)) mentions.push(replyTo.from);
      const message = messageView(store.addMessage(id, ch, me, text, mentions, now, replyTo?.id ?? null), new Map(), []);
      pushMany(readers, { type: 'community-message', message });
      if (c.members >= 3) deps.countMessage?.(me);
      return { message, ...(channel.slowMode && RANK[m.role] < RANK.moderator ? { nextPostAt: now + channel.slowMode * 1000 } : {}) };
    }],
    ['POST', route(`/${ID}/channels/${ID}/messages/${MID}/edit`), async (req, [id, ch, raw]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (m.mutedUntil > Date.now()) fail(403, 'community_muted');
      deps.limitEdits(me);
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch) fail(404, 'not_found');
      const channel = readable(id, ch, actorOf(id, m));
      const refusal = editRefusal({ ...old!, deleted: !!old!.deletedAt }, me, false, Date.now(), editWindow());
      if (refusal) fail(...refusal);
      const text = cleanText((await body(req)).text);
      store.editMessage(old!.id, text, mentionsIn(id, text, channel));
      const message = messageView(store.message(id, old!.id)!);
      toReaders(id, ch, { type: 'community-message-edit', message });
      return { message };
    }],
    // the author takes it back, or a moderator above the author
    ['DELETE', route(`/${ID}/channels/${ID}/messages/${MID}`), (req, [id, ch, raw]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      deps.limitEdits(me);
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch) fail(404, 'not_found');
      readable(id, ch, actorOf(id, m));
      if (!mayDelete(c, actorOf(id, m), old!, me)) fail(403, 'not_allowed');
      if (old!.deletedAt) return { message: messageView(old!) };
      if (old!.from !== me) store.log(id, me, 'message_delete', old!.from, `#${old!.id}`);
      return { message: deleteMessage(c, old!, me) };
    }],
    // a reaction: `emoji` one of REACTIONS, `on` to add or take off (left out: the other way round)
    ['POST', route(`/${ID}/channels/${ID}/messages/${MID}/reactions`), async (req, [id, ch, raw]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch || old.deletedAt) fail(404, 'not_found');
      readable(id, ch, actorOf(id, m));
      if (m.mutedUntil > Date.now()) fail(403, 'community_muted');
      const { emoji, on } = await body(req);
      if (!isReaction(emoji) || (on !== undefined && typeof on !== 'boolean')) fail(400, 'bad_reaction');
      const add = typeof on === 'boolean' ? on : !store.hasReacted(old!.id, me, emoji as string);
      // a new kind of emoji only while there is room for one
      if (add && store.reactionCount(old!.id, emoji as string) === 0 && store.reactionKinds(old!.id) >= L.reactions) fail(400, 'too_many_reactions');
      deps.limitReactions?.(me);
      if (store.react(old!.id, me, emoji as string, add)) {
        toReaders(id, ch, { type: 'community-reaction', community: id, channel: ch, message: old!.id, emoji, user: me, on: add, count: store.reactionCount(old!.id, emoji as string) });
      }
      return { message: messageView(old!, new Map(), store.reactionsOf([old!.id], me).get(old!.id) ?? []) };
    }],
    // who reacted with what (the first 50 of each emoji)
    ['GET', route(`/${ID}/channels/${ID}/messages/${MID}/reactions`), (req, [id, ch, raw]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch) fail(404, 'not_found');
      readable(id, ch, actorOf(id, m));
      const counts = store.reactionsOf([old!.id], me).get(old!.id) ?? [];
      const users = store.reactors(old!.id);
      return {
        reactions: counts.map((r) => ({
          ...r, users: users.filter((u) => u.emoji === r.emoji).map((u) => {
            const p = person(u.uuid);
            return { id: p.id, name: p.name, handle: p.handle };
          }),
        })),
      };
    }],
    // pinned (moderators and up), or taken off; at most L.pins in a channel
    ['POST', route(`/${ID}/channels/${ID}/messages/${MID}/pin`), async (req, [id, ch, raw]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'pin')) fail(403, 'not_allowed');
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch || old.deletedAt) fail(404, 'not_found');
      readable(id, ch, actorOf(id, m));
      const { pinned } = await body(req);
      if (typeof pinned !== 'boolean') fail(400, 'bad_request');
      deps.limitChanges(me);
      if (pinned && !old!.pinnedAt && store.pinCount(ch) >= L.pins) fail(400, 'too_many_pins');
      const changed = pinned ? store.pin(old!.id, ch, me) : store.unpin(old!.id);
      const message = messageView(store.message(id, old!.id)!);
      if (changed) {
        store.log(id, me, pinned ? 'pin' : 'unpin', old!.from, `#${old!.id}`);
        toReaders(id, ch, { type: 'community-pin', community: id, channel: ch, message, pinned, by: { id: me, name: nameOf(me) } });
      }
      return { message, pins: store.pinCount(ch) };
    }],
    ['GET', route(`/${ID}/channels/${ID}/pins`), (req, [id, ch]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      readable(id, ch, actorOf(id, m));
      const pins = store.pins(ch);
      const rows = pins.flatMap((p) => {
        const msg = store.message(id, p.message);
        return msg ? [msg] : [];
      });
      const views = new Map(messageViews(rows, me).map((v) => [v.id, v]));
      return { pins: pins.flatMap((p) => (views.has(p.message) ? [{ message: views.get(p.message), by: person(p.by), at: p.at }] : [])), limit: L.pins };
    }],
    // slow mode: one message per member per `seconds` (one of SLOW_MODES; 0 off), set by admins and the owner
    ['POST', route(`/${ID}/channels/${ID}/slowmode`), async (req, [id, ch]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'slowMode')) fail(403, 'not_allowed');
      const channel = readable(id, ch, actorOf(id, m));
      const { seconds } = await body(req);
      if (typeof seconds !== 'number' || !SLOW_MODES.includes(seconds)) fail(400, 'bad_request');
      deps.limitChanges(me);
      if (channel.slowMode !== seconds) {
        store.setSlowMode(ch, seconds as number);
        store.log(id, me, 'slowmode', '', seconds ? `${seconds} s` : '');
        listChanged(id);
      }
      return { ok: true, slowMode: seconds };
    }],

    // a report: the community's moderators see it, and so does the site's admin panel
    ['POST', route(`/${ID}/channels/${ID}/messages/${MID}/report`), async (req, [id, ch, raw]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      deps.limitReports(me);
      const old = store.message(id, Number(raw));
      if (!old || old.channel !== ch || old.deletedAt) fail(404, 'not_found');
      readable(id, ch, actorOf(id, m));
      if (old!.from === me) fail(400, 'self');
      const { reason } = await body(req);
      const why = typeof reason === 'string' ? reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300) : '';
      if (!store.report(id, old!.id, me, why, old!.text)) fail(409, 'already_reported');
      toStaff(id, { type: 'community', id, report: true });
      listChanged(id, staffOf(id));
      return { ok: true };
    }],
    ['POST', route(`/${ID}/channels/${ID}/read`), (req, [id, ch]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      readable(id, ch, actorOf(id, m));
      store.markRead(ch, me);
      return { ok: true };
    }],
    ['GET', route(`/${ID}/reports`), (req, [id]) => {
      const me = authed(req);
      const { m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'reports')) fail(403, 'not_allowed');
      return { reports: reportsView(store.openReports(id)) };
    }],
    // dismissed, or the message deleted (by someone above its author)
    ['POST', route(`/${ID}/reports/(\\d{1,15})/resolve`), async (req, [id, rid]) => {
      const me = authed(req);
      const { c, m } = membership(id, me);
      if (!allowed(actorOf(id, m), 'reports')) fail(403, 'not_allowed');
      const r = store.reportById(Number(rid));
      if (!r || r.community !== id) fail(404, 'not_found');
      const { action } = await body(req);
      if (action !== 'dismiss' && action !== 'delete') fail(400, 'bad_request');
      const msg = store.message(id, r!.message);
      if (action === 'delete' && msg && !msg.deletedAt) {
        if (!mayDelete(c, actorOf(id, m), msg, me)) fail(403, 'not_allowed');
        deleteMessage(c, msg, me);
      }
      store.resolveReports(r!.message, me, action as string);
      store.log(id, me, action === 'delete' ? 'report_delete' : 'report_dismiss', msg?.from ?? '', `#${r!.message}`);
      listChanged(id, staffOf(id));
      return { reports: reportsView(store.openReports(id)) };
    }],

    // -- the site's admins (moderation) --
    ['GET', /^\/v1\/admin\/communities$/, (req, _p, url) => {
      deps.admin(req);
      return { communities: store.all(query(url)).map((c) => ({ ...c, slug: c.tag || c.id, ...logoField(c.id) })), limits: L };
    }],
    ['GET', /^\/v1\/admin\/communities\/reports$/, (req) => {
      deps.admin(req);
      return { reports: reportsView(store.openReports('')).map((r) => ({ ...r, communityName: store.community(r.community)?.name ?? '' })) };
    }],
    ['POST', /^\/v1\/admin\/communities\/reports\/(\d{1,15})\/resolve$/, async (req, [rid]) => {
      const me = deps.admin(req);
      const r = store.reportById(Number(rid)) ?? fail(404, 'not_found');
      const { action } = await body(req);
      if (action !== 'dismiss' && action !== 'delete') fail(400, 'bad_request');
      const c = store.community(r.community);
      const msg = store.message(r.community, r.message);
      if (action === 'delete' && c && msg && !msg.deletedAt) deleteMessage(c, msg, me);
      store.resolveReports(r.message, me, action as string);
      store.log(r.community, me, action === 'delete' ? 'admin_report_delete' : 'admin_report_dismiss', msg?.from ?? '', `#${r.message}`);
      db.log(me, action === 'delete' ? 'community.message_delete' : 'community.report_dismiss', r.community, `${c?.name ?? ''} #${r.message}`);
      if (c) listChanged(c.id, staffOf(c.id));
      return { ok: true };
    }],
    ['GET', /^\/v1\/admin\/communities\/([\w-]{1,32})$/, (req, [id], url) => {
      deps.admin(req);
      const c = communityOf(id) ?? fail(404, 'not_found');
      const { offset, limit } = page(url, 200, 100);
      const { list, total } = store.members(id, query(url), offset, limit);
      return {
        community: { ...summary(c), channels: store.channels(id), pending: store.requestCount(id), bans: store.bans(id).length },
        members: list.map((x) => ({ ...person(x.uuid), role: x.role, joinedAt: x.joinedAt, mutedUntil: x.mutedUntil })), total,
        log: logView(id, 200), reports: reportsView(store.openReports(id)),
      };
    }],
    ['DELETE', /^\/v1\/admin\/communities\/([\w-]{1,32})$/, (req, [id]) => {
      const me = deps.admin(req);
      const c = store.community(id) ?? fail(404, 'not_found');
      remove(c, me, 'admin_delete');
      db.log(me, 'community.delete', id, c.name);
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/admin\/communities\/([\w-]{1,32})\/logo$/, (req, [id]) => {
      const me = deps.admin(req);
      const c = store.community(id);
      if (!c || !logos.remove(id)) fail(404, 'not_found');
      store.log(id, me, 'admin_logo_remove');
      db.log(me, 'community.logo_remove', id, c!.name);
      listChanged(id);
      return { ok: true };
    }],
    ['DELETE', /^\/v1\/admin\/communities\/([\w-]{1,32})\/description$/, (req, [id]) => {
      const me = deps.admin(req);
      const c = store.community(id) ?? fail(404, 'not_found');
      store.update(id, { ...c, description: '' });
      store.log(id, me, 'admin_description_remove');
      db.log(me, 'community.description_remove', id, c.name);
      listChanged(id);
      return { ok: true };
    }],
    // the admin gives it to another member (an owner who abuses it, or is gone for good)
    ['POST', /^\/v1\/admin\/communities\/([\w-]{1,32})\/owner$/, async (req, [id]) => {
      const me = deps.admin(req);
      const c = communityOf(id) ?? fail(404, 'not_found');
      const other = userFrom(await body(req));
      if (!store.member(id, other.id)) fail(400, 'not_member');
      if (other.id !== c.owner) {
        store.setRole(id, c.owner, 'admin');
        store.setRole(id, other.id, 'owner');
        store.setOwner(id, other.id);
        store.log(id, me, 'admin_transfer', other.id);
        db.log(me, 'community.transfer', id, `${c.name} → @${other.handle}`);
        listChanged(id, [c.owner, other.id]);
      }
      return { ok: true };
    }],
  ];

  // own channels, custom roles (0.9.30): communityManage.ts
  routes.push(...communityManageRoutes({
    db, authed, body, fail, push, store, roles, limits: L, membership, actorOf, listChanged, limitChanges: deps.limitChanges,
    memberView: (c, m, me) => memberView(c, m, me), toReaders,
  }));

  return {
    routes,
    store,
    /** The logos' pictures (not JSON). */
    serveLogo: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => serveLogo(logos, req, res, url),
    /** What a profile shows: public communities the player left on (never private ones). */
    onProfile: (uuid: string) => store.onProfile(uuid).map((c) => ({
      name: c.name, tag: c.tag, slug: c.tag || c.id, members: c.members, role: c.role, ...(logos.version(c.id) !== undefined ? { logo: logos.url(c.id, logos.version(c.id)!) } : {}),
    })),
    limits: L,
  };
}
