import fs from 'node:fs/promises';
import path from 'node:path';
import { partOn, presetOptions, type PerfPreset } from '../shared/perfPresets';

/**
 * A preset for slower computers on a profile's game settings (options.txt), when it is picked or changed:
 * the settings it changes are written, and what they were before is kept (.slashclient/perf-preset.json),
 * so switching the preset off (or to another) puts the player's own back. Between changes the game's
 * settings are the player's: what they change in the game stays.
 */

interface Applied {
  /** The preset written last ("off": none). */
  preset: PerfPreset;
  /** The settings it changed, as they were before. */
  before: Record<string, string>;
  /** The settings it added that the file did not have (the game's defaults then): taken out again. */
  added?: string[];
}

const stateFile = (gameDir: string) => path.join(gameDir, '.slashclient', 'perf-preset.json');

/** options.txt's lines as key → value. */
function parse(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) out.set(line.slice(0, at), line.slice(at + 1));
  }
  return out;
}

/** The text with these keys set (changed in place, new ones at the end) and `remove` taken out. */
export function withOptions(text: string, values: Record<string, string>, remove: string[] = []): string {
  const left = new Map(Object.entries(values));
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf(':');
    const key = at > 0 ? line.slice(0, at) : '';
    if (key && remove.includes(key) && !left.has(key)) continue;
    if (!left.has(key)) {
      lines.push(line);
      continue;
    }
    lines.push(`${key}:${left.get(key)}`);
    left.delete(key);
  }
  while (lines.length && lines.at(-1) === '') lines.pop();
  for (const [key, value] of left) lines.push(`${key}:${value}`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * Before a launch: the profile's preset (with its graphics part on) written into options.txt when it is
 * not the one written last; the one before taken back first. Returns whether anything changed.
 */
export async function applyPerfPreset(gameDir: string, preset: PerfPreset | undefined, off: string[] | undefined): Promise<boolean> {
  const wanted: PerfPreset = partOn(preset, off, 'graphics') ? preset! : 'off';
  const file = stateFile(gameDir);
  const applied: Applied = await fs.readFile(file, 'utf8').then((t) => JSON.parse(t) as Applied, () => ({ preset: 'off', before: {} }));
  if (applied.preset === wanted) return false;
  const optionsPath = path.join(gameDir, 'options.txt');
  // the player's own settings back from the preset written before
  let text = withOptions(await fs.readFile(optionsPath, 'utf8').catch(() => ''), applied.before ?? {}, applied.added ?? []);
  const values = presetOptions(wanted);
  const now = parse(text);
  const before: Record<string, string> = {};
  const added: string[] = [];
  for (const key of Object.keys(values)) {
    if (now.has(key)) before[key] = now.get(key)!;
    else added.push(key);
  }
  text = withOptions(text, values);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(optionsPath, text);
  await fs.writeFile(file, JSON.stringify({ preset: wanted, before, added } satisfies Applied, null, 2));
  return true;
}
