// The site's pages switch without reloading: a click on a link to another page of the site (home,
// account, bug reports, shared logs, the admin panel) fetches that page, puts its content in place of
// this one's and runs its script again; back and forward work the same way.
//
// A page's script may have left timers, animation loops and listeners on window or document behind:
// they belong to the page they were made on and stop when it is left.

const PAGE = /^\/(|en|konto|account|admin|zgloszenia(\/\d+)?|bugs(\/\d+)?|logi\/[A-Za-z0-9]{10}|logs\/[A-Za-z0-9]{10})\/?$/;
const ROUTER = new URL(import.meta.url).pathname;

const native = {
  setTimeout: window.setTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  winAdd: window.addEventListener.bind(window),
  winRemove: window.removeEventListener.bind(window),
  docAdd: document.addEventListener.bind(document),
  docRemove: document.removeEventListener.bind(document),
};

/** Which page is shown: things made for an older one do nothing any more. */
let page = 0;
const intervals = new Set();
const listeners = [];

window.setTimeout = (fn, ms, ...args) => {
  const mine = page;
  return native.setTimeout((...a) => { if (mine === page && typeof fn === 'function') fn(...a); }, ms, ...args);
};
window.setInterval = (fn, ms, ...args) => {
  const id = native.setInterval(fn, ms, ...args);
  intervals.add(id);
  return id;
};
window.clearInterval = (id) => {
  intervals.delete(id);
  native.clearInterval(id);
};
window.requestAnimationFrame = (fn) => {
  const mine = page;
  return native.requestAnimationFrame((t) => { if (mine === page) fn(t); });
};
window.addEventListener = (type, fn, opts) => {
  listeners.push([native.winRemove, type, fn, opts]);
  native.winAdd(type, fn, opts);
};
document.addEventListener = (type, fn, opts) => {
  listeners.push([native.docRemove, type, fn, opts]);
  native.docAdd(type, fn, opts);
};

/** Stops what the page being left still had running. */
function leave() {
  page++;
  for (const id of intervals) native.clearInterval(id);
  intervals.clear();
  for (const [remove, type, fn, opts] of listeners.splice(0)) remove(type, fn, opts);
}

let loads = 0;

/** Shows another page of the site; `push` adds it to the history (not when going back or forward). */
export async function go(href, { push = true } = {}) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || !PAGE.test(url.pathname)) {
    location.href = url.href;
    return;
  }
  let html;
  try {
    const res = await fetch(url.href, { headers: { Accept: 'text/html' } });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) throw new Error(String(res.status));
    html = await res.text();
  } catch {
    location.href = url.href;
    return;
  }
  const next = new DOMParser().parseFromString(html, 'text/html');
  // its look first (a stylesheet this page lacks), so it does not show unstyled
  await Promise.all([...next.querySelectorAll('link[rel="stylesheet"]')].map((link) => {
    const href = new URL(link.getAttribute('href'), url).href;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) return undefined;
    const added = document.createElement('link');
    added.rel = 'stylesheet';
    added.href = href;
    document.head.append(added);
    return new Promise((done) => { added.onload = added.onerror = done; });
  }));
  leave();
  if (push) history.pushState(null, '', url.href);
  shown = url.pathname + url.search;
  document.title = next.title;
  // the home page is Polish at / and English at /en
  document.documentElement.lang = next.documentElement.lang || 'pl';
  // what the page says about itself (description, canonical address, link previews) goes with it
  const META = 'meta[name="description"], meta[name="robots"], meta[name="keywords"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]';
  document.head.querySelectorAll(META).forEach((m) => m.remove());
  for (const m of next.head.querySelectorAll(META)) document.head.append(document.importNode(m, true));
  document.body.className = next.body.className;
  document.body.replaceChildren(...[...next.body.childNodes].map((n) => document.importNode(n, true)));
  // the look of the page left goes with it (the admin panel's and the site's do not mix)
  const wanted = new Set([...next.querySelectorAll('link[rel="stylesheet"]')].map((l) => new URL(l.getAttribute('href'), url).href));
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => !wanted.has(l.href) && l.remove());
  // the page's script runs again for the new content (a fresh copy of it; the shared modules stay)
  loads++;
  for (const s of next.querySelectorAll('script[type="module"][src]')) {
    const src = new URL(s.getAttribute('src'), url);
    if (src.pathname === ROUTER) continue;
    src.searchParams.set('strona', String(loads));
    await import(src.href).catch((err) => console.error(err));
  }
  // a new page starts where it should at once (the site scrolls smoothly only within a page)
  if (url.hash) native.setTimeout(() => document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({ behavior: 'instant' }), 50);
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

native.docAdd('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !PAGE.test(url.pathname)) return;
  // a place on this same page: the browser's own jump (and its hashchange)
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
  e.preventDefault();
  void go(url.href);
});

/** The page now shown (path and query): back or forward within one page only moves on it. */
let shown = location.pathname + location.search;
// a page changing its own address (the bug list's filters) is still the same page
const replace = history.replaceState.bind(history);
history.replaceState = (state, title, href) => {
  replace(state, title, href);
  shown = location.pathname + location.search;
};
native.winAdd('popstate', () => {
  if (location.pathname + location.search === shown) return;
  void go(location.href, { push: false });
});
