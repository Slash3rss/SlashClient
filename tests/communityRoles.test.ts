import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { setLang, t } from '../src/shared/i18n';
import {
  LOG_GROUPS, ROLE_PERMISSIONS, accessText, channelClosed, channelSlug, communityCan, logActionText, mayManageRole, permissionText, rolePower, type CustomRole, type RoleHolder,
} from '../src/renderer/communityRoles';

/** Own channels, custom roles and the moderation log in the Friends view (server 0.9.30+). */

const role = (id: string, position: number, permissions: string[] = []): CustomRole => ({ id, name: id.toUpperCase(), color: '#22c55e', position, permissions });
const roles = [role('lead', 3, ['manageRoles', 'kick']), role('vip', 2, ['postReadOnly']), role('new', 1)];

describe('custom roles and own channels in the Friends view', () => {
  it('has the server\'s permissions, the same lowest built-in role for each, and the same log kinds', () => {
    const server = readFileSync('server/src/communityRoles.ts', 'utf8');
    const list = /export const ROLE_PERMISSIONS = \[([^\]]+)\]/.exec(server)![1].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1));
    assert.deepEqual([...ROLE_PERMISSIONS], list);
    const base = /const BASE: Record<RolePermission, CommunityRole> = \{([^}]+)\}/.exec(server)![1];
    const mine = readFileSync('src/renderer/communityRoles.ts', 'utf8');
    const ours = /const BASE: Record<string, BaseRole> = \{([^}]+)\}/.exec(mine)![1];
    assert.equal(ours.replace(/\s+/g, ' ').trim(), base.replace(/\s+/g, ' ').trim());
    for (const g of LOG_GROUPS) assert.ok(server.includes(`  ${g}: [`), g);
  });

  it('decides like the server: the server\'s permissions, then power (built-in role first, then the custom role\'s place)', () => {
    const lead: RoleHolder = { role: 'member', customRole: roles[0], roles, permissions: { kick: true, manageRoles: true, ban: false } };
    assert.equal(communityCan(lead, 'kick'), true);
    assert.equal(communityCan(lead, 'kick', { role: 'member' }), true);
    assert.equal(communityCan(lead, 'kick', { role: 'member', customRole: roles[1] }), true);
    assert.equal(communityCan(lead, 'kick', { role: 'moderator' }), false);
    assert.equal(communityCan(lead, 'ban', { role: 'member' }), false);
    assert.ok(rolePower('moderator') > rolePower('member', 15));
    // an older server: no custom roles, no new permissions; what the built-in role has
    const oldMod: RoleHolder = { role: 'moderator', permissions: { kick: true } };
    assert.equal(communityCan(oldMod, 'kick', { role: 'member' }), true);
    assert.equal(communityCan(oldMod, 'kick', { role: 'moderator' }), false);
    assert.equal(communityCan(oldMod, 'manageChannels'), false);
    assert.equal(communityCan({ role: 'admin' }, 'manageChannels'), true);
    // managing roles: admins any, others below their own
    assert.equal(mayManageRole(lead, roles[1]), true);
    assert.equal(mayManageRole(lead, roles[0]), false);
    assert.equal(mayManageRole({ role: 'admin', roles, permissions: { manageRoles: true } }, roles[0]), true);
    assert.equal(mayManageRole({ role: 'moderator', roles, permissions: { manageRoles: false } }, roles[2]), false);
  });

  it('names channels as the server keeps them, and says who reads and writes', () => {
    assert.equal(channelSlug('#Handel ludzi!'), 'handel-ludzi');
    assert.equal(channelSlug('  PvP  '), 'pvp');
    assert.equal(channelSlug('Żółw'), 'żółw');
    assert.equal(channelClosed({}), false);
    assert.equal(channelClosed({ readRole: 'member' }), false);
    assert.equal(channelClosed({ readRole: 'moderator' }), true);
    assert.equal(channelClosed({ readRole: 'member', readRoles: ['vip'] }), true);
    setLang('pl');
    assert.equal(accessText({ readRole: 'member', postRole: 'admin', writeRoles: ['vip'] }, roles), 'Czytają: wszyscy · Piszą: administratorzy + VIP');
    setLang('en');
    assert.equal(accessText({ readRole: 'moderator', readRoles: ['vip', 'gone'], postRole: 'moderator' }, roles), 'Read: moderators and up + VIP · Write: moderators and up');
    setLang('pl');
  });

  it('says every permission and log entry in Polish and in English', () => {
    const actions = ['kick', 'ban', 'mute', 'message_delete', 'channel_create', 'channel_edit', 'channel_delete', 'channel_order', 'role_create', 'role_edit', 'role_delete', 'role_order', 'member_role'];
    for (const p of ROLE_PERMISSIONS) {
      setLang('pl');
      const pl = permissionText(p);
      setLang('en');
      assert.notEqual(permissionText(p), pl, p);
    }
    for (const a of actions) {
      setLang('pl');
      const pl = logActionText(a);
      assert.ok(pl, a);
      setLang('en');
      assert.notEqual(logActionText(a), pl, a);
    }
    // the server's errors of these
    assert.equal(t('Kanał o tej nazwie już jest.'), 'A channel with this name already exists.');
    setLang('pl');
  });
});
