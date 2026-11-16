import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { decodePng, encodePng } from '../src/png.ts';
import { createServerIcons, iconAddress, publicIp } from '../src/serverIcons.ts';

const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-server-icons-'));
let base = '';
let app: ReturnType<typeof createApp>;
/** How many times a Minecraft server was asked, by address. */
const asked = new Map<string, number>();

/** A 64×64 icon, red on the left and blue on the right. */
const icon = () => {
  const rgba = Buffer.alloc(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) rgba.set(i % 64 < 32 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  return encodePng({ width: 64, height: 64, rgba });
};
const servers: Record<string, unknown> = {
  'skyup.pl': { favicon: `data:image/png;base64,${icon().toString('base64')}` },
  'noicon.example.com': { description: 'no icon here' },
  'big.example.com': { favicon: `data:image/png;base64,${encodePng({ width: 128, height: 128, rgba: Buffer.alloc(128 * 128 * 4) }).toString('base64')}` },
};
const deps = {
  resolve: async (address: string) => ({ ip: '203.0.113.7', host: address.split(':')[0], port: 25565 }),
  status: async (_ip: string, host: string) => {
    asked.set(host, (asked.get(host) ?? 0) + 1);
    if (!(host in servers)) throw new Error('down');
    return servers[host];
  },
};

before(async () => {
  app = createApp({ dbFile: path.join(dir, 'test.db'), publicUrl: 'http://localhost', allowDevLogin: true, loginsPerMinute: 1000, oauth: {}, serverIcons: deps });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('Minecraft server icons', () => {
  it('asks only servers on the internet', () => {
    assert.equal(iconAddress('SkyUp.pl:25565'), 'skyup.pl');
    for (const bad of ['localhost', '127.0.0.1', '10.1.2.3:25565', '192.168.0.10', 'minecraft', 'pc.lan', 'a b.pl', '../etc'])
      assert.equal(iconAddress(bad), undefined, bad);
    assert.equal(publicIp('51.77.1.2'), true);
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:192.168.1.1', '100.64.0.1']) assert.equal(publicIp(ip), false, ip);
  });

  it('serves the icon enlarged, keeps it, and says when there is none', async () => {
    const res = await fetch(`${base}/v1/public/server-icon/skyup.pl.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const picture = decodePng(Buffer.from(await res.arrayBuffer()));
    assert.deepEqual([picture.width, picture.height], [256, 256]);
    assert.deepEqual([...picture.rgba.subarray(0, 4)], [255, 0, 0, 255]);
    // kept: the server is not asked again
    assert.equal((await fetch(`${base}/v1/public/server-icon/SkyUp.pl.png`)).status, 200);
    assert.equal(asked.get('skyup.pl'), 1);
    for (const none of ['noicon.example.com', 'big.example.com', 'down.example.com', '127.0.0.1', 'localhost'])
      assert.equal((await fetch(`${base}/v1/public/server-icon/${none}.png`)).status, 404, none);
    assert.equal(asked.get('127.0.0.1'), undefined);
  });

  it('limits new servers per address, not the ones already read', async () => {
    app.settings.set({ 'security.serverIconsPerMinute': 2 }, 'test');
    try {
      const ip = { 'X-Forwarded-For': '198.51.100.9' };
      assert.equal((await fetch(`${base}/v1/public/server-icon/a1.example.com.png`, { headers: ip })).status, 404);
      assert.equal((await fetch(`${base}/v1/public/server-icon/a2.example.com.png`, { headers: ip })).status, 404);
      assert.equal((await fetch(`${base}/v1/public/server-icon/a3.example.com.png`, { headers: ip })).status, 429);
      assert.equal((await fetch(`${base}/v1/public/server-icon/skyup.pl.png`, { headers: ip })).status, 200);
    } finally {
      app.settings.set({ 'security.serverIconsPerMinute': null }, 'test');
    }
  });

  it('can be switched off in the admin panel', async () => {
    app.settings.set({ 'feature.serverIcons': false }, 'test');
    try {
      assert.equal((await fetch(`${base}/v1/public/server-icon/skyup.pl.png`)).status, 503);
    } finally {
      app.settings.set({ 'feature.serverIcons': null }, 'test');
    }
  });

  it('asks a server once while the first answer is on its way', async () => {
    let calls = 0;
    const icons = createServerIcons({ ...deps, status: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return servers['skyup.pl'];
    } });
    const [a, b] = await Promise.all([icons.icon('skyup.pl', { hours: 1 }), icons.icon('skyup.pl', { hours: 1 })]);
    assert.ok(a && b);
    assert.equal(calls, 1);
  });
});
