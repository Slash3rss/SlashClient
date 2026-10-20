import { getLang, t } from '../shared/i18n';
import { el } from './dialog';

/**
 * What the admin switched off for a while in the server's panel (Ustawienia → Funkcje) and the
 * announcement banner (Ustawienia → Komunikat), from GET /v1/features (server 0.9.23+; an older
 * server has none: everything is on, no banner). Asked on start, when the connection comes back,
 * when the server says it changed ({ type: 'features' }) and every 10 minutes.
 *
 * Switched-off parts are greyed out or left out where they are drawn (featureOn), and every
 * element with data-feature="<id>" gets the body class feature-off-<id> rules (style.css).
 */

export type FeatureId = 'shop' | 'support' | 'communities' | 'clans' | 'groups' | 'media' | 'cloud' | 'profiles' | 'sprays' | 'chatImages' | 'registration';
export interface Banner { id: string; text: string; textEn: string; level: 'info' | 'warning'; link: string; start: number; end: number }
export interface FeatureState { features: Partial<Record<FeatureId, boolean>>; banner: Banner | null }

let state: FeatureState = { features: {}, banner: null };
const listeners: ((s: FeatureState) => void)[] = [];

/** Whether a feature is on (anything the server did not mention is on). */
export const featureOn = (id: FeatureId) => state.features[id] !== false;

/** Called whenever the switches or the banner change (the friends list draws its sections again). */
export function onFeatures(fn: (s: FeatureState) => void) {
  listeners.push(fn);
}

/** The text a part shows instead of itself while it is switched off. */
export const disabledText = () => t('Chwilowo wyłączone przez administratora.');

/** Only links the banner may carry: http(s) pages, or a path on the SlashClient site. */
export function bannerLink(link: string, socialUrl: string): string | undefined {
  if (/^https?:\/\/[^\s<>"']+$/i.test(link)) return link;
  const base = socialUrl.trim().replace(/\/+$/, '');
  if (/^\/(?!\/)[^\s<>"']*$/.test(link) && /^https?:\/\/[^\s/]+$/.test(base)) return base + link;
  return undefined;
}

/** A server's answer as the launcher keeps it (anything odd is left out). */
export function cleanFeatures(res: unknown): FeatureState {
  const r = (res && typeof res === 'object' ? res : {}) as { features?: unknown; banner?: unknown };
  const features: Partial<Record<FeatureId, boolean>> = {};
  if (r.features && typeof r.features === 'object') {
    for (const [k, v] of Object.entries(r.features as Record<string, unknown>)) if (typeof v === 'boolean') features[k as FeatureId] = v;
  }
  const b = r.banner as Partial<Banner> | null | undefined;
  const banner = b && typeof b === 'object' && typeof b.id === 'string' && (typeof b.text === 'string' || typeof b.textEn === 'string')
    ? { id: b.id, text: String(b.text ?? b.textEn ?? ''), textEn: String(b.textEn ?? b.text ?? ''), level: b.level === 'warning' ? 'warning' as const : 'info' as const,
      link: typeof b.link === 'string' ? b.link : '', start: Number(b.start) || 0, end: Number(b.end) || 0 }
    : null;
  return { features, banner };
}

interface FeatureDeps {
  api: { socialFeatures?: () => Promise<unknown>; on: (channel: string, fn: (e: any) => void) => void };
  socialUrl: () => string;
  /** Opens a link in the system browser. */
  openUrl: (url: string) => void;
}

const CLOSED = 'slashclient.bannerClosed';

export function initFeatures(deps: FeatureDeps) {
  const bar = el('div', { className: 'feature-banner hidden', id: 'feature-banner' });
  bar.setAttribute('role', 'status');
  document.querySelector('main')?.prepend(bar);

  function drawBanner() {
    const b = state.banner;
    let closed = '';
    try {
      closed = localStorage.getItem(CLOSED) ?? '';
    } catch {
      // shown every time
    }
    // past its end while the launcher stayed open
    if (!b || closed === b.id || (b.end && Date.now() >= b.end)) {
      bar.classList.add('hidden');
      bar.replaceChildren();
      return;
    }
    bar.className = `feature-banner ${b.level}`;
    const text = getLang() === 'en' ? b.textEn || b.text : b.text;
    const link = b.link ? bannerLink(b.link, deps.socialUrl()) : undefined;
    const more = link ? el('button', { type: 'button', className: 'link-button feature-banner-link', textContent: t('Więcej') }) : '';
    if (more) more.addEventListener('click', () => deps.openUrl(link!));
    const close = el('button', { type: 'button', className: 'icon-btn feature-banner-close', title: t('Zamknij') }, el('i', { className: 'fa-solid fa-xmark' }));
    close.addEventListener('click', () => {
      try {
        localStorage.setItem(CLOSED, b.id);
      } catch {
        // nothing to remember it in
      }
      drawBanner();
    });
    bar.replaceChildren(el('i', { className: `fa-solid ${b.level === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'}` }), el('span', { className: 'feature-banner-text', textContent: text }), more, close);
  }

  function apply(next: FeatureState) {
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    state = next;
    for (const id of ['shop', 'support', 'communities', 'clans', 'groups', 'media', 'cloud', 'profiles', 'sprays', 'chatImages', 'registration'] as FeatureId[]) {
      document.body.classList.toggle(`feature-off-${id}`, !featureOn(id));
    }
    drawBanner();
    if (changed) for (const fn of listeners) fn(state);
  }

  async function refresh() {
    const res = await deps.api.socialFeatures?.().catch(() => undefined);
    // no answer (offline): keep what was known
    if (res !== undefined) apply(cleanFeatures(res));
  }

  deps.api.on('social:event', (e: { type?: string; state?: { connected?: boolean } }) => {
    if (e?.type === 'features' || (e?.type === 'state' && e.state?.connected)) void refresh();
  });
  void refresh();
  setInterval(() => void refresh(), 10 * 60_000);
  return { refresh };
}
