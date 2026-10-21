import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { setLang } from '../src/shared/i18n';
import { keepMyVotes, nextVote, pollDraft, pollEndText, pollOpen, pollPercents, votesText, type Poll } from '../src/renderer/communityMedia';

const poll = (extra: Partial<Poll> = {}): Poll => ({ question: 'Kiedy?', options: [{ text: 'Sobota', votes: 3 }, { text: 'Niedziela', votes: 1 }, { text: 'Nigdy', votes: 0 }], multiple: false, voters: 4, ...extra });

describe('pictures and polls in a community chat', () => {
  it('counts each option\'s share, of the votes or (several choices) of the voters', () => {
    assert.deepEqual(pollPercents(poll()), [75, 25, 0]);
    assert.deepEqual(pollPercents(poll({ multiple: true, voters: 3, options: [{ text: 'a', votes: 3 }, { text: 'b', votes: 2 }] })), [100, 67]);
    assert.deepEqual(pollPercents(poll({ voters: 0, options: [{ text: 'a', votes: 0 }, { text: 'b', votes: 0 }] })), [0, 0]);
  });

  it('votes: one choice swaps or is taken back, several toggle', () => {
    assert.deepEqual(nextVote(poll(), 1), [1]);
    assert.deepEqual(nextVote(poll({ mine: [0] }), 1), [1]);
    assert.deepEqual(nextVote(poll({ mine: [1] }), 1), []);
    assert.deepEqual(nextVote(poll({ multiple: true, mine: [2] }), 0), [0, 2]);
    assert.deepEqual(nextVote(poll({ multiple: true, mine: [0, 2] }), 2), [0]);
  });

  it('keeps my choices over a pushed result, and knows when a poll ended', () => {
    assert.deepEqual(keepMyVotes(poll({ mine: [1] }), poll({ voters: 5 })).mine, [1]);
    assert.deepEqual(keepMyVotes(poll({ mine: [1] }), poll({ mine: [] })).mine, []);
    assert.equal(keepMyVotes(undefined, poll()).mine, undefined);
    const now = 1_000_000;
    assert.equal(pollOpen(poll(), now), true);
    assert.equal(pollOpen(poll({ closed: true }), now), false);
    assert.equal(pollOpen(poll({ endsAt: now - 1 }), now), false);
    assert.equal(pollOpen(poll({ endsAt: now + 1 }), now), true);
    setLang('pl');
    assert.equal(pollEndText(poll({ closed: true }), now), 'Ankieta zakończona');
    assert.equal(pollEndText(poll(), now), 'Bez terminu');
    setLang('en');
    assert.equal(pollEndText(poll({ endsAt: now - 1 }), now), 'Poll closed');
    setLang('pl');
  });

  it('says how many votes in Polish and English', () => {
    setLang('pl');
    assert.deepEqual([1, 2, 4, 5, 12, 22, 25].map(votesText), ['1 głos', '2 głosy', '4 głosy', '5 głosów', '12 głosów', '22 głosy', '25 głosów']);
    setLang('en');
    assert.deepEqual([1, 3].map(votesText), ['1 vote', '3 votes']);
    setLang('pl');
  });

  it('makes a poll the server takes, or says what is missing', () => {
    const now = 5_000_000;
    assert.deepEqual(pollDraft('  Kiedy  gramy? ', ['Sobota', ' ', 'Niedziela '], true, 60, now), { poll: { question: 'Kiedy gramy?', options: ['Sobota', 'Niedziela'], multiple: true, endsAt: now + 3_600_000 } });
    assert.deepEqual(pollDraft('Q', ['a', 'b'], false, 0, now), { poll: { question: 'Q', options: ['a', 'b'], multiple: false } });
    assert.ok('error' in pollDraft('', ['a', 'b'], false, 0));
    assert.ok('error' in pollDraft('Q', ['a', ''], false, 0));
    assert.ok('error' in pollDraft('Q', ['a', 'A'], false, 0));
  });

  it('lets the game send a screenshot to a community, show its pictures and vote, and passes poll results on', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({
      call: async (method, path) => {
        calls.push(`${method} ${path}`);
        return { ok: true };
      },
      state: () => ({ signedIn: true }),
      sendCommunityImage: async (community, channel, file) => {
        if (!file.endsWith('/screenshots/a.png')) throw Object.assign(new Error('not_a_screenshot'), { code: 'not_a_screenshot' });
        calls.push(`image ${community} ${channel}`);
        return { id: 7, image: { id: 'x' } };
      },
      communityImage: async (community, id) => {
        calls.push(`show ${community} ${id}`);
        return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, init: RequestInit = {}) => fetch(url + path, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
    const sent = await req('/chat/image', { method: 'POST', body: JSON.stringify({ community: 'com1', channel: 'ch1', path: '/x/screenshots/a.png' }) });
    assert.equal(sent.status, 200);
    assert.equal((await sent.json()).message.id, 7);
    assert.equal((await req('/chat/image', { method: 'POST', body: JSON.stringify({ community: 'com1', channel: 'ch1', path: '/etc/passwd' }) })).status, 502);
    assert.equal((await req('/chat/image', { method: 'POST', body: JSON.stringify({ community: 'com/1', channel: 'ch1', path: '/x/screenshots/a.png' }) })).status, 400);
    const shown = await req('/community/image/com1/abcdefghijklmnopqrstuv');
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get('content-type'), 'image/png');
    assert.equal((await req('/community/image/com1/short')).status, 403);
    assert.equal((await req('/v1/communities/com1/channels/ch1/messages/5/vote', { method: 'POST', body: JSON.stringify({ options: [0] }) })).status, 200);
    // closing polls stays in the launcher
    assert.equal((await req('/v1/communities/com1/channels/ch1/messages/5/poll/close', { method: 'POST' })).status, 403);
    assert.deepEqual(calls, ['image com1 ch1', 'show com1 abcdefghijklmnopqrstuv', 'POST /v1/communities/com1/channels/ch1/messages/5/vote']);
    bridge.push({ type: 'community-poll', message: 5, poll: { voters: 1 } });
    const events = await (await req('/events?after=0')).json();
    assert.equal(events.events.at(-1).type, 'community-poll');
    bridge.stop();
  });
});
