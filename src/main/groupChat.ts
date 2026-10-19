import { decrypt, encrypt, isEncrypted, type DeviceKey, type PublicDevice } from './chatCrypto';

/**
 * End-to-end encryption of group chats (and clan chats), with the same envelope as direct
 * messages (chatCrypto.ts): a fresh key per message, wrapped for the launchers of everyone in the
 * group at the moment it is sent. Someone added later was not in the keys of what came before;
 * someone who left is not in the keys of what comes after. `aad` ties a message to its group and
 * sender, so the server cannot move it to another group or pass it off as someone else's.
 */

export interface GroupKey { user: string; device: string; pub: string }
export interface GroupChatMessage { group: string; from: string; text: string; encrypted?: boolean; unreadable?: boolean }

const MAX_TEXT = 2000;

export const groupAad = (group: string, from: string) => `group:${group}|${from}`;

/** The launchers to encrypt for: every member's (ours included), each once, this one last with its own key. */
export function groupDevices(keys: GroupKey[], own: DeviceKey): PublicDevice[] {
  const seen = new Set<string>([own.device]);
  const out: PublicDevice[] = [];
  for (const k of keys) {
    if (seen.has(k.device)) continue;
    seen.add(k.device);
    out.push({ device: k.device, pub: k.pub });
  }
  return [...out, { device: own.device, pub: own.publicKey }];
}

/** The text as it goes to the server; too long for the limit, it goes as it is and the server says so. */
export function sealGroupText(text: string, own: DeviceKey, keys: GroupKey[], group: string, me: string): string {
  if (text.length > MAX_TEXT) return text;
  return encrypt(text, own, groupDevices(keys, own), groupAad(group, me));
}

/** A message as this launcher reads it; one not sealed for it says so instead of the envelope. */
export function openGroupMessage<T extends GroupChatMessage>(m: T, own: DeviceKey, unreadableText: string): T {
  if (!isEncrypted(m.text)) return m;
  const text = decrypt(m.text, own, groupAad(m.group, m.from));
  return text === undefined ? { ...m, text: unreadableText, encrypted: true, unreadable: true } : { ...m, text, encrypted: true };
}
