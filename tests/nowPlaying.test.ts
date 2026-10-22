import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { GameBridge } from '../src/main/bridge';
import {
  CoverCache, NowPlayingReader, PLAYERCTL_FORMAT, SEP, WindowsReader, macScript, parseDbusNames, parseDbusPlayer, parseOsascript, parsePlayerctl,
  parseWindowsLine, pickSession, readLinux, readMac, sourceOf, toNowPlaying, windowsScript, type MediaSession, type ReaderProcess,
} from '../src/main/nowPlaying';

// "Now playing" for the game's module: what each system says, read into one shape; the one to
// show picked; covers only as small PNGs (from the system, or Spotify's own image host); the
// Windows reader started while the game asks and gone after; the bridge's answer as older games read it.

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex');
const fakePng = (data: Buffer, size: number) => Buffer.from(`png:${size}:${data.length}`);

const winLine = (sessions: unknown[]) => JSON.stringify({ sessions });
const SPOTIFY_WIN = { app: 'Spotify.exe', title: 'Pszczółka Maja', artist: 'Zespół A', album: 'Album C', status: 'Paused', position: 61000, duration: 200000, current: false };
const CHROME_WIN = { app: 'Chrome', title: 'Lofi na YouTube', artist: 'Kanał', album: '', status: 'Playing', position: 5000, duration: 0, current: true };

describe('Now playing: what the systems say', () => {
  it('Windows: the PowerShell line, the cover as a picture only when it is one', () => {
    const parsed = parseWindowsLine(winLine([{ ...SPOTIFY_WIN, thumb: PNG.toString('base64') }, { ...CHROME_WIN, thumb: Buffer.from('<html>').toString('base64') }]));
    assert.ok(parsed);
    const [spotify, chrome] = parsed.sessions;
    assert.deepEqual({ ...spotify, thumb: undefined }, { app: 'Spotify.exe', title: 'Pszczółka Maja', artists: ['Zespół A'], album: 'Album C', status: 'paused', positionMs: 61000, durationMs: 200000, current: false, thumb: undefined });
    assert.deepEqual(spotify.thumb, PNG);
    assert.equal(chrome.thumb, undefined);
    assert.equal(chrome.status, 'playing');
    // PowerShell 5.1 may give a lone session as an object, not a list
    assert.equal(parseWindowsLine(JSON.stringify({ sessions: SPOTIFY_WIN }))?.sessions.length, 1);
    assert.deepEqual(parseWindowsLine('{"sessions":[]}'), { sessions: [] });
    assert.deepEqual(parseWindowsLine('{"error":"unsupported"}'), { sessions: [], error: 'unsupported' });
    assert.equal(parseWindowsLine('WARNING: something'), undefined);
    // control characters out, time within the track
    const odd = parseWindowsLine(winLine([{ ...SPOTIFY_WIN, title: 'A\u0000B', position: 999_999 }]))!.sessions[0];
    assert.equal(odd.title, 'A B');
    assert.equal(odd.positionMs, 200000);
  });

  it('the script for Windows: hidden, awaited through AsTask, the cover capped, gone with the launcher', () => {
    const script = windowsScript(4242);
    assert.match(script, /GlobalSystemMediaTransportControlsSessionManager/);
    assert.match(script, /IAsyncOperation`1/);
    assert.match(script, /OpenReadAsync/);
    assert.match(script, /-gt 2097152/);
    assert.match(script, /Get-Process -Id 4242/);
    // it fits a command line (Windows takes up to 32767 characters)
    assert.ok(Buffer.from(script, 'utf16le').toString('base64').length < 30_000);
  });

  it('macOS: osascript for Spotify (and Music), only for players already running', async () => {
    const out = ['playing', 'Kopalnia o świcie', 'Slash3rss', 'Lato', '61234', '200000', 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb'].join(SEP) + '\n';
    assert.deepEqual(parseOsascript('Spotify', out), {
      app: 'Spotify', title: 'Kopalnia o świcie', artists: ['Slash3rss'], album: 'Lato', status: 'playing', positionMs: 61234, durationMs: 200000,
      artUrl: 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb',
    });
    assert.equal(parseOsascript('Spotify', 'stopped\n'), undefined);
    const asked: string[][] = [];
    const sessions = await readMac(async (cmd, args) => {
      asked.push(args);
      if (args.some((a) => a.includes('is running'))) return 'Spotify \n';
      return out;
    });
    assert.equal(sessions.length, 1);
    // Music was not running: never told anything (so never started)
    assert.ok(!asked.some((a) => a.some((x) => x.includes('tell application "Music"'))));
    assert.ok(asked.some((a) => a.some((x) => x.includes('tell application "Spotify"'))));
    assert.match(macScript('Music'), /\(duration of t\) \* 1000/);
  });

  it('Linux: playerctl, and D-Bus straight when there is no playerctl', async () => {
    const line = (f: string[]) => f.join(SEP);
    const out = [
      line(['spotify', 'Playing', 'Utwór', 'A, B', 'Album', '61000000', '200000000', 'https://i.scdn.co/image/ab67616d00004851cccccccccccccccccccccccc']),
      line(['firefox', 'Paused', 'Film', '', '', '1000000', '', 'file:///tmp/firefox-mpris/cover.png']),
      line(['vlc', 'Stopped', '', '', '', '', '', '']),
    ].join('\n');
    const sessions = parsePlayerctl(out);
    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions[0], { app: 'spotify', title: 'Utwór', artists: ['A, B'], album: 'Album', status: 'playing', positionMs: 61000, durationMs: 200000, artUrl: 'https://i.scdn.co/image/ab67616d00004851cccccccccccccccccccccccc' });
    assert.equal(sessions[1].positionMs, 1000);
    assert.equal(PLAYERCTL_FORMAT.split(SEP).length, 8);

    const names = `method return time=1.2 sender=org.freedesktop.DBus -> destination=:1.80 serial=3 reply_serial=2
   array [
      string "org.freedesktop.DBus"
      string "org.mpris.MediaPlayer2.spotify"
      string ":1.7"
      string "org.mpris.MediaPlayer2.firefox.instance_1_23"
   ]`;
    assert.deepEqual(parseDbusNames(names), ['org.mpris.MediaPlayer2.spotify', 'org.mpris.MediaPlayer2.firefox.instance_1_23']);
    const player = `method return time=1.3 sender=:1.5 -> destination=:1.81 serial=9 reply_serial=2
   array [
      dict entry(
         string "PlaybackStatus"
         variant             string "Playing"
      )
      dict entry(
         string "Metadata"
         variant             array [
               dict entry(
                  string "mpris:length"
                  variant                      uint64 215000000
               )
               dict entry(
                  string "mpris:artUrl"
                  variant                      string "https://i.scdn.co/image/ab67616d00004851dddddddddddddddddddddddd"
               )
               dict entry(
                  string "xesam:album"
                  variant                      string "Płyta"
               )
               dict entry(
                  string "xesam:artist"
                  variant                      array [
                        string "Wykonawca "Cytat""
                        string "Drugi"
                     ]
               )
               dict entry(
                  string "xesam:title"
                  variant                      string "Tytuł "w cudzysłowie""
               )
            ]
      )
      dict entry(
         string "Position"
         variant             int64 12345678
      )
   ]`;
    assert.deepEqual(parseDbusPlayer('org.mpris.MediaPlayer2.spotify', player), {
      app: 'spotify', title: 'Tytuł "w cudzysłowie"', artists: ['Wykonawca "Cytat"', 'Drugi'], album: 'Płyta', status: 'playing', positionMs: 12345, durationMs: 215000,
      artUrl: 'https://i.scdn.co/image/ab67616d00004851dddddddddddddddddddddddd',
    });
    // without playerctl: the same over dbus-send
    const viaDbus = await readLinux(async (cmd, args) => {
      if (cmd === 'playerctl') throw Object.assign(new Error('spawn playerctl ENOENT'), { code: 'ENOENT' });
      return args.includes('org.freedesktop.DBus.ListNames') ? names : player;
    });
    assert.equal(viaDbus.length, 2);
    assert.equal(viaDbus[0].title, 'Tytuł "w cudzysłowie"');
    // playerctl with no player at all exits with an error: nothing plays
    assert.deepEqual(await readLinux(async () => {
      throw Object.assign(new Error('No players found'), { code: 1 });
    }), []);
  });

  it('tells Spotify, browsers and other players apart', () => {
    assert.equal(sourceOf('Spotify.exe'), 'spotify');
    assert.equal(sourceOf('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'), 'spotify');
    assert.equal(sourceOf('Chrome'), 'browser');
    assert.equal(sourceOf('MSEdge'), 'browser');
    assert.equal(sourceOf('308046B0AF4A39CB'), 'browser');
    assert.equal(sourceOf('firefox.instance_1_23'), 'browser');
    assert.equal(sourceOf('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), 'other');
    assert.equal(sourceOf('vlc'), 'other');
  });

  it('picks what plays before what is paused, Spotify before the rest; "only Spotify" leaves the rest out', () => {
    const s = (app: string, status: MediaSession['status'], current = false): MediaSession => ({ app, title: app, artists: [], album: '', status, positionMs: 0, durationMs: 0, current });
    assert.equal(pickSession([s('Spotify.exe', 'paused'), s('Chrome', 'playing', true)])?.app, 'Chrome');
    assert.equal(pickSession([s('Chrome', 'playing', true), s('Spotify.exe', 'playing')])?.app, 'Spotify.exe');
    assert.equal(pickSession([s('Spotify.exe', 'paused'), s('Chrome', 'playing', true)], true)?.app, 'Spotify.exe');
    assert.equal(pickSession([s('Chrome', 'playing')], true), undefined);
    assert.equal(pickSession([s('vlc', 'stopped')]), undefined);
    assert.equal(pickSession([]), undefined);
    assert.deepEqual(toNowPlaying({ ...s('Chrome', 'playing'), title: 'Film', artists: ['Kanał'], positionMs: 5000, durationMs: 0 }, 'not-an-id'), {
      kind: 'track', title: 'Film', artists: ['Kanał'], album: '', cover: '', durationMs: 0, progressMs: 5000, isPlaying: true, source: 'browser', app: 'Chrome',
    });
  });
});

describe('Now playing: covers', () => {
  it('keeps pictures from the system by their hash, only PNG or JPEG, not too big', async () => {
    const covers = new CoverCache(fakePng, async () => {
      throw new Error('no network in this test');
    });
    const id = covers.put(PNG);
    assert.match(id, /^[0-9a-f]{40}$/);
    assert.equal((await covers.get(id)).toString(), `png:64:${PNG.length}`);
    assert.match(covers.put(JPEG), /^[0-9a-f]{40}$/);
    assert.equal(covers.put(Buffer.from('<svg/>')), '');
    assert.equal(covers.put(Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)])), '');
    assert.equal(new CoverCache(() => Buffer.alloc(0)).put(PNG), '');
    assert.equal(CoverCache.remoteId('https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb'), 'ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(CoverCache.remoteId('https://open.spotify.com/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb'), 'ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(CoverCache.remoteId('https://evil.example/image/abcdefabcdefabcdef'), '');
    assert.equal(CoverCache.remoteId('https://i.ytimg.com/vi/x/hqdefault.jpg'), '');
  });

  it('fetches Spotify\'s own covers only from i.scdn.co, small, once each', async () => {
    const asked: string[] = [];
    let type = 'image/jpeg';
    let body = Buffer.from('jpeg-bytes');
    const covers = new CoverCache((data, size) => Buffer.from(`png:${size}:${data.toString()}`), async (url) => {
      asked.push(String(url));
      return new Response(body, { headers: { 'Content-Type': type } });
    });
    assert.equal((await covers.get('ab67616d00004851bbbbbbbbbbbbbbbb')).toString(), 'png:64:jpeg-bytes');
    await covers.get('ab67616d00004851bbbbbbbbbbbbbbbb');
    assert.deepEqual(asked, ['https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbb']);
    await assert.rejects(covers.get('../../etc/passwd'), /bad_request/);
    await assert.rejects(covers.get('ABCDEF'), /bad_request/);
    type = 'text/html';
    await assert.rejects(covers.get('cccccccccccccccccccc'), /not_an_image/);
    type = 'image/jpeg';
    body = Buffer.alloc(600 * 1024);
    await assert.rejects(covers.get('dddddddddddddddddddd'), /too_large/);
    body = Buffer.from('ok');
    assert.equal((await covers.get('dddddddddddddddddddd')).toString(), 'png:64:ok');
  });
});

/** A PowerShell that is not one: lines are written into it by the test. */
function fakeProcess() {
  const events = new EventEmitter();
  const stdout = new PassThrough();
  let killed = false;
  const proc: ReaderProcess & { say: (line: string) => void; killed: () => boolean } = {
    stdout,
    on: (event: string, cb: (...args: any[]) => void) => events.on(event, cb),
    kill: () => {
      killed = true;
      events.emit('exit', null);
    },
    say: (line) => stdout.write(line + '\n'),
    killed: () => killed,
  };
  return proc;
}

describe('Now playing: the Windows reader', () => {
  it('starts on the first ask, keeps the newest line and the cover of the current track', async () => {
    const procs: ReturnType<typeof fakeProcess>[] = [];
    const covers = new CoverCache(fakePng);
    const reader = new WindowsReader(covers, () => {
      const p = fakeProcess();
      procs.push(p);
      // the first line comes a moment after the start, half of it at a time
      setTimeout(() => {
        const line = winLine([{ ...SPOTIFY_WIN, thumb: PNG.toString('base64') }]);
        (p.stdout as PassThrough).write(line.slice(0, 20));
        p.say(line.slice(20));
      }, 20);
      return p;
    });
    const first = await reader.read();
    assert.equal(procs.length, 1);
    assert.equal(first.sessions[0].title, 'Pszczółka Maja');
    const coverId = first.covers.get(first.sessions[0]);
    assert.match(coverId!, /^[0-9a-f]{40}$/);
    // the next line has no picture (the same track): the cover stays
    procs[0].say(winLine([SPOTIFY_WIN, CHROME_WIN]));
    await new Promise((r) => setTimeout(r, 10));
    const second = await reader.read();
    assert.equal(procs.length, 1);
    assert.equal(second.sessions.length, 2);
    assert.equal(second.covers.get(second.sessions[0]), coverId);
    assert.equal(second.covers.get(second.sessions[1]), undefined);
    // a new track without its picture yet: no old cover on it
    procs[0].say(winLine([{ ...SPOTIFY_WIN, title: 'Następny' }]));
    await new Promise((r) => setTimeout(r, 10));
    const third = await reader.read();
    assert.equal(third.covers.size, 0);
    reader.stop();
    assert.ok(procs[0].killed());
    assert.equal(reader.running, false);
  });

  it('a reader that cannot start (or dies) is tried again only after a while', async () => {
    let clock = 0;
    let starts = 0;
    const reader = new WindowsReader(new CoverCache(fakePng), () => {
      starts++;
      throw new Error('spawn powershell.exe ENOENT');
    }, () => clock);
    assert.deepEqual((await reader.read(10)).sessions, []);
    await reader.read(10);
    assert.equal(starts, 1);
    clock = 31_000;
    await reader.read(10);
    assert.equal(starts, 2);
  });

  it('answers as older games read it, and stops reading once the game stops asking', async () => {
    const proc = fakeProcess();
    const covers = new CoverCache(fakePng);
    const windows = new WindowsReader(covers, () => {
      setTimeout(() => proc.say(winLine([{ ...SPOTIFY_WIN, thumb: PNG.toString('base64') }, CHROME_WIN])), 5);
      return proc;
    });
    const reader = new NowPlayingReader({ covers, platform: 'win32', windows, idleMs: 60 });
    const answer = await reader.get();
    assert.equal(answer.available, true);
    assert.equal(answer.linked, true);
    assert.equal(answer.playing?.title, 'Lofi na YouTube');
    assert.equal(answer.playing?.source, 'browser');
    const only = await reader.get(true);
    assert.equal(only.playing?.title, 'Pszczółka Maja');
    assert.equal(only.playing?.source, 'spotify');
    assert.equal(only.playing?.isPlaying, false);
    assert.match(only.playing!.cover, /^[0-9a-f]{40}$/);
    assert.equal(reader.reading, true);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(reader.reading, false);
    assert.ok(proc.killed());
    reader.stop();
  });

  it('nothing playing: the module is told so cleanly', async () => {
    const proc = fakeProcess();
    const covers = new CoverCache(fakePng);
    const reader = new NowPlayingReader({
      covers, platform: 'win32', windows: new WindowsReader(covers, () => {
        setTimeout(() => proc.say('{"sessions":[]}'), 5);
        return proc;
      }),
    });
    assert.deepEqual(await reader.get(), { available: true, linked: true, playing: null });
    reader.stop();
  });
});

describe('Now playing: macOS and Linux readers', () => {
  it('Spotify\'s covers by their id on i.scdn.co, local ones read from the file, other hosts left out', async () => {
    let clock = 0;
    let reads = 0;
    const covers = new CoverCache(fakePng);
    const mac = new NowPlayingReader({
      covers, platform: 'darwin', now: () => clock, readMac: async () => {
        reads++;
        return [{ app: 'Spotify', title: 'A', artists: ['B'], album: 'C', status: 'playing', positionMs: 1000, durationMs: 2000, artUrl: 'https://i.scdn.co/image/ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb' }];
      },
    });
    assert.equal((await mac.get()).playing?.cover, 'ab67616d00004851bbbbbbbbbbbbbbbbbbbbbbbb');
    // asked at most every two seconds
    await mac.get();
    assert.equal(reads, 1);
    clock = 2500;
    await mac.get();
    assert.equal(reads, 2);

    const files: string[] = [];
    const linux = new NowPlayingReader({
      covers, platform: 'linux',
      readFile: async (file) => {
        files.push(file);
        return file.endsWith('cover.png') ? PNG : Buffer.from('not a picture');
      },
      readLinux: async () => [
        { app: 'firefox', title: 'Film', artists: [], album: '', status: 'playing', positionMs: 0, durationMs: 0, artUrl: 'file:///tmp/firefox-mpris/cover.png' },
        { app: 'vlc', title: 'Plik', artists: [], album: '', status: 'paused', positionMs: 0, durationMs: 0, artUrl: 'https://example.com/a.jpg' },
      ],
    });
    const answer = await linux.get();
    assert.equal(answer.playing?.title, 'Film');
    assert.match(answer.playing!.cover, /^[0-9a-f]{40}$/);
    assert.equal(files.length, 1);
    assert.equal(answer.playing?.source, 'browser');

    const other = new NowPlayingReader({ covers, platform: 'freebsd' as NodeJS.Platform });
    assert.deepEqual(await other.get(), { available: true, linked: true, playing: null, error: 'unsupported' });
  });
});

describe('Now playing: the bridge', () => {
  it('serves what plays (all players, or only Spotify) and the covers, with the game\'s key only', async () => {
    const asked: boolean[] = [];
    const bridge = new GameBridge({
      call: async () => ({}), state: () => ({ signedIn: true }),
      spotifyNow: async (onlySpotify) => {
        asked.push(onlySpotify);
        return { available: true, linked: true, playing: toNowPlaying({ app: 'Spotify.exe', title: 'Pszczółka Maja', artists: ['Zespół A'], album: 'Album C', status: 'playing', positionMs: 61_000, durationMs: 200_000 }, 'ab67616d00004851bbbbbbbbbbbbbbbb') };
      },
      spotifyCover: async (id) => {
        if (id !== 'ab67616d00004851bbbbbbbbbbbbbbbb') throw new Error('not_an_image');
        return PNG;
      },
    });
    const { url, key } = await bridge.start();
    const req = (path: string, k = key) => fetch(url + path, { headers: { Authorization: `Bearer ${k}` } });
    try {
      assert.equal((await req('/spotify/now', 'wrong')).status, 401);
      const now = await (await req('/spotify/now')).json();
      // the shape games since 0.9.36 read, plus where it plays
      assert.deepEqual(now, {
        available: true, linked: true,
        playing: { kind: 'track', title: 'Pszczółka Maja', artists: ['Zespół A'], album: 'Album C', cover: 'ab67616d00004851bbbbbbbbbbbbbbbb', durationMs: 200_000, progressMs: 61_000, isPlaying: true, source: 'spotify', app: 'Spotify.exe' },
      });
      await req('/spotify/now?only=spotify');
      assert.deepEqual(asked, [false, true]);
      const cover = await req('/spotify/cover/ab67616d00004851bbbbbbbbbbbbbbbb');
      assert.equal(cover.status, 200);
      assert.equal(cover.headers.get('content-type'), 'image/png');
      assert.equal((await req('/spotify/cover/cccccccccccccccccccc')).status, 404);
      assert.equal((await req('/spotify/cover/..%2F..%2Fetc')).status, 403);
      // the server's old Spotify routes are not open to the game
      assert.equal((await req('/v1/me/spotify/now')).status, 403);
    } finally {
      bridge.stop();
    }
  });
});
