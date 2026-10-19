import { t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * The "Podgląd tekstur" window of the resource pack browser: the pack's block and item textures
 * next to the game's own, before installing it. The download and the comparison happen in the
 * main process (src/main/packPreview.ts).
 */

interface TexturePair { kind: 'block' | 'item'; name: string; pack: string; vanilla: string }
interface PackPreview {
  pairs: TexturePair[];
  changed: { blocks: number; items: number };
  total: { blocks: number; items: number };
  description: string;
  icon?: string;
  other: string[];
  versionNumber?: string;
  vanillaFrom?: string;
}
interface Hit { id: string; title: string; iconUrl?: string }

export interface PackPreviewDeps {
  api: any;
  /** The profile the browser installs into. */
  profileId: () => string;
  source: () => 'modrinth' | 'curseforge';
  /** Installs the pack as the card's button would. */
  install: (hit: Hit) => void;
}

/** "oak_planks" → "Oak planks". */
export const textureLabel = (name: string) => (name.charAt(0).toUpperCase() + name.slice(1)).replace(/_/g, ' ');

const errorOf = (err: unknown) => String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** Grey textures the game colours by biome: shown green, roughly as in a plains biome. */
const TINTED = new Set(['grass_block_top', 'oak_leaves', 'short_grass', 'fern', 'vine', 'lily_pad']);

/** A texture as the game shows it: pixels kept sharp, an animated strip cut to its first frame. */
function tile(src: string, label: string, tinted = false) {
  const img = el('img', { className: `pp-tex${tinted ? ' tinted' : ''}`, alt: label, draggable: false });
  img.src = src;
  return el('figure', { className: 'pp-tile' }, img, el('figcaption', { textContent: label }));
}

export function openPackPreview(d: PackPreviewDeps, hit: Hit) {
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
  const head = el('div', { className: 'pp-head' });
  const packIcon = el('img', { className: 'pp-icon', alt: '' });
  packIcon.src = hit.iconUrl?.startsWith('https://') ? hit.iconUrl : 'logo.png';
  const meta = el('p', { className: 'muted pp-meta' });
  head.append(packIcon, el('div', { className: 'grow' }, el('h2', { textContent: hit.title }), meta));
  const content = el('div', { className: 'pp-content' },
    el('div', { className: 'pp-loading muted' }, el('span', { className: 'spinner' }), t('Pobieram paczkę i porównuję tekstury…')));
  const install = el('button', { type: 'button', className: 'primary' }, icon('fa-download'), ' ', t('Instaluj'));
  const box = el('div', { className: 'modal' },
    el('div', { className: 'modal-box glass-panel pp-box' }, close,
      el('div', { className: 'modal-body' }, head, content, el('div', { className: 'row pp-actions' }, el('span', { className: 'grow' }), install))));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      done();
    }
  };
  const done = () => {
    box.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  close.addEventListener('click', done);
  box.addEventListener('click', (e) => e.target === box && done());
  install.addEventListener('click', () => {
    done();
    d.install(hit);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);

  void (async () => {
    let p: PackPreview;
    try {
      p = await d.api.packPreview(d.profileId(), hit.id, d.source());
    } catch (err) {
      content.replaceChildren(el('p', { className: 'pp-error' }, icon('fa-triangle-exclamation'), ' ', errorOf(err)));
      return;
    }
    if (!box.isConnected) return;
    if (p.icon) packIcon.src = p.icon;
    meta.textContent = [p.versionNumber ? t('Wersja {0}', p.versionNumber) : '', p.description].filter(Boolean).join(' · ');
    const summary = el('p', { className: 'pp-summary' },
      t('Zmienia {0} z {1} tekstur bloków i {2} z {3} tekstur przedmiotów.', p.changed.blocks, p.total.blocks, p.changed.items, p.total.items));
    if (!p.pairs.length) {
      const what = p.other.length ? t('Ta paczka nie zmienia wyglądu bloków ani przedmiotów. Zmienia: {0}.', p.other.join(', ')) : t('Ta paczka nie zmienia wyglądu bloków ani przedmiotów.');
      content.replaceChildren(summary, el('p', { className: 'muted', textContent: what }));
      return;
    }
    const grid = el('div', { className: 'pp-grid' }, ...p.pairs.map((pair) =>
      el('div', { className: 'pp-pair', title: `${pair.kind}/${pair.name}` },
        el('b', { textContent: textureLabel(pair.name) }),
        el('div', { className: 'pp-sides' }, tile(pair.vanilla, 'Minecraft', TINTED.has(pair.name)), icon('fa-arrow-right'), tile(pair.pack, t('Paczka'), TINTED.has(pair.name))))));
    content.replaceChildren(summary,
      el('p', { className: 'muted small', textContent: t('Po lewej tekstury z gry (Minecraft {0}), po prawej z paczki. Pokazane są tylko te, które paczka zmienia.', p.vanillaFrom ?? '') }),
      grid);
  })();
}
