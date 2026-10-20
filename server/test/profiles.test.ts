import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { dayOf } from '../src/achievements.ts';
import { createApp } from '../src/app.ts';
import { Db } from '../src/db.ts';
import { encodePng } from '../src/png.ts';
import { DEFAULT_PRIVACY, ELEMENTS, access, cleanPrivacy, indexable, profileRoutes, type AchievementView, type Element, type Privacy, type Viewer, type Visibility } from '../src/profiles.ts';
import { testSkin } from './png.test.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-profiles-'));
const webDir = path.join(dir, 'web');
const MC = 'fedcba9876543210fedcba9876543210';
let base = '';
let app: ReturnType<typeof createApp>;

const fake = (async (url: string | URL) => {
  const u = String(url);
  if (u === `https://sessionserver.mojang.com/session/minecraft/profile/${MC}`) {
    const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'https://textures.minecraft.net/texture/face' } } })).toString('base64');
    return new Response(JSON.stringify({ id: MC, properties: [{ name: 'textures', value }] }));
  }
  if (u === 'https://textures.minecraft.net/texture/face') return new Response(new Uint8Array(testSkin()));
  return new Response('', { status: 404 });
}) as typeof fetch;

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
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
  return { status: res.status, body: json, text, headers: res.headers };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string; handle: string } };

let owner: { token: string; user: { id: string; handle: string } };
let friend: typeof owner;
let stranger: typeof owner;
let admin: typeof owner;

before(async () => {
  mkdirSync(webDir, { recursive: true });
  writeFileSync(path.join(webDir, 'profil.html'), '<!doctype html><head>\n  <!--preview-->\n  <script type="module" src="/profile.js"></script>\n</head><body></body>');
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'https://client.example', allowDevLogin: true, oauth: {}, webDir, adminHandles: ['ProfAdmin'], fetchImpl: fake, loginsPerMinute: 1000, profileViewsPerMinute: 10_000 });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  owner = await login('ProfOwner');
  friend = await login('ProfFriend');
  stranger = await login('ProfStranger');
  admin = await login('ProfAdmin');
  await call('POST', '/v1/friends/requests', owner.token, { handle: 'ProfFriend' });
  await call('POST', `/v1/friends/requests/${owner.user.id}/accept`, friend.token);
  // a Minecraft account (the dev login has none), play time and a server, a clan with a logo
  const sql = new DatabaseSync(path.join(dir, 'test.db'));
  sql.prepare("INSERT INTO identities (provider, subject, uuid, label) VALUES ('minecraft', ?, ?, 'OwnerMC')").run(MC, owner.user.id);
  sql.close();
  const now = Date.now();
  for (let d = 0; d < 3; d++) app.achievements.store.addPlay(owner.user.id, dayOf(now - d * 86_400_000), 4 * 3600);
  app.achievements.store.addServer(owner.user.id, 'skyup.pl', now);
  assert.equal((await call('POST', '/v1/clans', owner.token, { tag: 'PRF', name: 'Klan Profili' })).status, 200);
  const logo = encodePng({ width: 64, height: 64, rgba: Buffer.alloc(64 * 64 * 4, 200) });
  assert.equal((await call('POST', '/v1/clans/mine/logo', owner.token, undefined, logo)).status, 200);
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const FIELDS: Record<Element, string> = {
  stats: 'stats', achievements: 'achievements', cosmetics: 'cosmetics', clan: 'clan', minecraft: 'minecraft', servers: 'servers', lastOnline: 'lastOnline', friends: 'friends', communities: 'communities', streams: 'streams',
};
const VIEWERS: Viewer[] = ['anonymous', 'stranger', 'friend', 'self', 'admin'];
const allOn = Object.fromEntries(ELEMENTS.map((e) => [e, true])) as Record<Element, boolean>;

describe('profile privacy rules', () => {
  it('decides every visibility × viewer × element', () => {
    for (const visibility of ['public', 'friends', 'private'] as Visibility[]) {
      for (const off of [undefined, ...ELEMENTS]) {
        const privacy: Privacy = { visibility, indexable: false, elements: { ...allOn, ...(off ? { [off]: false } : {}) } };
        for (const viewer of VIEWERS) {
          const a = access(privacy, { hidden: false }, false, viewer);
          if (viewer === 'self' || viewer === 'admin') {
            assert.ok(a.ok && a.full && a.elements.size === ELEMENTS.length, `${visibility}/${viewer}`);
            continue;
          }
          const allowed = visibility === 'public' || (visibility === 'friends' && viewer === 'friend');
          if (!allowed) {
            assert.deepEqual(a, { ok: false, error: visibility === 'private' ? 'profile_private' : 'profile_friends_only' }, `${visibility}/${viewer}`);
            continue;
          }
          assert.ok(a.ok && !a.full);
          for (const e of ELEMENTS) assert.equal(a.elements.has(e), e !== off, `${visibility}/${viewer}/${e}`);
        }
      }
    }
  });

  it('hides hidden and banned profiles from all but admins (the owner sees their own hidden one)', () => {
    for (const viewer of VIEWERS) {
      const hidden = access(DEFAULT_PRIVACY, { hidden: true }, false, viewer);
      assert.equal(hidden.ok, viewer === 'self' || viewer === 'admin', viewer);
      if (!hidden.ok) assert.equal(hidden.error, 'not_found');
      assert.equal(access(DEFAULT_PRIVACY, { hidden: false }, true, viewer).ok, viewer === 'admin', viewer);
    }
  });

  it('starts public, without servers, last online and search engines', () => {
    assert.equal(DEFAULT_PRIVACY.visibility, 'public');
    assert.equal(DEFAULT_PRIVACY.indexable, false);
    assert.equal(DEFAULT_PRIVACY.elements.servers, false);
    assert.equal(DEFAULT_PRIVACY.elements.lastOnline, false);
    for (const e of ['stats', 'achievements', 'cosmetics', 'clan', 'minecraft', 'friends'] as Element[]) assert.equal(DEFAULT_PRIVACY.elements[e], true, e);
    // junk keeps what was there
    const p = cleanPrivacy({ visibility: 'everyone', indexable: 'yes', elements: { stats: 'no', clan: false, bogus: true } }, DEFAULT_PRIVACY);
    assert.equal(p.visibility, 'public');
    assert.equal(p.indexable, false);
    assert.equal(p.elements.stats, true);
    assert.equal(p.elements.clan, false);
    assert.equal('bogus' in p.elements, false);
    assert.equal(indexable({ ...DEFAULT_PRIVACY, indexable: true }, { hidden: false }, false), true);
    assert.equal(indexable({ ...DEFAULT_PRIVACY, visibility: 'friends', indexable: true }, { hidden: false }, false), false);
    assert.equal(indexable({ ...DEFAULT_PRIVACY, indexable: true }, { hidden: true }, false), false);
  });
});

describe('profiles over HTTP', () => {
  const tokens = () => ({ anonymous: undefined, stranger: stranger.token, friend: friend.token, self: owner.token, admin: admin.token }) as Record<Viewer, string | undefined>;

  it('defaults: the public sees the safe parts, pictures through the profile', async () => {
    const res = await call('GET', '/v1/profiles/ProfOwner');
    assert.equal(res.status, 200);
    const p = res.body.profile;
    assert.equal(p.handle, 'ProfOwner');
    assert.equal(p.viewer, 'anonymous');
    assert.equal(p.stats.hours, 12);
    assert.equal(p.stats.daysPlayed, 3);
    assert.equal(p.stats.servers, 1);
    assert.equal(p.friends, 1);
    assert.deepEqual(p.minecraft, ['OwnerMC']);
    assert.equal(p.clan.tag, 'PRF');
    assert.match(p.clan.logo, /^\/v1\/clans\/[\w-]+\/logo\.png\?v=\d+$/);
    assert.equal(p.servers, undefined);
    assert.equal(p.lastOnline, undefined);
    assert.equal(p.privacy, undefined);
    assert.equal(p.skin, '/v1/profiles/ProfOwner/skin');
    assert.equal(p.avatar, '/v1/profiles/ProfOwner/head');
    assert.ok(p.achievements.total > 0);
    // the Minecraft uuid and the account's id stay out of what the public gets
    assert.ok(!res.text.includes(MC));
    assert.ok(!res.text.includes(owner.user.id));
    const head = await fetch(`${base}/v1/profiles/ProfOwner/head`);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${base}/v1/profiles/ProfOwner/skin`)).status, 200);
    // a friend gets the usual addresses
    assert.equal((await call('GET', '/v1/profiles/ProfOwner', friend.token)).body.profile.skin, `/v1/skin/${MC}`);
  });

  it('gives each viewer exactly what each setting allows', async () => {
    for (const visibility of ['public', 'friends', 'private'] as Visibility[]) {
      for (const off of [undefined, ...ELEMENTS]) {
        const set = await call('POST', '/v1/me/profile-privacy', owner.token, { visibility, elements: { ...allOn, ...(off ? { [off]: false } : {}) } });
        assert.equal(set.status, 200);
        for (const [viewer, token] of Object.entries(tokens()) as [Viewer, string | undefined][]) {
          const res = await call('GET', '/v1/profiles/ProfOwner', token);
          const full = viewer === 'self' || viewer === 'admin';
          const allowed = full || visibility === 'public' || (visibility === 'friends' && viewer === 'friend');
          const what = `${visibility}/${off ?? 'all'}/${viewer}`;
          if (!allowed) {
            assert.equal(res.status, 403, what);
            assert.deepEqual(res.body, { error: visibility === 'private' ? 'profile_private' : 'profile_friends_only' }, what);
            continue;
          }
          assert.equal(res.status, 200, what);
          const p = res.body.profile;
          for (const e of ELEMENTS) assert.equal(FIELDS[e] in p, full || e !== off, `${what}: ${e}`);
          assert.equal('privacy' in p, full, what);
          assert.equal(!!p.adminView, viewer === 'admin', what);
        }
      }
    }
    await call('POST', '/v1/me/profile-privacy', owner.token, { visibility: 'public', elements: { ...DEFAULT_PRIVACY.elements } });
  });

  it('shows the owner the public view on ?view=public, and only the day of last online to others', async () => {
    await call('POST', '/v1/me/profile-privacy', owner.token, { elements: { lastOnline: true } });
    const own = (await call('GET', '/v1/profiles/ProfOwner?view=public', owner.token)).body.profile;
    assert.equal(own.viewer, 'anonymous');
    assert.equal(own.privacy, undefined);
    assert.equal(own.lastOnline.at % 86_400_000, 0);
    // a stranger cannot ask for more than the public view
    assert.equal((await call('GET', '/v1/profiles/ProfOwner', stranger.token)).body.profile.viewer, 'stranger');
    await call('POST', '/v1/me/profile-privacy', owner.token, { elements: { lastOnline: false } });
  });

  it('answers 404 for unknown players', async () => {
    assert.equal((await call('GET', '/v1/profiles/nobodyhere')).status, 404);
    assert.equal((await call('GET', '/v1/profiles/bad%2Fname')).status, 404);
    const page = await call('GET', '/u/nobodyhere');
    assert.equal(page.status, 404);
    assert.match(page.text, /noindex/);
    assert.equal((await fetch(`${base}/v1/profiles/nobodyhere/head`)).status, 404);
  });

  it('needs a sign-in for the settings and keeps them', async () => {
    assert.equal((await call('GET', '/v1/me/profile-privacy')).status, 401);
    const got = (await call('GET', '/v1/me/profile-privacy', owner.token)).body;
    assert.equal(got.url, '/u/ProfOwner');
    assert.equal(got.privacy.visibility, 'public');
    assert.deepEqual(got.defaults, DEFAULT_PRIVACY);
  });

  it('carries OpenGraph tags of the public view, noindex unless allowed, and a sitemap', async () => {
    const page = await call('GET', '/u/ProfOwner');
    assert.equal(page.status, 200);
    assert.match(page.text, /<title>ProfOwner \(@ProfOwner\) – SlashClient<\/title>/);
    assert.match(page.text, /<meta property="og:title" content="ProfOwner \(@ProfOwner\)">/);
    assert.match(page.text, /<meta property="og:image" content="https:\/\/client\.example\/v1\/profiles\/ProfOwner\/head">/);
    assert.match(page.text, /og:description" content="Profil gracza ProfOwner w SlashClient: 12 h gry, \d+\/\d+ osiągnięć, klan \[PRF\]\."/);
    assert.match(page.text, /<meta name="robots" content="noindex">/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex');
    assert.ok(!(await call('GET', '/sitemap-profiles.xml')).text.includes('ProfOwner'));

    await call('POST', '/v1/me/profile-privacy', owner.token, { indexable: true });
    const listed = await call('GET', '/u/ProfOwner');
    assert.match(listed.text, /<meta name="robots" content="index, follow">/);
    assert.match((await call('GET', '/sitemap-profiles.xml')).text, /<loc>https:\/\/client\.example\/u\/ProfOwner<\/loc>/);

    // stats off: not in the description either
    await call('POST', '/v1/me/profile-privacy', owner.token, { elements: { stats: false } });
    assert.ok(!(await call('GET', '/u/ProfOwner')).text.includes('h gry'));

    // friends only and private: nothing about the player, never indexed
    for (const [visibility, title] of [['friends', 'Profil tylko dla znajomych'], ['private', 'Profil prywatny']]) {
      await call('POST', '/v1/me/profile-privacy', owner.token, { visibility });
      const closed = await call('GET', '/u/ProfOwner');
      assert.equal(closed.status, 200);
      assert.match(closed.text, new RegExp(`<title>${title} – SlashClient</title>`));
      assert.match(closed.text, /noindex/);
      assert.ok(!closed.text.includes('og:image'));
      assert.ok(!closed.text.includes('osiągnięć'));
      assert.ok(!(await call('GET', '/sitemap-profiles.xml')).text.includes('ProfOwner'));
      assert.equal((await fetch(`${base}/v1/profiles/ProfOwner/head`)).status, 404);
    }
    await call('POST', '/v1/me/profile-privacy', owner.token, { visibility: 'public', indexable: false, elements: { stats: true } });

    const moved = await call('GET', '/gracz/ProfOwner');
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.get('location'), '/u/ProfOwner');
  });

  it('lets admins hide a profile, in the log; hidden is "not found" for others', async () => {
    assert.equal((await call('POST', '/v1/admin/profiles/ProfOwner', stranger.token, { hidden: true })).status, 403);
    assert.equal((await call('POST', '/v1/admin/profiles/ProfOwner', admin.token, {})).status, 400);
    await call('POST', '/v1/me/profile-privacy', owner.token, { indexable: true });
    const hid = await call('POST', '/v1/admin/profiles/ProfOwner', admin.token, { hidden: true, reason: 'obraźliwy nick' });
    assert.equal(hid.status, 200);
    assert.equal(hid.body.profile.moderation.hidden, true);
    assert.equal(hid.body.profile.moderation.by, 'ProfAdmin');
    for (const token of [undefined, stranger.token, friend.token]) assert.deepEqual((await call('GET', '/v1/profiles/ProfOwner', token)).body, { error: 'not_found' });
    const own = (await call('GET', '/v1/profiles/ProfOwner', owner.token)).body.profile;
    assert.equal(own.moderation.hidden, true);
    assert.equal(own.moderation.reason, 'obraźliwy nick');
    assert.equal(own.moderation.by, undefined);
    assert.equal((await call('GET', '/v1/me/profile-privacy', owner.token)).body.hidden, true);
    assert.equal((await call('GET', '/v1/profiles/ProfOwner', admin.token)).body.profile.adminView, true);
    const page = await call('GET', '/u/ProfOwner');
    assert.equal(page.status, 404);
    assert.match(page.text, /noindex/);
    assert.ok(!(await call('GET', '/sitemap-profiles.xml')).text.includes('ProfOwner'));
    const log = (await call('GET', '/v1/admin/log', admin.token)).body.entries;
    assert.ok(log.some((e: any) => e.action === 'profile_hide' && e.target === 'ProfOwner' && e.detail === 'obraźliwy nick' && e.admin === admin.user.id));

    assert.equal((await call('POST', '/v1/admin/profiles/ProfOwner', admin.token, { hidden: false })).status, 200);
    assert.equal((await call('GET', '/v1/profiles/ProfOwner')).status, 200);
    assert.ok((await call('GET', '/v1/admin/log', admin.token)).body.entries.some((e: any) => e.action === 'profile_show'));
    await call('POST', '/v1/me/profile-privacy', owner.token, { indexable: false });
  });
});

describe('achievements on a profile', () => {
  it('never shows a secret one before it is unlocked, and progress only with the numbers', async () => {
    const db = new Db(path.join(dir, 'unit.db'));
    const user = db.signIn('dev', 'u1', { handle: 'Unit', name: 'Unit', avatar: '' });
    const a = (id: string, extra: Partial<AchievementView>): AchievementView => ({ id, group: 'hours', name: id, nameEn: id, description: '', descriptionEn: '', unlockedAt: null, ...extra });
    const list = [
      a('plain_locked', { progress: 0.5, value: 5 }),
      a('plain_done', { unlockedAt: 1000 }),
      a('secret_locked', { hidden: true, progress: 0.9 }),
      a('secret_done', { hidden: true, unlockedAt: 2000 }),
      a('secret2_locked', { secret: true }),
      a('friends_locked', { group: 'friends', progress: 0.3 }),
    ];
    const profiles = profileRoutes({
      db, publicUrl: 'https://x', authed: () => '', admin: () => '', isAdmin: () => false, body: async () => ({}), clientIp: () => '', limitViews: () => {},
      achievements: () => ({ achievements: list, stats: { hours: 1, streak: 0, bestStreak: 0, servers: 0 } }),
      worn: () => ({}), badge: () => '', status: () => 'offline', skinOf: async () => undefined, headOf: async () => undefined,
      audit: () => {}, versioned: (h) => h, fail: (s, c) => { throw new Error(`${s} ${c}`); },
    });
    const ids = (p: any) => p.achievements.list.map((x: any) => x.id);
    let p = profiles.build(user, 'anonymous') as any;
    assert.deepEqual(ids(p), ['plain_locked', 'plain_done', 'secret_done', 'friends_locked']);
    assert.equal(p.achievements.unlocked, 2);
    assert.equal(p.achievements.total, 4);
    assert.ok(!JSON.stringify(p).includes('secret_locked') && !JSON.stringify(p).includes('secret2'));
    assert.equal(p.achievements.list[0].progress, 0.5);
    assert.equal(p.achievements.list[0].value, undefined);
    // stats off: no progress that would tell them; friends off: none on the friends' ones
    profiles.store.setPrivacy(user.id, { ...DEFAULT_PRIVACY, elements: { ...DEFAULT_PRIVACY.elements, stats: false, friends: false } });
    p = profiles.build(user, 'anonymous') as any;
    assert.equal(p.stats, undefined);
    assert.ok(p.achievements.list.every((x: any) => x.progress === undefined));
    // the owner neither sees a secret one early
    assert.ok(!ids(profiles.build(user, 'self')).includes('secret_locked'));
    db.close();
  });
});
