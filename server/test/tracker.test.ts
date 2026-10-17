import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-tracker-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, raw?: Buffer) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(raw ? { 'Content-Type': 'text/plain' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ? new Uint8Array(raw) : body === undefined ? undefined : JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, buf, type: res.headers.get('content-type') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('shared logs', () => {
  it('keeps a log and shows it back, signed in or not', async () => {
    const log = '[12:00:00] [main/INFO]: Starting\n[12:00:01] [main/ERROR]: Boom\n';
    const sent = await call('POST', '/v1/logs', undefined, undefined, Buffer.from(log));
    assert.equal(sent.status, 200);
    assert.match(sent.body.id, /^[A-Za-z0-9]{10}$/);
    assert.equal(sent.body.url, `/logi/${sent.body.id}`);
    const back = (await call('GET', `/v1/logs/${sent.body.id}`)).body;
    assert.equal(back.text, log);
    assert.equal(back.lines, 3);
    assert.equal((await call('GET', '/v1/logs/nieistniej')).status, 404);
    assert.equal((await call('GET', '/v1/logs/../../etc')).status, 404);
    assert.equal((await call('POST', '/v1/logs', undefined, undefined, Buffer.from('  \n'))).body.error, 'empty');
  });

  it('refuses a too big log', async () => {
    const res = await call('POST', '/v1/logs', undefined, undefined, Buffer.alloc(4 * 1024 * 1024 + 10, 97));
    assert.equal(res.status, 413);
  });
});

describe('bug tracker', () => {
  it('takes reports from players and lets the team answer and close them', async () => {
    const boss = await login('Szef');
    const player = await login('Gracz');
    const other = await login('Inny');
    assert.equal((await call('POST', '/v1/bugs', undefined, { title: 'Crash', body: 'Gra się wyłącza' })).status, 401);
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'x', body: 'Gra się wyłącza' })).body.error, 'title_too_short');
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'Crash gry', body: 'krótko' })).body.error, 'body_too_short');
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'Crash gry', body: 'Gra się wyłącza po wejściu', logId: 'AAAAAAAAAA' })).body.error, 'bad_log');

    const log = (await call('POST', '/v1/logs', player.token, undefined, Buffer.from('crash log'))).body.id;
    const bug = (await call('POST', '/v1/bugs', player.token, { title: 'Crash gry', body: 'Gra się wyłącza po wejściu', logId: log, version: '0.9.0' })).body.bug;
    assert.equal(bug.status, 'open');
    assert.equal(bug.authorHandle, 'Gracz');
    assert.equal(bug.logId, log);

    const list = (await call('GET', '/v1/bugs')).body;
    assert.equal(list.total, 1);
    assert.equal((await call('GET', '/v1/bugs?q=wyłącza')).body.total, 1);
    assert.equal((await call('GET', '/v1/bugs?q=100%')).body.total, 0);
    assert.equal((await call('GET', '/v1/bugs?status=fixed')).body.total, 0);
    assert.equal((await call('GET', '/v1/bugs?status=zly')).body.error, 'bad_status');

    // a player cannot change the status; the admin can, and answers as the team
    assert.equal((await call('PATCH', `/v1/bugs/${bug.id}`, player.token, { status: 'fixed' })).body.error, 'not_admin');
    assert.equal((await call('PATCH', `/v1/bugs/${bug.id}`, boss.token, { status: 'fixed' })).body.bug.status, 'fixed');
    const comments = (await call('POST', `/v1/bugs/${bug.id}/comments`, boss.token, { body: 'Naprawione w 0.9.1' })).body.comments;
    assert.equal(comments.length, 1);
    assert.equal(comments[0].staff, true);
    const view = (await call('GET', `/v1/bugs/${bug.id}`, player.token)).body;
    assert.equal(view.canModerate, false);
    assert.equal(view.bug.comments, 1);

    // others' comments stay; an answered report cannot be taken back by its author
    assert.equal((await call('DELETE', `/v1/bugs/${bug.id}/comments/${comments[0].id}`, other.token)).body.error, 'forbidden');
    assert.equal((await call('DELETE', `/v1/bugs/${bug.id}`, player.token)).body.error, 'forbidden');
    assert.equal((await call('DELETE', `/v1/bugs/${bug.id}`, boss.token)).body.ok, true);
    assert.equal((await call('GET', `/v1/bugs/${bug.id}`)).status, 404);
  });

  it('serves the pages at their addresses', async () => {
    // the site is only served with a web dir; the routing is checked by pattern here
    const { serveWeb } = await import('../src/web.ts');
    const fake = { writeHead: () => {}, end: () => {} } as never;
    const web = path.join(import.meta.dirname, '..', 'web');
    assert.equal(await serveWeb(web, '/logi/AbCdEf1234', fake), true);
    assert.equal(await serveWeb(web, '/zgloszenia', fake), true);
    assert.equal(await serveWeb(web, '/zgloszenia/12', fake), true);
    assert.equal(await serveWeb(web, '/logi/../admin', fake), false);
  });
});
