import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { Db } from '../src/db.ts';
import { encodePng } from '../src/png.ts';
import { gameBadge, iconProblem, type HeldRank } from '../src/ranks.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-ranks-'));
const dbFile = path.join(dir, 'test.db');
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': raw ? 'image/png' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, type: res.headers.get('content-type') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };
const me = async (token: string) => (await call('GET', '/v1/me', token)).body;
const png = (size: number) => encodePng({ width: size, height: size, rgba: Buffer.alloc(size * size * 4, 0xff) });
/** A Minecraft account of the player in a game with the launcher (what the HUD asks about). */
async function inGame(token: string, userId: string, n: number) {
  const hex = String(n).repeat(32).slice(0, 32);
  app.db.link('minecraft', hex, userId, `Mc${n}`);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  assert.equal((await call('POST', '/v1/mc/link', token, { uuid })).status, 200);
  return uuid;
}
const lookup = async (uuid: string, knownRanks?: string[]) => (await call('POST', '/v1/mc/lookup', undefined, { uuids: [uuid], ...(knownRanks ? { knownRanks } : {}) })).body;
/** What a 0.9.22 HUD sends, and what one from 0.9.23 sends. */
const OLD_HUD = ['friend_pink'];
const NEW_HUD = ['friend_pink', 'supporter', 'colors'];

let boss: { token: string; user: { id: string } };
let migrated: Record<string, string> = {};

before(async () => {
  // a database from before ranks: one rank per account in users.rank
  const old = new Db(dbFile);
  for (const [name, rank] of [['Ania', 'partner'], ['Bartek', 'friend_pink'], ['Celina', ''], ['Darek', 'support']]) {
    const u = old.signIn('dev', name.toLowerCase(), { handle: name, name, avatar: '' });
    if (rank) old.setRank(u.id, rank);
    migrated[name] = u.id;
  }
  old.close();
  app = createApp({ dbFile, publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'], loginsPerMinute: 1000, profileViewsPerMinute: 10_000 });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  boss = await login('Szef');
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ranks', () => {
  it('moves the one rank each account had into user_ranks, showing the same', async () => {
    const rows = app.db.sql.prepare("SELECT uuid, rank, source FROM user_ranks WHERE source = 'migration' ORDER BY rank").all() as { uuid: string; rank: string }[];
    assert.deepEqual(rows.map((r) => r.rank), ['friend_pink', 'partner', 'support']);
    const ania = await login('Ania');
    const m = await me(ania.token);
    assert.equal(m.badge, 'partner');
    assert.equal(m.rank, 'partner');
    assert.deepEqual(m.ranks.map((r: any) => [r.id, r.color, r.source]), [['partner', '#facc15', 'migration']]);
    assert.equal(m.badgeChoice, '');
    assert.equal(m.badgeRank.id, 'partner');
    // the game: an old HUD the same as before, a new one with the colour the old HUD draws partners in
    const mc = await inGame(ania.token, ania.user.id, 1);
    assert.equal((await lookup(mc, OLD_HUD)).ranks[mc], 'partner');
    assert.equal((await lookup(mc, OLD_HUD)).badgeColors, undefined);
    const now = await lookup(mc, NEW_HUD);
    assert.equal(now.ranks[mc], 'partner');
    assert.equal(now.badgeColors[mc], '#facc15');
    // the pink friend still green for HUDs before 0.9.12
    const bartek = await login('Bartek');
    const bmc = await inGame(bartek.token, bartek.user.id, 2);
    assert.equal((await lookup(bmc)).ranks[bmc], 'friend');
    assert.equal((await lookup(bmc, OLD_HUD)).ranks[bmc], 'friend_pink');
    // no rank, no badge; the migration does not run again
    assert.equal((await me((await login('Celina')).token)).badge, '');
    await call('DELETE', `/v1/admin/users/${migrated.Darek}/ranks/support`, boss.token);
    assert.equal(app.db.user(migrated.Darek)!.rank, '');
  });

  it('gives several ranks with expiry, the most important shown by default, in the log', async () => {
    const ewa = await login('Ewa');
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, ewa.token, { rank: 'partner' })).status, 403);
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'king' })).body.error, 'bad_rank');
    // automatic ranks are not given by hand
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'admin' })).body.error, 'auto_rank');
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'supporter' })).body.error, 'auto_rank');
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'friend', expiresAt: Date.now() - 1 })).body.error, 'bad_expiry');
    await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'friend' });
    const r = await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'support', expiresAt: Date.now() + 400 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.grants.map((g: any) => [g.rank, g.grantedByHandle]), [['friend', 'Szef'], ['support', 'Szef']]);
    let m = await me(ewa.token);
    assert.deepEqual(m.ranks.map((x: any) => x.id), ['support', 'friend']);
    assert.equal(m.badge, 'support');
    // the mirror for what reads one rank
    assert.equal(m.rank, 'support');
    // the list in the panel
    const list = (await call('GET', '/v1/admin/users?q=Ewa', boss.token)).body.users;
    assert.deepEqual(list[0].ranks, ['support', 'friend']);
    // the support rank runs out
    await new Promise((res) => setTimeout(res, 500));
    m = await me(ewa.token);
    assert.deepEqual(m.ranks.map((x: any) => x.id), ['friend']);
    assert.equal(m.badge, 'friend');
    const panel = (await call('GET', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token)).body;
    assert.equal(panel.grants.find((g: any) => g.rank === 'support').expired, true);
    // taken back
    await call('DELETE', `/v1/admin/users/${ewa.user.id}/ranks/friend`, boss.token);
    assert.equal((await me(ewa.token)).badge, '');
    assert.equal((await call('DELETE', `/v1/admin/users/${ewa.user.id}/ranks/friend`, boss.token)).status, 404);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    for (const a of ['rank_grant', 'rank_revoke']) assert.ok(log.includes(a), a);
    // the old one-rank API: exactly this given rank
    await call('POST', `/v1/admin/users/${ewa.user.id}/ranks`, boss.token, { rank: 'friend' });
    const old = (await call('POST', `/v1/admin/users/${ewa.user.id}`, boss.token, { rank: 'partner' })).body;
    assert.equal(old.rank, 'partner');
    assert.deepEqual((await me(ewa.token)).ranks.map((x: any) => x.id), ['partner']);
    assert.equal((await call('POST', `/v1/admin/users/${ewa.user.id}`, boss.token, { rank: 'admin' })).body.error, 'bad_rank');
  });

  it('lets the player pick the badge only from ranks they hold, or none', async () => {
    const filip = await login('Filip');
    await call('POST', `/v1/admin/users/${filip.user.id}/ranks`, boss.token, { rank: 'support' });
    await call('POST', `/v1/admin/users/${filip.user.id}/ranks`, boss.token, { rank: 'partner' });
    assert.equal((await call('POST', '/v1/me/badge', filip.token, { rank: 'friend' })).body.error, 'not_your_rank');
    assert.equal((await call('POST', '/v1/me/badge', filip.token, { rank: 'admin' })).body.error, 'not_your_rank');
    assert.equal((await call('POST', '/v1/me/badge', filip.token, { rank: 7 })).status, 400);
    assert.equal((await call('POST', '/v1/me/badge', undefined, { rank: 'partner' })).status, 401);
    const picked = (await call('POST', '/v1/me/badge', filip.token, { rank: 'partner' })).body;
    assert.equal(picked.badgeChoice, 'partner');
    assert.equal(picked.badgeRank.id, 'partner');
    const mc = await inGame(filip.token, filip.user.id, 3);
    assert.equal((await lookup(mc, NEW_HUD)).ranks[mc], 'partner');
    // none: the white logo
    await call('POST', '/v1/me/badge', filip.token, { rank: 'none' });
    assert.equal((await me(filip.token)).badge, '');
    assert.deepEqual((await lookup(mc, NEW_HUD)).ranks, {});
    // back to the default: the most important one
    await call('POST', '/v1/me/badge', filip.token, { rank: '' });
    assert.equal((await me(filip.token)).badge, 'support');
    // a picked rank taken away: the default again
    await call('POST', '/v1/me/badge', filip.token, { rank: 'partner' });
    await call('DELETE', `/v1/admin/users/${filip.user.id}/ranks/partner`, boss.token);
    assert.equal((await me(filip.token)).badge, 'support');
  });

  it('lets each Minecraft account show a badge of its own', async () => {
    const igor = await login('Igor');
    await call('POST', `/v1/admin/users/${igor.user.id}/ranks`, boss.token, { rank: 'support' });
    await call('POST', `/v1/admin/users/${igor.user.id}/ranks`, boss.token, { rank: 'partner' });
    const main = await inGame(igor.token, igor.user.id, 8);
    const alt = await inGame(igor.token, igor.user.id, 9);
    const altId = alt.replace(/-/g, '');
    // only a linked account, only a rank held
    assert.equal((await call('POST', '/v1/me/badge', igor.token, { rank: 'partner', character: '6'.repeat(32) })).body.error, 'not_linked');
    assert.equal((await call('POST', '/v1/me/badge', igor.token, { rank: 'friend', character: alt })).body.error, 'not_your_rank');
    const picked = (await call('POST', '/v1/me/badge', igor.token, { rank: 'partner', character: alt })).body;
    assert.deepEqual(picked.characterBadges, { [altId]: 'partner' });
    assert.equal(picked.badgeChoice, '');
    assert.equal((await lookup(main, NEW_HUD)).ranks[main], 'support');
    assert.equal((await lookup(alt, NEW_HUD)).ranks[alt], 'partner');
    // none on the alt, while the account shows its badge elsewhere
    await call('POST', '/v1/me/badge', igor.token, { rank: 'none', character: alt });
    assert.deepEqual((await lookup(alt, NEW_HUD)).ranks, {});
    assert.equal((await me(igor.token)).badge, 'support');
    // a rank taken away: the account's pick again
    await call('POST', '/v1/me/badge', igor.token, { rank: 'partner', character: alt });
    await call('DELETE', `/v1/admin/users/${igor.user.id}/ranks/partner`, boss.token);
    assert.equal((await lookup(alt, NEW_HUD)).ranks[alt], 'support');
    // '' goes back to the account's
    await call('POST', '/v1/me/badge', igor.token, { rank: 'none', character: alt });
    assert.deepEqual((await call('POST', '/v1/me/badge', igor.token, { rank: '', character: alt })).body.characterBadges, {});
    assert.equal((await lookup(alt, NEW_HUD)).ranks[alt], 'support');
  });

  it('lets rank items be worn with any rank held, whichever badge shows', async () => {
    const gosia = await login('Gosia');
    assert.equal((await call('POST', '/v1/me', gosia.token, { loadout: { wings: 'phoenix' } })).body.error, 'bad_item');
    await call('POST', `/v1/admin/users/${gosia.user.id}/ranks`, boss.token, { rank: 'support' });
    await call('POST', `/v1/admin/users/${gosia.user.id}/ranks`, boss.token, { rank: 'partner' });
    await call('POST', '/v1/me/badge', gosia.token, { rank: 'none' });
    // phoenix wings are the partners', crystal ones support's, the cape support's
    assert.equal((await call('POST', '/v1/me', gosia.token, { loadout: { wings: 'phoenix' } })).body.loadout.wings, 'phoenix');
    assert.equal((await call('POST', '/v1/me', gosia.token, { cape: 'staff_support' })).body.cape, 'staff_support');
    const catalog = (await call('GET', '/v1/cosmetics', gosia.token)).body.items;
    assert.ok(catalog.find((i: any) => i.id === 'crystal').available);
    assert.ok(!catalog.find((i: any) => i.id === 'royal').available);
    // the rank gone, the item goes too (in game)
    const mc = await inGame(gosia.token, gosia.user.id, 4);
    await call('DELETE', `/v1/admin/users/${gosia.user.id}/ranks/partner`, boss.token);
    assert.deepEqual((await lookup(mc, NEW_HUD)).cosmetics[mc], { cape: 'staff_support' });
  });

  it('counts an active supporter tier as a rank by itself, in the tier colour', async () => {
    const hela = await login('Hela');
    const g = await call('POST', '/v1/admin/support/grants', boss.token, { handle: 'Hela', tier: 'patron', days: 10 });
    assert.equal(g.status, 200);
    let m = await me(hela.token);
    assert.deepEqual(m.ranks.map((x: any) => [x.id, x.color, x.name, x.source]), [['supporter', '#fbbf24', 'Mecenas', 'payment']]);
    assert.equal(m.badge, 'supporter');
    const mc = await inGame(hela.token, hela.user.id, 5);
    const old = await lookup(mc, ['friend_pink', 'supporter']);
    assert.equal(old.ranks[mc], 'supporter');
    assert.equal(old.supporterColors[mc], '#fbbf24');
    assert.equal((await lookup(mc, NEW_HUD)).badgeColors[mc], '#fbbf24');
    // a given rank comes before it unless she picks the supporter's badge
    await call('POST', `/v1/admin/users/${hela.user.id}/ranks`, boss.token, { rank: 'friend' });
    assert.equal((await me(hela.token)).badge, 'friend');
    await call('POST', '/v1/me/badge', hela.token, { rank: 'supporter' });
    assert.equal((await me(hela.token)).badge, 'supporter');
    // the tier taken back: the rank goes with it, the choice falls back
    await call('POST', `/v1/admin/support/grants/${g.body.grant.id}/revoke`, boss.token, { reason: 'test' });
    m = await me(hela.token);
    assert.deepEqual(m.ranks.map((x: any) => x.id), ['friend']);
    assert.equal(m.badge, 'friend');
  });

  it('lets admins make, change, give an icon to and delete ranks, each in the log', async () => {
    const ida = await login('Ida');
    assert.equal((await call('GET', '/v1/admin/ranks', ida.token)).status, 403);
    const before = (await call('GET', '/v1/admin/ranks', boss.token)).body.ranks;
    // the first ranks, in the game's colours, most important first
    assert.deepEqual(before.map((r: any) => [r.id, r.color, r.auto]), [
      ['admin', '#ef4444', 'role'], ['support', '#38bdf8', ''], ['partner', '#facc15', ''], ['friend', '#22c55e', ''], ['friend_pink', '#ec4899', ''], ['supporter', '#f472b6', 'payment'],
    ]);
    assert.equal((await call('POST', '/v1/admin/ranks', boss.token, { id: 'Bad Id', name: 'X', color: '#ffffff' })).body.error, 'bad_rank_id');
    assert.equal((await call('POST', '/v1/admin/ranks', boss.token, { id: 'none', name: 'X', color: '#ffffff' })).body.error, 'bad_rank_id');
    assert.equal((await call('POST', '/v1/admin/ranks', boss.token, { id: 'vip', name: 'VIP', color: 'red' })).body.error, 'bad_color');
    assert.equal((await call('POST', '/v1/admin/ranks', boss.token, { id: 'vip', color: '#ffffff' })).body.error, 'bad_rank_name');
    const made = await call('POST', '/v1/admin/ranks', boss.token, { id: 'vip', name: 'VIP', nameEn: 'VIP', color: '#14B8A6', priority: 95, description: 'Dla VIP-ów' });
    assert.equal(made.status, 200);
    assert.equal(made.body.color, '#14b8a6');
    assert.equal((await call('POST', '/v1/admin/ranks', boss.token, { id: 'vip', name: 'VIP', color: '#14b8a6' })).status, 409);
    assert.equal((await call('POST', '/v1/admin/ranks/vip', boss.token, { priority: 5000 })).body.error, 'bad_priority');
    // given, it is the most important one of Ida's
    await call('POST', `/v1/admin/users/${ida.user.id}/ranks`, boss.token, { rank: 'partner' });
    await call('POST', `/v1/admin/users/${ida.user.id}/ranks`, boss.token, { rank: 'vip' });
    assert.equal((await me(ida.token)).badge, 'vip');
    const mc = await inGame(ida.token, ida.user.id, 6);
    // a 0.9.22 HUD does not know it: the most important rank it knows; one with the supporter: the supporter's logo in its colour
    assert.equal((await lookup(mc, OLD_HUD)).ranks[mc], 'partner');
    const mid = await lookup(mc, ['friend_pink', 'supporter']);
    assert.equal(mid.ranks[mc], 'supporter');
    assert.equal(mid.supporterColors[mc], '#14b8a6');
    const now = await lookup(mc, NEW_HUD);
    assert.equal(now.ranks[mc], 'vip');
    assert.equal(now.badgeColors[mc], '#14b8a6');
    // its look changes for everyone holding it
    await call('POST', '/v1/admin/ranks/vip', boss.token, { color: '#0ea5e9', name: 'VIP+' });
    assert.equal((await lookup(mc, NEW_HUD)).badgeColors[mc], '#0ea5e9');
    // an icon: 16×16 or 32×32 PNG only
    assert.equal((await call('PUT', '/v1/admin/ranks/vip/icon', boss.token, undefined, png(64))).body.error, 'bad_logo_size');
    assert.equal((await call('PUT', '/v1/admin/ranks/vip/icon', boss.token, undefined, Buffer.from('not a png at all, not at all, not at all, not at all'))).body.error, 'not_png');
    assert.equal((await call('PUT', '/v1/admin/ranks/vip/icon', ida.token, undefined, png(16))).status, 403);
    const withIcon = await call('PUT', '/v1/admin/ranks/vip/icon', boss.token, undefined, png(32));
    assert.equal(withIcon.status, 200);
    assert.match(withIcon.body.iconUrl, /^\/v1\/ranks\/vip\/logo\.png\?v=\d+$/);
    const icon = await call('GET', withIcon.body.iconUrl);
    assert.equal(icon.type, 'image/png');
    assert.equal((await me(ida.token)).badgeRank.icon, withIcon.body.iconUrl);
    assert.equal((await call('GET', '/v1/ranks')).body.ranks.find((r: any) => r.id === 'vip').icon, withIcon.body.iconUrl);
    // switched off: nobody shows it
    await call('POST', '/v1/admin/ranks/vip', boss.token, { enabled: false });
    assert.equal((await me(ida.token)).badge, 'partner');
    assert.ok(!(await call('GET', '/v1/ranks')).body.ranks.some((r: any) => r.id === 'vip'));
    // the first ones cannot be deleted, made ones can (with their grants)
    assert.equal((await call('DELETE', '/v1/admin/ranks/partner', boss.token)).body.error, 'builtin_rank');
    assert.equal((await call('DELETE', '/v1/admin/ranks/vip', boss.token)).status, 200);
    assert.equal((await call('GET', `/v1/admin/users/${ida.user.id}/ranks`, boss.token)).body.grants.length, 1);
    assert.equal((await call('GET', withIcon.body.iconUrl)).status, 404);
    const log = (await call('GET', '/v1/admin/log', boss.token)).body.entries.map((e: any) => e.action);
    for (const a of ['rank_create', 'rank_update', 'rank_icon', 'rank_delete']) assert.ok(log.includes(a), a);
  });

  it('shows every rank on the public profile, the friends list the badge', async () => {
    const jan = await login('Jan');
    const kuba = await login('Kuba');
    await call('POST', `/v1/admin/users/${jan.user.id}/ranks`, boss.token, { rank: 'friend' });
    await call('POST', `/v1/admin/users/${jan.user.id}/ranks`, boss.token, { rank: 'partner' });
    await call('POST', '/v1/me/badge', jan.token, { rank: 'friend' });
    const profile = (await call('GET', '/v1/profiles/Jan')).body.profile;
    assert.equal(profile.badge, 'friend');
    assert.deepEqual(profile.ranks.map((r: any) => r.id), ['partner', 'friend']);
    // friends see the badge Jan picked
    const req = await call('POST', '/v1/friends/requests', kuba.token, { handle: 'Jan' });
    assert.equal(req.status, 200);
    const incoming = (await call('GET', '/v1/friends', jan.token)).body.incoming[0];
    await call('POST', `/v1/friends/requests/${incoming.id}/accept`, jan.token);
    const friend = (await call('GET', '/v1/friends', kuba.token)).body.friends.find((f: any) => f.handle === 'Jan');
    assert.deepEqual(friend.badgeRank, { id: 'friend', name: 'Przyjaciel', nameEn: 'Friend', color: '#22c55e' });
  });

  it('follows the panel settings: no badge without a choice, fewer ranks on the profile', async () => {
    const lena = await login('Lena');
    for (const r of ['support', 'partner', 'friend']) await call('POST', `/v1/admin/users/${lena.user.id}/ranks`, boss.token, { rank: r });
    assert.equal((await me(lena.token)).badge, 'support');
    assert.equal((await call('POST', '/v1/admin/settings', boss.token, { values: { 'ranks.defaultBadge': 'none', 'ranks.profileMax': 2 } })).status, 200);
    assert.equal((await me(lena.token)).badge, '');
    // a choice of her own still counts
    await call('POST', '/v1/me/badge', lena.token, { rank: 'friend' });
    assert.equal((await me(lena.token)).badge, 'friend');
    assert.deepEqual((await call('GET', '/v1/profiles/Lena')).body.profile.ranks.map((r: any) => r.id), ['support', 'partner']);
    assert.equal((await call('POST', '/v1/admin/settings', boss.token, { values: { 'ranks.defaultBadge': 'everyone' } })).status, 400);
    await call('POST', '/v1/admin/settings', boss.token, { values: { 'ranks.defaultBadge': 'highest', 'ranks.profileMax': 20 } });
  });

  it('says which badge the game draws for each kind of HUD', () => {
    const r = (id: string, color: string, priority: number): HeldRank => ({ id, name: id, nameEn: id, color, priority, source: 'admin' });
    const vip = r('vip', '#123456', 95);
    const partner = r('partner', '#facc15', 80);
    const pink = r('friend_pink', '#ec4899', 60);
    assert.equal(gameBadge(undefined, [vip], NEW_HUD), undefined);
    assert.deepEqual(gameBadge(vip, [vip, partner], NEW_HUD), { rank: 'vip', color: '#123456' });
    assert.deepEqual(gameBadge(vip, [vip, partner], OLD_HUD), { rank: 'partner' });
    assert.deepEqual(gameBadge(vip, [vip], []), undefined);
    assert.deepEqual(gameBadge(pink, [pink], []), { rank: 'friend' });
    assert.deepEqual(gameBadge(vip, [vip, pink], ['supporter']), { rank: 'supporter', supporterColor: '#123456' });
    assert.equal(iconProblem(png(16)), undefined);
    assert.equal(iconProblem(png(32)), undefined);
    assert.equal(iconProblem(png(64)), 'bad_logo_size');
    assert.equal(iconProblem(encodePng({ width: 16, height: 32, rgba: Buffer.alloc(16 * 32 * 4) })), 'bad_logo_size');
  });
});
