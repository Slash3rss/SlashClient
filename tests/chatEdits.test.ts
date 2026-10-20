import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { canDelete, canEdit, editHint, replaceMessage, slowDownSeconds, slowDownText } from '../src/renderer/chatEdits';
import { errorCode } from '../src/main/social';
import { GameBridge } from '../src/main/bridge';

describe('editing and deleting chat messages', () => {
  const WINDOW = 15 * 60_000;
  const now = 1_000_000_000;
  const mine = { id: 1, from: 'me', at: now - 60_000, text: 'hej' };

  it('offers editing only for one\'s own text within the window, and only when the server gave one', () => {
    assert.ok(canEdit(mine, 'me', WINDOW, now));
    assert.ok(!canEdit(mine, 'me', undefined, now), 'an older server: no editing');
    assert.ok(!canEdit(mine, 'other', WINDOW, now));
    assert.ok(!canEdit({ ...mine, at: now - WINDOW - 1 }, 'me', WINDOW, now));
    for (const extra of [{ deleted: true }, { image: { id: 'x' } }, { invite: { server: 'a' } }, { waypoint: {} }, { event: { kind: 'left' } }, { unreadable: true }]) {
      assert.ok(!canEdit({ ...mine, ...extra }, 'me', WINDOW, now), JSON.stringify(extra));
    }
    assert.equal(editHint(mine, WINDOW, now), 'jeszcze 14 min');
  });

  it('offers deleting one\'s own any time, and others\' to moderators by role', () => {
    const old = { ...mine, at: 0 };
    assert.ok(canDelete(old, 'me', WINDOW));
    assert.ok(!canDelete(old, 'me', undefined));
    assert.ok(!canDelete({ ...old, deleted: true }, 'me', WINDOW));
    assert.ok(!canDelete({ ...old, event: { kind: 'created' } }, 'me', WINDOW));
    const theirs = { ...old, from: 'ala' };
    assert.ok(!canDelete(theirs, 'me', WINDOW));
    assert.ok(canDelete(theirs, 'me', WINDOW, 'all', 'officer'));
    // a clan officer: plain members and those who left, not the owner or other officers
    assert.ok(canDelete(theirs, 'me', WINDOW, 'members', 'member'));
    assert.ok(canDelete(theirs, 'me', WINDOW, 'members', undefined));
    assert.ok(!canDelete(theirs, 'me', WINDOW, 'members', 'officer'));
    assert.ok(!canDelete(theirs, 'me', WINDOW, 'members', 'owner'));
  });

  it('puts the new version in place, keeping a picture an edit does not repeat', () => {
    const list = [{ ...mine }, { id: 2, from: 'me', at: now, text: 'b', image: { id: 'p' } }];
    const edited = replaceMessage(list, { id: 1, from: 'me', at: mine.at, text: 'nowy', editedAt: now });
    assert.equal(edited[0].text, 'nowy');
    assert.equal(edited[0].editedAt, now);
    assert.equal(edited[1], list[1]);
    assert.deepEqual(replaceMessage(list, { id: 2, from: 'me', at: now, text: 'b' })[1].image, { id: 'p' });
    assert.equal(replaceMessage(list, { id: 2, from: 'me', at: now, text: '', deleted: true })[1].image, undefined);
    // one this list does not have: nothing added
    assert.equal(replaceMessage(list, { id: 9, from: 'me', at: now, text: 'x' }).length, 2);
  });

  it('says how long to wait after too many messages in a row', () => {
    assert.equal(errorCode({ error: 'slow_down', retryAfter: 7 }, 429), 'slow_down:7');
    assert.equal(errorCode({ error: 'slow_down' }, 429), 'slow_down');
    assert.equal(errorCode({ error: 'rate_limited', retryAfter: 7 }, 429), 'rate_limited');
    assert.equal(errorCode({}, 502), 'http_502');
    assert.equal(slowDownSeconds('slow_down:7'), 7);
    assert.equal(slowDownSeconds('slow_down'), 5);
    assert.equal(slowDownSeconds('rate_limited'), undefined);
    setLang('pl');
    assert.equal(slowDownText(7), 'Zwolnij trochę — możesz pisać za 7 s.');
    setLang('en');
    assert.equal(slowDownText(7), 'Slow down a little — you can write again in 7 s.');
    setLang('pl');
  });

  it('lets the game edit and delete through the bridge, and passes the events on', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({ call: async (method, path) => (calls.push(`${method} ${path}`), { ok: true }), state: () => ({}) });
    const { url, key } = await bridge.start();
    const req = (path: string, method: string) => fetch(url + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{"text":"x"}' : undefined });
    try {
      assert.equal((await req('/v1/messages/abc/12/edit', 'POST')).status, 200);
      assert.equal((await req('/v1/messages/abc/12', 'DELETE')).status, 200);
      assert.equal((await req('/v1/groups/g1/messages/12/edit', 'POST')).status, 200);
      assert.equal((await req('/v1/groups/g1/messages/12', 'DELETE')).status, 200);
      assert.equal((await req('/v1/groups/g1', 'DELETE')).status, 403);
      assert.equal((await req('/v1/messages/abc/x/edit', 'POST')).status, 403);
      assert.deepEqual(calls, ['POST /v1/messages/abc/12/edit', 'DELETE /v1/messages/abc/12', 'POST /v1/groups/g1/messages/12/edit', 'DELETE /v1/groups/g1/messages/12']);
      for (const type of ['message-edit', 'message-delete', 'group-message-edit', 'group-message-delete']) bridge.push({ type, message: { id: 1 } });
      const events = await (await fetch(`${url}/events?after=0`, { headers: { Authorization: `Bearer ${key}` } })).json() as { events: { type: string }[] };
      assert.deepEqual(events.events.map((e) => e.type), ['message-edit', 'message-delete', 'group-message-edit', 'group-message-delete']);
    } finally {
      bridge.stop();
    }
  });
});
