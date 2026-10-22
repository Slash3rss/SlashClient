// Notifications on this phone (Web Push, push.ts on the server): asking for permission, the
// subscription at the browser's push service, and what kinds this phone wants to hear about.

import { api } from './api.js';
import { lang } from './i18n.js';

const PREFS = 'slashclient.app.push';
export const KINDS = ['dm', 'group', 'clan', 'mention', 'invite'];

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}');
  } catch {
    return {};
  }
};
const write = (v) => {
  try {
    localStorage.setItem(PREFS, JSON.stringify(v));
  } catch {
    // private mode
  }
};

export const prefs = () => ({ dm: true, group: true, clan: true, mention: true, invite: true, ...read().prefs });

export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const permission = () => (supported() ? Notification.permission : 'unsupported');

/** "Pixel 8 · Chrome": what the list of phones shows. */
function label() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Linux';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${device} · ${browser}` : device;
}

const keyBytes = (b64u) => {
  const s = atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** The server's side: whether it sends notifications at all, and its key. */
export const serverInfo = () => api('GET', '/v1/push').catch(() => ({ enabled: false }));

async function current() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Tells the server about this phone's subscription (again), with the kinds and the language. */
async function save(sub, publicKey) {
  const json = sub.toJSON();
  await api('POST', '/v1/push/subscriptions', { endpoint: json.endpoint, keys: json.keys, prefs: prefs(), lang: lang(), label: label(), vapid: publicKey });
  write({ ...read(), vapid: publicKey, endpoint: json.endpoint });
}

/** Asks for permission (it must come from a tap) and subscribes; throws 'denied' when the player said no. */
export async function enable() {
  const info = await serverInfo();
  if (!info.enabled) throw Object.assign(new Error('push_disabled'), { code: 'push_disabled' });
  const answer = await Notification.requestPermission();
  if (answer !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // made with another key (the server's keys changed): a new one
  if (sub && read().vapid && read().vapid !== info.publicKey) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) });
  await save(sub, info.publicKey);
}

export async function disable() {
  const sub = await current();
  if (sub) {
    await api('POST', '/v1/push/subscriptions/remove', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  write({ ...read(), vapid: undefined, endpoint: undefined });
}

/** Whether this phone gets notifications now (permission given and subscribed). */
export async function active() {
  return permission() === 'granted' && !!(await current());
}

export async function setPref(kind, on) {
  write({ ...read(), prefs: { ...prefs(), [kind]: on } });
  const sub = await current();
  if (sub && permission() === 'granted') await save(sub, read().vapid);
}

/**
 * On every start with a session: the subscription told to the server again (it may have been
 * signed in to another account, the language may have changed), and made anew when the server's
 * keys changed. Nothing is asked of the player here.
 */
export async function refresh() {
  if (permission() !== 'granted') return;
  const sub = await current();
  if (!sub) return;
  const info = await serverInfo();
  if (!info.enabled) return;
  if (read().vapid !== info.publicKey) {
    await sub.unsubscribe().catch(() => {});
    const reg = await navigator.serviceWorker.ready;
    return save(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) }), info.publicKey);
  }
  await save(sub, info.publicKey);
}

/** Signing out: this phone stops getting the account's notifications. */
export async function forget() {
  const sub = await current().catch(() => null);
  if (sub) await api('POST', '/v1/push/subscriptions/remove', { endpoint: sub.endpoint }).catch(() => {});
}
