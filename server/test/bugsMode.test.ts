import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-bugsmode-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'pl', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text, location: res.headers.get('location') ?? '' };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string };
const mode = (values: Record<string, unknown>) => app.settings.set(values, 'test');

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'https://slashclient.pl', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('where "Zgłoś błąd" leads', () => {
  it('is the site by default, and /v1/features says so', async () => {
    assert.equal((await call('GET', '/v1/features')).body.bugs, 'site');
    const player = await login('Zglaszacz');
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'Crash przy starcie', body: 'Gra wyłącza się od razu.' })).status, 200);
  });

  it('sends players to Discord, with the log to paste first when the launcher gave one', async () => {
    const player = await login('Zglaszacz');
    const old = (await call('POST', '/v1/bugs', player.token, { title: 'Stare zgłoszenie', body: 'Napisane przed zmianą.' })).body.bug.id;
    mode({ 'bugs.mode': 'discord' });
    assert.equal((await call('GET', '/v1/features')).body.bugs, 'discord');
    const plain = await call('GET', '/zgloszenia?nowe=1&wersja=0.9.79');
    assert.equal(plain.status, 302);
    assert.equal(plain.location, 'https://dc.slashclient.pl');
    assert.equal((await call('GET', '/bugs')).location, 'https://dc.slashclient.pl');
    const withLog = await call('GET', '/zgloszenia?nowe=1&log=AbCdEf1234');
    assert.equal(withLog.status, 200);
    assert.match(withLog.text, /https:\/\/slashclient\.pl\/logi\/AbCdEf1234/);
    assert.match(withLog.text, /href="https:\/\/dc\.slashclient\.pl"/);
    // the admin's own link, only https
    mode({ 'bugs.link': 'https://discord.com/channels/1/2' });
    assert.equal((await call('GET', '/zgloszenia')).location, 'https://discord.com/channels/1/2');
    // a report already written stays readable, nothing new is taken
    assert.equal((await call('GET', `/v1/bugs/${old}`)).status, 200);
    assert.notEqual((await call('GET', `/zgloszenia/${old}`)).status, 302);
    const refused = await call('POST', '/v1/bugs', player.token, { title: 'Nowe zgłoszenie', body: 'Już nie przejdzie.' });
    assert.equal(refused.status, 503);
    assert.equal(refused.body.feature, 'bugs');
    assert.equal((await call('POST', `/v1/bugs/${old}/comments`, player.token, { body: 'dopisek' })).status, 503);
    mode({ 'bugs.mode': null, 'bugs.link': null });
  });

  it('switched off: the pages say so and nothing is written', async () => {
    const player = await login('Zglaszacz');
    mode({ 'bugs.mode': 'off' });
    assert.equal((await call('GET', '/v1/features')).body.bugs, 'off');
    const page = await call('GET', '/zgloszenia');
    assert.equal(page.status, 503);
    assert.match(page.text, /Zgłoszenia są wyłączone/);
    assert.equal((await call('GET', '/zgloszenia/1')).status, 503);
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'Nowe zgłoszenie', body: 'Już nie przejdzie.' })).status, 503);
    mode({ 'bugs.mode': null });
    assert.equal((await call('POST', '/v1/bugs', player.token, { title: 'Znowu działa', body: 'Tryb strony wrócił.' })).status, 200);
  });
});
