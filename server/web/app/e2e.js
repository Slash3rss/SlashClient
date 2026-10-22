// The chat's encryption as the app uses it: this phone's key (made once per account, kept in
// IndexedDB), published to the server so friends' launchers encrypt for it, and the friends' and
// groups' keys asked for when sealing a message (kept a little, like the launcher does).

import { api, bytes, idbGet, idbSet } from './api.js';
import { decrypt, encrypt, groupAad, groupDevices, isEncrypted, newDeviceKey, openImage, parseImageKey } from './crypto.js';
import { t } from './i18n.js';

let own;
let me = '';
const userKeys = new Map();
const groupKeys = new Map();
/** Opened pictures' keys, by the picture's id. */
const imageKeys = new Map();

/** This phone's key for the account (made the first time), published to the server. */
export async function startKeys(userId) {
  me = userId;
  userKeys.clear();
  groupKeys.clear();
  own = await idbGet(`chat:${userId}`).catch(() => undefined);
  if (!own) {
    own = await newDeviceKey();
    await idbSet(`chat:${userId}`, own).catch((err) => console.error('klucz czatu:', err));
  }
  // every start: the server keeps each member's most recent devices, this one among them
  await api('POST', '/v1/keys', { device: own.device, pub: own.publicKey }).catch((err) => console.error('klucz czatu:', err));
}

/** A friend's (or our own) devices changed: asked again next time. */
export function keysChanged(userId) {
  userKeys.delete(userId);
  groupKeys.clear();
}
export const groupsChanged = () => groupKeys.clear();

async function keysOf(userId) {
  const hit = userKeys.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.keys;
  const { keys } = await api('GET', `/v1/keys/${userId}`);
  userKeys.set(userId, { at: Date.now(), keys });
  return keys;
}

/** A direct message as it goes to the server: for the friend's devices and ours (as it is when the friend has no key: an old launcher). */
export async function sealDirect(to, text) {
  if (!own || text.length > 2000) return text;
  const [theirs, mine] = await Promise.all([keysOf(to), keysOf(me)]);
  if (!theirs.length) return text;
  const devices = [...theirs, ...mine.filter((d) => d.device !== own.device), { device: own.device, pub: own.publicKey }];
  return encrypt(text, own, devices, `${me}|${to}`);
}

export async function sealGroup(group, text) {
  if (!own || text.length > 2000) return text;
  let hit = groupKeys.get(group);
  if (!hit || Date.now() - hit.at > 60_000) {
    hit = { at: Date.now(), keys: (await api('GET', `/v1/groups/${group}/keys`)).keys };
    groupKeys.set(group, hit);
  }
  return encrypt(text, own, groupDevices(hit.keys, own), groupAad(group, me));
}

/** A message with its text (and its picture's key) opened when this phone can; `aad` is the conversation's. */
async function openWith(m, aad) {
  const out = { ...m };
  if (m.image?.id) {
    const key = isEncrypted(m.image.key) ? parseImageKey((await decrypt(m.image.key, own, aad)) ?? '') : undefined;
    if (key) imageKeys.set(m.image.id, key);
    out.image = { id: m.image.id, w: key?.w, h: key?.h, unreadable: !key };
  }
  if (!isEncrypted(m.text)) return out;
  const text = own ? await decrypt(m.text, own, aad) : undefined;
  return text === undefined ? { ...out, text: t('Wiadomość zaszyfrowana dla innego urządzenia.'), encrypted: true, unreadable: true } : { ...out, text, encrypted: true };
}
export const openDirect = (m) => openWith(m, `${m.from}|${m.to}`);
export const openGroup = (m) => openWith(m, groupAad(m.group, m.from));

/** A picture from a message, downloaded and decrypted, as a data: address (the app's pages allow only those). */
const pictures = new Map();
export async function pictureUrl(id) {
  if (pictures.has(id)) return pictures.get(id);
  const key = imageKeys.get(id);
  if (!key) throw new Error('no_key');
  const data = await openImage(await bytes(`/v1/images/${id}`), key);
  const url = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(new Blob([data], { type: key.type }));
  });
  pictures.set(id, url);
  return url;
}
