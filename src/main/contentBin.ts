import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { contentFile, FOLDERS, mergeManifest, readManifest, writeManifest, type ContentType, type ManifestEntry } from './modrinth';

/**
 * Removing mods, packs and shaders from the Installed list: the files first go aside into the
 * profile (.slashclient/removed/<batch>), so "Cofnij" in the notification puts them back exactly as
 * they were (disabled stays disabled, the launcher's note about each file comes back too). Once the
 * notification is gone, the batch goes to the system trash, from where the player can still get it.
 */

interface BinnedItem { type: ContentType; filename: string; disabled: boolean; entry?: ManifestEntry }
interface Batch { at: number; items: BinnedItem[] }

const binRoot = (gameDir: string) => path.join(gameDir, '.slashclient', 'removed');
const BATCH_ID = /^\d+-[0-9a-f]{8}$/;

function batchDir(gameDir: string, id: string): string {
  if (!BATCH_ID.test(id)) throw new Error('Nieprawidłowy identyfikator');
  return path.join(binRoot(gameDir), id);
}

const exists = (file: string) => fs.access(file).then(() => true, () => false);

/** Moves the files aside (not deleting anything) and returns the batch to undo or to send to the trash. */
export async function binContent(gameDir: string, items: { type: ContentType; filename: string }[]): Promise<{ id: string; removed: number }> {
  const id = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const dir = batchDir(gameDir, id);
  const manifest = await readManifest(gameDir);
  const batch: Batch = { at: Date.now(), items: [] };
  for (const { type, filename } of items) {
    const file = contentFile(gameDir, type, filename);
    const disabled = !(await exists(file)) && (await exists(`${file}.disabled`));
    const from = disabled ? `${file}.disabled` : file;
    if (!disabled && !(await exists(file))) continue;
    await fs.mkdir(path.join(dir, FOLDERS[type]), { recursive: true });
    await fs.rename(from, path.join(dir, FOLDERS[type], path.basename(from)));
    const entry = manifest.find((m) => m.type === type && m.filename === filename);
    batch.items.push({ type, filename, disabled, ...(entry ? { entry } : {}) });
    // the note is written after every move: a crash halfway leaves a batch that "Cofnij" or the trash still knows
    await fs.writeFile(path.join(dir, 'batch.json'), JSON.stringify(batch, null, 2));
  }
  const gone = new Set(batch.items.map((i) => `${i.type}:${i.filename}`));
  if (gone.size) await writeManifest(gameDir, manifest.filter((m) => !gone.has(`${m.type}:${m.filename}`)));
  return { id, removed: batch.items.length };
}

/** "Cofnij": the files go back where they were; a file of the same name put there since stays, and its removed copy goes to the trash later. */
export async function restoreContent(gameDir: string, id: string): Promise<{ restored: number; skipped: string[] }> {
  const dir = batchDir(gameDir, id);
  const batch: Batch = JSON.parse(await fs.readFile(path.join(dir, 'batch.json'), 'utf8'));
  const back: ManifestEntry[] = [];
  const skipped: string[] = [];
  let restored = 0;
  const left: BinnedItem[] = [];
  for (const item of batch.items) {
    const file = contentFile(gameDir, item.type, item.filename);
    const name = item.disabled ? `${item.filename}.disabled` : item.filename;
    const binned = path.join(dir, FOLDERS[item.type], name);
    if (!(await exists(binned))) continue;
    if ((await exists(file)) || (await exists(`${file}.disabled`))) {
      skipped.push(item.filename);
      left.push(item);
      continue;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.rename(binned, item.disabled ? `${file}.disabled` : file);
    if (item.entry) back.push(item.entry);
    restored++;
  }
  if (back.length) await writeManifest(gameDir, mergeManifest(await readManifest(gameDir), back));
  if (left.length) await fs.writeFile(path.join(dir, 'batch.json'), JSON.stringify({ ...batch, items: left }, null, 2));
  else await fs.rm(dir, { recursive: true, force: true }); // only the empty folders and the note are left
  return { restored, skipped };
}

/**
 * Sends the removed files to the system trash: one batch (the notification closed without "Cofnij"), or all
 * older than `olderThanMs` (the launcher was closed while a notification was on). A batch the trash
 * does not take stays where it is, so nothing is ever deleted for good here.
 */
export async function emptyBin(gameDir: string, trash: (dir: string) => Promise<void>, opts: { id?: string; olderThanMs?: number } = {}): Promise<number> {
  const root = binRoot(gameDir);
  const ids = opts.id ? [opts.id] : (await fs.readdir(root).catch(() => [] as string[])).filter((d) => BATCH_ID.test(d));
  let sent = 0;
  for (const id of ids) {
    const dir = batchDir(gameDir, id);
    if (!(await exists(dir))) continue;
    if (opts.olderThanMs !== undefined && Date.now() - Number(id.split('-')[0]) < opts.olderThanMs) continue;
    // file by file, so the trash shows "sodium.jar" and not a folder with a number
    let kept = false;
    for (const folder of Object.values(FOLDERS)) {
      for (const f of await fs.readdir(path.join(dir, folder)).catch(() => [] as string[])) {
        try {
          await trash(path.join(dir, folder, f));
          sent++;
        } catch {
          kept = true; // no trash on this system (or it refused): the file stays in the profile
        }
      }
    }
    // left: empty folders and the launcher's own note about the batch
    if (!kept) await fs.rm(dir, { recursive: true, force: true });
  }
  return sent;
}
