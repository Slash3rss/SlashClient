import { httpMessage, netFetch } from './download';

/**
 * The pictures of the wiki articles the game opened (the "Wiki SkyUp" and "Minecraft Wiki" screens),
 * id → address: the game asks for a picture by its id only, so it cannot make the launcher fetch any
 * other address. A whole Minecraft Wiki article has a few hundred small pictures, so only the newest
 * few thousand ids are kept; an older one is found again when its article is opened again.
 */
const gamePictures = new Map<string, string>();
const MAX_PICTURES = 5000;
const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

export function rememberGamePictures(pictures: Record<string, string>) {
  for (const [id, url] of Object.entries(pictures)) {
    gamePictures.delete(id);
    gamePictures.set(id, url);
  }
  while (gamePictures.size > MAX_PICTURES) gamePictures.delete(gamePictures.keys().next().value!);
}

/** A picture of an article the game opened, as it comes from the wiki's host. */
export async function gamePictureBytes(id: string): Promise<Buffer> {
  const url = gamePictures.get(id);
  if (!url) throw new Error('not_found');
  const res = await netFetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(httpMessage(res.status, url));
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_PICTURE_BYTES) throw new Error('too_big');
  return data;
}
