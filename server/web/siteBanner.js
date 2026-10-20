// The announcement banner from the admin panel (Ustawienia → Komunikat) on top of the website's
// pages, and the feature switches for the pages that need them (`siteFeatures`). A banner the
// player closed stays closed until the admin changes its text (its id changes).

const EN = !/^pl\b/i.test(navigator.language || 'pl');
const CLOSED = 'slashclient.bannerClosed';

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
