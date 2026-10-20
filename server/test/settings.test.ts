import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { BURST_LIMITS, COUNTED_PER_DAY, EDIT_WINDOW_MS } from '../src/chatLimits.ts';
import { IMAGE_LIMITS } from '../src/chatImages.ts';
import { MAX_LOGO_BYTES } from '../src/clanLogos.ts';
import { BLOCKED_WORDS, CLAN_SIZE, offensive } from '../src/clans.ts';
import { COMMUNITY_LIMITS } from '../src/communityStore.ts';
import { ITEMS, mayWear } from '../src/cosmetics.ts';
import { FEATURE_IDS, bannerOf, featuresFor } from '../src/features.ts';
import { GROUP_SIZE } from '../src/groups.ts';
import { MEDIA_LIMITS } from '../src/media.ts';
import { REFUND_WINDOW_DAYS } from '../src/payments/refunds.ts';
import { CLOUD_LIMITS } from '../src/profileCloud.ts';
import { SHARE_LIMITS } from '../src/profileShares.ts';
import { SettingError, Settings, liveSettings, validateSetting, withDefaults } from '../src/settings.ts';
import { SETTING_DEFS } from '../src/settingsDefs.ts';
import { DEFAULT_MIN_FREE } from '../src/storage.ts';
import { LOG_DAYS } from '../src/tracker.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-settings-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, type = 'application/json') {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text };
}
type Login = { token: string; user: { id: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Login;
async function befriend(a: Login, b: Login, bHandle: string) {
  await call('POST', '/v1/friends/requests', a.token, { handle: bHandle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}
const envelope = (s: string) => `e2e1:${Buffer.from(s).toString('base64')}`;
function png(width: number, height: number, size = 45): Buffer {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

let boss: Login;
const set = (values: Record<string, unknown>, token = boss.token) => call('POST', '/v1/admin/settings', token, { values });

before(async () => {
  app = createApp({
    dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {},
    adminHandles: ['Szef'], mediaDir: path.join(dir, 'media'), imagesDir: path.join(dir, 'images'),
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  boss = await login('Szef');
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the settings registry', () => {
  it('has defaults equal to the constants the code used before', () => {
    const d = Object.fromEntries(SETTING_DEFS.map((s) => [s.key, s.default]));
    // the chat
    assert.equal(d['chat.burstMessages'], 6);
    assert.equal(d['chat.burstMessages'], BURST_LIMITS.messages);
    assert.equal(d['chat.burstSeconds'], BURST_LIMITS.seconds);
    assert.equal(d['chat.burstStrikes'], BURST_LIMITS.strikes);
    assert.equal(d['chat.holdSeconds'], BURST_LIMITS.muteSeconds);
    assert.equal(d['chat.editWindowMinutes'], 15);
    assert.equal((d['chat.editWindowMinutes'] as number) * 60_000, EDIT_WINDOW_MS);
    assert.equal(d['chat.messagesPerMinute'], 40);
    // pictures, clips, profiles
    assert.equal(d['media.imageBytes'], 10 * 1024 * 1024);
    for (const k of Object.keys(MEDIA_LIMITS) as (keyof typeof MEDIA_LIMITS)[]) assert.equal(d[`media.${k}`], MEDIA_LIMITS[k], k);
    for (const k of Object.keys(CLOUD_LIMITS) as (keyof typeof CLOUD_LIMITS)[]) assert.equal(d[`cloud.${k}`], CLOUD_LIMITS[k], k);
    for (const k of Object.keys(SHARE_LIMITS) as (keyof typeof SHARE_LIMITS)[]) assert.equal(d[`shares.${k}`], SHARE_LIMITS[k], k);
    for (const k of ['maxBytes', 'perDay', 'bytesPerDay', 'days'] as const) assert.equal(d[`chatImages.${k}`], IMAGE_LIMITS[k], k);
    // communities, clans, groups
    assert.equal(d['communities.members'], 1000);
    for (const k of Object.keys(COMMUNITY_LIMITS) as (keyof typeof COMMUNITY_LIMITS)[]) assert.equal(d[`communities.${k}`], COMMUNITY_LIMITS[k], k);
    assert.equal(d['clans.maxMembers'], CLAN_SIZE);
    assert.equal(d['clans.logoBytes'], MAX_LOGO_BYTES);
    assert.equal(d['groups.size'], GROUP_SIZE);
    assert.equal(d['groups.maxGroups'], 30);
    // the rest
    assert.equal(d['support.refundWindowDays'], REFUND_WINDOW_DAYS);
    assert.equal(d['support.refundWindowDays'], 14);
    assert.equal(d['sparks.messagesPerDay'], COUNTED_PER_DAY);
    assert.equal(d['logs.days'], LOG_DAYS);
    assert.equal((d['storage.minFreeMb'] as number) * 1024 * 1024, DEFAULT_MIN_FREE);
    assert.equal(d['security.sessionIdleDays'], 90);
    assert.deepEqual(d['moderation.blockedWords'], BLOCKED_WORDS);
    // every feature is on, the banner off
    for (const f of FEATURE_IDS) assert.equal(d[`feature.${f}`], true, f);
    assert.equal(d['banner.enabled'], false);
    // keys are unique and every default passes its own definition
    assert.equal(new Set(SETTING_DEFS.map((s) => s.key)).size, SETTING_DEFS.length);
    for (const def of SETTING_DEFS) assert.deepEqual(validateSetting(def, def.default), def.default, def.key);
  });

  it('keeps only overrides, checks them, goes back to the default and survives a restart', () => {
    const sql = new DatabaseSync(':memory:');
    const s = new Settings(sql, SETTING_DEFS, { 'media.days': 7 });
    // the config's value is the default here (env, tests)
    assert.equal(s.num('media.days'), 7);
    assert.equal(s.num('chat.burstMessages'), 6);
    const seen: string[] = [];
    s.onChange((c) => seen.push(...c.map((x) => x.key)));
    const changes = s.set({ 'chat.burstMessages': 3, 'media.days': '9' }, 'admin-id');
    assert.deepEqual(changes.map((c) => [c.key, c.old, c.new]), [['chat.burstMessages', 6, 3], ['media.days', 7, 9]]);
    assert.deepEqual(seen, ['chat.burstMessages', 'media.days']);
    assert.equal(s.num('chat.burstMessages'), 3);
    // only the overrides are rows
    assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n, 2);
    // all or nothing: one wrong value saves none
    assert.throws(() => s.set({ 'chat.burstMessages': 4, 'support.refundWindowDays': 7 }, 'a'), (e: unknown) => e instanceof SettingError && e.message === 'setting_too_small' && e.key === 'support.refundWindowDays');
    assert.equal(s.num('chat.burstMessages'), 3);
    assert.throws(() => s.set({ 'chat.burstMessages': 1.5 }, 'a'), /setting_invalid/);
    assert.throws(() => s.set({ 'chat.burstMessages': 1000 }, 'a'), /setting_too_big/);
    assert.throws(() => s.set({ 'nope.nothing': 1 }, 'a'), /setting_unknown/);
    assert.throws(() => s.set({ 'banner.link': 'javascript:alert(1)' }, 'a'), /setting_bad_url/);
    assert.throws(() => s.set({ 'feature.shop': 'no' }, 'a'), /setting_invalid/);
    // lists are cleaned: trimmed, lower case, no repeats
    s.set({ 'moderation.blockedTags': ' ABC \nabc\n\nxyz' }, 'a');
    assert.deepEqual(s.list('moderation.blockedTags'), ['abc', 'xyz']);
    // the values are cached: a second registry on the same database reads them (a restart)
    const again = new Settings(sql, SETTING_DEFS, { 'media.days': 7 });
    assert.equal(again.num('chat.burstMessages'), 3);
    assert.equal(again.view().find((v) => v.key === 'chat.burstMessages')!.updatedBy, 'admin-id');
    // a value equal to the default, or null, removes the row
    assert.equal(s.set({ 'chat.burstMessages': 6 }, 'a')[0].reset, true);
    assert.equal(s.isOverridden('chat.burstMessages'), false);
    assert.equal(s.set({ 'media.days': null }, 'a')[0].new, 7);
    // a row that no longer passes (bounds changed in a later version) is ignored
    sql.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('groups.size', '99', 0)").run();
    s.reload();
    assert.equal(s.num('groups.size'), GROUP_SIZE);
  });

  it('gives modules live limits', () => {
    const sql = new DatabaseSync(':memory:');
    const s = new Settings(sql, SETTING_DEFS);
    const limits = withDefaults(MEDIA_LIMITS, liveSettings(s, { days: 'media.days' }));
    assert.equal(limits.days, 30);
    assert.equal(limits.imageBytes, MEDIA_LIMITS.imageBytes);
    s.set({ 'media.days': 3 }, 'a');
    assert.equal(limits.days, 3);
    assert.equal({ ...limits }.days, 3);
    assert.equal(JSON.parse(JSON.stringify(limits)).days, 3);
  });

  it('works out which switch a request needs', () => {
    const clanOf = (id: string) => ({ g1: '', c1: 'clan1' } as Record<string, string>)[id];
    assert.deepEqual(featuresFor('POST', '/v1/shop/veteran/buy', clanOf), ['shop']);
    assert.deepEqual(featuresFor('GET', '/v1/wallet', clanOf), []);
    assert.deepEqual(featuresFor('POST', '/v1/support/checkout', clanOf), ['support']);
    assert.deepEqual(featuresFor('POST', '/v1/payments/stripe/webhook', clanOf), []);
    assert.deepEqual(featuresFor('GET', '/v1/communities/mine', clanOf), ['communities']);
    assert.deepEqual(featuresFor('GET', '/v1/communities/abc/logo.png', clanOf), []);
    assert.deepEqual(featuresFor('GET', '/v1/admin/communities', clanOf), []);
    assert.deepEqual(featuresFor('GET', '/v1/groups/g1', clanOf), ['groups']);
    assert.deepEqual(featuresFor('POST', '/v1/groups/c1/messages', clanOf), ['clans']);
    assert.deepEqual(featuresFor('POST', '/v1/groups/g1/images', clanOf), ['groups', 'chatImages']);
    assert.deepEqual(featuresFor('GET', '/v1/groups', clanOf), []);
    assert.deepEqual(featuresFor('POST', '/v1/media', clanOf), ['media']);
    assert.deepEqual(featuresFor('GET', '/media/abcdefghij', clanOf), []);
    assert.deepEqual(featuresFor('PUT', '/v1/cloud-profiles/x', clanOf), ['cloud']);
    assert.deepEqual(featuresFor('GET', '/v1/cloud-profiles', clanOf), []);
    assert.deepEqual(featuresFor('GET', '/u/Gracz', clanOf), ['profiles']);
    assert.deepEqual(featuresFor('POST', '/v1/mc/spray', clanOf), ['sprays']);
  });
});

describe('the admin panel\'s settings', () => {
  it('lets only admins see and change them, and logs every change old → new', async () => {
    const player = await login('Gracz1');
    assert.equal((await call('GET', '/v1/admin/settings')).status, 401);
    assert.equal((await call('GET', '/v1/admin/settings', player.token)).body.error, 'not_admin');
    assert.equal((await set({ 'chat.burstMessages': 2 }, player.token)).body.error, 'not_admin');
    const view = (await call('GET', '/v1/admin/settings', boss.token)).body;
    assert.ok(view.categories.some((c: any) => c.id === 'chat'));
    const burst = view.settings.find((s: any) => s.key === 'chat.burstMessages');
    assert.equal(burst.value, 6);
    assert.equal(burst.overridden, false);
    // a wrong value says which field
    assert.equal((await set({ 'support.refundWindowDays': 3 })).body.error, 'setting_too_small:support.refundWindowDays');
    const saved = (await set({ 'logs.days': 30, 'media.imageBytes': 5 * 1024 * 1024 })).body;
    assert.deepEqual(saved.changed.sort(), ['logs.days', 'media.imageBytes']);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries;
    assert.ok(log.some((e: any) => e.action === 'setting' && e.target === 'logs.days' && e.detail === '90 dni → 30 dni'), JSON.stringify(log.slice(0, 3)));
    assert.ok(log.some((e: any) => e.action === 'setting' && e.target === 'media.imageBytes' && e.detail === '10 MB → 5 MB'));
    await set({ 'logs.days': null, 'media.imageBytes': null });
    assert.ok((await call('GET', '/v1/admin/log', boss.token)).body.entries.some((e: any) => e.action === 'setting_reset' && e.target === 'logs.days' && e.detail === '30 dni → 90 dni'));
    const after = (await call('GET', '/v1/admin/settings', boss.token)).body.settings.find((s: any) => s.key === 'media.imageBytes');
    assert.equal(after.overridden, false);
  });

  it('applies the burst limit and the edit window at once', async () => {
    const a = await login('Pisarz');
    const b = await login('Czytelnik');
    await befriend(a, b, 'Czytelnik');
    await set({ 'chat.burstMessages': 2 });
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: `hej ${i}` })).status, 200);
    const third = await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: 'hej 3' });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'slow_down');
    await set({ 'chat.burstMessages': null });
    // the window clients get with the history, and the edit refused once it is 0
    const sent = (await call('POST', `/v1/messages/${a.user.id}`, b.token, { text: envelope('x') })).body.message;
    assert.equal((await call('GET', `/v1/messages/${a.user.id}`, b.token)).body.editWindowMs, 15 * 60_000);
    await set({ 'chat.editWindowMinutes': 0 });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal((await call('GET', `/v1/messages/${a.user.id}`, b.token)).body.editWindowMs, 0);
    assert.equal((await call('POST', `/v1/messages/${a.user.id}/${sent.id}/edit`, b.token, { text: envelope('y') })).body.error, 'edit_expired');
    await set({ 'chat.editWindowMinutes': null });
    assert.equal((await call('POST', `/v1/messages/${a.user.id}/${sent.id}/edit`, b.token, { text: envelope('y') })).status, 200);
  });

  it('applies the media and community limits and the refund window', async () => {
    const p = await login('Fotograf');
    await set({ 'media.imageBytes': 64 * 1024 });
    assert.equal((await call('POST', '/v1/media', p.token, png(10, 10, 70 * 1024), 'image/png')).body.error, 'too_large');
    await set({ 'media.imageBytes': null, 'media.maxActive': 1 });
    assert.equal((await call('POST', '/v1/media', p.token, png(10, 10), 'image/png')).status, 200);
    assert.equal((await call('GET', '/v1/media', p.token)).body.limits.maxActive, 1);
    assert.equal((await call('POST', '/v1/media', p.token, png(10, 10), 'image/png')).body.error, 'media_limit');
    await set({ 'media.maxActive': null });
    // communities: none may be founded now, then one may
    await set({ 'communities.owned': 0 });
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Fotografowie' })).body.error, 'too_many_owned');
    await set({ 'communities.owned': null });
    assert.equal((await call('POST', '/v1/communities', p.token, { name: 'Fotografowie' })).status, 200);
    // refunds: the window players are told about
    assert.equal((await call('GET', '/v1/me/support', p.token)).body.refundWindowDays, 14);
    await set({ 'support.refundWindowDays': 30 });
    assert.equal((await call('GET', '/v1/me/support', p.token)).body.refundWindowDays, 30);
    await set({ 'support.refundWindowDays': null });
  });

  it('edits the word list used for tags and names', async () => {
    assert.equal(offensive('Zielonka'), false);
    await set({ 'moderation.blockedWords': [...BLOCKED_WORDS, 'zielonk'] });
    assert.equal(offensive('Zielonka'), true);
    const p = await login('Klanowicz');
    assert.equal((await call('POST', '/v1/clans', p.token, { tag: 'ZIEL', name: 'Zielonka' })).body.error, 'offensive_name');
    await set({ 'moderation.blockedWords': null });
    assert.equal(offensive('Zielonka'), false);
  });
});

describe('feature switches', () => {
  it('refuse a switched-off feature\'s endpoints with 503 feature_disabled, and come back', async () => {
    const p = await login('Kupiec');
    assert.deepEqual((await call('GET', '/v1/features')).body.features.shop, true);
    await set({ 'feature.shop': false, 'feature.communities': false, 'feature.profiles': false });
    assert.equal((await call('GET', '/v1/features')).body.features.shop, false);
    const buy = await call('POST', '/v1/shop/veteran/buy', p.token);
    assert.equal(buy.status, 503);
    assert.deepEqual(buy.body, { error: 'feature_disabled', feature: 'shop' });
    // the wallet itself still works
    assert.equal((await call('GET', '/v1/wallet', p.token)).status, 200);
    assert.equal((await call('GET', '/v1/communities/mine', p.token)).body.feature, 'communities');
    // pages get a page
    const page = await call('GET', '/u/Kupiec');
    assert.equal(page.status, 503);
    assert.match(page.text, /Chwilowo niedostępne/);
    // the admin panel is never switched off
    assert.equal((await call('GET', '/v1/admin/communities', boss.token)).status, 200);
    await set({ 'feature.shop': true, 'feature.communities': null, 'feature.profiles': null });
    assert.notEqual((await call('POST', '/v1/shop/veteran/buy', p.token)).status, 503);
    assert.equal((await call('GET', '/v1/communities/mine', p.token)).status, 200);
  });

  it('closes registration to new accounts only', async () => {
    await login('Stary');
    await set({ 'feature.registration': false });
    const fresh = await call('POST', '/v1/auth/dev', undefined, { name: 'Nowy' });
    assert.equal(fresh.status, 503);
    assert.equal(fresh.body.error, 'feature_disabled');
    assert.equal((await call('POST', '/v1/auth/dev', undefined, { name: 'Stary' })).status, 200);
    await set({ 'feature.registration': null });
    assert.equal((await call('POST', '/v1/auth/dev', undefined, { name: 'Nowy' })).status, 200);
  });

  it('tells connected launchers when a switch or the banner changes', async () => {
    const p = await login('Sluchacz');
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
    const events: any[] = [];
    ws.on('message', (d) => events.push(JSON.parse(String(d))));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: p.token }));
    for (let i = 0; i < 50 && !events.some((e) => e.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 20));
    await set({ 'feature.sprays': false });
    for (let i = 0; i < 50 && !events.some((e) => e.type === 'features'); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(events.some((e) => e.type === 'features'));
    await set({ 'feature.sprays': null });
    await new Promise((r) => {
      ws.once('close', r);
      ws.close();
    });
  });
});

describe('the banner', () => {
  it('shows only when on, with text, and within its time', async () => {
    assert.equal((await call('GET', '/v1/features')).body.banner, null);
    await set({ 'banner.enabled': true });
    // no text yet
    assert.equal((await call('GET', '/v1/features')).body.banner, null);
    await set({ 'banner.text': 'Przerwa techniczna o 22:00', 'banner.level': 'warning', 'banner.link': '/wsparcie' });
    const b = (await call('GET', '/v1/features')).body.banner;
    assert.equal(b.text, 'Przerwa techniczna o 22:00');
    // without English text, English players get the Polish one
    assert.equal(b.textEn, 'Przerwa techniczna o 22:00');
    assert.equal(b.level, 'warning');
    assert.equal(b.link, '/wsparcie');
    assert.match(b.id, /^[0-9a-f]{12}$/);
    await set({ 'banner.end': Date.now() - 1000 });
    assert.equal((await call('GET', '/v1/features')).body.banner, null);
    await set({ 'banner.end': null, 'banner.start': Date.now() + 3_600_000 });
    assert.equal((await call('GET', '/v1/features')).body.banner, null);
    // the clock decides, not the request
    assert.equal(bannerOf(app.settings, Date.now() + 2 * 3_600_000)?.text, 'Przerwa techniczna o 22:00');
    await set({ 'banner.enabled': null, 'banner.start': null, 'banner.text': null, 'banner.level': null, 'banner.link': null });
  });
});

describe('supporter-only cosmetics from the panel', () => {
  it('makes any item one for supporters of a level, everywhere, and back', async () => {
    const free = ITEMS.find((i) => i.slot === 'cape' && !i.rank && !i.achievement && !i.price && !i.supporter && !i.since)!;
    const p = await login('Noszacy');
    assert.equal((await call('POST', '/v1/me', p.token, { cape: free.id })).status, 200);
    const player = await login('Inny');
    assert.equal((await call('POST', `/v1/admin/cosmetics/${free.id}/supporter`, player.token, { level: 2 })).body.error, 'not_admin');
    assert.equal((await call('POST', `/v1/admin/cosmetics/${free.id}/supporter`, boss.token, { level: -1 })).body.error, 'bad_level');
    const r = (await call('POST', `/v1/admin/cosmetics/${free.id}/supporter`, boss.token, { level: 2 })).body;
    assert.equal(r.supporter, 2);
    assert.equal(r.supporterDefault, 0);
    // who wore it without the tier took it off
    assert.equal(r.removed, 1);
    assert.equal((await call('GET', '/v1/me', p.token)).body.cape, '');
    // the catalog shows the lock, and it cannot be put on
    const item = (await call('GET', '/v1/cosmetics', player.token)).body.items.find((i: any) => i.id === free.id);
    assert.equal(item.supporter, 2);
    assert.equal(item.available, false);
    assert.equal((await call('POST', '/v1/me', player.token, { cape: free.id })).body.error, 'bad_cape');
    // how to get it, in the panel
    const obtain = (await call('GET', '/v1/admin/cosmetics/obtain', boss.token)).body.items[free.id];
    assert.equal(obtain.supporter, 2);
    assert.match(obtain.text, /wspierający od poziomu 2/i);
    assert.ok(!obtain.ways.some((w: any) => w.kind === 'free'));
    // the same check the game's lookup uses
    assert.equal(mayWear(app.db.cosmeticSettings(), [], free.id, 'cape', '', 1), false);
    assert.equal(mayWear(app.db.cosmeticSettings(), [], free.id, 'cape', '', 2), true);
    assert.ok((await call('GET', '/v1/admin/log', boss.token)).body.entries.some((e: any) => e.action === 'cosmetic_supporter' && e.target === free.id));
    // a code supporters' item freed for everyone, then back to cosmetics.ts
    const heart = ITEMS.find((i) => i.supporter)!;
    await call('POST', `/v1/admin/cosmetics/${heart.id}/supporter`, boss.token, { level: 0 });
    assert.equal(mayWear(app.db.cosmeticSettings(), [], heart.id, heart.slot, '', 0), true);
    await call('POST', `/v1/admin/cosmetics/${heart.id}/supporter`, boss.token, { level: null });
    assert.equal(mayWear(app.db.cosmeticSettings(), [], heart.id, heart.slot, '', 0), false);
    await call('POST', `/v1/admin/cosmetics/${free.id}/supporter`, boss.token, { level: null });
    assert.equal((await call('POST', '/v1/me', player.token, { cape: free.id })).status, 200);
  });
});
