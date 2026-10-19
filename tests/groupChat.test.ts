import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import { newDeviceKey } from '../src/main/chatCrypto';
import { groupDevices, openGroupMessage, sealGroupText, type GroupChatMessage } from '../src/main/groupChat';

describe('group chat encryption', () => {
  const alaPc = newDeviceKey();
  const alaLaptop = newDeviceKey();
  const bob = newDeviceKey();
  const cyr = newDeviceKey();
  const dan = newDeviceKey();
  const key = (user: string, k: typeof alaPc) => ({ user, device: k.device, pub: k.publicKey });
  const members = [key('ala', alaPc), key('ala', alaLaptop), key('bob', bob), key('cyr', cyr)];
  const read = (text: string, k: typeof alaPc, group = 'g1', from = 'ala') => openGroupMessage<GroupChatMessage>({ group, from, text }, k, '?');

  it('opens for every member\'s launcher, the sender\'s other one too, and nobody else', () => {
    const text = sealGroupText('Zbiórka o 20 na spawnie', alaPc, members, 'g1', 'ala');
    assert.ok(!text.includes('Zbiórka'));
    for (const k of [alaPc, alaLaptop, bob, cyr]) assert.deepEqual(read(text, k), { group: 'g1', from: 'ala', text: 'Zbiórka o 20 na spawnie', encrypted: true });
    // dan is not in the group (yet): the message was not sealed for him
    assert.deepEqual(read(text, dan), { group: 'g1', from: 'ala', text: '?', encrypted: true, unreadable: true });
  });

  it('follows who is in the group when it is sent', () => {
    // cyr left, dan came: the next message is for dan and not for cyr
    const after = [...members.filter((m) => m.user !== 'cyr'), key('dan', dan)];
    const text = sealGroupText('już bez Cyryla', bob, after, 'g1', 'bob');
    assert.equal(read(text, dan, 'g1', 'bob').text, 'już bez Cyryla');
    assert.equal(read(text, cyr, 'g1', 'bob').unreadable, true);
  });

  it('is tied to its group and sender', () => {
    const text = sealGroupText('tajne', alaPc, members, 'g1', 'ala');
    assert.equal(read(text, bob, 'g2').unreadable, true);
    assert.equal(read(text, bob, 'g1', 'cyr').unreadable, true);
    // plain text (an event line, or an older launcher) passes as it is
    assert.deepEqual(read('', bob), { group: 'g1', from: 'ala', text: '' });
  });

  it('wraps the key once per launcher, its own last', () => {
    const devices = groupDevices([...members, key('ala', alaPc)], alaPc);
    assert.equal(devices.length, 4);
    assert.equal(devices.at(-1)!.device, alaPc.device);
    assert.equal(new Set(devices.map((d) => d.device)).size, 4);
  });

  it('passes group chats between the game and the server, but not clan management', async () => {
    const calls: string[] = [];
    const bridge = new GameBridge({ call: async (method, path) => (calls.push(`${method} ${path}`), { ok: true }), state: () => ({}) });
    const { url, key: k } = await bridge.start();
    const req = (path: string, method = 'GET') => fetch(url + path, { method, headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    for (const [path, method] of [['/v1/groups', 'GET'], ['/v1/groups', 'POST'], ['/v1/groups/abc/messages?limit=50', 'GET'], ['/v1/groups/abc/messages', 'POST'], ['/v1/groups/abc/read', 'POST'], ['/v1/groups/abc/leave', 'POST'], ['/v1/clans/mine', 'GET']]) {
      assert.equal((await req(path, method)).status, 200, path);
    }
    for (const [path, method] of [['/v1/groups/abc/name', 'POST'], ['/v1/clans', 'POST'], ['/v1/clans/rename', 'POST'], ['/v1/clans/mine', 'DELETE'], ['/v1/groups/abc/keys', 'GET']]) {
      assert.equal((await req(path, method)).status, 403, path);
    }
    assert.equal(calls.length, 7);
    const poll = req('/events?after=0').then((r) => r.json());
    bridge.push({ type: 'group-message', message: { group: 'abc', text: 'hej' } });
    bridge.push({ type: 'clan' });
    assert.deepEqual((await poll).events.map((e: { type: string }) => e.type), ['group-message', 'clan']);
    bridge.stop();
  });
});
