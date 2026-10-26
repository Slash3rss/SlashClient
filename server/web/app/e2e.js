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
/**
 * Message keys handed over to this phone by the player's launcher (server 0.9.47+, chatKeys.ts),
 * for the history from before the phone had its key: by "m12:text" / "g7:image".
 */
const wraps = new Map();
let wrapsAfter = 0;

/** The handed-over keys again (all of them the first time, then what is new); how many came. An older server has none. */
export async function wrapsChanged() {
  if (!own) return 0;
  let added = 0;
  for (;;) {
    const res = await api('GET', `/v1/chat-keys/wraps?device=${own.device}&after=${wrapsAfter}`).catch(() => undefined);
    if (!res?.wraps) return added;
    added += res.wraps.length;
    for (const w of res.wraps) {
      wraps.set(`${w.kind}${w.id}:${w.field}`, { by: w.by, pub: w.pub, iv: w.iv, ct: w.ct });
      wrapsAfter = Math.max(wrapsAfter, w.seq);
    }
    if (!res.next) return added;
  }
}

/** What the player's other devices show for this phone ("Urządzenia" in the launcher). */
function deviceName() {
  const ua = navigator.userAgent;
  return `SlashClient Web · ${/iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Linux'}`;
}

/**
 * A new key for this phone, kept for good. Safari on the iPhone cannot keep the browser's own X25519
 * key in its storage (the write fails without a word): a phone that kept nothing made a new key at
 * every start, and the launcher asked about a "new device" each time. So the key is read back after
 * it is written, and when it did not stay, it is made as plain bytes instead, which every browser keeps.
 */
async function keepNewKey(slot) {
  for (const native of [undefined, false]) {
    const key = await newDeviceKey(native);
    const kept = await idbSet(slot, key).then(() => idbGet(slot)).catch((err) => console.error('klucz czatu:', err));
    if (kept?.device === key.device && kept.privateKey) return key;
  }
  // nothing stays (a private window): this start's key, a new one next time
  return newDeviceKey(false);
}

/** This phone's key for the account (made the first time), published to the server. */
export async function startKeys(userId) {
  me = userId;
  userKeys.clear();
  groupKeys.clear();
  wraps.clear();
  wrapsAfter = 0;
  own = await idbGet(`chat:${userId}`).catch(() => undefined);
  // (a key kept without its private part is no key)
  if (!own?.privateKey) own = await keepNewKey(`chat:${userId}`);
  // every start: the server keeps each member's most recent devices, this one among them
  await api('POST', '/v1/keys', { device: own.device, pub: own.publicKey, name: deviceName() }).catch((err) => console.error('klucz czatu:', err));
  await wrapsChanged();
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
async function openWith(m, aad, kind) {
  const out = { ...m };
  if (m.image?.id) {
    const key = isEncrypted(m.image.key) ? parseImageKey((await decrypt(m.image.key, own, aad, wraps.get(`${kind}${m.id}:image`))) ?? '') : undefined;
    if (key) imageKeys.set(m.image.id, key);
    out.image = { id: m.image.id, w: key?.w, h: key?.h, unreadable: !key };
  }
  if (!isEncrypted(m.text)) return out;
  const text = own ? await decrypt(m.text, own, aad, wraps.get(`${kind}${m.id}:text`)) : undefined;
  return text === undefined ? { ...out, text: t('Wiadomość zaszyfrowana dla innego urządzenia.'), encrypted: true, unreadable: true } : { ...out, text, encrypted: true };
}
export const openDirect = (m) => openWith(m, `${m.from}|${m.to}`, 'm');
export const openGroup = (m) => openWith(m, groupAad(m.group, m.from), 'g');

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
