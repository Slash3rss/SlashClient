import { nativeImage, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { t } from '../shared/i18n';

const SIZE = 128;
const MAX_RAW = 2 * 1024 * 1024;
const EXTENSIONS = ['png', 'webp', 'gif'] as const;

const iconPath = (gameDir: string, ext: string) => path.join(gameDir, '.slashclient', `icon.${ext}`);

/** The profile's own icon inside its game folder (so it travels with it), if there is one. */
export function iconFile(gameDir: string): string | undefined {
  for (const ext of EXTENSIONS) if (existsSync(iconPath(gameDir, ext))) return iconPath(gameDir, ext);
  return undefined;
}

/** Crops to a centred square and scales to 128 px. */
function normalise(image: NativeImage): Buffer {
  const { width, height } = image.getSize();
  const side = Math.min(width, height);
  const square = image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  return square.resize({ width: SIZE, height: SIZE, quality: 'best' }).toPNG();
}

/** WebP/GIF by their magic bytes; Electron's image decoder can't read them but the page can show them. */
function rawFormat(buf: Buffer): 'webp' | 'gif' | undefined {
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  return undefined;
}

/** Stores an image as the profile icon: PNG/JPEG resized to 128 px, WebP/GIF kept as they are. */
async function store(gameDir: string, buf: Buffer): Promise<void> {
  const image = nativeImage.createFromBuffer(buf);
  let ext: string;
  let data: Buffer;
  if (!image.isEmpty()) {
    ext = 'png';
    data = normalise(image);
  } else {
    const raw = rawFormat(buf);
    if (!raw || buf.length > MAX_RAW) throw new Error(t('Nie udało się odczytać obrazka.'));
    ext = raw;
    data = buf;
  }
  await fs.mkdir(path.dirname(iconPath(gameDir, ext)), { recursive: true });
  for (const other of EXTENSIONS) if (other !== ext) await fs.rm(iconPath(gameDir, other), { force: true });
  await fs.writeFile(iconPath(gameDir, ext), data);
}

export async function iconFromFile(gameDir: string, source: string): Promise<void> {
  await store(gameDir, await fs.readFile(source));
}

/** Downloads a project icon (e.g. a Modrinth modpack's) and stores it as the profile icon. */
export async function iconFromUrl(gameDir: string, url: string): Promise<void> {
  if (!url.startsWith('https://')) throw new Error('Nieprawidłowa ikona');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await store(gameDir, Buffer.from(await res.arrayBuffer()));
}
