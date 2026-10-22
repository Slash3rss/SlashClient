// The phone app's way to the server: the same /v1 API and WebSocket the launcher uses, with the
// session from signing in (kept in this browser only, the same key the website's account page uses).

const TOKEN = 'slashclient.token';
export const VERSION = '1';

export const token = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN) ?? '';
    } catch {
      return '';
    }
  },
  set: (t) => {
    try {
      if (t) localStorage.setItem(TOKEN, t);
      else localStorage.removeItem(TOKEN);
    } catch {
      // private mode: the session lasts as long as the page
    }
  },
};

export class ApiError extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Called when the server says the session is over (signed out elsewhere, banned). */
let onSignedOut = () => {};
export const whenSignedOut = (fn) => {
  onSignedOut = fn;
};

async function request(method, path, init) {
  const headers = { 'X-SlashClient': `app/${VERSION}`, ...init.headers };
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`;
  let res;
  try {
    res = await fetch(path, { method, ...init, headers });
  } catch {
    throw new ApiError('offline', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token.get()) {
      token.set('');
      onSignedOut();
    }
    throw new ApiError(data.error ?? `http_${res.status}`, res.status, data.retryAfter);
  }
  return res;
}

export async function api(method, path, body) {
  const res = await request(method, path, {
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

/** Bytes from the server (an encrypted chat picture). */
export async function bytes(path) {
  const res = await request('GET', path, {});
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The live connection (/v1/ws): events as the launcher gets them. It reconnects on its own
 * (2 s, 4 s… up to a minute) and at once when the app comes back to the front, since phones cut
 * connections of apps in the background.
 */
export class Live {
  constructor({ presence, onEvent, onState }) {
    this.presence = presence;
    this.onEvent = onEvent;
    this.onState = onState;
    this.retry = 0;
    this.connected = false;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.connected && !this.stopped) this.connect(true);
    });
    addEventListener('online', () => !this.connected && !this.stopped && this.connect(true));
  }

  start() {
    this.stopped = false;
    this.connect(true);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = undefined;
    this.set(false);
  }

  set(connected) {
    if (this.connected === connected) return;
    this.connected = connected;
    this.onState(connected);
  }

  connect(now = false) {
    clearTimeout(this.timer);
    if (now) this.retry = 0;
    if (this.ws && this.ws.readyState <= 1) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/v1/ws`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: token.get(), presence: this.presence(), client: 'app' }));
    ws.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      if (event.type === 'ready') {
        this.retry = 0;
        this.set(true);
      }
      this.onEvent(event);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.set(false);
      // 4001: the session is no longer valid; 4003: signed out from elsewhere
      if (e.code === 4001 || e.code === 4003) {
        token.set('');
        onSignedOut();
        return;
      }
      if (this.stopped) return;
      this.timer = setTimeout(() => this.connect(), Math.min(60_000, 2000 * 2 ** this.retry++));
    };
  }

  send(message) {
    if (this.ws?.readyState === 1 && this.connected) this.ws.send(JSON.stringify(message));
  }
}

// ---- IndexedDB: this phone's chat key per account (a CryptoKey can be kept there as it is) ----

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('slashclient-app', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction('keys').objectStore('keys').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
