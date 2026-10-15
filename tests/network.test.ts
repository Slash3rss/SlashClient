import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, describe, it } from 'node:test';
import { fetchJson, netFetch } from '../src/main/download';
import { setLang } from '../src/shared/i18n';

describe('readable network errors', () => {
  let server: http.Server;
  let base = '';
  before(async () => {
    setLang('pl');
    server = http.createServer((req, res) => {
      res.statusCode = req.url === '/missing' ? 404 : 503;
      res.end('<html>upstream error details</html>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  });
  after(() => server.close());

  it('explains an unknown host instead of "fetch failed"', async () => {
    await assert.rejects(netFetch('https://slashclient-test.invalid/x'), (err: Error) => {
      assert.match(err.message, /internetem/);
      assert.match(err.message, /slashclient-test\.invalid/);
      assert.doesNotMatch(err.message, /fetch failed/);
      return true;
    });
  });

  it('explains a refused connection', async () => {
    // a port that was just free is very likely still closed
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    await assert.rejects(netFetch(`http://127.0.0.1:${port}/`), /odrzucił połączenie/);
  });

  it('turns HTTP errors into short messages without the response body', async () => {
    await assert.rejects(fetchJson(`${base}/x`), (err: Error) => {
      assert.match(err.message, /chwilowe problemy \(503\)/);
      assert.doesNotMatch(err.message, /upstream|<html>/);
      return true;
    });
    await assert.rejects(fetchJson(`${base}/missing`), /Nie znaleziono.*404/);
  });
});
