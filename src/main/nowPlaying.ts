import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';

/**
 * "Now playing" for the game's module (id "spotify", HUD 0.9.36+): what plays on this computer,
 * read from the operating system, with no account and no server. The game asks the bridge
 * (/spotify/now) only while its module is on; the launcher reads the system only while the game
 * asks, and stops a little after it stops asking.
 *
 * - Windows: the media controls every player reports to the system (the volume flyout): Spotify,
 *   browsers (YouTube, SoundCloud…), the Media Player. One hidden PowerShell runs while the game
 *   asks and prints what plays each second; the cover comes along as a picture once per track.
 * - macOS: the Spotify app (and Music) asked with osascript, only when it is already running, so
 *   neither is ever started by this.
 * - Linux: MPRIS players (Spotify, browsers, VLC…) via playerctl, or straight over D-Bus.
 *
 * Covers reach the game as 64×64 PNGs by an id (/spotify/cover/<id>): a picture from the system is
 * kept here by its hash, Spotify's own (i.scdn.co, macOS and Linux) is fetched from there only.
 * Spotify Connect playback on another device (a phone, a speaker) is not on this computer and is
 * not seen.
 */

export type Source = 'spotify' | 'browser' | 'other';

/** One player as the system reports it. */
export interface MediaSession {
  /** The player: an app id on Windows ("Spotify.exe", "Chrome"…), the app on macOS, the MPRIS name on Linux. */
  app: string;
  title: string;
  artists: string[];
  album: string;
  status: 'playing' | 'paused' | 'stopped';
  positionMs: number;
  durationMs: number;
  /** Windows: the session the system itself counts as current. */
  current?: boolean;
  /** The cover: a picture's bytes (Windows), a file (Linux) or an address (macOS, Linux). */
  thumb?: Buffer;
  artUrl?: string;
}

/** What plays, as the game gets it (the shape the game has read since 0.9.36, plus `source` and `app`). */
export interface NowPlaying {
  kind: 'track' | 'episode';
  title: string;
  artists: string[];
  album: string;
  /** The cover's id for /spotify/cover/<id> ('' when there is none). */
  cover: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  source: Source;
  app: string;
}

export interface NowAnswer {
  /** Always true: older games hide the module without it. */
  available: boolean;
  /** Always true: older games ask the player to link Spotify without it. */
  linked: boolean;
  playing: NowPlaying | null;
  /** Why nothing can be read: 'unsupported' (no media controls on this system). */
  error?: string;
}

export const COVER_ID = /^[0-9a-f]{16,64}$/;
/** Spotify's own image host (macOS and Linux Spotify give covers there); older Spotify on Linux said open.spotify.com. */
const SPOTIFY_COVER = /^https:\/\/(?:i\.scdn\.co|open\.spotify\.com)\/image\/([0-9a-f]{16,64})$/;
const MAX_COVER_BYTES = 512 * 1024;
/** A picture from the system (a browser's may be a big video frame); it leaves as a 64×64 PNG. */
const MAX_LOCAL_COVER_BYTES = 2 * 1024 * 1024;
export const COVER_SIZE = 64;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const ms = (v: unknown) => Math.max(0, Math.min(24 * 3600_000, Math.floor(Number(v) || 0)));
const status = (v: unknown): MediaSession['status'] => {
  const s = String(v ?? '').toLowerCase();
  return s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'stopped';
};

/** Whose player it is: Spotify (desktop app or its MPRIS name), a web browser, or anything else. */
export function sourceOf(app: string): Source {
  const a = app.toLowerCase();
  if (/spotify/.test(a)) return 'spotify';
  // Firefox's id on Windows is a hash of its install folder; 308046B0AF4A39CB is the usual one
  if (/chrome|chromium|msedge|edge|firefox|308046b0af4a39cb|opera|brave|vivaldi|safari|yandex|arc\b|zen|librewolf|floorp|thorium|browser/.test(a)) return 'browser';
  return 'other';
}

const isImage = (b: Buffer) => (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff);

// ---------- what each system says ----------

/** A line of the Windows reader (the PowerShell below): every player with media controls. */
export function parseWindowsLine(line: string): { sessions: MediaSession[]; error?: string } | undefined {
  let raw: any;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.error === 'string') return { sessions: [], error: text(raw.error, 40) };
  const list = Array.isArray(raw.sessions) ? raw.sessions : raw.sessions && typeof raw.sessions === 'object' ? [raw.sessions] : [];
  const sessions: MediaSession[] = [];
  for (const s of list.slice(0, 16)) {
    if (!s || typeof s !== 'object') continue;
    const durationMs = ms(s.duration);
    const session: MediaSession = {
      app: text(s.app, 200), title: text(s.title, 200), artists: [text(s.artist, 200)].filter(Boolean), album: text(s.album, 200),
      status: status(s.status), positionMs: Math.min(durationMs || Infinity, ms(s.position)), durationMs, current: s.current === true,
    };
    if (typeof s.thumb === 'string' && s.thumb.length <= Math.ceil(MAX_LOCAL_COVER_BYTES / 3) * 4) {
      const bytes = Buffer.from(s.thumb, 'base64');
      if (isImage(bytes)) session.thumb = bytes;
    }
    sessions.push(session);
  }
  return { sessions };
}

/** The unit separator between osascript's fields (no title has it). */
export const SEP = '\u001f';

/**
 * osascript's answer for one player (the scripts in macScript): "state␟title␟artist␟album␟position
 * ms␟duration␟artwork url". Spotify gives its duration in ms, Music in seconds (asked ×1000 there).
 */
export function parseOsascript(app: string, out: string): MediaSession | undefined {
  const f = out.replace(/\r?\n$/, '').split(SEP);
  if (f.length < 6) return undefined;
  const durationMs = ms(f[5]);
  const title = text(f[1], 200);
  if (!title) return undefined;
  return {
    app, title, artists: [text(f[2], 200)].filter(Boolean), album: text(f[3], 200), status: status(f[0]),
    positionMs: Math.min(durationMs || Infinity, ms(f[4])), durationMs, artUrl: text(f[6], 500) || undefined,
  };
}

/** The format asked of playerctl: one line per player, fields split by SEP. */
export const PLAYERCTL_FORMAT = ['{{playerName}}', '{{status}}', '{{xesam:title}}', '{{xesam:artist}}', '{{xesam:album}}', '{{position}}', '{{mpris:length}}', '{{mpris:artUrl}}'].join(SEP);

/** `playerctl -a metadata --format …`: MPRIS times are in microseconds. */
export function parsePlayerctl(out: string): MediaSession[] {
  const sessions: MediaSession[] = [];
  for (const line of out.split(/\r?\n/)) {
    const f = line.split(SEP);
    if (f.length < 8 || !text(f[2], 200)) continue;
    const durationMs = ms(Number(f[6]) / 1000);
    sessions.push({
      app: text(f[0], 200), title: text(f[2], 200), artists: [text(f[3], 200)].filter(Boolean), album: text(f[4], 200), status: status(f[1]),
      positionMs: Math.min(durationMs || Infinity, ms(Number(f[5]) / 1000)), durationMs, artUrl: text(f[7], 1000) || undefined,
    });
  }
  return sessions.slice(0, 16);
}

/** The MPRIS players among D-Bus names (dbus-send … ListNames). */
export function parseDbusNames(out: string): string[] {
  return [...out.matchAll(/string "(org\.mpris\.MediaPlayer2\.[\w.-]{1,200})"/g)].map((m) => m[1]).slice(0, 16);
}

/** dbus-send's GetAll of org.mpris.MediaPlayer2.Player for one player. */
export function parseDbusPlayer(name: string, out: string): MediaSession | undefined {
  const str = (key: string) => new RegExp(`string "${key.replace(/[.:]/g, '\\$&')}"\\s*\\n\\s*variant\\s+string "(.*)"\\s*$`, 'm').exec(out)?.[1] ?? '';
  const num = (key: string) => Number(new RegExp(`string "${key.replace(/[.:]/g, '\\$&')}"\\s*\\n\\s*variant\\s+(?:u?int(?:16|32|64)|double)\\s+(-?[\\d.]+)`, 'm').exec(out)?.[1] ?? 0);
  const title = text(str('xesam:title'), 200);
  if (!title) return undefined;
  const artistBlock = /string "xesam:artist"\s*\n\s*variant\s+array \[([\s\S]*?)\]/.exec(out)?.[1] ?? '';
  const artists = [...artistBlock.matchAll(/string "(.*)"\s*$/gm)].map((m) => text(m[1], 200)).filter(Boolean).slice(0, 8);
  const durationMs = ms(num('mpris:length') / 1000);
  return {
    app: name.replace(/^org\.mpris\.MediaPlayer2\./, ''), title, artists, album: text(str('xesam:album'), 200), status: status(str('PlaybackStatus')),
    positionMs: Math.min(durationMs || Infinity, ms(num('Position') / 1000)), durationMs, artUrl: text(str('mpris:artUrl'), 1000) || undefined,
  };
}

/**
 * The one to show: something playing before something paused, Spotify before the rest, then the
 * system's own current one. With `onlySpotify` the rest are not looked at.
 */
export function pickSession(sessions: MediaSession[], onlySpotify = false): MediaSession | undefined {
  const rank = (s: MediaSession) => (s.status === 'playing' ? 0 : 4) + (sourceOf(s.app) === 'spotify' ? 0 : 2) + (s.current ? 0 : 1);
  return sessions
    .filter((s) => s.title && s.status !== 'stopped' && (!onlySpotify || sourceOf(s.app) === 'spotify'))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)[0]?.s;
}

/** A player as the game's answer, the cover given by its id. */
export function toNowPlaying(s: MediaSession, cover = ''): NowPlaying {
  return {
    kind: 'track', title: text(s.title, 200), artists: s.artists.map((a) => text(a, 100)).filter(Boolean).slice(0, 8), album: text(s.album, 200),
    cover: COVER_ID.test(cover) ? cover : '', durationMs: s.durationMs, progressMs: Math.min(s.durationMs || Infinity, s.positionMs),
    isPlaying: s.status === 'playing', source: sourceOf(s.app), app: text(s.app, 80),
  };
}

// ---------- covers ----------

/**
 * Covers as 64×64 PNGs by id: pictures from the system kept by their hash (`put`), Spotify's own
 * fetched from i.scdn.co only (small; a JPEG or a PNG), the last few kept. `toPng` decodes and
 * scales (Electron's nativeImage).
 */
export class CoverCache {
  private readonly kept = new Map<string, Promise<Buffer>>();
  constructor(
    private readonly toPng: (data: Buffer, size: number) => Buffer,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly keep = 16,
  ) {}

  /** A picture from the system (PNG or JPEG, not too big); its id, or '' when it is not one. */
  put(data: Buffer): string {
    if (!data.length || data.length > MAX_LOCAL_COVER_BYTES || !isImage(data)) return '';
    const id = createHash('sha1').update(data).digest('hex');
    if (this.kept.has(id)) return id;
    let png: Buffer;
    try {
      png = this.toPng(data, COVER_SIZE);
    } catch {
      return '';
    }
    if (!png.length) return '';
    this.remember(id, Promise.resolve(png));
    return id;
  }

  /** The id of a cover on Spotify's own host ('' for any other address). */
  static remoteId(url: string | undefined): string {
    return SPOTIFY_COVER.exec(url ?? '')?.[1] ?? '';
  }

  get(id: string): Promise<Buffer> {
    if (!COVER_ID.test(id)) return Promise.reject(new Error('bad_request'));
    let found = this.kept.get(id);
    if (found) {
      this.kept.delete(id);
      this.kept.set(id, found);
      return found;
    }
    found = this.download(id);
    // a failed one is tried again next time
    found.catch(() => this.kept.delete(id));
    this.remember(id, found);
    return found;
  }

  private remember(id: string, png: Promise<Buffer>) {
    this.kept.set(id, png);
    while (this.kept.size > this.keep) this.kept.delete(this.kept.keys().next().value!);
  }

  private async download(id: string): Promise<Buffer> {
    const res = await this.fetchImpl(`https://i.scdn.co/image/${id}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png)$/.test(type.split(';')[0].trim())) throw new Error('not_an_image');
    if (Number(res.headers.get('content-length') ?? 0) > MAX_COVER_BYTES) throw new Error('too_large');
    // read with a cap: a server that lies about its length is cut off
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error('not_an_image');
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_COVER_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('too_large');
      }
      chunks.push(value);
    }
    const png = this.toPng(Buffer.concat(chunks), COVER_SIZE);
    if (!png.length) throw new Error('not_an_image');
    return png;
  }
}

// ---------- Windows: the media controls through one hidden PowerShell ----------

/**
 * Prints every player's track once a second as one JSON line; a cover (base64) only when the
 * track is new (and again shortly after, as players often set the picture a moment later).
 * Leaves on its own when the launcher is gone. Windows PowerShell 5.1: WinRT calls are awaited
 * through AsTask.
 */
export function windowsScript(parentPid: number): string {
  return String.raw`
$ErrorActionPreference = 'Stop'
$out = [Console]::OpenStandardOutput()
$utf8 = New-Object System.Text.UTF8Encoding $false
function Say([string]$line) {
  $bytes = $utf8.GetBytes($line + [char]10)
  $out.Write($bytes, 0, $bytes.Length)
  $out.Flush()
}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' })[0]
  function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    if (-not $task.Wait(5000)) { throw 'timeout' }
    $task.Result
  }
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  try { Say '{"error":"unsupported"}' } catch {}
  exit 2
}
function Thumb($ref) {
  if ($null -eq $ref) { return $null }
  $stream = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  # through the .NET wrapper, read with a cap: PowerShell sees no members on the WinRT stream, so the
  # wrapper is made by reflection (which asks the object for the interface itself)
  $net = $asStream.Invoke($null, @($stream))
  try {
    $mem = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 65536
    while (($n = $net.Read($buf, 0, $buf.Length)) -gt 0) {
      $mem.Write($buf, 0, $n)
      if ($mem.Length -gt ${MAX_LOCAL_COVER_BYTES}) { return $null }
    }
    if ($mem.Length -eq 0) { return $null }
    return [Convert]::ToBase64String($mem.ToArray())
  } finally { $net.Dispose() }
}
$seen = @{}
$tick = 0
while ($true) {
  $list = New-Object System.Collections.ArrayList
  try {
    $current = $manager.GetCurrentSession()
    $currentId = if ($null -ne $current) { $current.SourceAppUserModelId } else { '' }
    foreach ($s in $manager.GetSessions()) {
      try {
        $app = [string]$s.SourceAppUserModelId
        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $state = [string]$s.GetPlaybackInfo().PlaybackStatus
        $tl = $s.GetTimelineProperties()
        $dur = ($tl.EndTime - $tl.StartTime).TotalMilliseconds
        $pos = ($tl.Position - $tl.StartTime).TotalMilliseconds
        if ($state -eq 'Playing' -and $tl.LastUpdatedTime.Year -gt 2000) {
          $late = ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalMilliseconds
          if ($late -gt 0 -and $late -lt 86400000) { $pos += $late }
        }
        $artist = [string]$p.Artist
        if (-not $artist) { $artist = [string]$p.AlbumArtist }
        $o = [ordered]@{ app = $app; title = [string]$p.Title; artist = $artist; album = [string]$p.AlbumTitle; status = $state; position = [int64][Math]::Max(0, $pos); duration = [int64][Math]::Max(0, $dur); current = ($app -eq $currentId) }
        $key = "$app|$($p.Title)|$artist|$($p.AlbumTitle)"
        $st = $seen[$app]
        if ($null -eq $st -or $st.key -ne $key) { $st = @{ key = $key; tries = 0; thumb = '' }; $seen[$app] = $st }
        if ($p.Title -and @(0, 1, 3, 6) -contains $st.tries) {
          try {
            $b64 = Thumb $p.Thumbnail
            if ($b64 -and $b64 -ne $st.thumb) { $st.thumb = $b64; $o.thumb = $b64 }
          } catch {}
        }
        $st.tries++
        [void]$list.Add($o)
      } catch {}
    }
  } catch {}
  $json = ConvertTo-Json -InputObject @{ sessions = @($list) } -Compress -Depth 4
  try { Say $json } catch { exit 0 }
  $tick++
  if ($tick % 10 -eq 0 -and -not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { exit 0 }
  Start-Sleep -Milliseconds 1000
}
`;
}

/** What the Windows reader needs of a child process (tests give a fake one). */
export interface ReaderProcess {
  stdout: NodeJS.ReadableStream | null;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  kill(): unknown;
}

export function spawnWindowsReader(): ReaderProcess {
  const encoded = Buffer.from(windowsScript(process.pid), 'utf16le').toString('base64');
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * The long-lived PowerShell: started on the first ask, its newest line kept; stopped by `stop`.
 * A reader that died is started again at most every 30 s.
 */
export class WindowsReader {
  private proc?: ReaderProcess;
  private sessions: MediaSession[] = [];
  private error?: string;
  private gotLine = false;
  private waiters: (() => void)[] = [];
  private failedAt = -Infinity;
  /** The cover's id per player, for its current track (the picture comes only when the track changes). */
  private readonly coverOf = new Map<string, { key: string; id: string }>();

  constructor(private readonly covers: CoverCache, private readonly start: () => ReaderProcess = spawnWindowsReader, private readonly now: () => number = Date.now) {}

  get running(): boolean {
    return !!this.proc;
  }

  /** What plays now (waits up to `waitMs` for a just-started reader's first line). */
  async read(waitMs = 3000): Promise<{ sessions: MediaSession[]; covers: Map<MediaSession, string>; error?: string }> {
    if (!this.proc && this.now() - this.failedAt >= 30_000) this.launch();
    if (this.proc && !this.gotLine) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitMs);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    const covers = new Map<MediaSession, string>();
    for (const s of this.sessions) {
      const c = this.coverOf.get(s.app);
      if (c && c.key === trackKey(s)) covers.set(s, c.id);
    }
    return { sessions: this.sessions, covers, error: this.error };
  }

  private launch() {
    let proc: ReaderProcess;
    try {
      proc = this.start();
    } catch {
      this.failedAt = this.now();
      return;
    }
    this.proc = proc;
    this.gotLine = false;
    let buffer = '';
    proc.stdout?.setEncoding?.('utf8');
    proc.stdout?.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString();
      // a line is at most a few MB (a cover); anything bigger is not ours
      if (buffer.length > 8 * 1024 * 1024) buffer = '';
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) this.take(line);
      }
    });
    const gone = () => {
      if (this.proc !== proc) return;
      this.proc = undefined;
      this.failedAt = this.now();
      this.sessions = [];
      this.wake();
    };
    proc.on('exit', gone);
    proc.on('error', gone);
  }

  private take(line: string) {
    const parsed = parseWindowsLine(line);
    if (!parsed) return;
    this.error = parsed.error;
    for (const s of parsed.sessions) {
      if (!s.thumb) continue;
      const id = this.covers.put(s.thumb);
      if (id) this.coverOf.set(s.app, { key: trackKey(s), id });
      delete s.thumb;
    }
    this.sessions = parsed.sessions;
    this.gotLine = true;
    this.wake();
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  stop() {
    const proc = this.proc;
    this.proc = undefined;
    this.sessions = [];
    this.gotLine = false;
    this.coverOf.clear();
    try {
      proc?.kill();
    } catch {
      // already gone
    }
    this.wake();
  }
}

const trackKey = (s: MediaSession) => `${s.title}|${s.artists.join(', ')}|${s.album}`;

// ---------- macOS and Linux: a command per ask ----------

export type Run = (cmd: string, args: string[]) => Promise<string>;

const runFile: Run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { timeout: 4000, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
});

/** osascript for one player; asked only when it already runs. */
export function macScript(app: 'Spotify' | 'Music'): string {
  const duration = app === 'Spotify' ? '(duration of t)' : '((duration of t) * 1000) as integer';
  const art = app === 'Spotify' ? '(artwork url of t)' : '""';
  return `tell application "${app}"
  set s to player state as string
  if s is "stopped" then return "stopped"
  set t to current track
  set sep to character id 31
  return s & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (((player position) * 1000) as integer) & sep & ${duration} & sep & ${art}
end tell`;
}

/** Spotify (and Music) on macOS: which runs is asked first, so neither is ever started. */
export async function readMac(run: Run = runFile): Promise<MediaSession[]> {
  const running = await run('osascript', ['-e', 'set r to ""', '-e', 'if application "Spotify" is running then set r to r & "Spotify "', '-e', 'if application "Music" is running then set r to r & "Music "', '-e', 'return r']);
  const sessions: MediaSession[] = [];
  for (const app of ['Spotify', 'Music'] as const) {
    if (!running.split(/\s+/).includes(app)) continue;
    try {
      const s = parseOsascript(app, await run('osascript', ['-e', macScript(app)]));
      if (s) sessions.push(s);
    } catch {
      // a player that just quit, or one that will not answer
    }
  }
  return sessions;
}

/** MPRIS on Linux: playerctl when it is installed, else the same over D-Bus with dbus-send. */
export async function readLinux(run: Run = runFile): Promise<MediaSession[]> {
  try {
    return parsePlayerctl(await run('playerctl', ['-a', 'metadata', '--format', PLAYERCTL_FORMAT]));
  } catch (err) {
    // playerctl exits with an error when no player runs: nothing plays then
    if ((err as { code?: unknown }).code !== 'ENOENT') return [];
  }
  const names = parseDbusNames(await run('dbus-send', ['--session', '--dest=org.freedesktop.DBus', '--type=method_call', '--print-reply', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames']));
  const sessions: MediaSession[] = [];
  for (const name of names) {
    try {
      const s = parseDbusPlayer(name, await run('dbus-send', ['--session', `--dest=${name}`, '--type=method_call', '--print-reply', '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties.GetAll', 'string:org.mpris.MediaPlayer2.Player']));
      if (s) sessions.push(s);
    } catch {
      // a player that just quit
    }
  }
  return sessions;
}

/** A local picture a player points at (file://, Linux browsers and VLC), read with a cap. */
export async function readLocalCover(url: string, readFile: (file: string) => Promise<Buffer> = defaultReadFile): Promise<Buffer | undefined> {
  if (!url.startsWith('file://')) return undefined;
  try {
    // a path on this computer only (no host); read as the players on Linux write it
    const parsed = new URL(url);
    if (parsed.host && parsed.host !== 'localhost') return undefined;
    const data = await readFile(decodeURIComponent(parsed.pathname));
    return data.length <= MAX_LOCAL_COVER_BYTES && isImage(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

async function defaultReadFile(file: string): Promise<Buffer> {
  const handle = await fsp.open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size > MAX_LOCAL_COVER_BYTES) return Buffer.alloc(0);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

// ---------- the whole: what the bridge answers ----------

export interface NowPlayingOptions {
  covers: CoverCache;
  platform?: NodeJS.Platform;
  windows?: WindowsReader;
  readMac?: () => Promise<MediaSession[]>;
  readLinux?: () => Promise<MediaSession[]>;
  readFile?: (file: string) => Promise<Buffer>;
  now?: () => number;
  /** How long the reader stays after the game's last ask. */
  idleMs?: number;
  /** macOS and Linux: the system asked at most this often (asks between get the same answer). */
  minMs?: number;
}

/** What plays on this computer, for the bridge: read while the game asks, stopped after it stops. */
export class NowPlayingReader {
  private readonly platform: NodeJS.Platform;
  private readonly windows?: WindowsReader;
  private readonly now: () => number;
  private lastAsk = 0;
  private idleTimer?: ReturnType<typeof setInterval>;
  private cached?: { at: number; sessions: MediaSession[]; covers: Map<MediaSession, string>; error?: string };
  private pending?: Promise<NonNullable<NowPlayingReader['cached']>>;

  constructor(private readonly opts: NowPlayingOptions) {
    this.platform = opts.platform ?? process.platform;
    this.now = opts.now ?? Date.now;
    if (this.platform === 'win32') this.windows = opts.windows ?? new WindowsReader(opts.covers);
  }

  async get(onlySpotify = false): Promise<NowAnswer> {
    this.lastAsk = this.now();
    this.watchIdle();
    let read: { sessions: MediaSession[]; covers: Map<MediaSession, string>; error?: string };
    try {
      read = this.windows ? await this.windows.read() : await this.readOther();
    } catch {
      read = { sessions: [], covers: new Map() };
    }
    const picked = pickSession(read.sessions, onlySpotify);
    return {
      available: true, linked: true, playing: picked ? toNowPlaying(picked, read.covers.get(picked) ?? '') : null,
      ...(read.error ? { error: read.error } : {}),
    };
  }

  private readOther() {
    if (this.cached && this.now() - this.cached.at < (this.opts.minMs ?? 2000)) return Promise.resolve(this.cached);
    this.pending ??= this.readOnce().then((r) => {
      this.cached = r;
      return r;
    }).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async readOnce() {
    const at = this.now();
    const read = this.platform === 'darwin' ? this.opts.readMac ?? (() => readMac()) : this.platform === 'linux' ? this.opts.readLinux ?? (() => readLinux()) : undefined;
    if (!read) return { at, sessions: [], covers: new Map<MediaSession, string>(), error: 'unsupported' };
    const sessions = await read().catch(() => []);
    const covers = new Map<MediaSession, string>();
    for (const s of sessions) {
      const remote = CoverCache.remoteId(s.artUrl);
      if (remote) covers.set(s, remote);
      else if (s.artUrl?.startsWith('file://')) {
        const data = await readLocalCover(s.artUrl, this.opts.readFile);
        const id = data ? this.opts.covers.put(data) : '';
        if (id) covers.set(s, id);
      }
    }
    return { at, sessions, covers };
  }

  /** The Windows reader goes when the game has not asked for a while (the module off, the game closed). */
  private watchIdle() {
    if (!this.windows || this.idleTimer) return;
    const idleMs = this.opts.idleMs ?? 30_000;
    this.idleTimer = setInterval(() => {
      if (this.now() - this.lastAsk < idleMs) return;
      this.stop();
    }, Math.min(5000, idleMs));
    this.idleTimer.unref?.();
  }

  get reading(): boolean {
    return !!this.windows?.running;
  }

  stop() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = undefined;
    this.windows?.stop();
  }
}
