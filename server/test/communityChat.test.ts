import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { QUICK_REACTIONS, REACTIONS, SLOW_MODES, isReaction } from '../src/communityStore.ts';

/** The community chat's extras (0.9.27): reactions, replies with a quote, pins, slow mode and timeouts. */

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-community-chat-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}
type Player = { token: string; user: { id: string; handle: string; name: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function connect(token: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence: { status: 'online' } }));
  const waitFor = async (pred: (e: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('event did not come');
  };
  await waitFor((e) => e.type === 'ready');
  return { ws, events, waitFor };
}

/** A community with an owner, an admin, a moderator and two members. */
async function community(prefix: string) {
  const owner = await login(`${prefix}Own`);
  const admin = await login(`${prefix}Adm`);
  const mod = await login(`${prefix}Mod`);
  const member = await login(`${prefix}Mem`);
  const other = await login(`${prefix}Oth`);
  const made = await call('POST', '/v1/communities', owner.token, { name: `Czat ${prefix}` });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const id = made.body.community.id as string;
  for (const p of [admin, mod, member, other]) assert.equal((await call('POST', `/v1/communities/${id}/join`, p.token)).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${admin.user.id}/role`, owner.token, { role: 'admin' })).status, 200);
  assert.equal((await call('POST', `/v1/communities/${id}/members/${mod.user.id}/role`, owner.token, { role: 'moderator' })).status, 200);
  const general = made.body.community.channels.find((c: any) => c.kind === 'general').id as string;
  const news = made.body.community.channels.find((c: any) => c.kind === 'announcements').id as string;
  return { id, owner, admin, mod, member, other, general, news };
}
type C = Awaited<ReturnType<typeof community>>;
const msgs = (c: C, ch = c.general) => `/v1/communities/${c.id}/channels/${ch}/messages`;
const post = (c: C, p: Player, text: string, extra: Record<string, unknown> = {}, ch = c.general) => call('POST', msgs(c, ch), p.token, { text, ...extra });
const react = (c: C, p: Player, mid: number, emoji: string, on?: boolean) => call('POST', `${msgs(c)}/${mid}/reactions`, p.token, { emoji, ...(on === undefined ? {} : { on }) });
const history = async (c: C, p: Player, ch = c.general) => (await call('GET', msgs(c, ch), p.token)).body;

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 10_000, oauth: {},
    communityLimits: { members: 20, reactions: 3, pins: 2 }, chatBurst: { messages: 100, seconds: 10 }, profileViewsPerMinute: 10_000,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('community chat extras', () => {
  it('knows its emoji: a fixed set, the quick ones first', () => {
    assert.deepEqual(REACTIONS.slice(0, QUICK_REACTIONS.length), QUICK_REACTIONS);
    assert.equal(new Set(REACTIONS).size, REACTIONS.length);
    assert.ok(isReaction('👍') && isReaction('❤️'));
    for (const bad of ['', 'x', ':custom:', '👍👍', 5, null]) assert.equal(isReaction(bad), false, String(bad));
    assert.ok(SLOW_MODES.includes(0) && SLOW_MODES.includes(3600));
  });

  it('reacts: adds and takes off one\'s own, counts each emoji, says who, pushes it live', async () => {
    const c = await community('Rx');
    const live = await connect(c.member.token);
    const m = (await post(c, c.owner, 'Wiadomość do reakcji')).body.message;
    let r = await react(c, c.member, m.id, '👍');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.message.reactions, [{ emoji: '👍', count: 1, me: true }]);
    const ev = await live.waitFor((e) => e.type === 'community-reaction');
    assert.deepEqual({ ...ev }, { type: 'community-reaction', community: c.id, channel: c.general, message: m.id, emoji: '👍', user: c.member.user.id, on: true, count: 1 });
    // a toggle: the same again takes it off; `on` says it outright (twice is no change)
    assert.equal((await react(c, c.mod, m.id, '👍', true)).body.message.reactions[0].count, 2);
    assert.equal((await react(c, c.mod, m.id, '👍', true)).body.message.reactions[0].count, 2);
    r = await react(c, c.member, m.id, '👍');
    assert.deepEqual(r.body.message.reactions, [{ emoji: '👍', count: 1 }]);
    await react(c, c.member, m.id, '🔥');
    // the history marks the reader's own
    const seen = (await history(c, c.member)).messages.find((x: any) => x.id === m.id);
    assert.deepEqual(seen.reactions, [{ emoji: '👍', count: 1 }, { emoji: '🔥', count: 1, me: true }]);
    const who = await call('GET', `${msgs(c)}/${m.id}/reactions`, c.owner.token);
    assert.equal(who.status, 200);
    assert.deepEqual(who.body.reactions.map((x: any) => [x.emoji, x.count, x.users.map((u: any) => u.id)]), [['👍', 1, [c.mod.user.id]], ['🔥', 1, [c.member.user.id]]]);
    // no custom emoji, nothing odd
    for (const emoji of [':kekw:', 'a', '', 42]) assert.equal((await react(c, c.member, m.id, emoji as string)).body.error, 'bad_reaction');
    assert.equal((await call('POST', `${msgs(c)}/${m.id}/reactions`, c.member.token, { emoji: '👍', on: 'yes' })).body.error, 'bad_reaction');
    live.ws.close();
  });

  it('keeps reactions within the limits, to members, and off deleted messages', async () => {
    const c = await community('Rl');
    const m = (await post(c, c.owner, 'Limit reakcji')).body.message;
    // at most 3 different emoji (the test's limit): a 4th kind is refused, one already there is fine
    for (const e of ['👍', '❤️', '😂']) assert.equal((await react(c, c.member, m.id, e)).status, 200);
    assert.equal((await react(c, c.member, m.id, '😮')).body.error, 'too_many_reactions');
    assert.equal((await react(c, c.other, m.id, '😂')).status, 200);
    // taking one kind off makes room again
    await react(c, c.member, m.id, '❤️', false);
    assert.equal((await react(c, c.member, m.id, '😮')).status, 200);
    // not a member: as if it were not there
    const outsider = await login('RlOut');
    assert.equal((await react(c, outsider, m.id, '👍')).status, 404);
    assert.equal((await call('GET', `${msgs(c)}/${m.id}/reactions`, outsider.token)).status, 404);
    // a message of another channel through this one's address
    const n = (await post(c, c.owner, 'ogłoszenie', {}, c.news)).body.message;
    assert.equal((await react(c, c.member, n.id, '👍')).status, 404);
    // deleted: its reactions go with it, and no new ones
    assert.equal((await call('DELETE', `${msgs(c)}/${m.id}`, c.owner.token)).status, 200);
    const gone = (await history(c, c.member)).messages.find((x: any) => x.id === m.id);
    assert.equal(gone.deleted, true);
    assert.equal(gone.reactions, undefined);
    assert.equal((await react(c, c.member, m.id, '👍')).status, 404);
  });

  it('replies with a quote of a message in the same channel only, and a deleted one shows as gone', async () => {
    const c = await community('Re');
    const live = await connect(c.member.token);
    const first = (await post(c, c.member, 'Pierwsza linia\ndruga linia')).body.message;
    const reply = await post(c, c.mod, 'Odpowiedź', { replyTo: first.id });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual(reply.body.message.replyTo, { id: first.id, from: c.member.user.id, author: { name: c.member.user.name, handle: c.member.user.handle }, text: 'Pierwsza linia' });
    // the one answered hears of it as of a mention
    assert.deepEqual(reply.body.message.mentions, [c.member.user.id]);
    const pushed = await live.waitFor((e) => e.type === 'community-message' && e.message.id === reply.body.message.id);
    assert.equal(pushed.message.replyTo.id, first.id);
    // another channel, another community, nothing there, or not a number: refused
    const n = (await post(c, c.owner, 'ogłoszenie', {}, c.news)).body.message;
    assert.equal((await post(c, c.member, 'x', { replyTo: n.id })).body.error, 'bad_reply');
    const d = await community('Rd');
    const elsewhere = (await post(d, d.owner, 'gdzie indziej')).body.message;
    assert.equal((await post(c, c.member, 'x', { replyTo: elsewhere.id })).body.error, 'bad_reply');
    assert.equal((await post(c, c.member, 'x', { replyTo: 999_999_999 })).body.error, 'bad_reply');
    assert.equal((await post(c, c.member, 'x', { replyTo: 'abc' })).body.error, 'bad_request');
    // the original deleted: the reply stays, its quote says it is gone; replying to it now is refused
    assert.equal((await call('DELETE', `${msgs(c)}/${first.id}`, c.member.token)).status, 200);
    const after = (await history(c, c.member)).messages.find((x: any) => x.id === reply.body.message.id);
    assert.deepEqual(after.replyTo, { id: first.id, from: c.member.user.id, author: { name: c.member.user.name, handle: c.member.user.handle }, text: '', deleted: true });
    assert.equal((await post(c, c.member, 'x', { replyTo: first.id })).body.error, 'reply_deleted');
    // a plain message has no quote (older clients send none)
    assert.equal((await post(c, c.member, 'zwykła')).body.message.replyTo, undefined);
    live.ws.close();
  });

  it('pins: moderators and up, up to the limit, a list in the channel, pushed, and gone with the message', async () => {
    const c = await community('Pn');
    const live = await connect(c.member.token);
    const [a, b, x] = [(await post(c, c.member, 'A')).body.message, (await post(c, c.member, 'B')).body.message, (await post(c, c.member, 'C')).body.message];
    const pin = (p: Player, mid: number, pinned: boolean) => call('POST', `${msgs(c)}/${mid}/pin`, p.token, { pinned });
    assert.equal((await pin(c.member, a.id, true)).body.error, 'not_allowed');
    assert.equal((await pin(await login('PnOut'), a.id, true)).status, 404);
    let r = await pin(c.mod, a.id, true);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.message.pinned, true);
    assert.equal(r.body.pins, 1);
    const ev = await live.waitFor((e) => e.type === 'community-pin');
    assert.equal(ev.message.id, a.id);
    assert.equal(ev.pinned, true);
    assert.equal(ev.by.id, c.mod.user.id);
    assert.equal((await pin(c.admin, b.id, true)).status, 200);
    // the test's limit is 2; pinning one already pinned is no change
    assert.equal((await pin(c.owner, x.id, true)).body.error, 'too_many_pins');
    assert.equal((await pin(c.owner, a.id, true)).status, 200);
    assert.equal((await pin(c.member, a.id, 'yes' as never)).status, 403);
    assert.equal((await pin(c.mod, a.id, 'yes' as never)).body.error, 'bad_request');
    const list = await call('GET', `/v1/communities/${c.id}/channels/${c.general}/pins`, c.member.token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.pins.map((p: any) => p.message.id), [b.id, a.id]);
    assert.equal(list.body.pins[0].by.id, c.admin.user.id);
    assert.equal(list.body.limit, 2);
    assert.equal((await history(c, c.member)).pins, 2);
    // unpinned makes room; a deleted message is unpinned with it
    assert.equal((await pin(c.mod, b.id, false)).body.pins, 1);
    assert.equal((await pin(c.mod, x.id, true)).status, 200);
    assert.equal((await call('DELETE', `${msgs(c)}/${x.id}`, c.mod.token)).status, 200);
    assert.deepEqual((await call('GET', `/v1/communities/${c.id}/channels/${c.general}/pins`, c.member.token)).body.pins.map((p: any) => p.message.id), [a.id]);
    assert.equal((await pin(c.mod, x.id, true)).status, 404);
    // pinning goes to the moderation log
    const log = (await call('GET', `/v1/communities/${c.id}/log`, c.owner.token)).body.log;
    assert.ok(log.some((e: any) => e.action === 'pin') && log.some((e: any) => e.action === 'unpin'));
    live.ws.close();
  });

  it('slow mode: set by admins, one message per member per that long, moderators exempt', async () => {
    const c = await community('Sl');
    const slow = (p: Player, seconds: unknown) => call('POST', `/v1/communities/${c.id}/channels/${c.general}/slowmode`, p.token, { seconds });
    assert.equal((await slow(c.mod, 30)).body.error, 'not_allowed');
    assert.equal((await slow(c.member, 30)).body.error, 'not_allowed');
    assert.equal((await slow(await login('SlOut'), 30)).status, 404);
    assert.equal((await slow(c.admin, 7)).body.error, 'bad_request');
    const live = await connect(c.member.token);
    assert.equal((await slow(c.admin, 30)).status, 200);
    await live.waitFor((e) => e.type === 'communities' && e.id === c.id);
    const mine = (await call('GET', '/v1/communities/mine', c.member.token)).body.communities[0];
    assert.equal(mine.channels.find((ch: any) => ch.id === c.general).slowMode, 30);
    assert.equal(mine.channels.find((ch: any) => ch.id === c.news).slowMode, undefined);
    // a member: the first goes, the next is told how long to wait
    const first = await post(c, c.member, 'raz');
    assert.equal(first.status, 200);
    assert.ok(first.body.nextPostAt > Date.now() + 25_000);
    const second = await post(c, c.member, 'dwa');
    assert.equal(second.status, 429);
    assert.equal(second.body.error, 'slow_mode');
    assert.ok(second.body.retryAfter > 25 && second.body.retryAfter <= 30, String(second.body.retryAfter));
    assert.equal(second.headers.get('retry-after'), String(second.body.retryAfter));
    const h = await history(c, c.member);
    assert.equal(h.slowMode, 30);
    assert.ok(h.nextPostAt > Date.now());
    // another member is not held back by someone else's message; deleting one's own does not skip it
    assert.equal((await post(c, c.other, 'ja też')).status, 200);
    await call('DELETE', `${msgs(c)}/${first.body.message.id}`, c.member.token);
    assert.equal((await post(c, c.member, 'trzy')).body.error, 'slow_mode');
    // moderators and up write as they like
    for (const p of [c.mod, c.mod, c.admin, c.admin, c.owner]) assert.equal((await post(c, p, 'moderacja')).status, 200);
    assert.equal((await history(c, c.mod)).nextPostAt, undefined);
    // off again: at once
    assert.equal((await slow(c.owner, 0)).status, 200);
    assert.equal((await post(c, c.member, 'cztery')).status, 200);
    const log = (await call('GET', `/v1/communities/${c.id}/log`, c.owner.token)).body.log;
    assert.ok(log.filter((e: any) => e.action === 'slowmode').length >= 2);
    live.ws.close();
  });

  it('a timeout (the mute): moderators on those below, no writing, editing or reacting, shown to them and the moderators, and it ends by itself', async () => {
    const c = await community('To');
    const m = (await post(c, c.owner, 'przed')).body.message;
    const own = (await post(c, c.member, 'moja')).body.message;
    const timeout = (p: Player, who: Player, minutes: number) => call('POST', `/v1/communities/${c.id}/members/${who.user.id}/mute`, p.token, { minutes });
    // not on someone of one's own role or above, not by members
    assert.equal((await timeout(c.member, c.other, 5)).body.error, 'not_allowed');
    assert.equal((await timeout(c.mod, c.admin, 5)).body.error, 'not_allowed');
    assert.equal((await timeout(c.admin, c.owner, 5)).body.error, 'not_allowed');
    const live = await connect(c.member.token);
    for (const minutes of [5, 60, 1440, 10080]) assert.equal((await timeout(c.mod, c.member, minutes)).status, 200);
    const ev = await live.waitFor((e) => e.type === 'community' && e.muted);
    assert.ok(ev.muted.until > Date.now());
    // reads, does not write, edit or react
    assert.equal((await history(c, c.member)).messages.length, 2);
    assert.equal((await post(c, c.member, 'hej')).body.error, 'community_muted');
    assert.equal((await call('POST', `${msgs(c)}/${own.id}/edit`, c.member.token, { text: 'zmiana' })).body.error, 'community_muted');
    assert.equal((await react(c, c.member, m.id, '👍')).body.error, 'community_muted');
    // shown to them and to the moderators, not to other members
    const me = (await call('GET', '/v1/communities/mine', c.member.token)).body.communities[0];
    assert.ok(me.mutedUntil > Date.now() + 6 * 86_400_000);
    const row = async (p: Player) => (await call('GET', `/v1/communities/${c.id}/members`, p.token)).body.members.find((x: any) => x.id === c.member.user.id);
    assert.ok((await row(c.member)).mutedUntil > Date.now());
    assert.ok((await row(c.mod)).mutedUntil > Date.now());
    assert.equal((await row(c.other)).mutedUntil, undefined);
    // logged
    const log = (await call('GET', `/v1/communities/${c.id}/log`, c.owner.token)).body.log;
    assert.ok(log.some((e: any) => e.action === 'mute' && e.detail === '5 min'));
    // lifted
    assert.equal((await timeout(c.mod, c.member, 0)).status, 200);
    assert.equal((await react(c, c.member, m.id, '👍')).status, 200);
    // ends by itself: a timeout that is over holds nothing back
    const store = app.communities.store;
    store.setMuted(c.id, c.member.user.id, Date.now() - 1000);
    assert.equal((await post(c, c.member, 'już mogę')).status, 200);
    assert.equal((await call('GET', '/v1/communities/mine', c.member.token)).body.communities[0].mutedUntil, undefined);
    assert.equal((await row(c.mod)).mutedUntil, undefined);
    live.ws.close();
  });

  it('gives the clients the new permissions', async () => {
    const c = await community('Pm');
    const perms = async (p: Player) => (await call('GET', `/v1/communities/${c.id}`, p.token)).body.community.permissions;
    assert.deepEqual([(await perms(c.member)).pin, (await perms(c.member)).slowMode], [false, false]);
    assert.deepEqual([(await perms(c.mod)).pin, (await perms(c.mod)).slowMode], [true, false]);
    assert.deepEqual([(await perms(c.admin)).pin, (await perms(c.admin)).slowMode], [true, true]);
    assert.deepEqual([(await perms(c.owner)).pin, (await perms(c.owner)).slowMode], [true, true]);
  });
});
