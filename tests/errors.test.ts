import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { bridgeError, GameBridge } from '../src/main/bridge';
import { appendLauncherLog, errorDetails, installErrorHandlers } from '../src/main/launcherErrors';
import { SocialError } from '../src/main/social';
import { FILE_ERROR_CODES, fileErrorText } from '../src/shared/fileErrors';
import { lookup, setLang } from '../src/shared/i18n';
import { ERRORS_EN } from '../src/shared/i18nErrors';

const fsError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('file errors in plain words', () => {
  it('replaces the code and the paths, keeps what came before', () => {
    setLang('pl');
    const text = fileErrorText("EPERM: operation not permitted, rename 'C:\\Users\\Gracz\\AppData\\Roaming\\SlashClient\\a' -> 'b'")!;
    assert.match(text, /^Brak dostępu do pliku/);
    assert.doesNotMatch(text, /EPERM|C:\\|Users/);
    assert.equal(fileErrorText('ENOSPC: no space left on device, write'), 'Brak miejsca na dysku. Zwolnij trochę miejsca i spróbuj ponownie.');
    assert.equal(fileErrorText("Nie udało się zaimportować świata: EBUSY: resource busy or locked, unlink '/x/y'"),
      'Nie udało się zaimportować świata: Plik jest używany przez inny program. Zamknij grę i spróbuj ponownie.');
    assert.match(fileErrorText("ENOENT: no such file or directory, open '/home/gracz/.slashclient/launcher.json'")!, /^Nie znaleziono pliku/);
    assert.match(fileErrorText('EACCES')!, /^Brak dostępu/);
  });

  it('leaves other texts alone', () => {
    assert.equal(fileErrorText('Nie znaleziono wersji 1.21.4'), undefined);
    assert.equal(fileErrorText('PERMANENT failure'), undefined);
    assert.equal(fileErrorText('ENOENTX'), undefined);
  });

  it('has an English text for every message', () => {
    setLang('en');
    try {
      for (const code of FILE_ERROR_CODES) {
        const text = fileErrorText(`${code}: x`)!;
        assert.ok(Object.values(ERRORS_EN).includes(text), `${code} has no English text`);
      }
      for (const pl of Object.keys(ERRORS_EN)) assert.ok(lookup(pl), pl);
      assert.equal(fileErrorText('ENOSPC: no space left on device'), 'The disk is full. Free up some space and try again.');
    } finally {
      setLang('pl');
    }
  });
});

describe('bridge errors for the game', () => {
  it('keeps the machine codes older HUDs look for', () => {
    assert.deepEqual(bridgeError(new SocialError('not_found', 404)), { error: 'not_found', status: 404 });
    assert.deepEqual(bridgeError(new SocialError('slow_down:30', 429)), { error: 'slow_down:30', status: 429 });
    assert.deepEqual(bridgeError(new SocialError('offline')), { error: 'offline' });
    assert.deepEqual(bridgeError(new Error('not_a_screenshot')), { error: 'not_a_screenshot' });
    assert.deepEqual(bridgeError(Object.assign(new Error('x'), { code: 'image_quota' })), { error: 'image_quota' });
  });

  it('never passes on paths, stacks or raw JSON', () => {
    setLang('pl');
    assert.deepEqual(bridgeError(new Error('HTTP 429 {"error":"slow_down","retryAfter":5}')), { error: 'slow_down', status: 429 });
    assert.deepEqual(bridgeError(new Error('HTTP 429 <html>Too many</html>')), { error: 'Za dużo zapytań. Spróbuj ponownie za chwilę.', status: 429 });
    assert.deepEqual(bridgeError(new Error('HTTP 503')), { error: 'Serwer ma chwilowe problemy. Spróbuj ponownie później.', status: 503 });
    const file = bridgeError(fsError('ENOENT', "ENOENT: no such file or directory, open 'C:\\Users\\Gracz\\shot.png'"));
    assert.equal(file.error, 'Nie znaleziono pliku lub folderu. Mógł zostać przeniesiony albo usunięty.');
    assert.equal(bridgeError(new Error("Outside the profiles: /home/gracz/x.png")).error, 'Launcher nie mógł tego zrobić. Spróbuj ponownie.');
    assert.equal(bridgeError(new TypeError("Cannot read properties of undefined (reading 'x')")).error, 'Launcher nie mógł tego zrobić. Spróbuj ponownie.');
    assert.equal(bridgeError(new SyntaxError('Unexpected token } in JSON at position 3')).error, 'Launcher nie mógł tego zrobić. Spróbuj ponownie.');
    assert.equal(bridgeError(undefined).error, 'Launcher nie mógł tego zrobić. Spróbuj ponownie.');
  });

  it('keeps a sentence that is already readable', () => {
    assert.deepEqual(bridgeError(new Error('Na wiki nie ma takiej strony.')), { error: 'Na wiki nie ma takiej strony.' });
    assert.deepEqual(bridgeError(new Error('Za dużo zapytań do skyup.pl. Spróbuj ponownie za chwilę.')), { error: 'Za dużo zapytań do skyup.pl. Spróbuj ponownie za chwilę.' });
  });

  it('answers the game with the clean text and the same fields', async () => {
    const logged: unknown[] = [];
    const before = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    const bridge = new GameBridge({
      call: async () => { throw new Error('HTTP 500 {"stack":"at C:\\\\x.js"}'); },
      state: () => ({}),
      copyImage: async () => { throw fsError('EACCES', "EACCES: permission denied, open '/home/gracz/shot.png'"); },
      skyupWikiIndex: async () => { throw new Error('Na wiki nie ma takiej strony.'); },
      skyupWikiArticle: async () => ({}),
      skyupWikiSearch: async () => ({}),
      skyupWikiPicture: async () => Buffer.alloc(0),
    });
    try {
      const { url, key } = await bridge.start();
      const req = (p: string, init: RequestInit = {}) => fetch(url + p, { ...init, headers: { Authorization: `Bearer ${key}` } });
      const friends = await req('/v1/friends');
      assert.equal(friends.status, 502);
      assert.deepEqual(await friends.json(), { error: 'Serwer ma chwilowe problemy. Spróbuj ponownie później.', status: 500 });
      const copy = await req('/clipboard/image', { method: 'POST', body: JSON.stringify({ path: '/x/screenshots/a.png' }) });
      assert.equal(copy.status, 403);
      const body = await copy.json() as { error: string };
      assert.doesNotMatch(body.error, /EACCES|gracz/);
      const wiki = await req('/skyup-wiki/index');
      assert.deepEqual(await wiki.json(), { error: 'Na wiki nie ma takiej strony.' });
      const broken = await req('/lan/host', { method: 'POST', body: '{nie json' });
      assert.equal(broken.status, 500);
      assert.doesNotMatch(((await broken.json()) as { error: string }).error, /JSON|position/);
      // the raw errors are in the log
      assert.ok(logged.some((l) => String(l).includes('EACCES')));
    } finally {
      bridge.stop();
      console.error = before;
    }
  });
});

describe('errors nobody caught', () => {
  const quietly = <T>(work: () => T): T => {
    const before = console.error;
    console.error = () => {};
    try {
      return work();
    } finally {
      console.error = before;
    }
  };

  it('logs them with the stack and ends only a launcher that is still starting', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'slash-errors-'));
    try {
      const log = path.join(dir, 'logs', 'launcher.log');
      const target = new EventEmitter();
      let started = false;
      const fatal: unknown[] = [];
      installErrorHandlers({ logFile: () => log, started: () => started, fatal: (err) => fatal.push(err), target: target as never });

      quietly(() => target.emit('unhandledRejection', new Error('server did not answer')));
      assert.equal(fatal.length, 0, 'a forgotten promise never ends the launcher');
      quietly(() => target.emit('uncaughtException', new Error('broken start')));
      quietly(() => target.emit('uncaughtException', new Error('again')));
      assert.equal(fatal.length, 1, 'the message comes once');
      started = true;
      quietly(() => target.emit('uncaughtException', new Error('later')));
      assert.equal(fatal.length, 1);

      const text = readFileSync(log, 'utf8');
      for (const m of ['[unhandledRejection] Error: server did not answer', '[uncaughtException] Error: broken start', 'Error: later']) assert.ok(text.includes(m), m);
      assert.match(text, /errors\.test/, 'with the stack');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes any value, and never throws itself', () => {
    assert.equal(errorDetails('plain'), 'plain');
    assert.equal(errorDetails({ a: 1 }), '{"a":1}');
    assert.equal(errorDetails(undefined), 'undefined');
    appendLauncherLog(path.join('\0bad', 'launcher.log'), 'nothing happens');
  });
});
