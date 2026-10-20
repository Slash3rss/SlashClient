import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import { applyGroupMessage, clanMay, eventText, validTag, type Group } from '../src/renderer/groups';

describe('groups and clans in the Friends view', () => {
  const group = (id: string, unread = 0, lastMessageAt = 0): Group => ({ id, name: id, owner: 'ala', createdAt: 0, members: [], unread, lastMessageAt });

  it('moves the group with a new message to the top and counts it unread unless open or ours', () => {
    const list = [group('a'), group('b', 1)];
    const msg = { id: 1, group: 'b', from: 'bob', text: 'hej', at: 5 };
    assert.deepEqual(applyGroupMessage(list, msg, 'ala', undefined).map((g) => [g.id, g.unread, g.lastMessageAt]), [['b', 2, 5], ['a', 0, 0]]);
    assert.equal(applyGroupMessage(list, msg, 'ala', 'b')[0].unread, 1);
    assert.equal(applyGroupMessage(list, { ...msg, from: 'ala' }, 'ala', undefined)[0].unread, 1);
    // a group this list does not know yet: unchanged (the list is fetched again)
    assert.equal(applyGroupMessage(list, { ...msg, group: 'x' }, 'ala', undefined), list);
  });

  it('says what happened in a group in the player\'s language', () => {
    setLang('pl');
    assert.equal(eventText({ kind: 'added', by: 'Ala', users: ['Bob', 'Cyr'] }), 'Ala dodaje: Bob, Cyr');
    setLang('en');
    assert.equal(eventText({ kind: 'renamed', by: 'Ala', name: 'Ekipa' }), 'Ala renamed it to “Ekipa”');
    assert.equal(eventText({ kind: 'left', by: 'Bob' }), 'Bob left');
    assert.equal(eventText({ kind: 'logo', by: 'Ala' }), 'Ala changed the clan’s logo');
    setLang('pl');
    assert.equal(eventText({ kind: 'logo', by: 'Ala' }), 'Ala zmienia logo klanu');
    assert.equal(eventText({ kind: 'logo', by: 'Ala', removed: true }), 'Ala usuwa logo klanu');
  });

  it('offers only what the clan role allows, as the server does', () => {
    assert.ok(clanMay('officer', 'invite') && !clanMay('member', 'invite') && !clanMay(undefined, 'invite'));
    assert.ok(clanMay('officer', 'kick', 'member') && !clanMay('officer', 'kick', 'officer') && !clanMay('owner', 'kick', 'owner'));
    assert.ok(clanMay('owner', 'setRole', 'member') && !clanMay('officer', 'setRole', 'member'));
    assert.ok(clanMay('owner', 'delete') && !clanMay('officer', 'rename'));
    assert.ok(clanMay('owner', 'logo') && !clanMay('officer', 'logo') && !clanMay('member', 'logo'));
    assert.ok(validTag('WOLF') && validTag('x9') && !validTag('A') && !validTag('ABCDEF') && !validTag('A B'));
  });
});
