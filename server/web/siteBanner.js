// The announcement banner from the admin panel (Ustawienia → Komunikat) on top of the website's
// pages, and the feature switches for the pages that need them (`siteFeatures`). A banner the
// player closed stays closed until the admin changes its text (its id changes).

const EN = !/^pl\b/i.test(navigator.language || 'pl');
const CLOSED = 'slashclient.bannerClosed';

// ---------- fewer animations: "Animacje: wł./wył." in every page's footer (remembered here) ----------
const MOTION = 'slashclient.motion';
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionChoice = () => {
  try {
    return localStorage.getItem(MOTION);
  } catch {
    return null;
  }
};
/** Off when the visitor turned animations off, or (not chosen) when the system asks for less motion. */
const motionOff = () => (motionChoice() ? motionChoice() === 'off' : systemReduced.matches);
const english = () => (document.documentElement.lang || '').startsWith('en') || (!document.documentElement.lang && EN);
function applyMotion() {
  document.documentElement.classList.toggle('reduce-motion', motionOff());
  const button = document.querySelector('.foot-motion');
  if (button) {
    const off = motionOff();
    button.textContent = english() ? `Animations: ${off ? 'off' : 'on'}` : `Animacje: ${off ? 'wył.' : 'wł.'}`;
    button.title = english() ? 'Fewer animations, for slower computers' : 'Mniej animacji, dla słabszych komputerów';
    button.setAttribute('aria-pressed', String(off));
  }
  // the 3D figures (preview.js) stop or start turning
  dispatchEvent(new Event('slashclient-motion'));
}
applyMotion();
const footRow = document.querySelector('footer.foot .foot-row') ?? document.querySelector('footer.foot');
if (footRow) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'foot-motion small';
  button.addEventListener('click', () => {
    try {
      localStorage.setItem(MOTION, motionOff() ? 'on' : 'off');
    } catch {
      // storage blocked: only for this page
      document.documentElement.classList.toggle('reduce-motion');
    }
    applyMotion();
  });
  footRow.append(button);
  applyMotion();
}
// one listener across the router's page changes (this file is loaded again on each)
window.slashMotionQuery?.removeEventListener('change', window.slashMotionListener);
window.slashMotionQuery = systemReduced;
window.slashMotionListener = applyMotion;
systemReduced.addEventListener('change', applyMotion);

/** { features: { shop: true, … }, banner: … | null }; everything on when the server cannot be asked. */
export const siteFeatures = fetch('/v1/features')
  .then((r) => (r.ok ? r.json() : undefined))
  .catch(() => undefined)
  .then((res) => ({ features: res?.features ?? {}, banner: res?.banner ?? null }));

/** Whether a feature is on (missing: an older server without switches, so on). */
export const featureOn = (features, id) => features[id] !== false;

/** The banner's element (also the admin panel's preview). */
export function bannerElement(b, onClose) {
  const box = document.createElement('div');
  box.className = `site-banner ${b.level === 'warning' ? 'warning' : 'info'}`;
  box.setAttribute('role', b.level === 'warning' ? 'alert' : 'status');
  const ic = document.createElement('i');
  ic.className = b.level === 'warning' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info';
  const text = document.createElement('span');
  text.className = 'site-banner-text';
  text.textContent = EN ? b.textEn || b.text : b.text;
  box.append(ic, text);
  // only http(s) links or this site's paths (the server checks it too)
  if (b.link && /^(https?:\/\/|\/(?!\/))/i.test(b.link)) {
    const a = document.createElement('a');
    a.href = b.link;
    a.textContent = EN ? 'More' : 'Więcej';
    if (/^https?:/i.test(b.link)) Object.assign(a, { target: '_blank', rel: 'noopener' });
    box.append(a);
  }
  if (onClose) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'icon-btn site-banner-close';
    x.title = EN ? 'Close' : 'Zamknij';
    x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    x.addEventListener('click', () => {
      box.remove();
      onClose();
    });
    box.append(x);
  }
  return box;
}

// pages hidden in the admin panel (with their link in the home page's menu or footer): no links to them anywhere
fetch('/v1/home/hidden')
  .then((r) => (r.ok ? r.json() : undefined))
  .then((res) => {
    const paths = res?.paths ?? [];
    if (!paths.length) return;
    const hidden = (href) => {
      let p;
      try {
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return false;
        p = u.pathname.replace(/\/+$/, '').toLowerCase();
      } catch {
        return false;
      }
      return paths.some((h) => p === h || p.startsWith(`${h}/`));
    };
    const sweep = () => document.querySelectorAll('a[href]').forEach((a) => { if (hidden(a.getAttribute('href'))) a.remove(); });
    sweep();
    // links drawn later by the page's own scripts too
    // the router loads this file again on every page: one watcher only, not one more each time
    window.slashHiddenLinks?.disconnect();
    window.slashHiddenLinks = new MutationObserver(sweep);
    window.slashHiddenLinks.observe(document.body, { childList: true, subtree: true });
  })
  .catch(() => {});

siteFeatures.then(({ banner }) => {
  // once per page, however many scripts import this
  if (!banner || document.querySelector('.site-banner[data-banner]')) return;
  let closed = '';
  try {
    closed = localStorage.getItem(CLOSED) ?? '';
  } catch {
    // no storage: shown every time
  }
  if (closed === banner.id) return;
  const box = bannerElement(banner, () => {
    try {
      localStorage.setItem(CLOSED, banner.id);
    } catch {
      // nothing to remember it in
    }
  });
  box.dataset.banner = banner.id;
  document.body.prepend(box);
});
