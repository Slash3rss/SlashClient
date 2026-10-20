import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import WebSocket from 'ws';
import { createApp } from '../src/app.ts';
import { cleanPresence, publicPresence } from '../src/presence.ts';
import { SKYUP_RULE, checkPattern, cleanDefaults, cleanRule, evaluate, matches, render, sanitizeDetail, RuleError } from '../src/statusRules.ts';

// SkyUp.pl's tab list as the game gets it (26.3): colours, the decorative » «, the lines under one another
const SKYUP_HEADER = (sector: string) => `§8» §b§lSkyUP §7- §fAnyBlock §8«\n§8» §e${sector} §8«\n`;
const SKYUP_FOOTER = '§7🕐 16:45:54 §8| §7⇄ 81ms\n§8» §9Discord: §fdc.skyup.pl §8«\n§8» §aStrona: §fskyup.pl §8«';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as RuleError).code;
  }
  return 'ok';
};

describe('status rules: reading the tab list', () => {
  it("reads SkyUp's sector with formatting codes and decorations", () => {
    for (const [line, want] of [['S0 (Spawn)', 'S0 (Spawn)'], ['S3 (Wyspy)', 'S3 (Wyspy)'], ['S8 (Dungeon)', 'S8 (Dungeon)'], ['S10 (Budowlany)', 'S10 (Budowlany)'], ['LOBBY', 'Lobby']]) {
      const r = evaluate(SKYUP_RULE, SKYUP_HEADER(line), SKYUP_FOOTER);
      assert.equal(r.detail, want, line);
      assert.equal(r.values.mode, 'AnyBlock');
    }
  });

  it('a template with the mode, when a server wants it', () => {
    const rule = { ...SKYUP_RULE, template: '{mode} · {sector}' };
    assert.equal(evaluate(rule, SKYUP_HEADER('S3 (Wyspy)'), '').detail, 'AnyBlock · S3 (Wyspy)');
    // the mode line missing: no half status
    assert.equal(evaluate(rule, '» S3 (Wyspy) «', '').detail, undefined);
  });

  it('says nothing for an unknown header', () => {
    assert.equal(evaluate(SKYUP_RULE, 'Witaj na serwerze!\nGraczy: 12', '').detail, undefined);
    assert.equal(evaluate(SKYUP_RULE, '', '').detail, undefined);
    assert.equal(evaluate(SKYUP_RULE, '» SkyUP - AnyBlock «\n» jakieś śmieci «', '').detail, undefined);
  });

  it('maps values and fills templates', () => {
    assert.equal(render('{a} · {b}', { a: 'x', b: 'y' }), 'x · y');
    assert.equal(render('{a} · {b}', { a: 'x' }), '');
    const rule = { strip: '', extractors: [{ source: 'footer' as const, line: 0, pattern: 'Tryb: (?<mode>\\w+)' }], map: { duels: 'Pojedynki' }, template: '{mode}' };
    assert.equal(evaluate(rule, '', 'cokolwiek\nTryb: DUELS').detail, 'Pojedynki');
  });

  it('cleans what friends get', () => {
    assert.equal(sanitizeDetail('  §aS3\u0000  (Wyspy)\n '), 'S3 (Wyspy)');
    assert.equal(sanitizeDetail('x'.repeat(100))!.length, 48);
    assert.equal(sanitizeDetail('\u202e\u200b'), undefined);
    assert.equal(sanitizeDetail(42), undefined);
  });

  it('matches the server and its subdomains', () => {
    assert.ok(matches('skyup.pl', 'SkyUp.pl'));
    assert.ok(matches('skyup.pl', 'play.skyup.pl:25565'));
    assert.ok(matches('skyup.pl', 'skyup.pl:25566'));
    assert.ok(!matches('skyup.pl', 'notskyup.pl'));
    assert.ok(!matches('skyup.pl', undefined));
    assert.ok(!matches('mc.example.com:25570', 'mc.example.com'));
  });
});

describe('status rules: checking patterns', () => {
  it('accepts what both engines read alike', () => {
    assert.deepEqual(checkPattern(SKYUP_RULE.extractors[1].pattern), ['sector']);
    assert.deepEqual(checkPattern('^(?<a>\\w+) - (?:(?<b>\\d{1,3}))?$'), ['a', 'b']);
  });

  it('refuses unsafe or unportable ones', () => {
    for (const p of ['(a+)+', '(?<x>a|ab)*', '(\\w*)*b', '(?:x{2,})+', '.*.*.*.*', '(a)\\1', '\\k<a>', '(?i)abc', '[a[b]]', '[a&&b]', '\\p{L}', 'a++', '\\Qx\\E', '(?<a_b>x)', '(?<a>x)(?<a>y)', '((', 'x'.repeat(201), '', '[]a]', '\\h']) {
      assert.notEqual(codeOf(() => checkPattern(p)), 'ok', p);
    }
  });

  it('checks whole rules', () => {
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE })), 'ok');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, server: 'nie serwer' })), 'bad_server');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, template: '{nieznane}' })), 'bad_template');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, extractors: [{ source: 'tab', line: 1, pattern: '(?<a>x)' }] })), 'bad_source');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, extractors: [{ source: 'header', line: 1, pattern: 'x+' }] })), 'bad_pattern_no_group');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, discord: { largeImage: 'http://x.pl/a.png' } })), 'bad_image');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, discord: { largeImage: 'javascript:alert(1)' } })), 'bad_image');
    assert.equal(codeOf(() => cleanRule({ ...SKYUP_RULE, discord: { details: '{nope}' } })), 'bad_discord_text');
    assert.equal(cleanRule({ ...SKYUP_RULE, discord: { largeImage: 'https://skyup.pl/logo.png', details: 'Na {server}' } }).discord.largeImage, 'https://skyup.pl/logo.png');
    assert.equal(cleanDefaults({ largeImage: 'logo', largeText: 'SlashClient' }).largeImage, 'logo');
    assert.equal(codeOf(() => cleanDefaults({ largeImage: 'https://' + 'a'.repeat(300) })), 'bad_image');
  });
});

describe('status rules: presence privacy', () => {
  it('keeps the status only with a server, and hides both together', () => {
    const p = cleanPresence({ status: 'online', activity: { kind: 'server', server: 'skyup.pl', detail: '§eS3 (Wyspy)\u0007' } })!;
    assert.equal(p.activity!.detail, 'S3 (Wyspy)');
    const shown = publicPresence(p, true, 0, () => 'SkyUp.pl');
    assert.equal(shown.activity!.detail, 'S3 (Wyspy)');
    assert.equal(shown.activity!.serverName, 'SkyUp.pl');
    const hidden = publicPresence(p, false, 0, () => 'SkyUp.pl');
    assert.equal(hidden.activity!.server, undefined);
    assert.equal(hidden.activity!.detail, undefined);
    assert.equal(hidden.activity!.serverName, undefined);
    // no server, no status; a client cannot set the name itself
    assert.equal(cleanPresence({ status: 'online', activity: { kind: 'menu', detail: 'S3' } })!.activity!.detail, undefined);
    assert.equal(cleanPresence({ status: 'online', activity: { kind: 'server', detail: 'S3' } })!.activity!.detail, undefined);
    assert.equal((cleanPresence({ status: 'online', activity: { kind: 'server', server: 'a.pl', serverName: 'Fałszywy' } })!.activity as any).serverName, undefined);
  });
});

// ---------- over HTTP and the WebSocket ----------

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-status-'));
let base = '';
let app: ReturnType<typeof createApp>;

async function call(method: string, url: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, etag: res.headers.get('etag') };
}
const login = async (name: string) => (await call('POST', '/v1/auth/dev', undefined, { name })).body as { token: string; user: { id: string } };

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
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, oauth: {}, adminHandles: ['Szef'] });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('status rules: the endpoints', () => {
  it('serves the seeded SkyUp rule with an ETag', async () => {
    const res = await call('GET', '/v1/status-rules');
    assert.equal(res.status, 200);
    assert.equal(res.body.rules.length, 1);
    assert.equal(res.body.rules[0].server, 'skyup.pl');
    assert.equal(res.body.rules[0].template, '{sector}');
    assert.equal(res.body.rules[0].id, undefined);
    assert.ok(res.etag && res.body.version);
    assert.equal((await call('GET', '/v1/status-rules', undefined, undefined, { 'If-None-Match': res.etag! })).status, 304);
  });

  it('only the admin changes rules; every change gives a new version', async () => {
    const admin = await login('Szef');
    const player = await login('Gracz');
    assert.equal((await call('GET', '/v1/admin/status-rules', player.token)).status, 403);
    const before = (await call('GET', '/v1/status-rules')).etag;
    const listed = (await call('GET', '/v1/admin/status-rules', admin.token)).body;
    const sky = listed.rules[0];
    assert.equal((await call('POST', `/v1/admin/status-rules/${sky.id}`, admin.token, { discord: { ...sky.discord, largeImage: 'https://skyup.pl/logo.png' } })).status, 200);
    const after = await call('GET', '/v1/status-rules');
    assert.notEqual(after.etag, before);
    assert.equal(after.body.rules[0].discord.largeImage, 'https://skyup.pl/logo.png');
    assert.equal((await call('POST', `/v1/admin/status-rules/${sky.id}`, admin.token, { extractors: [{ source: 'header', line: 1, pattern: '(?<x>a+)+' }] })).body.error, 'bad_pattern_nested');
    assert.equal((await call('POST', '/v1/admin/status-rules', admin.token, { ...SKYUP_RULE })).status, 409);
    const added = await call('POST', '/v1/admin/status-rules', admin.token, { server: 'mc.example.com', name: 'Example', extractors: [{ source: 'footer', line: 1, pattern: '^Tryb: (?<mode>\\w+)$' }], template: '{mode}' });
    assert.equal(added.body.rules.length, 2);
    const preview = await call('POST', '/v1/admin/status-preview', admin.token, { rule: { ...sky, discord: { details: 'Gra na {server}', state: '{sector}' } }, header: SKYUP_HEADER('S9 (Event)') });
    assert.equal(preview.body.detail, 'S9 (Event)');
    assert.deepEqual(preview.body.discord, { details: 'Gra na SkyUp.pl', state: 'S9 (Event)' });
    assert.equal((await call('POST', '/v1/admin/status-defaults', admin.token, { largeImage: 'ftp://x' })).body.error, 'bad_image');
    assert.equal((await call('POST', '/v1/admin/status-defaults', admin.token, { largeImage: 'logo', largeText: 'SlashClient' })).status, 200);
    assert.equal((await call('GET', '/v1/status-rules')).body.discord.largeText, 'SlashClient');
    const removed = await call('DELETE', `/v1/admin/status-rules/${added.body.rules.find((r: any) => r.server === 'mc.example.com').id}`, admin.token);
    assert.equal(removed.body.rules.length, 1);
  });

  it("friends get the status with the server's name, and not when the server is hidden", async () => {
    const ala = await login('Ala');
    const bob = await login('Bob');
    await call('POST', '/v1/friends/requests', ala.token, { handle: 'Bob' });
    await call('POST', `/v1/friends/requests/${ala.user.id}/accept`, bob.token);
    await call('POST', '/v1/me', ala.token, { showServer: true });
    const bobLive = await connect(bob.token, { status: 'online', activity: { kind: 'launcher' } });
    const alaLive = await connect(ala.token, { status: 'online', activity: { kind: 'server', server: 'play.skyup.pl', version: '26.3', detail: 'S3 (Wyspy)' } });
    const seen = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.activity?.detail);
    assert.equal(seen.presence.activity.detail, 'S3 (Wyspy)');
    assert.equal(seen.presence.activity.serverName, 'SkyUp.pl');
    const listed = (await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id);
    assert.equal(listed.presence.activity.detail, 'S3 (Wyspy)');

    alaLive.ws.send(JSON.stringify({ type: 'presence', presence: { status: 'online', activity: { kind: 'server', server: 'play.skyup.pl', detail: 'Lobby' } } }));
    await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.activity?.detail === 'Lobby');

    await call('POST', '/v1/me', ala.token, { showServer: false });
    const hidden = await bobLive.waitFor((e) => e.type === 'presence' && e.id === ala.user.id && e.presence.activity && !e.presence.activity.server);
    assert.equal(hidden.presence.activity.detail, undefined);
    const quiet = (await call('GET', '/v1/friends', bob.token)).body.friends.find((f: any) => f.id === ala.user.id);
    assert.equal(quiet.presence.activity.detail, undefined);
    // closed (and the server done with them) before the app goes
    for (const live of [alaLive, bobLive]) {
      const closed = new Promise((r) => live.ws.once('close', r));
      live.ws.close();
      await closed;
    }
    await new Promise((r) => setTimeout(r, 100));
  });
});
