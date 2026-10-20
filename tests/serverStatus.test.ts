import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { GameBridge } from '../src/main/bridge';
import { cleanDetail, cleanValues, decorate, render, ruleFor, StatusRules, Throttle, type PublishedRules } from '../src/main/serverStatus';
import { SocialClient } from '../src/main/social';

const RULES: PublishedRules = {
  rules: [
    { server: 'skyup.pl', name: 'SkyUp.pl', discord: { details: 'Gra na {server}', state: '{sector}', largeImage: 'https://skyup.pl/logo.png', largeText: 'SkyUp.pl' } },
    { server: 'mc.example.com', name: '' },
  ],
  discord: { largeImage: 'logo', largeText: 'SlashClient' },
};
const BASE = { details: 'Minecraft 26.3 · Fabric', state: 'Na serwerze play.skyup.pl', startTimestamp: 1, largeImageKey: 'logo', largeImageText: 'SlashClient' };
const SKY = { server: 'play.skyup.pl', detail: 'S3 (Wyspy)', values: { sector: 'S3 (Wyspy)', mode: 'AnyBlock' } };

describe('server statuses from the tab list', () => {
  it('cleans what the game sends', () => {
    assert.equal(cleanDetail(' §eS3\u0000 (Wyspy)\n'), 'S3 (Wyspy)');
    assert.equal(cleanDetail('x'.repeat(80))!.length, 48);
    assert.equal(cleanDetail(5), undefined);
    assert.deepEqual(cleanValues({ sector: 'S3', 'bad name': 'x', mode: '', n: 7 }), { sector: 'S3' });
  });

  it('finds the rule for subdomains and ports', () => {
    assert.equal(ruleFor(RULES.rules, 'Play.SkyUp.pl:25565')?.name, 'SkyUp.pl');
    assert.equal(ruleFor(RULES.rules, 'skyup.pl.'), RULES.rules[0]);
    assert.equal(ruleFor(RULES.rules, 'notskyup.pl'), undefined);
    assert.equal(render('{a} · {b}', { a: '1' }), '');
  });

  it("builds Discord's activity from the rule", () => {
    setLang('pl');
    const p = decorate(BASE, { server: 'play.skyup.pl', status: SKY, rules: RULES, hideServer: false });
    assert.equal(p.details, 'Gra na SkyUp.pl');
    assert.equal(p.state, 'S3 (Wyspy)');
    assert.equal(p.largeImageKey, 'https://skyup.pl/logo.png');
    assert.equal(p.largeImageText, 'SkyUp.pl');
    assert.equal(p.startTimestamp, 1);
    // no status yet: the rule's picture, the lines it cannot fill stay as they were
    const early = decorate(BASE, { server: 'skyup.pl', rules: RULES, hideServer: false });
    assert.equal(early.details, 'Gra na SkyUp.pl');
    assert.equal(early.state, BASE.state);
    // a status about the server before: not used
    assert.equal(decorate(BASE, { server: 'mc.example.com', status: SKY, rules: RULES, hideServer: false }).state, BASE.state);
    // a rule without Discord lines: the status after the usual line
    assert.equal(decorate(BASE, { server: 'mc.example.com', status: { server: 'mc.example.com', detail: 'Lobby', values: {} }, rules: RULES, hideServer: false }).state, `${BASE.state} · Lobby`);
  });

  it('keeps the server and its status off Discord when it is hidden from friends', () => {
    setLang('pl');
    const p = decorate(BASE, { server: 'play.skyup.pl', status: SKY, rules: RULES, hideServer: true });
    assert.equal(p.state, 'Gra w Minecraft');
    assert.equal(p.details, BASE.details);
    assert.equal(p.largeImageKey, 'logo');
    assert.ok(!JSON.stringify(p).includes('Wyspy') && !JSON.stringify(p).includes('skyup'));
  });

  it("uses the admin's default pictures where no rule matches", () => {
    const p = decorate({ details: 'W launcherze', largeImageKey: 'logo', largeImageText: 'SlashClient' }, { rules: { rules: [], discord: { largeImage: 'https://x.pl/a.png', largeText: 'Hej', smallImage: 'small', smallText: 'Mały' } }, hideServer: false });
    assert.equal(p.largeImageKey, 'https://x.pl/a.png');
    assert.equal(p.smallImageKey, 'small');
    assert.equal(p.smallImageText, 'Mały');
  });

  it('lets one Discord change through per 15 seconds, the last one waiting', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      const seen: number[] = [];
      const throttle = new Throttle(15_000);
      throttle.run(() => seen.push(1));
      throttle.run(() => seen.push(2));
      throttle.run(() => seen.push(3));
      assert.deepEqual(seen, [1]);
      mock.timers.tick(14_999);
      assert.deepEqual(seen, [1]);
      mock.timers.tick(1);
      assert.deepEqual(seen, [1, 3]);
      mock.timers.tick(20_000);
      throttle.run(() => seen.push(4));
      assert.deepEqual(seen, [1, 3, 4]);
    } finally {
      mock.timers.reset();
    }
  });

  it('asks for the rules with the ETag it has', async () => {
    const asked: (string | null)[] = [];
    const rules = new StatusRules(() => 'http://social.test/', async (_url, init) => {
      const tag = new Headers(init?.headers).get('if-none-match');
      asked.push(tag);
      return tag === '"v1"' ? new Response(null, { status: 304 }) : Response.json({ version: 'v1', ...RULES }, { headers: { ETag: '"v1"' } });
    });
    await rules.refresh(true);
    await rules.refresh(true);
    assert.deepEqual(asked, [null, '"v1"']);
    assert.equal(rules.current()?.rules[0].name, 'SkyUp.pl');
  });

  it('passes the status from the game through the bridge', async () => {
    const got: unknown[] = [];
    const bridge = new GameBridge({ call: async () => ({}), state: () => ({}), gameStatus: (s) => got.push(s) });
    const { url, key } = await bridge.start();
    const post = (body: unknown) => fetch(url + '/status', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    assert.equal((await post({ server: 'skyup.pl', detail: '§eS3 (Wyspy)', values: { sector: 'S3 (Wyspy)' } })).status, 200);
    assert.equal((await post({ server: 'zły adres!' })).status, 400);
    assert.equal((await post({ server: null })).status, 200);
    assert.deepEqual(got, [{ server: 'skyup.pl', detail: 'S3 (Wyspy)', values: { sector: 'S3 (Wyspy)' } }, undefined]);
    bridge.stop();
  });

  it('sends the status to friends only with the server shown', () => {
    const client = new SocialClient({ url: () => 'http://social.test', token: () => undefined, saveToken: async () => {}, status: () => 'online', emit: () => {} });
    client.setActivity({ kind: 'server', server: 'skyup.pl' });
    client.updateUser({ id: '1', handle: 'a', name: 'A', avatar: '', showServer: true, providers: [] });
    client.setDetail('S3 (Wyspy)');
    assert.equal(client.presenceForTest().activity.detail, 'S3 (Wyspy)');
    client.updateUser({ id: '1', handle: 'a', name: 'A', avatar: '', showServer: false, providers: [] });
    assert.equal(client.presenceForTest().activity.detail, undefined);
    // another server: the old status is gone
    client.updateUser({ id: '1', handle: 'a', name: 'A', avatar: '', showServer: true, providers: [] });
    client.setActivity({ kind: 'server', server: 'mc.example.com' });
    assert.equal(client.presenceForTest().activity.detail, undefined);
    client.setActivity({ kind: 'menu' });
    client.setDetail('Lobby');
    assert.equal(client.presenceForTest().activity.detail, undefined);
  });
});
