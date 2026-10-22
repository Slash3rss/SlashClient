import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import { bytesText, mediaLinks, pageOf, usageShare, usageText, type MediaLimits } from '../src/renderer/chatMediaPanel';
import { communitySource, directSource, groupSource } from '../src/renderer/chatMediaSources';
import { canEdit, replaceMessage, type ChatLine } from '../src/renderer/chatEdits';
import { removedText, ThumbCache } from '../src/main/chatMedia';

const LIMITS: MediaLimits = { quotaBytes: 2 * 1024 ** 3, quotaCount: 5000, days: 90, maxBytes: 4 * 1024 ** 2, perMemberDay: 50 };

/** A fake socialApi that remembers the calls and answers with `answer`. */
function fakeApi(answer: (method: string, path: string, body?: unknown) => unknown = () => ({})) {
  const calls: [string, string, unknown][] = [];
  return {
    calls,
    socialApi: async (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body]);
      return answer(method, path, body);
    },
    socialImage: async (id: string) => `full:${id}`,
    socialImageThumb: async (id: string) => `thumb:${id}`,
    socialCommunityImage: async (c: string, id: string) => `cfull:${c}:${id}`,
    socialCommunityImageThumb: async (c: string, id: string) => `cthumb:${c}:${id}`,
  };
}

describe('the Multimedia panel', () => {
  it('says how full a chat is, in the launcher\'s language', () => {
    setLang('pl');
    assert.equal(bytesText(1.2 * 1024 ** 3), '1,2 GB');
    assert.equal(bytesText(340 * 1024 ** 2), '340 MB');
    assert.equal(usageText({ bytes: 1.2 * 1024 ** 3, count: 340 }, LIMITS), '1,2 GB z 2 GB, 340 z 5000 zdjęć');
    setLang('en');
    assert.equal(usageText({ bytes: 1.2 * 1024 ** 3, count: 340 }, LIMITS), '1.2 GB of 2 GB, 340 of 5000 pictures');
    assert.equal(t('Zdjęcie usunięte'), 'Picture deleted');
    assert.equal(t('Ten czat ma już pełny limit multimediów – usuń stare albo poczekaj.'), 'This chat\'s media storage is full – delete old pictures or wait.');
    setLang('pl');
    // the fuller of bytes and pictures
    assert.equal(usageShare({ bytes: 0, count: 2500 }, LIMITS), 0.5);
    assert.equal(usageShare({ bytes: 3 * 1024 ** 3, count: 1 }, LIMITS), 1);
  });

  it('finds links to shared screenshots and clips', () => {
    assert.deepEqual(mediaLinks('zobacz https://slashclient.pl/media/AbCdE12345 i https://slashclient.pl/media/AbCdE12345 oraz https://x.pl/inne'), ['https://slashclient.pl/media/AbCdE12345']);
    assert.deepEqual(mediaLinks('nic'), []);
  });

  it('reads a page of the server\'s answer, with the limits when given', () => {
    const page = pageOf({ media: [{ id: 5, from: 'a', at: 1, image: { id: 'x'.repeat(22), w: 4, h: 3 } }, { id: 4, from: 'b', at: 0, image: undefined }], more: true, limits: LIMITS, usage: { bytes: 1, count: 1 }, moderator: true }, (id) => id.toUpperCase());
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].name, 'A');
    assert.equal(page.more, true);
    assert.equal(page.moderator, true);
    assert.deepEqual(page.info?.usage, { bytes: 1, count: 1 });
    assert.equal(pageOf({ media: [] }, String).info, undefined);
  });
});

describe('the panel\'s sources', () => {
  it('a friend\'s conversation: pages, own pictures only, live changes, links', async () => {
    const api = fakeApi(() => ({ media: [{ id: 3, from: 'me', to: 'ala', at: 10, image: { id: 'p3' } }], more: false }));
    const src = directSource({
      api, friend: { id: 'ala', name: 'Ala' }, me: () => 'me', myName: () => 'Ja',
      messages: () => [{ id: 1, from: 'ala', at: 1, text: 'patrz https://s.pl/media/Abcdefghij' }, { id: 2, from: 'me', at: 2, text: 'ok', unreadable: true }],
      jump: () => undefined,
    });
    const page = await src.load(7);
    assert.deepEqual(api.calls[0], ['GET', '/v1/messages/ala/media?limit=40&before=7', undefined]);
    assert.equal(page.items[0].name, 'Ja');
    assert.equal(await src.thumb(page.items[0]), 'thumb:p3');
    assert.equal(src.canDelete(page.items[0], false), true);
    assert.equal(src.canDelete({ ...page.items[0], from: 'ala' }, true), false);
    await src.remove([3]);
    assert.deepEqual(api.calls[1], ['POST', '/v1/messages/ala/media/delete', { messages: [3] }]);
    assert.deepEqual(src.onEvent!({ type: 'message-edit', message: { id: 3, from: 'me', to: 'ala', imageRemoved: { at: 1 } } }), { removed: 3 });
    assert.equal(src.onEvent!({ type: 'message-edit', message: { id: 3, from: 'me', to: 'bob', imageRemoved: { at: 1 } } }), undefined);
    assert.equal(src.onEvent!({ type: 'message', message: { id: 9, from: 'ala', to: 'me', at: 5, image: { id: 'p9' } } })!.added!.name, 'Ala');
    assert.deepEqual(src.links!().map((l) => [l.id, l.name]), [[1, 'Ala']]);
  });

  it('a group: moderators by the author, limits saved, its own events', async () => {
    const api = fakeApi((m, p) => (p.endsWith('/limits') ? { limits: LIMITS, own: { days: 5 } } : { media: [], more: false }));
    const src = groupSource({
      api, group: { id: 'g1', name: 'Ekipa' }, me: () => 'me', name: (id) => id,
      mayModerate: (author) => author !== 'owner', messages: () => [], jump: () => undefined,
    });
    const item = { id: 1, from: 'bob', name: 'bob', at: 0, image: { id: 'x' } };
    assert.equal(src.canDelete(item, false), false);
    assert.equal(src.canDelete(item, true), true);
    assert.equal(src.canDelete({ ...item, from: 'owner' }, true), false);
    assert.deepEqual((await src.saveLimits!({ days: 5 }))?.own, { days: 5 });
    assert.deepEqual(api.calls[0], ['POST', '/v1/groups/g1/media/limits', { days: 5 }]);
    assert.deepEqual(src.onEvent!({ type: 'group-message-delete', message: { id: 4, group: 'g1', deleted: true } }), { removed: 4 });
    assert.equal(src.onEvent!({ type: 'group-message-delete', message: { id: 4, group: 'g2', deleted: true } }), undefined);
  });

  it('a community\'s channel: removed pictures leave, new ones come with their author', async () => {
    const api = fakeApi(() => ({ media: [{ id: 2, from: 'u', at: 1, author: { name: 'Ula' }, image: { id: 'c2', w: 4, h: 3 } }], more: true }));
    const src = communitySource({
      api, community: { id: 'c', name: 'Klub' }, channel: { id: 'ch', name: 'ogolny' }, me: () => 'me',
      mayModerate: () => false, messages: () => [], jump: () => undefined,
    });
    assert.equal(src.title, 'Klub · #ogolny');
    const page = await src.load();
    assert.deepEqual(api.calls[0], ['GET', '/v1/communities/c/channels/ch/media?limit=40', undefined]);
    assert.equal(page.items[0].name, 'Ula');
    assert.equal(await src.full(page.items[0]), 'cfull:c:c2');
    assert.deepEqual(src.onEvent!({ type: 'community-message-edit', message: { id: 2, community: 'c', channel: 'ch', image: { id: 'c2', removed: true, expired: true } } }), { removed: 2 });
    assert.equal(src.onEvent!({ type: 'community-message', message: { id: 3, community: 'c', channel: 'ch', from: 'u', at: 2, author: { name: 'Ula' }, image: { id: 'c3' } } })!.added!.id, 3);
    assert.equal(src.onEvent!({ type: 'community-message', message: { id: 4, community: 'c', channel: 'other', image: { id: 'c4' } } }), undefined);
  });
});

describe('a message whose picture went', () => {
  it('is not editable, and its new version drops the picture', () => {
    const m: ChatLine = { id: 1, from: 'me', at: 1000, text: '[Zrzut ekranu]' };
    assert.ok(canEdit(m, 'me', 60_000, 2000));
    assert.ok(!canEdit({ ...m, imageRemoved: { at: 1 } }, 'me', 60_000, 2000));
    const list: ChatLine[] = [{ ...m, image: { id: 'p' } }];
    assert.equal(replaceMessage(list, { ...m, imageRemoved: { at: 2 } })[0].image, undefined);
    // an edit that does not repeat the picture keeps it
    assert.deepEqual(replaceMessage(list, { ...m })[0].image, { id: 'p' });
  });

  it('says why in the game: deleted or run out', () => {
    setLang('pl');
    assert.equal(removedText({ at: 1, by: 'x' }, t), 'Zdjęcie usunięte');
    assert.equal(removedText({ at: 1, expired: true }, t), 'Zdjęcie wygasło i zniknęło z serwera.');
    assert.equal(removedText(undefined, t), undefined);
  });

  it('keeps a few hundred thumbnails, the oldest going first', () => {
    const c = new ThumbCache(2);
    c.set('a', '1');
    c.set('b', '2');
    c.get('a');
    c.set('c', '3');
    assert.equal(c.get('a'), '1');
    assert.equal(c.get('b'), undefined);
  });
});
