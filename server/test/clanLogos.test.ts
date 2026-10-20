import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { logoProblem, MAX_LOGO_BYTES } from '../src/clanLogos.ts';
import { encodePng } from '../src/png.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-clan-logos-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
type Player = { token: string; user: { id: string; handle: string } };
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as Player;
async function befriend(a: Player, b: Player) {
  await call('POST', '/v1/friends/requests', a.token, { handle: b.user.handle });
  await call('POST', `/v1/friends/requests/${a.user.id}/accept`, b.token);
}
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
/** A clan with an owner, an officer and a member. */
async function clanOf(prefix: string, tag: string) {
  const owner = await login(`${prefix}Own`);
  const officer = await login(`${prefix}Off`);
  const member = await login(`${prefix}Mem`);
  const id = (await call('POST', '/v1/clans', owner.token, { tag, name: `Klan ${prefix}` })).body.clan.id;
  for (const p of [officer, member]) {
    await call('POST', '/v1/clans/invites', owner.token, { handle: p.user.handle });
    assert.equal((await call('POST', `/v1/clans/${id}/accept`, p.token)).status, 200);
  }
  assert.equal((await call('POST', `/v1/clans/members/${officer.user.id}/role`, owner.token, { role: 'officer' })).status, 200);
  return { id, owner, officer, member };
}

const png = (w: number, h: number, fill = 0) => encodePng({ width: w, height: h, rgba: Buffer.alloc(w * h * 4, fill) });
async function upload(token: string, data: Buffer, method = 'PUT') {
  const res = await fetch(`${base}/v1/clans/mine/logo`, { method, headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` }, body: new Uint8Array(data) });
  return { status: res.status, body: (await res.json()) as any };
}

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, adminHandles: ['LogoAdmin'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('clan logos', () => {
  it('checks the picture: a PNG by its signature and header, 64×64, small', () => {
    assert.equal(logoProblem(png(64, 64)), undefined);
    assert.equal(logoProblem(png(32, 32)), 'bad_logo_size');
    assert.equal(logoProblem(png(64, 65)), 'bad_logo_size');
    assert.equal(logoProblem(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)])), 'not_png');
    // the signature alone, and a PNG cut short (no end)
    assert.equal(logoProblem(Buffer.concat([png(64, 64).subarray(0, 8), Buffer.alloc(60)])), 'not_png');
    assert.equal(logoProblem(png(64, 64).subarray(0, 60)), 'not_png');
    assert.equal(logoProblem(Buffer.alloc(MAX_LOGO_BYTES + 1)), 'too_large');
  });

  it('lets the owner set and remove it; everyone sees it; officers and members may not', async () => {
    const { id, owner, officer, member } = await clanOf('Logo', 'LOGO');
    const friend = await login('LogoFriend');
    await befriend(member, friend);
    const live = await connect(member.token);
    assert.equal((await upload(officer.token, png(64, 64))).body.error, 'not_allowed');
    assert.equal((await upload(member.token, png(64, 64))).body.error, 'not_allowed');
    assert.equal((await upload(owner.token, png(48, 48))).body.error, 'bad_logo_size');
    assert.equal((await upload(owner.token, Buffer.from('GIF89a not a png at all, really not, no'))).body.error, 'not_png');
    const big = Buffer.concat([png(64, 64).subarray(0, 33), Buffer.alloc(MAX_LOGO_BYTES), png(64, 64).subarray(-12)]);
    assert.equal((await upload(owner.token, big)).status, 413);
    assert.equal((await fetch(`${base}/v1/clans/${id}/logo.png`)).status, 404);

    const logo = png(64, 64, 200);
    const set = await upload(owner.token, logo, 'POST');
    assert.equal(set.status, 200, JSON.stringify(set.body));
    const v = set.body.clan.logo;
    assert.equal(typeof v, 'number');
    // members hear of it, and the clan's chat says who did it
    await live.waitFor((e) => e.type === 'clan');
    await live.waitFor((e) => e.type === 'group-message' && e.message.event?.kind === 'logo' && e.message.event.by === 'LogoOwn');
    assert.equal((await call('GET', '/v1/clans/mine', member.token)).body.clan.logo, v);
    const chat = (await call('GET', '/v1/groups', member.token)).body.groups.find((g: any) => g.clan?.id === id);
    assert.equal(chat.clan.logo, v);
    const friendRow = (await call('GET', '/v1/friends', friend.token)).body.friends.find((f: any) => f.id === member.user.id);
    assert.equal(friendRow.clan, 'LOGO');
    assert.deepEqual(friendRow.clanLogo, { id, v });
    // anyone may fetch it; with its version the address is kept for good
    const got = await fetch(`${base}/v1/clans/${id}/logo.png?v=${v}`);
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.match(got.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), logo);
    assert.doesNotMatch((await fetch(`${base}/v1/clans/${id}/logo.png`)).headers.get('cache-control') ?? '', /immutable/);
    // a new one has a newer version
    const again = await upload(owner.token, png(64, 64, 100));
    assert.ok(again.body.clan.logo > v);

    assert.equal((await call('DELETE', '/v1/clans/mine/logo', officer.token)).body.error, 'not_allowed');
    const removed = await call('DELETE', '/v1/clans/mine/logo', owner.token);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.clan.logo, undefined);
    assert.equal((await fetch(`${base}/v1/clans/${id}/logo.png`)).status, 404);
    const friendAfter = (await call('GET', '/v1/friends', friend.token)).body.friends.find((f: any) => f.id === member.user.id);
    assert.equal(friendAfter.clanLogo, undefined);
    const events = (await call('GET', `/v1/groups/${chat.id}/messages`, owner.token)).body.messages.filter((m: any) => m.event?.kind === 'logo');
    assert.deepEqual(events.map((m: any) => !!m.event.removed), [false, false, true]);
    live.ws.close();
  });

  it('goes with the clan, and an admin can take it off (in the log)', async () => {
    const admin = await login('LogoAdmin');
    const ala = await login('LogoAla');
    const made = (await call('POST', '/v1/clans', ala.token, { tag: 'LGA', name: 'Z logo' })).body.clan;
    assert.equal((await upload(ala.token, png(64, 64))).status, 200);
    const listed = (await call('GET', '/v1/admin/clans', admin.token)).body.clans.find((c: any) => c.id === made.id);
    assert.equal(typeof listed.logo, 'number');
    assert.equal((await call('DELETE', `/v1/admin/clans/${made.id}/logo`, ala.token)).status, 403);
    assert.equal((await call('DELETE', `/v1/admin/clans/${made.id}/logo`, admin.token)).status, 200);
    assert.equal((await call('DELETE', `/v1/admin/clans/${made.id}/logo`, admin.token)).status, 404);
    assert.equal((await call('GET', '/v1/clans/mine', ala.token)).body.clan.logo, undefined);
    assert.equal((await call('GET', '/v1/admin/clans', admin.token)).body.clans.find((c: any) => c.id === made.id).logo, null);
    const log = (await call('GET', '/v1/admin/log', admin.token)).body;
    assert.ok(JSON.stringify(log).includes('clan.logo_remove'));

    // deleting the clan takes its logo too
    assert.equal((await upload(ala.token, png(64, 64))).status, 200);
    assert.equal((await fetch(`${base}/v1/clans/${made.id}/logo.png`)).status, 200);
    assert.equal((await call('DELETE', '/v1/clans/mine', ala.token)).status, 200);
    assert.equal((await fetch(`${base}/v1/clans/${made.id}/logo.png`)).status, 404);
    // and an admin removing a clan
    const bob = await login('LogoBob');
    const other = (await call('POST', '/v1/clans', bob.token, { tag: 'LGB', name: 'Też z logo' })).body.clan;
    assert.equal((await upload(bob.token, png(64, 64))).status, 200);
    assert.equal((await call('DELETE', `/v1/admin/clans/${other.id}`, admin.token)).status, 200);
    assert.equal((await fetch(`${base}/v1/clans/${other.id}/logo.png`)).status, 404);
  });
});
