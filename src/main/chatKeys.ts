import { backupDevice, openBackup, passwordProblem, PasswordTries, sealBackup, SCRYPT, type ScryptParams } from './chatBackup.ts';
import { envelopeDevices, fingerprint, messageKey, newDeviceKey, openWithKey, rewrap, type DeviceKey, type ExtraWrap } from './chatCrypto.ts';

/**
 * The chat's history on a new device (server/src/chatKeys.ts has the whole picture and the threat
 * model). This launcher:
 * - reads messages with its own key, with wraps other devices of the account handed over to it, and
 *   (once the player typed the chat password here) with the password backup's key;
 * - asks the player about each new device of the account, and only after "Udostępnij" re-wraps the
 *   history it can read for that device's key, in pages, picking up where it stopped after a restart;
 * - sets up, changes and removes the password backup, and opens it on a new device, after which the
 *   history is re-wrapped for this launcher's own key so the password is not needed again.
 *
 * Who to share with is kept here (`ShareTarget`, with the public key the player saw the fingerprint
 * of), never taken from the server's word: the server only shows which devices are waiting.
 */

export type Kind = 'm' | 'g';
export type Field = 'text' | 'image';
export interface WrapRef { kind: Kind; id: number; field: Field }

/** A device to re-wrap the history for, as this launcher agreed to it (persisted, so it resumes). */
export interface ShareTarget { account: string; device: string; pub: string; cursor: string; done: number; backup?: boolean; own?: boolean }

export interface DeviceView {
  device: string; pub: string; name: string; createdAt?: number; lastSeen: number; handover: string;
  fingerprint: string; own: boolean;
}
/** What the page shows in "Szyfrowanie czatu" and above a chat with unreadable history. */
export interface ChatKeysView {
  supported: boolean;
  device: string;
  fingerprint: string;
  devices: DeviceView[];
  backup: { device: string; createdAt: number; updatedAt: number; unlocked: boolean } | null;
  /** this launcher's key was removed on another device: nothing new is encrypted for it */
  revoked: boolean;
  /** history being handed over right now (to another device, the backup or this one) */
  sharing: { device: string; done: number; backup?: boolean; own?: boolean }[];
  /** new devices to ask the player about (the page asks once per window it shows) */
  pending: string[];
}

interface ServerState {
  devices: { device: string; pub: string; name: string; createdAt?: number; lastSeen: number; handover: string }[];
  backup: { device: string; pub: string; blob: string; createdAt: number; updatedAt: number } | null;
  limits: { wrapsPerRequest: number; historyPerRequest: number; handoverDays: number };
}
interface HistoryItem { kind: Kind; id: number; from: string; to?: string; group?: string; text?: string; image?: string }

export interface ChatKeysDeps {
  call: <T>(method: string, path: string, body?: unknown) => Promise<T>;
  /** this launcher's key now */
  own: () => DeviceKey;
  /** keys this launcher had before (its key was removed and replaced): still good for reading */
  retired?: () => DeviceKey[];
  /** the signed-in account */
  me: () => string | undefined;
  shares: () => ShareTarget[];
  saveShares: (list: ShareTarget[]) => void;
  /** to the page and the game: 'chat-keys-state', 'chat-device-new', 'chat-history', 'chat-share-done' */
  emit: (event: Record<string, unknown>) => void;
  /** the KDF's cost for a new backup (tests use a cheap one) */
  scrypt?: ScryptParams;
}

const status = (err: unknown) => (err as { httpStatus?: number }).httpStatus;
const code = (err: unknown) => (err as { code?: string }).code ?? (err as Error).message;
export const aadOf = (m: { kind: Kind; from: string; to?: string; group?: string }) => (m.kind === 'g' ? `group:${m.group}|${m.from}` : `${m.from}|${m.to}`);
const refKey = (device: string, ref: WrapRef) => `${device}|${ref.kind}${ref.id}:${ref.field}`;

export class ChatKeys {
  private readonly deps: ChatKeysDeps;
  /** handed-over wraps of this launcher's key and of the opened backup's, by device and message */
  private readonly wraps = new Map<string, ExtraWrap>();
  private readonly loadedSeq = new Map<string, number>();
  private server: ServerState | undefined;
  private backupKey: DeviceKey | undefined;
  private readonly tries = new PasswordTries();
  /** new devices already asked about in this run of the launcher */
  private readonly asked = new Set<string>();
  private running: Promise<void> | undefined;
  private progress = new Map<string, number>();
  supported = false;
  revoked = false;

  constructor(deps: ChatKeysDeps) {
    this.deps = deps;
  }

  /** Signed out, or another account: nothing of the old one stays. */
  reset() {
    this.wraps.clear();
    this.loadedSeq.clear();
    this.server = undefined;
    this.backupKey = undefined;
    this.asked.clear();
    this.supported = false;
    this.revoked = false;
  }

  /** The keys that may open a message here: this launcher's, its older ones, and the backup's once opened. */
  private ring(): DeviceKey[] {
    return [this.deps.own(), ...(this.deps.retired?.() ?? []), ...(this.backupKey ? [this.backupKey] : [])];
  }

  /** The message key of an envelope, with any key of the ring and its handed-over wraps. */
  key(text: string, aad: string, ref?: WrapRef): Buffer | undefined {
    for (const k of this.ring()) {
      const key = messageKey(text, k, aad, ref ? this.wraps.get(refKey(k.device, ref)) : undefined);
      if (key) return key;
    }
    return undefined;
  }

  /** A message's text (or a picture's key) for this launcher; undefined when nothing here opens it. */
  open(text: string, aad: string, ref?: WrapRef): string | undefined {
    const key = this.key(text, aad, ref);
    return key && openWithKey(text, key, aad);
  }

  view(): ChatKeysView {
    const own = this.deps.own();
    const me = this.deps.me();
    return {
      supported: this.supported,
      device: own.device,
      fingerprint: fingerprint(own.publicKey),
      devices: (this.server?.devices ?? []).map((d) => ({ ...d, fingerprint: fingerprint(d.pub), own: d.device === own.device })),
      backup: this.server?.backup ? { device: this.server.backup.device, createdAt: this.server.backup.createdAt, updatedAt: this.server.backup.updatedAt, unlocked: !!this.backupKey } : null,
      revoked: this.revoked,
      sharing: this.deps.shares().filter((s) => s.account === me).map((s) => ({ device: s.device, done: this.progress.get(s.device) ?? s.done, ...(s.backup ? { backup: true } : {}), ...(s.own ? { own: true } : {}) })),
      pending: this.server ? this.pendingDevices().map((d) => d.device) : [],
    };
  }

  private changed() {
    this.deps.emit({ type: 'chat-keys-state', state: this.view() });
  }

  /**
   * The account's devices and backup again (an older server has none: the features stay hidden),
   * the wraps handed over to this launcher, the questions about new devices, and any hand-over
   * that did not finish.
   */
  async refresh(): Promise<ChatKeysView> {
    if (!this.deps.me()) return this.view();
    try {
      this.server = await this.deps.call<ServerState>('GET', '/v1/chat-keys');
      this.supported = true;
    } catch (err) {
      if (status(err) === 404) {
        this.supported = false;
        this.server = undefined;
        return this.view();
      }
      throw err;
    }
    // a backup removed or replaced elsewhere: the key opened here is no longer the account's
    if (this.backupKey && this.server.backup?.device !== this.backupKey.device) this.backupKey = undefined;
    const before = this.wraps.size;
    await this.loadWraps(this.deps.own().device);
    if (this.backupKey) await this.loadWraps(this.backupKey.device);
    this.changed();
    if (this.wraps.size !== before) this.deps.emit({ type: 'chat-history' });
    this.askAboutNew();
    this.resume();
    return this.view();
  }

  /** The wraps handed over to a device of ours, from where the last load stopped. */
  async loadWraps(device: string) {
    let after = this.loadedSeq.get(device) ?? 0;
    for (;;) {
      let res: { wraps: ({ seq: number } & WrapRef & ExtraWrap)[]; next: number | null };
      try {
        res = await this.deps.call('GET', `/v1/chat-keys/wraps?device=${device}&after=${after}`);
      } catch (err) {
        if (status(err) === 404) return;
        throw err;
      }
      for (const w of res.wraps) {
        this.wraps.set(refKey(device, w), { by: w.by, pub: w.pub, iv: w.iv, ct: w.ct });
        after = Math.max(after, w.seq);
      }
      this.loadedSeq.set(device, after);
      if (!res.next) return;
    }
  }

  /** Devices waiting for the player's answer (not this one, not one being handed the history already, not too old). */
  pending(): DeviceView[] {
    const own = this.deps.own().device;
    return this.pendingDevices().map((d) => ({ ...d, fingerprint: fingerprint(d.pub), own: d.device === own }));
  }

  private pendingDevices() {
    const days = this.server?.limits.handoverDays ?? 30;
    const me = this.deps.me();
    const own = this.deps.own().device;
    const mine = new Set(this.deps.shares().filter((s) => s.account === me).map((s) => s.device));
    return (this.server?.devices ?? []).filter((d) => d.device !== own && d.handover === 'pending' && !mine.has(d.device) && (d.createdAt ?? 0) > Date.now() - days * 86_400_000);
  }

  private askAboutNew() {
    for (const d of this.pending()) {
      if (this.asked.has(d.device)) continue;
      this.asked.add(d.device);
      this.deps.emit({ type: 'chat-device-new', device: d });
    }
  }

  /**
   * The player's answer about a new device. "Udostępnij": the key that is shared with is the one the
   * question showed the fingerprint of (taken from what this launcher fetched, not from the page).
   */
  async decide(device: string, share: boolean, shown?: string) {
    const me = this.deps.me();
    const d = this.server?.devices.find((x) => x.device === device);
    if (!me || !d || device === this.deps.own().device) throw new Error('not_found');
    // the key changed since the question was shown: asked again, never shared with a key the player did not see
    if (share && shown !== undefined && shown !== fingerprint(d.pub)) throw new Error('changed');
    if (!share) {
      await this.deps.call('POST', `/v1/chat-keys/devices/${device}`, { handover: 'declined' });
      return this.refresh();
    }
    this.addShare({ account: me, device, pub: d.pub, cursor: 'm0', done: 0 });
    await this.deps.call('POST', `/v1/chat-keys/devices/${device}`, { handover: 'sharing' }).catch(() => undefined);
    this.resume();
    return this.view();
  }

  private addShare(t: ShareTarget) {
    const list = this.deps.shares().filter((s) => !(s.account === t.account && s.device === t.device));
    this.deps.saveShares([...list, t]);
  }

  private saveShare(t: ShareTarget | undefined, remove = false) {
    if (!t) return;
    const list = this.deps.shares().filter((s) => !(s.account === t.account && s.device === t.device));
    this.deps.saveShares(remove ? list : [...list, t]);
  }

  /** Hand-overs left to do for this account run one after another (in the background). */
  resume(): Promise<void> {
    if (this.running) return this.running;
    const run = async () => {
      for (;;) {
        const me = this.deps.me();
        const next = this.deps.shares().find((s) => s.account === me);
        if (!me || !next || !this.supported) return;
        try {
          await this.shareTo(next);
        } catch (err) {
          // offline or the server said no for now: tried again on the next refresh
          if (status(err) !== 404) {
            console.error('Historia czatu:', code(err));
            return;
          }
          this.saveShare(next, true);
        }
      }
    };
    this.running = run().finally(() => {
      this.running = undefined;
      this.changed();
    });
    return this.running;
  }

  /** Re-wraps the history page by page for one device; the cursor is kept after every page. */
  private async shareTo(target: ShareTarget) {
    const limits = this.server?.limits ?? { wrapsPerRequest: 200, historyPerRequest: 200, handoverDays: 30 };
    const own = this.deps.own();
    let t = { ...target };
    for (let cursor: string | null = t.cursor; cursor;) {
      const page: { items: HistoryItem[]; next: string | null } = await this.deps.call('GET', `/v1/chat-keys/history?after=${cursor}&limit=${limits.historyPerRequest}&for=${t.device}`);
      const wraps: (WrapRef & ExtraWrap)[] = [];
      for (const item of page.items) {
        const aad = aadOf(item);
        for (const field of ['text', 'image'] as const) {
          const env = item[field];
          if (!env || envelopeDevices(env).includes(t.device)) continue;
          const ref = { kind: item.kind, id: item.id, field };
          const key = this.key(env, aad, ref);
          if (key) wraps.push({ ...ref, ...rewrap(key, own, { device: t.device, pub: t.pub }, aad) });
        }
      }
      for (let i = 0; i < wraps.length; i += limits.wrapsPerRequest) {
        const batch = wraps.slice(i, i + limits.wrapsPerRequest);
        await this.deps.call('POST', '/v1/chat-keys/wraps', { device: t.device, wraps: batch });
        // this launcher's own: readable right away, without waiting for the server's push
        if (t.device === own.device) for (const w of batch) this.wraps.set(refKey(own.device, w), { by: w.by, pub: w.pub, iv: w.iv, ct: w.ct });
      }
      t = { ...t, cursor: page.next ?? '', done: t.done + wraps.length };
      this.progress.set(t.device, t.done);
      cursor = page.next;
      if (cursor) this.saveShare(t);
      this.deps.emit({ type: 'chat-share-progress', device: t.device, done: t.done });
      if (t.device === own.device && wraps.length) this.deps.emit({ type: 'chat-history' });
    }
    this.saveShare(t, true);
    this.progress.delete(t.device);
    // this launcher read it all with the password: the other launchers stop asking about it
    if (!t.backup) await this.deps.call('POST', `/v1/chat-keys/devices/${t.device}`, { handover: 'done' }).catch(() => undefined);
    this.deps.emit({ type: 'chat-share-done', device: t.device, done: t.done, ...(t.backup ? { backup: true } : {}), ...(t.own ? { own: true } : {}) });
  }

  // ---------- this launcher removed, or another device removed ----------

  /** "Usuń urządzenie": nothing new is encrypted for it; what it already read stays on it. */
  async revoke(device: string) {
    if (device === this.deps.own().device) throw new Error('bad_request');
    await this.deps.call('DELETE', `/v1/chat-keys/devices/${device}`);
    this.saveShare(this.deps.shares().find((s) => s.device === device), true);
    return this.refresh();
  }

  // ---------- the password backup ----------

  /** "Kopia klucza czatu": a new backup key, sealed with the password; then the history this launcher reads is wrapped for it. */
  async setBackup(password: string) {
    const me = this.deps.me();
    if (!me || !this.supported) throw new Error('unsupported');
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    const key = newDeviceKey();
    const blob = await sealBackup(key, password, me, this.deps.scrypt ?? SCRYPT);
    await this.deps.call('POST', '/v1/chat-keys/backup', { device: key.device, pub: key.publicKey, blob });
    // a backup replaced: the old one's hand-over is moot
    for (const s of this.deps.shares().filter((x) => x.account === me && x.backup)) this.saveShare(s, true);
    this.addShare({ account: me, device: key.device, pub: key.publicKey, cursor: 'm0', done: 0, backup: true });
    this.backupKey = key;
    await this.refresh();
    return this.view();
  }

  /** A new password for the same backup key: the current one opens it first (nothing else can). */
  async changeBackupPassword(current: string, next: string) {
    const me = this.deps.me();
    const backup = this.server?.backup;
    if (!me || !backup) throw new Error('not_found');
    const problem = passwordProblem(next);
    if (problem) throw new Error(problem);
    const key = await this.unlockKey(current);
    const blob = await sealBackup(key, next, me, this.deps.scrypt ?? SCRYPT);
    await this.deps.call('POST', '/v1/chat-keys/backup', { device: key.device, pub: key.publicKey, blob });
    return this.refresh();
  }

  /** The backup gone from the server: nothing new is wrapped for it, and the password opens nothing any more. */
  async removeBackup() {
    const me = this.deps.me();
    await this.deps.call('DELETE', '/v1/chat-keys/backup');
    for (const s of this.deps.shares().filter((x) => x.account === me && x.backup)) this.saveShare(s, true);
    this.backupKey = undefined;
    return this.refresh();
  }

  /** The backup's key from the password, checked against the account's backup key (wrong tries slow down). */
  private async unlockKey(password: string): Promise<DeviceKey> {
    const me = this.deps.me();
    const backup = this.server?.backup;
    if (!me || !backup) throw new Error('not_found');
    const wait = this.tries.wait();
    if (wait) throw Object.assign(new Error('wait'), { wait });
    if (backupDevice(backup.blob) !== backup.device) throw new Error('bad_backup');
    let key: DeviceKey;
    try {
      key = await openBackup(backup.blob, password, me);
    } catch (err) {
      if ((err as Error).message === 'wrong_password') this.tries.failed();
      throw err;
    }
    // the sealed key must be the one new messages are wrapped for
    if (key.publicKey !== backup.pub) throw new Error('bad_backup');
    this.tries.succeeded();
    return key;
  }

  /**
   * "Masz kopię klucza – wpisz hasło czatu": the history opens with the backup's key, and is then
   * re-wrapped for this launcher's own key, so it stays readable here without the password.
   */
  async unlockBackup(password: string) {
    const me = this.deps.me();
    const key = await this.unlockKey(password);
    this.backupKey = key;
    await this.loadWraps(key.device);
    this.deps.emit({ type: 'chat-history' });
    const own = this.deps.own();
    this.addShare({ account: me!, device: own.device, pub: own.publicKey, cursor: 'm0', done: 0, own: true });
    this.changed();
    void this.resume();
    return this.view();
  }

  /** Whether a hand-over is running (tests wait for it). */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }
}
