import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setLang } from '../src/shared/i18n';
import {
  QUICK_REACTIONS, REACTIONS, SLOW_MODES, applyCommunityMessage, applyReaction, channelName, communityBadge, communityMay, keepMyReactions, mentionParts, shouldNotify, waitText,
  type Community, type CommunityMessage, type CommunityRole,
} from '../src/renderer/communities';
import { readFileSync } from 'node:fs';

const ROLES: CommunityRole[] = ['owner', 'admin', 'moderator', 'member'];

describe('communities in the Friends view', () => {
  it('offers what the server allows, for every role, action and target', () => {
    const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };
    for (const role of ROLES) {
      for (const action of ['invite', 'requests', 'reports', 'pin', 'kick', 'mute', 'deleteMessage', 'ban', 'edit', 'announce', 'log', 'slowMode', 'setRole', 'transfer', 'delete'] as const) {
        for (const target of [undefined, ...ROLES]) {
          for (const next of [undefined, ...ROLES]) {
            const r = RANK[role];
            const below = target !== undefined && RANK[target] < r;
            const want = {
              invite: r >= 1, requests: r >= 1, reports: r >= 1, pin: r >= 1, slowMode: r >= 2, kick: r >= 1 && below, mute: r >= 1 && below, deleteMessage: r >= 1 && below,
              ban: r >= 2 && below, edit: r >= 2, announce: r >= 2, log: r >= 2, setRole: r >= 2 && below && next !== undefined && next !== 'owner' && RANK[next] < r,
              transfer: role === 'owner' && target !== undefined && target !== 'owner', delete: role === 'owner',
            }[action];
            assert.equal(communityMay(role, action, target, next), want, `${role} ${action} ${target} ${next}`);
          }
        }
      }
    }
    assert.equal(communityMay(undefined, 'invite'), false);
    // the server's own table says the same (its files import with .ts endings, so they are read here)
    const server = readFileSync('server/src/communityStore.ts', 'utf8');
    assert.match(server, /case 'ban':\s+return r >= RANK\.admin && below;/);
    assert.ok(server.includes("return r >= RANK.admin && below && next !== undefined && next !== 'owner' && RANK[next] < r;"));
  });

  const community = (id: string, over: Partial<Community> = {}): Community => ({
    id, name: id, tag: '', slug: id, description: '', visibility: 'public', joinMode: 'open', members: 10, owner: { id: 'o', handle: 'o', name: 'O', avatar: '' }, createdAt: 0,
    role: 'member', notify: 'mentions', onProfile: true, joinedAt: 0, lastMessageAt: 0, unread: 0, mentions: 0, permissions: {},
    channels: [{ id: `${id}-g`, kind: 'general', name: '', canPost: true, unread: 0, mentions: 0 }, { id: `${id}-n`, kind: 'announcements', name: '', canPost: false, unread: 0, mentions: 0 }],
    ...over,
  });
  const msg = (over: Partial<CommunityMessage> = {}): CommunityMessage => ({ id: 1, community: 'b', channel: 'b-g', from: 'bob', author: { name: 'Bob', handle: 'bob' }, text: 'hej', at: 5, ...over });

  it('moves the community with a new message up, counting unread and mentions unless that channel is open or it is ours', () => {
    const list = [community('a'), community('b')];
    const next = applyCommunityMessage(list, msg({ mentions: ['me'] }), 'me');
    assert.deepEqual(next.map((c) => [c.id, c.unread, c.mentions, c.lastMessageAt]), [['b', 1, 1, 5], ['a', 0, 0, 0]]);
    assert.deepEqual(next[0].channels.map((ch) => [ch.unread, ch.mentions]), [[1, 1], [0, 0]]);
    assert.equal(applyCommunityMessage(list, msg(), 'me', { community: 'b', channel: 'b-g' })[0].unread, 0);
    // the other channel is open: this one still counts
    assert.equal(applyCommunityMessage(list, msg(), 'me', { community: 'b', channel: 'b-n' })[0].unread, 1);
    assert.equal(applyCommunityMessage(list, msg({ from: 'me' }), 'me')[0].unread, 0);
    assert.equal(applyCommunityMessage(list, msg({ community: 'x' }), 'me'), list);
  });

  it('notifies as the member chose: everything, mentions only (the default) or nothing', () => {
    assert.equal(shouldNotify({ notify: 'mentions' }, { from: 'bob' }, 'me'), false);
    assert.equal(shouldNotify({ notify: 'mentions' }, { from: 'bob', mentions: ['me'] }, 'me'), true);
    assert.equal(shouldNotify({ notify: 'all' }, { from: 'bob' }, 'me'), true);
    assert.equal(shouldNotify({ notify: 'all' }, { from: 'me' }, 'me'), false);
    assert.equal(shouldNotify({ notify: 'none' }, { from: 'bob', mentions: ['me'] }, 'me'), false);
    // the badge: all unread where wanted, only mentions where not, and the invites
    assert.equal(communityBadge([{ notify: 'all', unread: 5, mentions: 1 }, { notify: 'mentions', unread: 40, mentions: 2 }, { notify: 'none', unread: 9, mentions: 9 }], 1), 8);
  });

  it('marks mentions in the text, one\'s own apart', () => {
    assert.deepEqual(mentionParts('hej @Ala i @bob. mail@x.pl', 'ala'), [
      { text: 'hej ' }, { text: '@Ala', mention: true, me: true }, { text: ' i ' }, { text: '@bob', mention: true, me: false }, { text: '. mail@x.pl' },
    ]);
    assert.deepEqual(mentionParts('bez wzmianek', 'ala'), [{ text: 'bez wzmianek' }]);
  });

  it('names the two channels every community has in the player\'s language', () => {
    setLang('en');
    assert.equal(channelName({ kind: 'general', name: '' }), 'General');
    assert.equal(channelName({ kind: 'announcements', name: '' }), 'Announcements');
    setLang('pl');
    assert.equal(channelName({ kind: 'general', name: '' }), 'Ogólny');
    assert.equal(channelName({ kind: 'custom', name: 'turnieje' }), 'turnieje');
  });

  it('reacts with the server\'s emoji, and slow mode has the server\'s choices', () => {
    const server = readFileSync('server/src/communityStore.ts', 'utf8').replace(/\r/g, '');
    // the emoji in quotes, in order, from the server's two lists
    const emoji = (src: string) => [...src.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(emoji(/export const QUICK_REACTIONS = \[([^\]]*)\]/.exec(server)![1]), QUICK_REACTIONS);
    assert.deepEqual([...QUICK_REACTIONS, ...emoji(/export const REACTIONS = \[\s*\.\.\.QUICK_REACTIONS,([^\]]*)\]/.exec(server)![1])], REACTIONS);

    assert.ok(server.includes(`export const SLOW_MODES = [${SLOW_MODES.join(', ')}];`));
  });

  it('counts reactions from the pushed changes, mine marked only by my own', () => {
    let r = applyReaction(undefined, { emoji: '👍', count: 1, user: 'bob', on: true }, 'me');
    assert.deepEqual(r, [{ emoji: '👍', count: 1 }]);
    r = applyReaction(r, { emoji: '👍', count: 2, user: 'me', on: true }, 'me');
    assert.deepEqual(r, [{ emoji: '👍', count: 2, me: true }]);
    r = applyReaction(r, { emoji: '🔥', count: 1, user: 'ala', on: true }, 'me');
    // someone else taking theirs off leaves my mark
    r = applyReaction(r, { emoji: '👍', count: 1, user: 'bob', on: false }, 'me');
    assert.deepEqual(r, [{ emoji: '👍', count: 1, me: true }, { emoji: '🔥', count: 1 }]);
    r = applyReaction(r, { emoji: '👍', count: 0, user: 'me', on: false }, 'me');
    assert.deepEqual(r, [{ emoji: '🔥', count: 1 }]);
    // an edited message pushed to everyone: my marks stay
    assert.deepEqual(keepMyReactions([{ emoji: '🔥', count: 1, me: true }], [{ emoji: '🔥', count: 2 }, { emoji: '😂', count: 1 }]), [{ emoji: '🔥', count: 2, me: true }, { emoji: '😂', count: 1 }]);
    assert.equal(keepMyReactions([{ emoji: '🔥', count: 1, me: true }], undefined), undefined);
  });

  it('says how long to wait in words', () => {
    assert.deepEqual([5, 30, 60, 90, 300, 3600, 3660].map(waitText), ['5 s', '30 s', '1 min', '1 min 30 s', '5 min', '1 h', '1 h 1 min']);
    assert.equal(waitText(4.2), '5 s');
  });
});

