import { t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * The details window of a mod, resource pack, shader or modpack in the content browser (Modrinth
 * and CurseForge alike): what the project is, and its pictures as a strip of thumbnails under the
 * description. A thumbnail opens the full-screen viewer (arrows, ←/→, Esc) with the picture's
 * title and description. The strip loads only the small copies; the full picture is fetched when
 * the viewer shows it. A project without pictures simply has no gallery section.
 */

export interface GalleryImage { thumb: string; full: string; title?: string; description?: string }
interface Hit { id: string; slug: string; title: string; description: string; author: string; iconUrl?: string; downloads: number; categories: string[]; pageUrl?: string; manualOnly?: boolean }

export interface ProjectDetailsDeps {
  api: any;
  source: 'modrinth' | 'curseforge';
  /** mod, resourcepack, shader, modpack or datapack (Modrinth's page address uses it). */
  type: string;
  /** The card's install button text and state ("Instaluj", "Zainstalowany"…). */
  installLabel: string;
  installed: boolean;
  install: () => void;
  chooseVersion: () => void;
  fmtCount: (n: number) => string;
}

/** Pictures the page may show (see the Content-Security-Policy in index.html). */
const allowed = (url: string) => url.startsWith('https://cdn.modrinth.com/') || url.startsWith('https://media.forgecdn.net/');

function projectPage(d: ProjectDetailsDeps, hit: Hit): string | undefined {
  if (d.source === 'curseforge') return hit.pageUrl;
  return hit.slug ? `https://modrinth.com/${d.type}/${encodeURIComponent(hit.slug)}` : undefined;
}

export function openProjectDetails(d: ProjectDetailsDeps, hit: Hit) {
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
  const logo = el('img', { className: 'pd-icon', alt: '' });
  logo.src = hit.iconUrl && allowed(hit.iconUrl) ? hit.iconUrl : 'logo.png';
  const head = el('div', { className: 'pd-head' }, logo,
    el('div', { className: 'grow' },
      el('h2', { textContent: hit.title }),
      el('p', { className: 'muted pd-meta' },
        ...(hit.author ? [t('od {0}', hit.author), ' · '] : []),
        icon('fa-download'), ` ${d.fmtCount(hit.downloads)}`,
        ...(hit.categories.length ? [` · ${hit.categories.slice(0, 5).join(' · ')}`] : []))));
  const gallery = el('div', { className: 'pd-gallery' },
    el('div', { className: 'pd-strip' }, ...Array.from({ length: 4 }, () => el('div', { className: 'pd-thumb skeleton' }))));

  const actions: HTMLElement[] = [];
  const page = projectPage(d, hit);
  if (page) {
    actions.push(el('a', { className: 'button-link', href: page, target: '_blank' }, icon('fa-arrow-up-right-from-square'), ' ',
      d.source === 'curseforge' ? t('Strona na CurseForge') : t('Strona na Modrinth')));
  }
  actions.push(el('span', { className: 'grow' }));
  const versions = el('button', { type: 'button' }, icon('fa-code-branch'), ' ', t('Wybierz wersję'));
  versions.addEventListener('click', () => {
    done();
    d.chooseVersion();
  });
  const install = el('button', { type: 'button', className: d.installed ? '' : 'primary', disabled: d.installed },
    icon(d.installed ? 'fa-check' : 'fa-download'), ' ', d.installLabel);
  install.addEventListener('click', () => {
    done();
    d.install();
  });
  actions.push(versions, install);

  const box = el('div', { className: 'modal' },
    el('div', { className: 'modal-box glass-panel pd-box' }, close,
      el('div', { className: 'modal-body' }, head,
        el('p', { className: 'pd-desc', textContent: hit.description }),
        gallery,
        el('div', { className: 'row pd-actions' }, ...actions))));

  let viewer: { close: () => void; key: (e: KeyboardEvent) => void } | undefined;
  const onKey = (e: KeyboardEvent) => {
    if (viewer) return viewer.key(e);
    if (e.key === 'Escape') {
      e.stopPropagation();
      done();
    }
  };
  const done = () => {
    viewer?.close();
    box.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  close.addEventListener('click', done);
  box.addEventListener('click', (e) => e.target === box && done());
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);

  void (async () => {
    let images: GalleryImage[] = [];
    try {
      images = ((await d.api.projectGallery(hit.id, d.source)) as GalleryImage[] ?? []).filter((g) => allowed(g.thumb) && allowed(g.full));
    } catch {
      // no pictures is not worth an error: the window still shows the rest
    }
    if (!images.length) return gallery.remove();
    const thumbs = images.map((g, i) => {
      const img = el('img', { alt: g.title ?? '', loading: 'lazy', draggable: false });
      img.src = g.thumb;
      const b = el('button', { type: 'button', className: 'pd-thumb', title: g.title ?? '' }, img);
      b.addEventListener('click', () => {
        viewer = openViewer(images, i, () => (viewer = undefined));
      });
      return b;
    });
    gallery.replaceChildren(
      el('h3', { textContent: t('Galeria ({0})', images.length) }),
      el('div', { className: 'pd-strip' }, ...thumbs));
  })();
}

/** The full-screen viewer: one picture at a time, the small copy shown until the full one arrives. */
function openViewer(images: GalleryImage[], start: number, onClose: () => void) {
  let index = start;
  const img = el('img', { className: 'pd-full', alt: '', draggable: false });
  const spinner = el('span', { className: 'spinner pd-spinner hidden' });
  const title = el('b', {});
  const desc = el('p', {});
  const count = el('span', { className: 'muted' });
  const prev = el('button', { type: 'button', className: 'pd-nav prev', title: t('Poprzednie') }, icon('fa-chevron-left'));
  const next = el('button', { type: 'button', className: 'pd-nav next', title: t('Następne') }, icon('fa-chevron-right'));
  const close = el('button', { type: 'button', className: 'icon-btn pd-close', title: t('Zamknij') }, icon('fa-xmark'));
  const stage = el('div', { className: 'pd-stage' }, img, spinner);
  const view = el('div', { className: 'pd-viewer' }, stage, prev, next, close,
    el('div', { className: 'pd-caption' }, el('div', { className: 'row' }, title, el('span', { className: 'grow' }), count), desc));

  let loading = 0;
  const show = (i: number) => {
    index = (i + images.length) % images.length;
    const g = images[index];
    const ticket = ++loading;
    img.src = g.thumb;
    img.alt = g.title ?? '';
    spinner.classList.remove('hidden');
    const full = new Image();
    full.onload = () => {
      if (ticket !== loading) return;
      img.src = g.full;
      spinner.classList.add('hidden');
    };
    full.onerror = () => ticket === loading && spinner.classList.add('hidden');
    full.src = g.full;
    title.textContent = g.title ?? '';
    desc.textContent = g.description ?? '';
    desc.classList.toggle('hidden', !g.description);
    count.textContent = `${index + 1} / ${images.length}`;
    const many = images.length > 1;
    prev.classList.toggle('hidden', !many);
    next.classList.toggle('hidden', !many);
  };
  const shut = () => {
    loading++;
    view.remove();
    onClose();
  };
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', shut);
  view.addEventListener('click', (e) => (e.target === view || e.target === stage) && shut());
  document.body.append(view);
  show(start);
  return {
    close: shut,
    key(e: KeyboardEvent) {
      if (e.key === 'Escape') shut();
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
      else return;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
