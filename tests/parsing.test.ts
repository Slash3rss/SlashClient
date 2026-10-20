import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { analyzeCrash } from '../src/main/crash';
import { createLogParser } from '../src/main/gamelog';
import { readNbt } from '../src/main/nbt';
import { setLang } from '../src/shared/i18n';
import { levelDat } from './helpers';

describe('game log parser', () => {
  const xml = `<log4j:Event logger="x" timestamp="1792019022499" level="INFO" thread="Render thread">
  <log4j:Message><![CDATA[Setting user: Steve]]></log4j:Message>
</log4j:Event>
`;
  it('turns log4j XML into readable lines, even when split across chunks', () => {
    const lines: string[] = [];
    const feed = createLogParser((l) => lines.push(l));
    for (let i = 0; i < xml.length; i += 7) feed(xml.slice(i, i + 7));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[\d{2}:\d{2}:\d{2}\] \[Render thread\/INFO\]: Setting user: Steve$/);
  });
  it('passes plain output through', () => {
    const lines: string[] = [];
    createLogParser((l) => lines.push(l))('plain line\nsecond\n');
    assert.deepEqual(lines, ['plain line', 'second']);
  });
});

describe('crash analysis', () => {
  const run = (log: string[], extra: Partial<Parameters<typeof analyzeCrash>[0]> = {}) =>
    analyzeCrash({ log, gameDir: os.tmpdir(), startedAt: Date.now() + 60_000, code: 1, signal: null, ...extra });
  setLang('pl');
  it('recognises missing dependencies', async () => {
    const a = await run(["Incompatible mods found!", " - Mod 'Mod Menu' (modmenu) 21.0.0 requires any version of fabric-api, which is missing!"]);
    assert.equal(a.title, 'Mody nie pasują do siebie');
    assert.match(a.details[0], /fabric-api/);
    // the ids the launcher offers to install
    assert.deepEqual(a.missing, ['fabric-api']);
  });
  it('recognises out of memory', async () => {
    assert.equal((await run(['java.lang.OutOfMemoryError: Java heap space'])).title, 'Grze zabrakło pamięci RAM');
  });
  it('recognises an old loader on a new Java', async () => {
    const a = await run(['java.lang.IllegalArgumentException: Unsupported class file major version 69']);
    assert.match(a.details[0], /Javy 25/);
  });
  it('explains SIGKILL', async () => {
    assert.equal((await run([], { code: null, signal: 'SIGKILL' })).title, 'System zamknął grę');
  });
});

describe('NBT reader', () => {
  it('reads level.dat fields', () => {
    const root = readNbt(levelDat('Mój świat', 1));
    const data = root.Data as Record<string, unknown>;
    assert.equal(data.LevelName, 'Mój świat');
    assert.equal(data.GameType, 1);
    assert.equal(data.LastPlayed, 1792019201727n);
  });
});

