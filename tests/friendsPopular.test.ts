import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { contentOf, PopularReporter, recentServers, type PopularReport } from '../src/main/friendsPopular';
import { cleanPopular, createPopularSource, friendsCountText, friendsWho, serverKey } from '../src/renderer/friendsPopular';
import type { InstalledItem } from '../src/main/modrinth';

const item = (o: Partial<InstalledItem>): InstalledItem => ({ type: 'mod', filename: 'x.jar', enabled: true, title: 'X', ...o });
const DAY = 86_400_000;

/** Timers run by hand: `advance` fires what is due. */
function clock() {
  let now = 1_000_000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 0;
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++next;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (id: unknown) => {
      timers = timers.filter((x) => x.id !== id);
    },
    async advance(ms: number) {
      now += ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        due.fn();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    pending: () => timers.length,
  };
}

describe('popular among friends: what the launcher sends', () => {
  it('sends only projects the sites recognise, never hand-added files', () => {
    const content = contentOf([
      { loader: 'fabric', gameVersion: '1.21.4', items: [
        item({ filename: 'sodium.jar', projectId: 'AANobbMI' }),
        // added by hand, unknown to Modrinth and CurseForge: stays private
        item({ filename: 'my-own-mod.jar' }),
        item({ filename: 'jei.jar', projectId: '238222', source: 'curseforge' }),
        // switched off in the profile
        item({ filename: 'iris.jar', projectId: 'YL57xq9U', enabled: false }),
        item({ type: 'resourcepack', filename: 'Faithful.zip', projectId: '9pZrDmPq' }),
      ] },
      // the same mod in another profile of the same version counts once
      { loader: 'fabric', gameVersion: '1.21.4', items: [item({ filename: 'sodium-copy.jar', projectId: 'AANobbMI' })] },
      { loader: 'vanilla', gameVersion: '1.20.1', items: [item({ type: 'shader', filename: 'bsl.zip', projectId: 'Q1vvjJYV' })] },
    ]);
    assert.deepEqual(content, [
      { source: 'curseforge', id: '238222', type: 'mod', loader: 'fabric', gameVersion: '1.21.4' },
      { source: 'modrinth', id: '9pZrDmPq', type: 'resourcepack', loader: 'fabric', gameVersion: '1.21.4' },
      { source: 'modrinth', id: 'AANobbMI', type: 'mod', loader: 'fabric', gameVersion: '1.21.4' },
      { source: 'modrinth', id: 'Q1vvjJYV', type: 'shader', loader: '', gameVersion: '1.20.1' },
    ]);
    assert.ok(!JSON.stringify(content).includes('.jar') && !JSON.stringify(content).includes('.zip'), 'no file names');
  });

  it('sends servers of the last 30 days, each once', () => {
    const now = 100 * DAY;
    const servers = recentServers([
      { servers: [{ address: 'Mc.Hypixel.net:25565', at: now - DAY }, { address: 'skyup.pl', at: now - 2 * DAY }] },
      { servers: [{ address: 'mc.hypixel.net', at: now - 3 * DAY }, { address: 'old.pl', at: now - 31 * DAY }, { address: 'bad address', at: now }] },
    ], now, [{ address: 'skyup.pl', at: now - 1000 }]);
    assert.deepEqual(servers, [{ address: 'skyup.pl', at: now - 1000 }, { address: 'mc.hypixel.net', at: now - DAY }]);
  });

  it('sends after a quiet while, only on a change, at most every few minutes', async () => {
    const c = clock();
    let report: PopularReport = { content: [{ source: 'modrinth', id: 'AANobbMI', type: 'mod', loader: 'fabric', gameVersion: '1.21.4' }], servers: [] };
    const sent: PopularReport[] = [];
    let signedIn = true;
    const r = new PopularReporter({
      collect: async () => report, send: async (x) => sent.push(x), signedIn: () => signedIn,
      now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, delayMs: 30_000, minGapMs: 5 * 60_000,
    });
    // installing several mods in a row is one report
    r.poke();
    await c.advance(10_000);
    r.poke();
    await c.advance(10_000);
    r.poke();
    assert.equal(sent.length, 0);
    await c.advance(30_000);
    assert.equal(sent.length, 1);
    // nothing changed: nothing goes
    r.poke();
    await c.advance(10 * 60_000);
    assert.equal(sent.length, 1);
    // a change soon after a report waits for the gap
    report = { ...report, servers: [{ address: 'skyup.pl', at: c.now() }] };
    const sentAt = c.now();
    r.poke();
    await c.advance(30_000);
    assert.equal(sent.length, 2, 'the gap since the last report had passed');
    report = { ...report, content: [] };
    r.poke();
    await c.advance(60_000);
    assert.equal(sent.length, 2, 'too soon after the last one');
    await c.advance(5 * 60_000);
    assert.equal(sent.length, 3);
    assert.ok(c.now() - sentAt >= 5 * 60_000);
    assert.deepEqual(sent[2].content, []);
    // signed out: nothing goes
    signedIn = false;
    report = { ...report, servers: [] };
    r.poke();
    await c.advance(10 * 60_000);
    assert.equal(sent.length, 3);
  });

  it('stops sending to an older server without the route', async () => {
    const c = clock();
    let calls = 0;
    let n = 0;
    const r = new PopularReporter({
      collect: async () => ({ content: [], servers: [{ address: `s${n++}.pl`, at: n * 2 * 86_400_000 }] }),
      send: async () => {
        calls++;
        throw Object.assign(new Error('not_found'), { httpStatus: 404 });
      },
      signedIn: () => true, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer,
    });
    r.poke();
    await c.advance(60_000);
    assert.equal(calls, 1);
    assert.equal(r.unsupported, true);
    r.poke();
    await c.advance(60 * 60_000);
    assert.equal(calls, 1);
    assert.equal(c.pending(), 0);
  });
});

describe('popular among friends: what the launcher shows', () => {
  it('hides the sections with an older server, the switch off or no account', async () => {
    const answers: Record<string, () => Promise<unknown>> = {
      old: () => Promise.reject(Object.assign(new Error('social:not_found'), { httpStatus: 404 })),
      off: async () => ({ enabled: false, content: [], servers: [] }),
      signedOut: () => Promise.reject(new Error('social:unauthorized')),
    };
    for (const [name, answer] of Object.entries(answers)) {
      const source = createPopularSource({ api: { socialApi: answer, popularProjects: async () => [] } });
      assert.equal(await source.get('fabric'), undefined, name);
    }
    const paths: string[] = [];
    const on = createPopularSource({ api: { socialApi: async (_m: string, p: string) => (paths.push(p), { enabled: true, content: [], servers: [] }) } });
    assert.deepEqual(await on.get('fabric'), { content: [], servers: [] });
    // kept for a while: one request
    await on.get('fabric');
    await on.get('vanilla');
    assert.deepEqual(paths, ['/v1/friends/popular?loader=fabric', '/v1/friends/popular']);
  });

  it('keeps only sensible items of the answer', () => {
    const got = cleanPopular({
      enabled: true,
      content: [
        { source: 'modrinth', id: 'AANobbMI', type: 'mod', count: 4, friends: [{ id: 'ala', name: 'Ala', handle: 'Ala' }, { id: 'bad id!', name: 'X' }] },
        { source: 'disk', id: 'x', type: 'mod', count: 1, friends: [] },
      ],
      servers: [{ address: 'skyup.pl', name: 'SkyUp', count: 'many', friends: [{ id: 'bob', name: 'Bob' }] }, { address: '<script>', count: 1, friends: [] }],
    });
    assert.deepEqual(got, {
      content: [{ source: 'modrinth', id: 'AANobbMI', type: 'mod', count: 4, friends: [{ id: 'ala', handle: 'Ala', name: 'Ala', avatar: undefined }] }],
      servers: [{ address: 'skyup.pl', name: 'SkyUp', count: 1, friends: [{ id: 'bob', handle: 'Bob', name: 'Bob', avatar: undefined }] }],
    });
    assert.equal(serverKey('Mc.Hypixel.NET.:25565'), 'mc.hypixel.net');
  });

  it('says how many friends and who, in Polish and in English', () => {
    assert.equal(friendsCountText('content', 4), 'używa 4 znajomych');
    assert.equal(friendsCountText('content', 1), 'używa 1 znajomy');
    assert.equal(friendsCountText('server', 3), 'gra 3 znajomych');
    assert.equal(friendsWho({ count: 4, friends: [{ id: 'a', handle: 'a', name: 'Ala' }, { id: 'b', handle: 'b', name: 'Bob' }] }), 'Ala, Bob i 2 innych');
    setLang('en');
    try {
      assert.equal(friendsCountText('server', 3), '3 friends play here');
      assert.equal(friendsCountText('content', 1), 'used by 1 friend');
      // every text of the module and of its place in app.ts has its English
      const texts = [...readFileSync('src/renderer/friendsPopular.ts', 'utf8').matchAll(/t\('([^']+)'/g)].map((m) => m[1]);
      const app = readFileSync('src/renderer/app.ts', 'utf8');
      const section = app.slice(app.indexOf('// ---------- "Popularne wśród znajomych"'), app.indexOf('/** Mods and Worlds work on the profile picked in Profiles'));
      texts.push(...[...section.matchAll(/t\('([^']+)'/g)].map((m) => m[1]));
      assert.ok(texts.length >= 15);
      for (const text of texts) assert.notEqual(t(text), text, text);
    } finally {
      setLang('pl');
    }
  });
});
