import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp, offlineUuid } from '../src/app.ts';
import net from 'node:net';
import { LanTunnels } from '../../src/main/lan.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-social-'));
let base = '';
let app: ReturnType<typeof createApp>;

/** Players who "joined" at Mojang: server id → Minecraft profile (what hasJoined answers). */
const joined = new Map<string, { id: string; name: string }>();
/** Microsoft codes the "player" has typed: device code → which user. */
const typedCodes = new Map<string, string>();
let deviceCodes = 0;

// a fake Discord, so sign-in can be tested without the internet
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith('https://sessionserver.mojang.com/session/minecraft/hasJoined?')) {
    const q = new URL(url).searchParams;
    const p = joined.get(q.get('serverId') ?? '');
    return p && p.name === q.get('username') ? Response.json({ ...p, properties: [] }) : new Response(null, { status: 204 });
  }
  if (url.endsWith('/oauth2/v2.0/devicecode')) {
    const n = ++deviceCodes;
    return Response.json({ device_code: `device-${n}`, user_code: `CODE${n}`, verification_uri: 'https://www.microsoft.com/link', interval: 0, expires_in: 900 });
  }
  if (url.endsWith('discord.com/api/oauth2/token')) return Response.json({ access_token: 'discord-token' });
  if (url === 'https://oauth2.googleapis.com/token') {
    const claims = Buffer.from(JSON.stringify({ sub: 'g-1', name: 'Zosia Nowak', picture: 'https://evil.example/x.png' })).toString('base64url');
    return Response.json({ id_token: `x.${claims}.y` });
  }
  if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'gh-token' });
  if (url === 'https://api.github.com/user') return Response.json({ id: 7, login: 'octo', name: null, avatar_url: 'https://avatars.githubusercontent.com/u/7' });
  if (url.endsWith('/oauth2/v2.0/token')) {
    // until the code is typed Microsoft says "pending"; then the typed code says which user signed in
    const code = typedCodes.get(new URLSearchParams(String(init?.body)).get('device_code') ?? '');
    if (!code) return Response.json({ error: 'authorization_pending' }, { status: 400 });
    const claims = Buffer.from(JSON.stringify({ sub: `ms-${code}`, name: code === 'jan' ? 'Jan Kowalski' : 'Ola' })).toString('base64url');
    return Response.json({ id_token: `x.${claims}.y` });
  }
  if (url.endsWith('/users/@me')) return Response.json({ id: '42', username: 'kasia', global_name: 'Kasia', avatar: 'abc' });
  throw new Error(`unexpected ${url}`);
};

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

/** A connected launcher that collects the events it gets. */
async function connect(token: string, presence?: unknown) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/v1/ws');
  const events: any[] = [];
  ws.on('message', (d) => events.push(JSON.parse(String(d))));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'auth', token, presence }));
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

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, adminHandles: ['Tomek'], oauth: { discord: { clientId: 'id', clientSecret: 'secret' }, microsoft: { clientId: 'ms', clientSecret: '' }, google: { clientId: 'g', clientSecret: 's' }, github: { clientId: 'gh', clientSecret: 's' } }, fetchImpl: fakeFetch });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('social server', () => {
  it('needs a session', async () => {
    assert.equal((await call('GET', '/v1/friends')).status, 401);
    assert.equal((await call('GET', '/v1/friends', 'nope')).status, 401);
  });

  /** The launcher's Minecraft sign-in: `name` (Mojang id `id`) "joins" the server id at Mojang. */
  async function minecraftLogin(name: string, id: string, token?: string, join = true) {
    const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
    if (join) joined.set(serverId, { id, name });
    return call('POST', '/v1/auth/minecraft/finish', token, { serverId, name });
  }
  const mcId = (n: number) => String(n).repeat(32).slice(0, 32);

  it('gives accounts their Minecraft face as avatar, or the sign-in picture when picked', async () => {
    const ala = await login('AlaAvatar');
    // no Minecraft account and no picture: none (the pages show a letter)
    assert.equal((await call('GET', '/v1/me', ala.token)).body.avatar, '');
    await minecraftLogin('AlaMC', mcId(9), ala.token);
    const me = (await call('GET', '/v1/me', ala.token)).body;
    assert.equal(me.avatar, `/v1/head/${mcId(9)}`);
    assert.equal(me.avatarSource, mcId(9));
    assert.deepEqual(me.avatars, { minecraft: [{ uuid: mcId(9), name: 'AlaMC', url: `/v1/head/${mcId(9)}` }], provider: '' });
    // the provider's picture picked, but there is none: still the face
    assert.equal((await call('POST', '/v1/me', ala.token, { avatarSource: 'provider' })).body.avatar, `/v1/head/${mcId(9)}`);
    assert.equal((await call('POST', '/v1/me', ala.token, { avatarSource: 'gravatar' })).body.error, 'bad_request');
    // a second Minecraft account: its face can be the avatar instead (not someone else's)
    await minecraftLogin('AlaAlt', mcId(8), ala.token);
    // listed in the order they were linked (AlaAlt would come first by name), the avatar still the first one's
    const two = (await call('GET', '/v1/me', ala.token)).body;
    assert.deepEqual(two.avatars.minecraft.map((m: any) => m.name), ['AlaMC', 'AlaAlt']);
    assert.equal(two.avatar, `/v1/head/${mcId(9)}`);
    const picked = (await call('POST', '/v1/me', ala.token, { avatarSource: mcId(8) })).body;
    assert.equal(picked.avatar, `/v1/head/${mcId(8)}`);
    assert.equal(picked.avatarSource, mcId(8));
    assert.equal((await call('POST', '/v1/me', ala.token, { avatarSource: mcId(1) })).body.error, 'bad_request');
  });

  it('starts accounts with Minecraft, proven at Mojang, and links more Minecraft accounts', async () => {
    // not joined at Mojang: no account
    assert.equal((await minecraftLogin('Kasia', mcId(1), undefined, false)).body.error, 'not_verified');
    const kasia = (await minecraftLogin('Kasia', mcId(1))).body;
    assert.equal(kasia.user.handle, 'Kasia');
    assert.deepEqual(kasia.user.minecraft, [{ uuid: mcId(1), name: 'Kasia', loadout: null }]);
    // a server id works once
    const { serverId } = (await call('POST', '/v1/auth/minecraft/start')).body;
    joined.set(serverId, { id: mcId(1), name: 'Kasia' });
    assert.equal((await call('POST', '/v1/auth/minecraft/finish', undefined, { serverId, name: 'Kasia' })).status, 200);
    assert.equal((await call('POST', '/v1/auth/minecraft/finish', undefined, { serverId, name: 'Kasia' })).body.error, 'login_expired');
    // a second Minecraft account joins the same SlashClient account
    const linked = (await minecraftLogin('KasiaPvP', mcId(2), kasia.token)).body;
    assert.equal(linked.linked, true);
    assert.deepEqual(linked.user.minecraft.map((m: { name: string }) => m.name), ['Kasia', 'KasiaPvP']);
    assert.equal((await minecraftLogin('KasiaPvP', mcId(2))).body.user.id, kasia.user.id);
    // someone else's Minecraft account: the launcher is switched to that account, nothing is taken over
    const other = (await minecraftLogin('Brat', mcId(3))).body;
    const switched = (await minecraftLogin('Brat', mcId(3), kasia.token)).body;
    assert.equal(switched.switched, true);
    assert.equal(switched.user.id, other.user.id);
    assert.equal((await call('GET', '/v1/me', kasia.token)).body.minecraft.length, 2);
    // a Minecraft account can go while another way to sign in is left
    const after = (await call('DELETE', `/v1/me/minecraft/${mcId(2)}`, kasia.token)).body;
    assert.deepEqual(after.minecraft, [{ uuid: mcId(1), name: 'Kasia', loadout: null }]);
    assert.equal((await call('DELETE', `/v1/me/minecraft/${mcId(1)}`, kasia.token)).body.error, 'last_provider');
  });

  it('signs in with Discord only to an account it was linked to', async () => {
    const discordLogin = async (token?: string) => {
      const { state, url } = (await call('POST', '/v1/auth/discord/start', token)).body;
      assert.match(url, /discord\.com\/oauth2\/authorize/);
      assert.equal((await call('GET', `/v1/auth/poll?state=${state}`)).body.pending, true);
      const page = await fetch(`${base}/v1/auth/discord/callback?state=${state}&code=xyz`);
      return { page: page.status, done: await call('GET', `/v1/auth/poll?state=${state}`) };
    };
    // nobody has this Discord account yet: no new account from Discord
    const first = await discordLogin();
    assert.equal(first.page, 400);
    assert.equal(first.done.body.error, 'not_linked');
    // linked from a signed-in account, Discord then opens it
    const owner = (await minecraftLogin('Discordowy', mcId(4))).body;
    const link = await discordLogin(owner.token);
    assert.equal(link.done.body.linked, true);
    const again = await discordLogin();
    assert.equal(again.page, 200);
    assert.equal(again.done.body.user.id, owner.user.id);
    // the name stays the account's own; Discord's picture is kept, but the avatar is the Minecraft face until picked
    assert.equal(again.done.body.user.name, 'Discordowy');
    assert.match(again.done.body.user.avatar, /^\/v1\/head\//);
    const token = again.done.body.token;
    assert.match((await call('GET', '/v1/me', token)).body.avatars.provider, /cdn\.discordapp\.com/);
    assert.match((await call('POST', '/v1/me', token, { avatarSource: 'provider' })).body.avatar, /cdn\.discordapp\.com/);
    // the result is handed out once
    assert.equal(again.done.status, 200);
  });

  /** A Microsoft sign-in with a code: `who` types it on microsoft.com/link, optionally linking to a session. */
  async function microsoftLogin(who: string, token?: string) {
    const start = (await call('POST', '/v1/auth/microsoft/start', token)).body;
    assert.equal(start.url, 'https://www.microsoft.com/link');
    assert.match(start.code, /^CODE\d+$/);
    // nobody has typed it yet
    assert.equal((await call('GET', `/v1/auth/poll?state=${start.state}`)).body.pending, true);
    typedCodes.set(`device-${start.code.slice(4)}`, who);
    for (let i = 0; i < 50; i++) {
      const res = await call('GET', `/v1/auth/poll?state=${start.state}`);
      if (!res.body.pending) return res;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('the sign-in did not finish');
  }

  it('signs in with Microsoft once linked, and keeps one Microsoft account per SlashClient account', async () => {
    assert.equal((await microsoftLogin('jan')).body.error, 'not_linked');
    const jan = (await minecraftLogin('Jan', mcId(5))).body;
    assert.equal((await microsoftLogin('jan', jan.token)).body.linked, true);
    assert.equal((await microsoftLogin('jan')).body.user.id, jan.user.id);

    const dev = await login('Linker');
    const linked = (await microsoftLogin('ola', dev.token)).body;
    assert.deepEqual(linked.user.providers, ['dev', 'microsoft']);
    assert.equal((await microsoftLogin('ola')).body.user.id, dev.user.id);
    // Jan's Microsoft account already belongs to Jan
    assert.equal((await microsoftLogin('jan', dev.token)).body.error, 'already_linked');
    const after = await call('DELETE', '/v1/me/providers/microsoft', dev.token);
    assert.deepEqual(after.body.providers, ['dev']);
    assert.equal((await call('DELETE', '/v1/me/providers/dev', dev.token)).status, 404);
  });

  it('signs in with Google and GitHub once linked', async () => {
    const zosia = (await minecraftLogin('Zosia', mcId(6))).body;
    for (const [provider, avatar] of [['google', ''], ['github', 'https://avatars.githubusercontent.com/u/7']]) {
      for (const token of [zosia.token, undefined]) {
        const { state, url } = (await call('POST', `/v1/auth/${provider}/start`, token)).body;
        assert.match(url, provider === 'google' ? /accounts\.google\.com/ : /github\.com\/login\/oauth/);
        await fetch(`${base}/v1/auth/${provider}/callback?state=${state}&code=c`);
        const done = (await call('GET', `/v1/auth/poll?state=${state}`)).body;
        if (token) assert.equal(done.linked, true);
        else {
          assert.equal(done.user.id, zosia.user.id);
          // pictures only from the provider's own host (Google's fake one is left out); the avatar stays the Minecraft face
          const me = (await call('GET', '/v1/me', done.token)).body;
          assert.equal(me.avatars.provider, avatar || me.avatars.provider);
          if (avatar) assert.equal(me.avatar, me.avatars.minecraft[0]?.url || avatar);
        }
      }
    }
    assert.deepEqual((await call('GET', '/v1/health')).body.providers, ['discord', 'microsoft', 'google', 'github']);
  });

  it('gives a free handle when the name is taken', async () => {
    const other = await call('POST', '/v1/auth/dev', undefined, { name: 'Kasia' });
    assert.equal(other.body.user.handle, 'Kasia2');
  });

  it('keeps launchers\' public keys for friends, and passes encrypted messages on untouched', async () => {
    const a = await login('Szyfr');
    const b = await login('Tajny');
    const c = await login('Obcy');
    await call('POST', '/v1/friends/requests', a.token, { handle: 'Tajny' });
    await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
    const key = { device: 'ab'.repeat(12), pub: 'MCowBQYDK2VuAyEA' + 'A'.repeat(44) };
    assert.equal((await call('POST', '/v1/keys', b.token, { device: 'x', pub: key.pub })).status, 400);
    assert.equal((await call('POST', '/v1/keys', b.token, key)).body.ok, true);
    // a friend can fetch them, a stranger cannot
    assert.deepEqual((await call('GET', `/v1/keys/${b.user.id}`, a.token)).body.keys, [key]);
    assert.equal((await call('GET', `/v1/keys/${b.user.id}`, c.token)).status, 403);
    const sealed = 'e2e1:' + Buffer.from('x'.repeat(5000)).toString('base64');
    const sent = (await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: sealed })).body.message;
    assert.equal(sent.text, sealed);
    assert.equal((await call('GET', `/v1/messages/${a.user.id}`, b.token)).body.messages.at(-1).text, sealed);
    // a plain message stays short; an "encrypted" one must look like one
    assert.equal((await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: 'x'.repeat(2001) })).body.error, 'too_long');
    assert.equal((await call('POST', `/v1/messages/${b.user.id}`, a.token, { text: 'e2e1:<script>' })).body.error, 'bad_request');
  });

  it('makes friends, shows statuses and delivers messages live', async () => {
    const ala = await login('Ala');
    const bob = await login('Bob');
    assert.equal((await call('POST', '/v1/friends/requests', ala.token, { handle: 'nikt' })).status, 404);
    assert.equal((await call('POST', '/v1/friends/requests', ala.token, { handle: 'Ala' })).body.error, 'self');
    // messages need a friendship
    assert.equal((await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: 'hej' })).status, 403);

    const bobLive = await connect(bob.token, { status: 'online', activity: { kind: 'launcher' } });
    const sent = await call('POST', '/v1/friends/requests', ala.token, { handle: '@bob' });
    assert.equal(sent.body.status, 'sent');
    await bobLive.waitFor((e) => e.type === 'friends' && e.request?.handle === 'Ala');
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.incoming[0].handle, 'Ala');
    await call('POST', `/v1/friends/requests/${ala.user.id}/accept`, bob.token);

    const alaLive = await connect(ala.token, { status: 'online', activity: { kind: 'server', server: 'mc.example.com', version: '1.21.4' } });
    const seen = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.status === 'online');
    assert.equal(seen.presence.activity.server, 'mc.example.com');

    // hiding the server address
    await call('POST', '/v1/me', ala.token, { showServer: false });
    const hidden = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.activity && !e.presence.activity.server);
    assert.equal(hidden.presence.activity.version, '1.21.4');

    const msg = await call('POST', `/v1/messages/${bob.user.id}`, ala.token, { text: '  cześć!  ' });
    assert.equal(msg.body.message.text, 'cześć!');
    await bobLive.waitFor((e) => e.type === 'message' && e.message.text === 'cześć!');
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends[0].unread, 1);
    await call('POST', `/v1/messages/${ala.user.id}/read`, bob.token);
    await alaLive.waitFor((e) => e.type === 'read' && e.by === bob.user.id);
    assert.equal((await call('GET', '/v1/friends', bob.token)).body.friends[0].unread, 0);
    const history = (await call('GET', `/v1/messages/${ala.user.id}`, bob.token)).body.messages;
    assert.equal(history.length, 1);
    assert.ok(history[0].readAt);

    alaLive.ws.send(JSON.stringify({ type: 'typing', to: bob.user.id }));
    await bobLive.waitFor((e) => e.type === 'typing' && e.from === ala.user.id);

    // invisible looks offline
    alaLive.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'invisible' } }));
    await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.status === 'offline');

    alaLive.ws.close();
    bobLive.ws.close();
  });

  it('sends game invites that stay in the chat', async () => {
    const ola = await login('Ola');
    const pit = await login('Piotr');
    assert.equal((await call('POST', `/v1/invites/${pit.user.id}`, ola.token, { server: 'skyup.pl' })).status, 403);
    await call('POST', '/v1/friends/requests', ola.token, { handle: 'Piotr' });
    await call('POST', `/v1/friends/requests/${ola.user.id}/accept`, pit.token);
    const live = await connect(pit.token);
    assert.equal((await call('POST', `/v1/invites/${pit.user.id}`, ola.token, { server: 'not a server!' })).body.error, 'bad_server');
    const sent = await call('POST', `/v1/invites/${pit.user.id}`, ola.token, { server: 'SkyUp.pl:25565', version: '26.1.2', extra: 'x' });
    assert.deepEqual(sent.body.message.invite, { server: 'skyup.pl:25565', version: '26.1.2' });
    await live.waitFor((e) => e.type === 'message' && e.message.invite?.server === 'skyup.pl:25565');
    const history = (await call('GET', `/v1/messages/${ola.user.id}`, pit.token)).body.messages;
    assert.deepEqual(history.at(-1).invite, { server: 'skyup.pl:25565', version: '26.1.2' });
    // plain messages have no invite field
    await call('POST', `/v1/messages/${pit.user.id}`, ola.token, { text: 'wchodzisz?' });
    assert.equal((await call('GET', `/v1/messages/${ola.user.id}`, pit.token)).body.messages.at(-1).invite, undefined);
    live.ws.close();
  });

  it('shows capes and emotes of launcher players', async () => {
    const ewa = await login('Ewa');
    const tom = await login('Tomek');
    const ewaMc = '11111111-2222-3333-4444-555555555555';
    const tomMc = '66666666-7777-8888-9999-000000000000';
    assert.equal((await call('POST', '/v1/me', ewa.token, { cape: 'nope' })).body.error, 'bad_cape');
    assert.equal((await call('POST', '/v1/me', ewa.token, { cape: 'galaxy' })).body.cape, 'galaxy');
    // nothing until the launcher links the game's player to the account
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body, { active: [], capes: {}, ranks: {}, cosmetics: {} });
    // only a Minecraft account proven at Mojang to be the player's own
    assert.equal((await call('POST', '/v1/mc/link', ewa.token, { uuid: ewaMc })).body.error, 'not_linked');
    await minecraftLogin('Ewa', ewaMc.replace(/-/g, ''), ewa.token);
    await minecraftLogin('Tomek', tomMc.replace(/-/g, ''), tom.token);
    await call('POST', '/v1/mc/link', ewa.token, { uuid: ewaMc });
    await call('POST', '/v1/mc/link', tom.token, { uuid: tomMc });
    const seen = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc, tomMc] })).body;
    assert.deepEqual(seen.capes, { [ewaMc]: 'galaxy' });
    // the logo's colour: Tomek is an admin
    assert.deepEqual(seen.ranks, { [tomMc]: 'admin' });
    // the pink friend: only HUDs that say they know it see it pink, older ones get the green friend
    await call('POST', `/v1/admin/users/${ewa.user.id}`, tom.token, { rank: 'friend_pink' });
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.ranks[ewaMc], 'friend');
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc], knownRanks: ['friend_pink'] })).body.ranks[ewaMc], 'friend_pink');
    await call('POST', `/v1/admin/users/${ewa.user.id}`, tom.token, { rank: '' });
    // the other slots: wings, a trail and a pet go with the cape; rank items only for that rank
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { wings: 'angel', trail: 'hearts', pet: 'allay' } })).body.loadout.wings, 'angel');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { wings: 'phoenix' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { wings: 'hearts' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { cape: 'staff_admin' })).body.error, 'bad_cape');
    // Tomek is an admin: he may wear every rank's items
    assert.equal((await call('POST', '/v1/me', tom.token, { cape: 'staff_admin', loadout: { aura: 'royal' } })).body.cape, 'staff_admin');
    const worn = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc, tomMc] })).body.cosmetics;
    assert.deepEqual(worn[ewaMc], { cape: 'galaxy', wings: 'angel', trail: 'hearts', pet: 'allay' });
    assert.deepEqual(worn[tomMc], { cape: 'staff_admin', aura: 'royal' });
    // '' takes an item off
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { pet: '' } })).body.loadout.pet, undefined);
    // clothing: a hat and a top go with the rest, each only in its own slot
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { hat: 'tophat', top: 'scarf' } })).body.loadout.hat, 'tophat');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { top: 'crown' } })).body.error, 'bad_item');
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc], { cape: 'galaxy', wings: 'angel', trail: 'hearts', hat: 'tophat', top: 'scarf' });
    await call('POST', '/v1/me', ewa.token, { loadout: { hat: '', top: '' } });
    // only launchers that can draw it see it in their menu
    const askAs = async (client?: string) => (await (await fetch(`${base}/v1/cosmetics`, { headers: { Authorization: `Bearer ${ewa.token}`, ...(client ? { 'X-SlashClient': client } : {}) } })).json()) as { items: { id: string; slot: string }[] };
    assert.ok((await askAs('launcher/0.9.11')).items.some((i) => i.id === 'tophat' && i.slot === 'hat'));
    assert.ok(!(await askAs('launcher/0.9.10')).items.some((i) => i.slot === 'hat' || i.slot === 'top'));
    // kill effects: one at a time, free for everyone, only in their own slot, and only for launchers from 0.9.14 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { kill: 'lightning' } })).body.loadout.kill, 'lightning');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { kill: 'confetti' } })).body.loadout.kill, 'confetti');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { kill: 'hearts' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { trail: 'ghost' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc].kill, 'confetti');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { kill: '' } })).body.loadout.kill, undefined);
    const kills = (await askAs('launcher/0.9.14')).items.filter((i) => i.slot === 'kill');
    assert.equal(kills.length, 12);
    assert.ok(kills.every((i) => (i as { available?: boolean }).available));
    assert.ok(!(await askAs('launcher/0.9.13')).items.some((i) => i.slot === 'kill'));
    assert.ok(!(await askAs('mod/0.9.13')).items.some((i) => i.slot === 'kill'));
    // suits: one at a time, free for everyone, only in their own slot, worn beside the clothing, and only for launchers and mods from 0.9.20 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { suit: 'astronaut', hat: 'crown' } })).body.loadout.suit, 'astronaut');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { suit: 'pirate' } })).body.loadout.suit, 'pirate');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { suit: 'tophat' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { top: 'knight' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { suit: 'ghost' } })).body.error, 'bad_item');
    const ewaSuit = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc];
    assert.equal(ewaSuit.suit, 'pirate');
    assert.equal(ewaSuit.hat, 'crown');
    await call('POST', '/v1/me', ewa.token, { loadout: { suit: '', hat: '' } });
    assert.equal((await call('GET', '/v1/me', ewa.token)).body.loadout.suit, undefined);
    const suits = (await askAs('launcher/0.9.20')).items.filter((i) => i.slot === 'suit');
    assert.deepEqual(suits.map((i) => i.id), ['astronaut', 'samurai', 'pandasuit', 'dinosuit', 'knight', 'ghostsheet', 'mech', 'pirate']);
    assert.ok(suits.every((i) => (i as { available?: boolean }).available));
    assert.ok((await askAs('mod/0.9.20')).items.some((i) => i.slot === 'suit'));
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'suit'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'suit'));
    // held item skins: a shield and a weapon together, each only in its own slot, for launchers and mods from 0.9.20 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { shield: 'shield_dragon', weapon: 'sword_katana' } })).body.loadout.shield, 'shield_dragon');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { weapon: 'bow_crystal' } })).body.loadout.weapon, 'bow_crystal');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { shield: 'sword_beam' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { weapon: 'shield_ice' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { hat: 'shield_heart' } })).body.error, 'bad_item');
    const held = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc];
    assert.equal(held.shield, 'shield_dragon');
    assert.equal(held.weapon, 'bow_crystal');
    await call('POST', '/v1/me', ewa.token, { loadout: { shield: '', weapon: '' } });
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc]?.shield, undefined);
    const newer = (await askAs('launcher/0.9.20')).items;
    assert.equal(newer.filter((i) => i.slot === 'shield').length, 7);
    assert.equal(newer.filter((i) => i.slot === 'weapon').length, 6);
    assert.ok(newer.filter((i) => i.slot === 'weapon').every((i) => /^(sword|bow)_/.test(i.id)));
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'shield' || i.slot === 'weapon'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'shield' || i.slot === 'weapon'));
    // ids are unique across all slots
    const { ITEMS } = await import('../src/cosmetics.ts');
    assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
    // shoes and things on the hands: each only in its own slot, worn with the rest, only for launchers and mods from 0.9.20 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { shoes: 'rocketboots', hands: 'boxinggloves' } })).body.loadout.shoes, 'rocketboots');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { shoes: 'wristwatch' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { hands: 'flippers' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { hat: 'mittens' } })).body.error, 'bad_item');
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc], { cape: 'galaxy', wings: 'angel', trail: 'hearts', shoes: 'rocketboots', hands: 'boxinggloves' });
    await call('POST', '/v1/me', ewa.token, { loadout: { shoes: '', hands: '' } });
    assert.equal((await call('GET', '/v1/me', ewa.token)).body.loadout.shoes, undefined);
    const limbs = (await askAs('launcher/0.9.20')).items.filter((i) => i.slot === 'shoes' || i.slot === 'hands');
    assert.deepEqual(limbs.filter((i) => i.slot === 'shoes').map((i) => i.id),
      ['sneakers_red', 'sneakers_blue', 'hikingboots', 'slippers', 'bunnyslippers', 'rocketboots', 'rollerskates', 'flippers']);
    assert.deepEqual(limbs.filter((i) => i.slot === 'hands').map((i) => i.id),
      ['boxinggloves', 'wristwatch', 'bracelet', 'spikedgauntlets', 'mittens', 'goldring', 'smartband']);
    assert.ok(limbs.every((i) => (i as { available?: boolean }).available));
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'shoes' || i.slot === 'hands'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'shoes' || i.slot === 'hands'));
    // ids are unique across all slots (a loadout is looked up by id alone)
    const every = (await askAs('launcher/0.9.20')).items.map((i) => i.id);
    assert.equal(new Set(every).size, every.length);
    // on the back and tails: one of each, each only in its own slot, and only for launchers and mods from 0.9.20 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { back: 'backpack', tail: 'foxtail' } })).body.loadout.back, 'backpack');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { back: 'kitsune' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { tail: 'katana' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { hat: 'cattail' } })).body.error, 'bad_item');
    const gear = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc];
    assert.equal(gear.back, 'backpack');
    assert.equal(gear.tail, 'foxtail');
    // a back item and a cape may both be picked: the game draws the back item in the cape's place
    assert.equal(gear.cape, 'galaxy');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { back: '', tail: '' } })).body.loadout.back, undefined);
    const backs = (await askAs('launcher/0.9.20')).items.filter((i) => i.slot === 'back');
    const tails = (await askAs('mod/0.9.20')).items.filter((i) => i.slot === 'tail');
    assert.equal(backs.length, 8);
    assert.equal(tails.length, 7);
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'back' || i.slot === 'tail'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'back' || i.slot === 'tail'));
    // rings and movement effects: free, each only in its own slot, and only for launchers and mods from 0.9.20 on
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { ring: 'ring_runes', move: 'move_steps' } })).body.loadout.ring, 'ring_runes');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { ring: 'move_jump' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { move: 'ring_galaxy' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { move: 'move_landing' } })).body.loadout.move, 'move_landing');
    const ringMove = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc] })).body.cosmetics[ewaMc];
    assert.equal(ringMove.ring, 'ring_runes');
    assert.equal(ringMove.move, 'move_landing');
    assert.equal((await call('POST', '/v1/me', ewa.token, { loadout: { ring: '', move: '' } })).body.loadout.ring, undefined);
    for (const slot of ['ring', 'move']) {
      const got = (await askAs('launcher/0.9.20')).items.filter((i) => i.slot === slot);
      assert.equal(got.length, slot === 'ring' ? 8 : 7, slot);
      assert.ok(got.every((i) => (i as { available?: boolean }).available), slot);
      assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === slot), slot);
      assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === slot), slot);
      assert.ok((await askAs('mod/0.9.20')).items.some((i) => i.slot === slot), slot);
    }
    const catalog = (await call('GET', '/v1/cosmetics', ewa.token)).body;
    assert.ok(catalog.items.some((i: any) => i.id === 'phoenix' && i.rank === 'partner' && !i.available));
    assert.ok(catalog.items.some((i: any) => i.id === 'angel' && i.slot === 'wings' && i.available));

    // on an offline-mode server Ewa's uuid is made from her name: the cape goes with it too
    assert.equal(offlineUuid('Guardes'), 'e2f755a8-fc71-367d-8353-0c1f31b4ee12');
    const ewaOffline = offlineUuid('Ewa');
    await call('POST', '/v1/mc/heartbeat', undefined, { uuid: ewaOffline });
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaOffline] })).body.capes, { [ewaOffline]: 'galaxy' });
    assert.deepEqual(seen.active.sort(), [ewaMc, tomMc].sort());

    // each Minecraft account may have its own set; it starts from the account's and replaces it
    const ewaAlt = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    await minecraftLogin('EwaPvP', ewaAlt.replace(/-/g, ''), ewa.token);
    assert.equal((await call('POST', '/v1/me', ewa.token, { character: tomMc, cape: 'ocean' })).body.error, 'not_linked');
    const mine = (await call('POST', '/v1/me', ewa.token, { character: ewaAlt, cape: 'ember', loadout: { wings: '', aura: 'portal' } })).body;
    assert.deepEqual(mine.minecraft.find((m: any) => m.name === 'EwaPvP').loadout, { trail: 'hearts', cape: 'ember', aura: 'portal' });
    assert.equal(mine.minecraft.find((m: any) => m.name === 'Ewa').loadout, null);
    assert.equal((await call('POST', '/v1/me', ewa.token, { character: ewaAlt, loadout: { wings: 'phoenix' } })).body.error, 'bad_item');
    await call('POST', '/v1/mc/link', ewa.token, { uuid: ewaAlt });
    const both = (await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaMc, ewaAlt] })).body.cosmetics;
    assert.deepEqual(both[ewaAlt], { trail: 'hearts', cape: 'ember', aura: 'portal' });
    assert.deepEqual(both[ewaMc], { cape: 'galaxy', wings: 'angel', trail: 'hearts' });
    // the admin panel shows what each Minecraft account wears, not only the account's own cape
    const listed = (await call('GET', `/v1/admin/users/${ewa.user.id}`, tom.token)).body;
    assert.deepEqual(listed.worn, [{ name: 'Ewa', cape: 'galaxy' }, { name: 'EwaPvP', cape: 'ember' }]);
    const capes = (await call('GET', '/v1/admin/stats', tom.token)).body.capes;
    assert.ok(capes.galaxy >= 1 && capes.ember >= 1);
    // back to the account's set
    await call('POST', '/v1/me', ewa.token, { character: ewaAlt, own: false });
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [ewaAlt] })).body.cosmetics[ewaAlt], { cape: 'galaxy', wings: 'angel', trail: 'hearts' });

    // emotes reach launcher players on the same server, not others
    const onServer = { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } };
    const ewaLive = await connect(ewa.token, onServer);
    const tomLive = await connect(tom.token, onServer);
    const ola = await login('Olka');
    const olaLive = await connect(ola.token, { status: 'online', activity: { kind: 'server', server: 'other.pl' } });
    assert.equal((await call('POST', '/v1/mc/emote', ewa.token, { uuid: tomMc, emote: 'wave' })).body.error, 'not_linked');
    assert.equal((await call('POST', '/v1/mc/emote', ewa.token, { uuid: ewaMc, emote: 'dance' })).status, 400);
    await call('POST', '/v1/mc/emote', ewa.token, { uuid: ewaMc, emote: 'wave' });
    await tomLive.waitFor((e) => e.type === 'emote' && e.uuid === ewaMc && e.emote === 'wave');
    await ewaLive.waitFor((e) => e.type === 'emote' && e.uuid === ewaMc);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!olaLive.events.some((e) => e.type === 'emote'));
    for (const l of [ewaLive, tomLive, olaLive]) l.ws.close();
  });

  it('lets players push a wheelbarrow (the prop slot), seen only by launchers from 0.9.20 on', async () => {
    const ola = await login('OlaTaczka');
    const olaMc = '12121212-3434-5656-7878-909090909090';
    await minecraftLogin('OlaTaczka', olaMc.replace(/-/g, ''), ola.token);
    await call('POST', '/v1/mc/link', ola.token, { uuid: olaMc });
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { prop: 'wheelbarrow' } })).body.loadout.prop, 'wheelbarrow');
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { prop: 'wheelbarrow_flowers', hat: 'tophat' } })).body.loadout.prop, 'wheelbarrow_flowers');
    // only in its own slot, and nothing else in it
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { prop: 'tophat' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { hat: 'wheelbarrow_gold' } })).body.error, 'bad_item');
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [olaMc] })).body.cosmetics[olaMc], { hat: 'tophat', prop: 'wheelbarrow_flowers' });
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { prop: '' } })).body.loadout.prop, undefined);
    const askAs = async (client: string) => (await (await fetch(`${base}/v1/cosmetics`, { headers: { Authorization: `Bearer ${ola.token}`, 'X-SlashClient': client } })).json()) as { items: { id: string; slot: string; available: boolean }[] };
    const props = (await askAs('launcher/0.9.20')).items.filter((i) => i.slot === 'prop');
    assert.deepEqual(props.map((i) => i.id), ['wheelbarrow', 'wheelbarrow_gold', 'wheelbarrow_flowers']);
    assert.ok(props.every((i) => i.available));
    assert.ok((await askAs('mod/0.9.20')).items.some((i) => i.slot === 'prop'));
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'prop'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'prop'));
  });

  it('tells players on the same server at once when someone changes cosmetics', async () => {
    const kasia = await login('KasiaLive');
    const bartek = await login('BartekLive');
    const obcy = await login('ObcyLive');
    const kasiaMc = 'abcdef01-2222-3333-4444-555555555555';
    await minecraftLogin('KasiaLive', kasiaMc.replace(/-/g, ''), kasia.token);
    // nobody hears anything while Kasia's game is not running
    const kasiaLive = await connect(kasia.token, { status: 'online', activity: { kind: 'server', server: 'SkyUp.pl:25565' } });
    const bartekLive = await connect(bartek.token, { status: 'online', activity: { kind: 'server', server: 'skyup.pl' } });
    const obcyLive = await connect(obcy.token, { status: 'online', activity: { kind: 'server', server: 'other.pl' } });
    await call('POST', '/v1/me', kasia.token, { cape: 'galaxy' });
    await new Promise((r) => setTimeout(r, 450));
    assert.ok(!bartekLive.events.some((e) => e.type === 'cosmetics'));

    await call('POST', '/v1/mc/link', kasia.token, { uuid: kasiaMc });
    // a burst of changes (slots clicked through) goes out as one event, with the last state
    const before = Date.now();
    await call('POST', '/v1/me', kasia.token, { cape: 'ember' });
    await call('POST', '/v1/me', kasia.token, { loadout: { wings: 'angel', pet: 'allay' } });
    await call('POST', '/v1/me', kasia.token, { loadout: { trail: 'hearts' } });
    const got = await bartekLive.waitFor((e) => e.type === 'cosmetics');
    assert.ok(Date.now() - before < 1500);
    // the same server however it was typed; the uuids dashed (also the one an offline-mode server gives), with the whole new set
    assert.deepEqual(got.uuids, [kasiaMc, offlineUuid('KasiaLive')]);
    assert.deepEqual(got.cosmetics[offlineUuid('KasiaLive')], got.cosmetics[kasiaMc]);
    assert.deepEqual(got.cosmetics[kasiaMc], { cape: 'ember', wings: 'angel', pet: 'allay', trail: 'hearts' });
    // her own launcher too (her game shows a change made on the website at once)
    await kasiaLive.waitFor((e) => e.type === 'cosmetics' && e.cosmetics[kasiaMc].cape === 'ember');
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(bartekLive.events.filter((e) => e.type === 'cosmetics').length, 1);
    // a player on another server does not hear it
    assert.ok(!obcyLive.events.some((e) => e.type === 'cosmetics'));

    // taking everything off: an empty set
    await call('POST', '/v1/me', kasia.token, { cape: '', loadout: { wings: '', pet: '', trail: '' } });
    await bartekLive.waitFor((e) => e.type === 'cosmetics' && Object.keys(e.cosmetics[kasiaMc]).length === 0);

    // a world opened to LAN (no server address): only friends in a game hear it
    for (const l of [kasiaLive, bartekLive, obcyLive]) l.ws.close();
    await call('POST', '/v1/friends/requests', kasia.token, { handle: 'BartekLive' });
    await call('POST', `/v1/friends/requests/${kasia.user.id}/accept`, bartek.token);
    const inWorld = { status: 'online', activity: { kind: 'singleplayer' } };
    const kasiaLan = await connect(kasia.token, inWorld);
    const bartekLan = await connect(bartek.token, inWorld);
    const obcyLan = await connect(obcy.token, inWorld);
    await call('POST', '/v1/me', kasia.token, { loadout: { aura: 'souls' } });
    await bartekLan.waitFor((e) => e.type === 'cosmetics' && e.cosmetics[kasiaMc].aura === 'souls');
    await new Promise((r) => setTimeout(r, 450));
    assert.ok(!obcyLan.events.some((e) => e.type === 'cosmetics'));
    for (const l of [kasiaLan, bartekLan, obcyLan]) l.ws.close();
  });

  it('accepts at once when both sides asked', async () => {
    const x = await login('Xavier');
    const y = await login('Yvonne');
    await call('POST', '/v1/friends/requests', x.token, { handle: 'Yvonne' });
    const back = await call('POST', '/v1/friends/requests', y.token, { handle: 'Xavier' });
    assert.equal(back.body.status, 'friends');
    assert.equal(back.body.friends[0].handle, 'Xavier');
    const removed = await call('DELETE', `/v1/friends/${x.user.id}`, y.token);
    assert.equal(removed.body.friends.length, 0);
  });

  it('knows which Minecraft players use SlashClient', async () => {
    const steve = '8667ba71-b85a-4004-af54-457a9734eed7';
    const alex = 'ec561538-f3fd-461d-aff5-086b22154bce';
    assert.equal((await call('POST', '/v1/mc/heartbeat', undefined, { uuid: 'nope' })).status, 400);
    assert.equal((await call('POST', '/v1/mc/heartbeat', undefined, { uuid: steve })).body.ok, true);
    const found = await call('POST', '/v1/mc/lookup', undefined, { uuids: [steve, alex, 'x'] });
    assert.deepEqual(found.body.active, [steve]);
    assert.equal((await call('POST', '/v1/mc/lookup', undefined, { uuids: 'all' })).status, 400);
  });

  it('rejects messages that are empty or too long', async () => {
    const p = await login('Piotr');
    const q = await login('Quinn');
    await call('POST', '/v1/friends/requests', p.token, { handle: 'Quinn' });
    await call('POST', `/v1/friends/requests/${p.user.id}/accept`, q.token);
    assert.equal((await call('POST', `/v1/messages/${q.user.id}`, p.token, { text: '   ' })).body.error, 'empty');
    assert.equal((await call('POST', `/v1/messages/${q.user.id}`, p.token, { text: 'x'.repeat(2001) })).body.error, 'too_long');
  });

  it('wears something on the face and on top of the head, each in its own slot', async () => {
    const ola = await login('OlaFace');
    const mc = '12121212-3434-5656-7878-909090909090';
    await minecraftLogin('OlaFace', mc.replace(/-/g, ''), ola.token);
    await call('POST', '/v1/mc/link', ola.token, { uuid: mc });
    // with a hat at once: they go with it (the clients hide what the hat would go through)
    const me = (await call('POST', '/v1/me', ola.token, { loadout: { face: 'sunglasses', ears: 'catears', hat: 'cap' } })).body;
    assert.deepEqual([me.loadout.face, me.loadout.ears, me.loadout.hat], ['sunglasses', 'catears', 'cap']);
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { face: 'kitsune', ears: 'unicorn' } })).body.loadout.face, 'kitsune');
    // each only in its own slot
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { face: 'catears' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { ears: 'monocle' } })).body.error, 'bad_item');
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { hat: 'antlers' } })).body.error, 'bad_item');
    assert.deepEqual((await call('POST', '/v1/mc/lookup', undefined, { uuids: [mc] })).body.cosmetics[mc], { face: 'kitsune', ears: 'unicorn', hat: 'cap' });
    assert.equal((await call('POST', '/v1/me', ola.token, { loadout: { face: '', ears: '' } })).body.loadout.face, undefined);
    // free for everyone, only for launchers and mods from 0.9.20 on
    const askAs = async (client: string) => (await (await fetch(`${base}/v1/cosmetics`, { headers: { Authorization: `Bearer ${ola.token}`, 'X-SlashClient': client } })).json()) as { items: { id: string; slot: string; available: boolean }[] };
    const items = (await askAs('launcher/0.9.20')).items;
    assert.equal(items.filter((i) => i.slot === 'face').length, 9);
    assert.equal(items.filter((i) => i.slot === 'ears').length, 8);
    assert.ok(items.filter((i) => i.slot === 'face' || i.slot === 'ears').every((i) => i.available));
    assert.ok(!(await askAs('launcher/0.9.19')).items.some((i) => i.slot === 'face' || i.slot === 'ears'));
    assert.ok(!(await askAs('mod/0.9.19')).items.some((i) => i.slot === 'face' || i.slot === 'ears'));
  });
});

describe('LAN worlds through the relay', () => {
  /** A /v1/lan connection: its first message, then the frames it gets. */
  async function lan(first: unknown) {
    const ws = new WebSocket(base.replace('http', 'ws') + '/v1/lan');
    const got: Buffer[] = [];
    let ok = false;
    let closed: number | undefined;
    ws.on('message', (d, binary) => {
      if (binary) got.push(d as Buffer);
      else if (JSON.parse(String(d)).type === 'ok') ok = true;
    });
    ws.on('close', (code) => (closed = code));
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify(first));
    const until = async (pred: () => boolean) => {
      for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
      assert.ok(pred(), 'did not happen');
    };
    return { ws, got, isOk: () => ok, closed: () => closed, until };
  }

  it('carries a friend to a world opened to LAN, and nobody else', async () => {
    const host = await login('Lanka');
    const friend = await login('Gosc');
    const stranger = await login('Obcy');
    await call('POST', '/v1/friends/requests', host.token, { handle: 'Gosc' });
    await call('POST', `/v1/friends/requests/${host.user.id}/accept`, friend.token);
    const hostWs = await connect(host.token, { status: 'online', activity: { kind: 'singleplayer' } });
    const friendWs = await connect(friend.token, { status: 'online' });

    // not open yet: no way in
    const early = await lan({ type: 'join', token: friend.token, host: host.user.id });
    await early.until(() => early.closed() === 4003);

    hostWs.ws.send(JSON.stringify({ type: 'lan', open: true }));
    await friendWs.waitFor((e) => e.type === 'presence' && e.id === host.user.id && e.presence.lan === true);

    // a stranger is turned away even now
    const other = await lan({ type: 'join', token: stranger.token, host: host.user.id });
    await other.until(() => other.closed() === 4003);

    const joiner = await lan({ type: 'join', token: friend.token, host: host.user.id });
    const ask = await hostWs.waitFor((e) => e.type === 'lan-connect' && e.from === friend.user.id);
    // only the host may answer
    const wrong = await lan({ type: 'accept', token: friend.token, id: ask.id });
    await wrong.until(() => wrong.closed() === 4004);
    const hostSide = await lan({ type: 'accept', token: host.token, id: ask.id });
    const joiner2 = joiner;
    await joiner2.until(() => joiner2.isOk());
    await hostSide.until(() => hostSide.isOk());
    joiner2.ws.send(Buffer.from([1, 2, 3]));
    hostSide.ws.send(Buffer.from('pong'));
    await hostSide.until(() => hostSide.got.length > 0);
    await joiner2.until(() => joiner2.got.length > 0);
    assert.deepEqual([...hostSide.got[0]], [1, 2, 3]);
    assert.equal(String(joiner2.got[0]), 'pong');

    // one side closes: so does the other
    joiner2.ws.close();
    await hostSide.until(() => hostSide.closed() !== undefined);

    // closed to LAN: friends see it, and no new way in
    hostWs.ws.send(JSON.stringify({ type: 'lan', open: false }));
    await friendWs.waitFor((e) => e.type === 'presence' && e.id === host.user.id && !e.presence.lan);
    for (const c of [hostWs, friendWs]) c.ws.close();
    // the server sees them go before the test ends
    await new Promise((r) => setTimeout(r, 100));
  });
});

describe('LAN worlds between two launchers', () => {
  it('lets a friend game talk to the host LAN world through both launchers', async () => {
    const host = await login('Gospodarz');
    const friend = await login('Kumpel');
    await call('POST', '/v1/friends/requests', host.token, { handle: 'Kumpel' });
    await call('POST', `/v1/friends/requests/${host.user.id}/accept`, friend.token);
    // the host's "LAN world": answers each line in capitals
    const world = net.createServer((s) => s.on('data', (d) => s.write(String(d).toUpperCase())));
    await new Promise<void>((r) => world.listen(0, '127.0.0.1', r));
    const worldPort = (world.address() as AddressInfo).port;

    const hostWs = await connect(host.token, { status: 'online' });
    const hostLan = new LanTunnels({ url: () => base, token: () => host.token, send: (m) => hostWs.ws.send(JSON.stringify(m)) });
    hostWs.ws.on('message', (d) => {
      const e = JSON.parse(String(d));
      if (e.type === 'lan-connect') hostLan.accept(e.id);
    });
    const friendWs = await connect(friend.token, { status: 'online' });
    hostLan.setHost(worldPort);
    await friendWs.waitFor((e) => e.type === 'presence' && e.id === host.user.id && e.presence.lan === true);

    const friendLan = new LanTunnels({ url: () => base, token: () => friend.token, send: () => {} });
    const port = await friendLan.join(host.user.id);
    const game = net.connect(port, '127.0.0.1');
    let got = '';
    game.on('data', (d) => (got += String(d)));
    // the game speaks at once, before the relay is ready: nothing is lost
    game.write('hello');
    const heard = async (want: string) => {
      for (let i = 0; i < 100 && got !== want; i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal(got, want);
    };
    await heard('HELLO');
    game.write(' again');
    await heard('HELLO AGAIN');

    game.destroy();
    friendLan.stop();
    hostLan.stop();
    world.close();
    for (const c of [hostWs, friendWs]) c.ws.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});
