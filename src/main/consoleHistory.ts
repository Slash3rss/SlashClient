import { createWriteStream, type WriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The console's history: each game session's log is kept on disk (the last KEEP per profile), so
 * the Play screen can show an earlier session's console after the game has closed. One file per
 * session (<start>.log) and a few words about how it ended (<start>.json).
 */

export interface ConsoleSession { id: string; start: number; end: number; code: number | null; crashed: boolean }

const KEEP = 10;

export class ConsoleHistory {
  constructor(private root: string) {}

  private dir(profileId: string): string {
    if (!/^[\w-]{1,64}$/.test(profileId)) throw new Error('bad_profile');
    return path.join(this.root, profileId);
  }

  /** Starts writing a session; `end` closes it, notes how it ended and drops the oldest past KEEP. */
  async start(profileId: string, start: number): Promise<{ line: (text: string) => void; end: (code: number | null, crashed: boolean) => Promise<void> }> {
    const dir = this.dir(profileId);
    await fs.mkdir(dir, { recursive: true });
    const out: WriteStream = createWriteStream(path.join(dir, `${start}.log`), { flags: 'a' });
    out.on('error', () => {});
    return {
      line: (text) => void out.write(`${text}\n`),
      end: async (code, crashed) => {
        await new Promise<void>((resolve) => out.end(resolve));
        const info: ConsoleSession = { id: String(start), start, end: Date.now(), code, crashed };
        await fs.writeFile(path.join(dir, `${start}.json`), JSON.stringify(info)).catch(() => {});
        await this.prune(profileId);
      },
    };
  }

  /** A profile's past sessions, newest first. */
  async list(profileId: string): Promise<ConsoleSession[]> {
    const dir = this.dir(profileId);
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const sessions: ConsoleSession[] = [];
    for (const f of files) {
      const m = /^(\d+)\.log$/.exec(f);
      if (!m) continue;
      const info = await fs.readFile(path.join(dir, `${m[1]}.json`), 'utf8').then((t) => JSON.parse(t) as ConsoleSession).catch(() => undefined);
      // a session without its note ended with the launcher (it closed or crashed first)
      sessions.push(info ?? { id: m[1], start: Number(m[1]), end: Number(m[1]), code: null, crashed: false });
    }
    return sessions.sort((a, b) => b.start - a.start);
  }

  /** One past session's lines. */
  async read(profileId: string, id: string): Promise<string> {
    if (!/^\d{1,16}$/.test(id)) throw new Error('bad_session');
    return fs.readFile(path.join(this.dir(profileId), `${id}.log`), 'utf8').catch(() => '');
  }

  private async prune(profileId: string) {
    const dir = this.dir(profileId);
    for (const old of (await this.list(profileId)).slice(KEEP)) {
      await fs.rm(path.join(dir, `${old.id}.log`), { force: true });
      await fs.rm(path.join(dir, `${old.id}.json`), { force: true });
    }
  }

  /** When a profile is deleted. */
  async forget(profileId: string) {
    await fs.rm(this.dir(profileId), { recursive: true, force: true });
  }
}
