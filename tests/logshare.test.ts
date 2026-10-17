import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { describe, it } from 'node:test';
import { redactLog, shareLog } from '../src/main/logshare';

describe('sharing logs', () => {
  it('hides the home folder and tokens', () => {
    const text = `> ${os.homedir()}/Library/Application Support/SlashClient/runtimes/java --accessToken abc.def.ghi\nSetting user: Steve`;
    const out = redactLog(text);
    assert.ok(!out.includes(os.homedir()));
    assert.match(out, /~\/Library\/Application Support/);
    assert.match(out, /--accessToken \[ukryte\]/);
    assert.match(out, /Setting user: Steve/);
  });

  it('posts the redacted log and returns the link', async () => {
    let received = '';
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received = req.url === '/v1/logs' ? body : '';
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id: 'AbCdE12345', url: '/logi/AbCdE12345' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
    const shared = await shareLog(`${os.homedir()}/x
line`, `${base}/`);
    server.close();
    assert.deepEqual(shared, { url: `${base}/logi/AbCdE12345`, id: 'AbCdE12345' });
    assert.equal(received, '~/x\nline');
  });
});
