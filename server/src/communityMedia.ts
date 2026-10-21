import { randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { withDefaults } from './settings.ts';

/**
 * Pictures and polls in a community's chat (server 0.9.30+).
 *
 * Pictures: the community chat is not end-to-end encrypted (communityStore.ts), so its pictures
 * are not either. The launcher scales a picture down and makes it a JPEG; this server takes only a
 * JPEG it can read through (markers, a frame with sane sides, a scan, the end), keeps just what is
 * needed to show it (the metadata goes: EXIF with the camera and GPS, comments, thumbnails, any
 * trailing bytes) and serves it to the community's members only. The message that carries it has
 * a short text ("[Zdjęcie]") that older launchers show instead. A deleted message's picture goes
 * with it; pictures past `imageDays` leave the message with `image.expired`.
 *
 * Polls: a message whose text is a readable fallback (the question and the options, for older
 * launchers and the game's notifications) and a poll beside it: 2–10 options, one or several
 * choices, an optional end. Members vote and may change their vote until it ends or the author
 * (or a moderator) closes it; every change goes to the members connected as `community-poll`.
 */

export interface CommunityMediaLimits {
  /** Largest picture (a JPEG made by the launcher). */
  imageBytes: number;
  /** Pictures one player may send in all communities per day. */
  imagesPerDay: number;
  /** How long a picture is kept (the message stays). */
  imageDays: number;
  /** The longest a picture's side may be (the launcher sends at most 1920). */
  imageSide: number;
  /** A poll may run at most this long. */
  pollDays: number;
}
export const COMMUNITY_MEDIA_LIMITS: CommunityMediaLimits = { imageBytes: 4 * 1024 * 1024, imagesPerDay: 100, imageDays: 365, imageSide: 4096, pollDays: 30 };

export const POLL_OPTIONS = { min: 2, max: 10 };
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 80;
/** An upload no message took goes after this long. */
const ORPHAN_MS = 3_600_000;
const IMAGE_ID = /^[\w-]{22}$/;

// ---------- JPEG ----------

/** Frames a browser and the game show: baseline, extended and progressive (Huffman). */
const SOF = new Set([0xc0, 0xc1, 0xc2]);
/** Frames we do not take (lossless, hierarchical, arithmetic coding). */
const OTHER_SOF = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * A JPEG with its metadata left out, and its size; undefined when it is not a whole JPEG we take.
 * Kept: the tables, the frame, the scans, a plain JFIF header (no thumbnail) and Adobe's colour
 * marker; everything else (APP1 EXIF/XMP, APP2 ICC, APP13 IPTC, comments, bytes after the end) goes.
 */
export function cleanJpeg(data: Buffer, maxSide = COMMUNITY_MEDIA_LIMITS.imageSide): { jpeg: Buffer; width: number; height: number } | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  const out: Buffer[] = [data.subarray(0, 2)];
  let width = 0, height = 0, scans = 0;
  let i = 2;
  for (;;) {
    if (i + 1 >= data.length || data[i] !== 0xff) return undefined;
    // fill bytes before a marker
    while (i + 1 < data.length && data[i + 1] === 0xff) i++;
    if (i + 1 >= data.length) return undefined;
    const marker = data[i + 1];
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      break;
    }
    // markers without a length do not belong here
    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return undefined;
    if (i + 4 > data.length) return undefined;
    const length = data.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > data.length) return undefined;
    const segment = data.subarray(i, i + 2 + length);
    if (OTHER_SOF.has(marker)) return undefined;
    if (SOF.has(marker)) {
      if (width || length < 8) return undefined;
      height = data.readUInt16BE(i + 5);
      width = data.readUInt16BE(i + 7);
      const components = data[i + 9];
      if (data[i + 4] !== 8 || (components !== 1 && components !== 3) || length !== 8 + components * 3) return undefined;
      if (!width || !height || width > maxSide || height > maxSide) return undefined;
    }
    let keep = true;
    if (marker === 0xfe || (marker >= 0xe1 && marker <= 0xef && marker !== 0xee)) keep = false;
    // JFIF without a thumbnail; Adobe's marker says how the colours were stored
    if (marker === 0xe0) keep = length === 16 && segment.toString('latin1', 4, 9) === 'JFIF\0' && segment[16] === 0 && segment[17] === 0;
    if (marker === 0xee) keep = length === 14 && segment.toString('latin1', 4, 9) === 'Adobe';
    if (keep) out.push(segment);
    i += 2 + length;
    if (marker === 0xda) {
      if (!width) return undefined;
      scans++;
      // the coded data runs to the next marker that is not a stuffed 0xFF or a restart
      let j = i;
      while (j + 1 < data.length) {
        if (data[j] === 0xff) {
          const n = data[j + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) {
            j += 2;
            continue;
          }
          if (n === 0xff) {
            j++;
            continue;
          }
          break;
        }
        j++;
      }
      if (j + 1 >= data.length) return undefined;
      out.push(data.subarray(i, j));
      i = j;
    }
  }
  if (!width || !scans) return undefined;
  return { jpeg: Buffer.concat(out), width, height };
}

// ---------- polls ----------

export interface PollDraft { question: string; options: string[]; multiple: boolean; endsAt: number | null }

const oneLine = (s: unknown, max: number): string | undefined => {
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && !/[\u0000-\u001f\u007f]/.test(t) ? t : undefined;
};

/** A poll from a request, or the reason it cannot be one. */
export function cleanPoll(raw: unknown, now = Date.now(), maxDays = COMMUNITY_MEDIA_LIMITS.pollDays): PollDraft | 'bad_poll' | 'bad_poll_end' {
  if (!raw || typeof raw !== 'object') return 'bad_poll';
  const r = raw as Record<string, unknown>;
  const question = oneLine(r.question, POLL_QUESTION_MAX);
  if (!question || !Array.isArray(r.options) || r.options.length < POLL_OPTIONS.min || r.options.length > POLL_OPTIONS.max) return 'bad_poll';
  const options = r.options.map((o) => oneLine(o, POLL_OPTION_MAX));
  if (options.some((o) => !o) || new Set(options.map((o) => o!.toLowerCase())).size !== options.length) return 'bad_poll';
  if (r.multiple !== undefined && typeof r.multiple !== 'boolean') return 'bad_poll';
  let endsAt: number | null = null;
  if (r.endsAt !== undefined && r.endsAt !== null) {
    // at least a minute from now, at most `maxDays`
    if (typeof r.endsAt !== 'number' || !Number.isSafeInteger(r.endsAt) || r.endsAt < now + 60_000 || r.endsAt > now + maxDays * 86_400_000) return 'bad_poll_end';
    endsAt = r.endsAt;
  }
  return { question, options: options as string[], multiple: r.multiple === true, endsAt };
}

/** What older launchers (and notifications) show instead of the poll. */
export function pollFallback(p: Pick<PollDraft, 'question' | 'options'>, lang: unknown): string {
  const en = lang === 'en';
  return [`📊 ${en ? 'Poll' : 'Ankieta'}: ${p.question}`, ...p.options.map((o) => `• ${o}`),
    en ? '(Vote in the SlashClient launcher.)' : '(Zagłosuj w launcherze SlashClient.)'].join('\n');
}

export const pictureFallback = (lang: unknown) => (lang === 'en' ? '[Picture]' : '[Zdjęcie]');

export interface PollView {
  question: string; options: { text: string; votes: number }[]; multiple: boolean; voters: number;
  endsAt?: number; closed?: true; closedAt?: number; mine?: number[];
}
export interface ImageView { id: string; w: number; h: number; size: number; expired?: true }

// ---------- the data ----------

interface ImageRow { id: string; community: string; channel: string; owner: string; size: number; width: number; height: number; createdAt: number; messageId: number | null; gone: number }
interface PollRow { messageId: number; community: string; channel: string; question: string; options: string; multiple: number; endsAt: number | null; closedAt: number | null; closedBy: string | null }

export class CommunityMediaStore {
  private readonly sql: DatabaseSync;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS community_images (id TEXT PRIMARY KEY, community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE, channel_id TEXT NOT NULL,
  owner TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, created_at INTEGER NOT NULL, message_id INTEGER, gone INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS community_images_message ON community_images(message_id);
CREATE INDEX IF NOT EXISTS community_images_owner ON community_images(owner, created_at);
CREATE TABLE IF NOT EXISTS community_polls (message_id INTEGER PRIMARY KEY REFERENCES community_messages(id) ON DELETE CASCADE, community_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  question TEXT NOT NULL, options TEXT NOT NULL, multiple INTEGER NOT NULL DEFAULT 0, ends_at INTEGER, closed_at INTEGER, closed_by TEXT);
CREATE TABLE IF NOT EXISTS community_poll_votes (message_id INTEGER NOT NULL REFERENCES community_polls(message_id) ON DELETE CASCADE, uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
  option INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (message_id, uuid, option));
`);
  }

  private static readonly IMAGE = `id, community_id AS community, channel_id AS channel, owner, size, width, height, created_at AS createdAt, message_id AS messageId, gone`;

  addImage(r: Omit<ImageRow, 'messageId' | 'gone'>) {
    this.sql.prepare('INSERT INTO community_images (id, community_id, channel_id, owner, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.id, r.community, r.channel, r.owner, r.size, r.width, r.height, r.createdAt);
  }

  image(id: string): ImageRow | undefined {
    return this.sql.prepare(`SELECT ${CommunityMediaStore.IMAGE} FROM community_images WHERE id = ?`).get(id) as ImageRow | undefined;
  }

  imageOf(mid: number): ImageRow | undefined {
    return this.sql.prepare(`SELECT ${CommunityMediaStore.IMAGE} FROM community_images WHERE message_id = ?`).get(mid) as ImageRow | undefined;
  }

  attachImage(id: string, mid: number) {
    this.sql.prepare('UPDATE community_images SET message_id = ? WHERE id = ?').run(mid, id);
  }

  /** Pictures sent by one player since then, and their bytes. */
  sentSince(owner: string, since: number): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM community_images WHERE owner = ? AND created_at > ?').get(owner, since) as { n: number }).n;
  }

  /** The ids of pictures to drop: past their time (`old`: their files go, the row says so) and uploads no message took. */
  stale(now: number, days: number): { old: string[]; orphans: string[] } {
    const old = (this.sql.prepare('SELECT id FROM community_images WHERE gone = 0 AND message_id IS NOT NULL AND created_at < ?').all(now - days * 86_400_000) as { id: string }[]).map((r) => r.id);
    const orphans = (this.sql.prepare('SELECT id FROM community_images WHERE message_id IS NULL AND created_at < ?').all(now - ORPHAN_MS) as { id: string }[]).map((r) => r.id);
    return { old, orphans };
  }

  markGone(id: string) {
    this.sql.prepare('UPDATE community_images SET gone = 1 WHERE id = ?').run(id);
  }

  deleteImage(id: string) {
    this.sql.prepare('DELETE FROM community_images WHERE id = ?').run(id);
  }

  /** Every picture's id kept (to find files nobody needs any more). */
  imageIds(): Set<string> {
    return new Set((this.sql.prepare('SELECT id FROM community_images WHERE gone = 0').all() as { id: string }[]).map((r) => r.id));
  }

  imagesOfCommunity(community: string): string[] {
    return (this.sql.prepare('SELECT id FROM community_images WHERE community_id = ?').all(community) as { id: string }[]).map((r) => r.id);
  }

  addPoll(mid: number, community: string, channel: string, p: PollDraft) {
    this.sql.prepare('INSERT INTO community_polls (message_id, community_id, channel_id, question, options, multiple, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(mid, community, channel, p.question, JSON.stringify(p.options), p.multiple ? 1 : 0, p.endsAt);
  }

  poll(mid: number): (Omit<PollRow, 'options'> & { options: string[] }) | undefined {
    const r = this.sql.prepare(`SELECT message_id AS messageId, community_id AS community, channel_id AS channel, question, options, multiple, ends_at AS endsAt, closed_at AS closedAt, closed_by AS closedBy
      FROM community_polls WHERE message_id = ?`).get(mid) as PollRow | undefined;
    return r && { ...r, options: JSON.parse(r.options) as string[] };
  }

  removePoll(mid: number) {
    this.sql.prepare('DELETE FROM community_poll_votes WHERE message_id = ?').run(mid);
    this.sql.prepare('DELETE FROM community_polls WHERE message_id = ?').run(mid);
  }

  closePoll(mid: number, by: string, now = Date.now()): boolean {
    return Number(this.sql.prepare('UPDATE community_polls SET closed_at = ?, closed_by = ? WHERE message_id = ? AND closed_at IS NULL').run(now, by, mid).changes) > 0;
  }

  /** One's votes replaced by these (none: the vote taken back). */
  vote(mid: number, uuid: string, options: number[], now = Date.now()) {
    this.sql.exec('BEGIN');
    try {
      this.sql.prepare('DELETE FROM community_poll_votes WHERE message_id = ? AND uuid = ?').run(mid, uuid);
      const add = this.sql.prepare('INSERT INTO community_poll_votes (message_id, uuid, option, at) VALUES (?, ?, ?, ?)');
      for (const o of options) add.run(mid, uuid, o, now);
      this.sql.exec('COMMIT');
    } catch (err) {
      this.sql.exec('ROLLBACK');
      throw err;
    }
  }

  counts(mid: number): { votes: Map<number, number>; voters: number } {
    const rows = this.sql.prepare('SELECT option, COUNT(*) AS n FROM community_poll_votes WHERE message_id = ? GROUP BY option').all(mid) as { option: number; n: number }[];
    const voters = (this.sql.prepare('SELECT COUNT(DISTINCT uuid) AS n FROM community_poll_votes WHERE message_id = ?').get(mid) as { n: number }).n;
    return { votes: new Map(rows.map((r) => [r.option, r.n])), voters };
  }

  votesOf(mid: number, uuid: string): number[] {
    return (this.sql.prepare('SELECT option FROM community_poll_votes WHERE message_id = ? AND uuid = ? ORDER BY option').all(mid, uuid) as { option: number }[]).map((r) => r.option);
  }
}

// ---------- the routes ----------

type Handler = (req: http.IncomingMessage, params: string[], url: URL) => Promise<unknown> | unknown;
type Role = 'owner' | 'admin' | 'moderator' | 'member';

/** What communities.ts lends: who is in, the channel, and telling the members. */
export interface MediaContext {
  sql: DatabaseSync;
  dir: string;
  limits?: Partial<CommunityMediaLimits>;
  authed: (req: http.IncomingMessage) => string;
  body: (req: http.IncomingMessage) => Promise<Record<string, unknown>>;
  fail: (status: number, code: string, retryAfter?: number) => never;
  /** My membership (404 when not a member), and the channel if `me` may read it (404 otherwise). */
  reader: (community: string, channel: string, me: string) => { role: Role; mutedUntil: number };
  /** Whether `me` may write there now (the channel's role, a timeout); throws like a message would. */
  writer: (community: string, channel: string, me: string) => void;
  /** The message as the members get it (`me`: their own votes marked). */
  message: (community: string, mid: number, me?: string) => { id: number; from: string; channel: string; deleted?: boolean; author: { role?: Role } } | undefined;
  /** Whether this member may close others' polls (moderators and up, or a custom role that may pin). */
  moderates: (member: { role: Role }) => boolean;
  toMembers: (community: string, event: unknown) => void;
  log: (community: string, by: string, action: string, target: string, detail: string) => void;
  limitUploads: (key: string) => void;
  limitDownloads: (key: string) => void;
  limitVotes?: (key: string) => void;
}

const MID = '(\\d{1,15})';
const ID = '([\\w-]{1,32})';

export function createCommunityMedia(ctx: MediaContext) {
  const { fail } = ctx;
  const L = withDefaults(COMMUNITY_MEDIA_LIMITS, ctx.limits);
  const store = new CommunityMediaStore(ctx.sql);
  mkdirSync(ctx.dir, { recursive: true });
  const fileOf = (id: string) => path.join(ctx.dir, `${id}.jpg`);
  const route = (p: string) => new RegExp(`^/v1/communities/${ID}/channels/${ID}${p}$`);

  async function readBody(req: http.IncomingMessage): Promise<Buffer> {
    if (Number(req.headers['content-length']) > L.imageBytes) {
      req.resume();
      fail(413, 'too_large');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size <= L.imageBytes) chunks.push(chunk);
    }
    if (size > L.imageBytes) fail(413, 'too_large');
    return Buffer.concat(chunks);
  }

  function pollView(mid: number, me?: string): PollView | undefined {
    const p = store.poll(mid);
    if (!p) return undefined;
    const { votes, voters } = store.counts(mid);
    const closed = !!p.closedAt || (!!p.endsAt && p.endsAt <= Date.now());
    return {
      question: p.question, options: p.options.map((text, i) => ({ text, votes: votes.get(i) ?? 0 })), multiple: !!p.multiple, voters,
      ...(p.endsAt ? { endsAt: p.endsAt } : {}), ...(closed ? { closed: true as const } : {}), ...(p.closedAt ? { closedAt: p.closedAt } : {}),
      ...(me ? { mine: store.votesOf(mid, me) } : {}),
    };
  }

  function imageView(mid: number): ImageView | undefined {
    const r = store.imageOf(mid);
    if (!r) return undefined;
    return { id: r.id, w: r.width, h: r.height, size: r.size, ...(r.gone ? { expired: true as const } : {}) };
  }

  /** The poll after a change, to everyone connected (without anyone's own votes). */
  function pushPoll(community: string, channel: string, mid: number, by: string) {
    const poll = pollView(mid);
    if (poll) ctx.toMembers(community, { type: 'community-poll', community, channel, message: mid, poll, user: by });
  }

  /** A poll message of that channel, still there; 404 otherwise. */
  function pollMessage(community: string, channel: string, mid: number, me: string) {
    const m = ctx.message(community, mid, me);
    const p = store.poll(mid);
    if (!m || m.deleted || m.channel !== channel || !p) return fail(404, 'not_found');
    return { m, p };
  }

  const routes: [string, RegExp, Handler][] = [
    // a picture for the next message in this channel: a JPEG (the launcher makes it) as the raw body
    ['POST', route('/images'), async (req, [community, channel]) => {
      const me = ctx.authed(req);
      try {
        ctx.writer(community, channel, me);
        ctx.limitUploads(`cimage:${me}`);
        if (store.sentSince(me, Date.now() - 86_400_000) >= L.imagesPerDay) fail(429, 'image_quota');
      } catch (err) {
        req.resume();
        throw err;
      }
      const clean = cleanJpeg(await readBody(req), L.imageSide);
      if (!clean) fail(400, 'not_an_image');
      const id = randomBytes(16).toString('base64url');
      // written aside and moved in, so a half-written file is never served
      await writeFile(`${fileOf(id)}.part`, clean!.jpeg);
      await rename(`${fileOf(id)}.part`, fileOf(id));
      store.addImage({ id, community, channel, owner: me, size: clean!.jpeg.length, width: clean!.width, height: clean!.height, createdAt: Date.now() });
      return { id, w: clean!.width, h: clean!.height, size: clean!.jpeg.length };
    }],
    // a vote: `options` the chosen ones' numbers (one at most unless the poll allows several; none takes it back)
    ['POST', route(`/messages/${MID}/vote`), async (req, [community, channel, raw]) => {
      const me = ctx.authed(req);
      const member = ctx.reader(community, channel, me);
      const { p } = pollMessage(community, channel, Number(raw), me);
      if (member.mutedUntil > Date.now()) fail(403, 'community_muted');
      if (p.closedAt || (p.endsAt && p.endsAt <= Date.now())) fail(409, 'poll_closed');
      const { options } = await ctx.body(req);
      if (!Array.isArray(options) || options.some((o) => !Number.isInteger(o) || o < 0 || o >= p.options.length) || new Set(options).size !== options.length
        || (!p.multiple && options.length > 1)) fail(400, 'bad_vote');
      ctx.limitVotes?.(me);
      store.vote(p.messageId, me, [...(options as number[])].sort((a, b) => a - b));
      pushPoll(community, channel, p.messageId, me);
      return { message: ctx.message(community, p.messageId, me) };
    }],
    // closed before its end: by its author, or a moderator and up
    ['POST', route(`/messages/${MID}/poll/close`), (req, [community, channel, raw]) => {
      const me = ctx.authed(req);
      const member = ctx.reader(community, channel, me);
      const { m, p } = pollMessage(community, channel, Number(raw), me);
      if (m.from !== me && !ctx.moderates(member)) fail(403, 'not_allowed');
      if (p.closedAt || (p.endsAt && p.endsAt <= Date.now())) fail(409, 'poll_closed');
      store.closePoll(p.messageId, me);
      if (m.from !== me) ctx.log(community, me, 'poll_close', m.from, `#${p.messageId}`);
      pushPoll(community, channel, p.messageId, me);
      return { message: ctx.message(community, p.messageId, me) };
    }],
  ];

  /**
   * A new message's picture or poll, checked before it is written: the text it carries for older
   * launchers, and what to do once it has its id. Undefined for a plain text message.
   */
  function prepare(raw: Record<string, unknown>, community: string, channel: string, me: string): { text: string; attach: (mid: number) => void } | undefined {
    const hasImage = raw.image !== undefined && raw.image !== null;
    const hasPoll = raw.poll !== undefined && raw.poll !== null;
    if (!hasImage && !hasPoll) return undefined;
    if (hasImage && hasPoll) fail(400, 'bad_request');
    if (hasImage) {
      const id = raw.image;
      const r = typeof id === 'string' && IMAGE_ID.test(id) ? store.image(id) : undefined;
      if (!r || r.owner !== me || r.community !== community || r.channel !== channel || r.messageId !== null || r.gone) fail(400, 'bad_image');
      const caption = typeof raw.text === 'string' ? raw.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, 200) : '';
      return { text: caption || pictureFallback(raw.lang), attach: (mid) => store.attachImage(r!.id, mid) };
    }
    const poll = cleanPoll(raw.poll, Date.now(), L.pollDays);
    if (typeof poll === 'string') fail(400, poll);
    const draft = poll as PollDraft;
    return { text: pollFallback(draft, raw.lang), attach: (mid) => store.addPoll(mid, community, channel, draft) };
  }

  /** What a message carries besides its text (none for a deleted one). */
  function extras(mid: number, me?: string): { image?: ImageView; poll?: PollView } {
    const image = imageView(mid);
    const poll = image ? undefined : pollView(mid, me);
    return { ...(image ? { image } : {}), ...(poll ? { poll } : {}) };
  }

  /** Whether a message is a picture or a poll (those are not edited). */
  const special = (mid: number) => !!store.imageOf(mid) || !!store.poll(mid);

  /** A deleted message's picture (file and all) and poll go with it (a small file: removed at once, so it is gone when the answer comes). */
  function remove(mid: number) {
    const img = store.imageOf(mid);
    if (img) {
      store.deleteImage(img.id);
      rmSync(fileOf(img.id), { force: true });
    }
    store.removePoll(mid);
  }

  /** A community deleted: its pictures' files go (the rows go with the community). */
  function removeCommunity(community: string) {
    for (const id of store.imagesOfCommunity(community)) rmSync(fileOf(id), { force: true });
  }

  /** GET /v1/communities/<id>/images/<image>: the JPEG, to members who may read its channel. True when the request was this. */
  async function serve(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/v1\/communities\/([\w-]{1,32})\/images\/([\w-]{1,64})$/.exec(url.pathname);
    if (req.method !== 'GET' || !m) return false;
    const answer = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
      return true;
    };
    try {
      const me = ctx.authed(req);
      ctx.limitDownloads(`cimage:${me}`);
      const r = IMAGE_ID.test(m[2]) ? store.image(m[2]) : undefined;
      if (!r || r.community !== m[1] || r.gone) return answer(404, 'not_found');
      // a member who may read that channel (an upload not sent yet: only its owner)
      ctx.reader(r.community, r.channel, me);
      if (r.messageId === null && r.owner !== me) return answer(404, 'not_found');
      const size = await stat(fileOf(r.id)).then((s) => s.size, () => undefined);
      if (size === undefined) return answer(404, 'not_found');
      res.writeHead(200, {
        'Content-Type': 'image/jpeg', 'Content-Length': size, 'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Content-Disposition': 'inline',
      });
      createReadStream(fileOf(r.id)).on('error', () => res.destroy()).pipe(res);
      return true;
    } catch (err) {
      const e = err as { status?: number; code?: string };
      return answer(e.status ?? 500, e.code ?? 'server_error');
    }
  }

  /** Pictures past their time (the message stays, saying so), uploads no message took, and files nobody needs. */
  async function cleanup(now = Date.now()) {
    const { old, orphans } = store.stale(now, L.imageDays);
    for (const id of old) {
      await rm(fileOf(id), { force: true });
      store.markGone(id);
    }
    for (const id of orphans) {
      await rm(fileOf(id), { force: true });
      store.deleteImage(id);
    }
    // files of messages whose author's account or community went away
    const kept = store.imageIds();
    for (const f of await readdir(ctx.dir).catch(() => [] as string[])) {
      const id = /^([\w-]{22})\.jpg$/.exec(f)?.[1];
      if (id && !kept.has(id) && (await stat(path.join(ctx.dir, f)).then((s) => now - s.mtimeMs > ORPHAN_MS, () => false))) await rm(path.join(ctx.dir, f), { force: true });
    }
  }

  return {
    routes, prepare, extras, special, remove, removeCommunity, serve, cleanup, store, limits: L,
  };
}
