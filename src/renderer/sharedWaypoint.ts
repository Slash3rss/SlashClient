import { t } from '../shared/i18n';

/** A waypoint a friend shared from the game (a message with `waypoint`), as the server sends it. */
export interface SharedWaypoint { name: string; x: number; y: number; z: number; dimension: string; world: string }

const DIMENSIONS: Record<string, string> = { 'minecraft:overworld': 'Overworld', 'minecraft:the_nether': 'Nether', 'minecraft:the_end': 'End' };

/** "skyup.pl" for a server, the world's name for singleplayer. */
export function waypointWorld(w: SharedWaypoint): string {
  if (w.world.startsWith('server:')) return w.world.slice(7);
  if (w.world.startsWith('world:')) return t('świat {0}', w.world.slice(6));
  return '';
}

export function waypointDimension(w: SharedWaypoint): string {
  return DIMENSIONS[w.dimension] ?? w.dimension.replace(/^minecraft:/, '');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** The chat card: the point's name, where it is, and a button that copies the coordinates. */
export function waypointCard(w: SharedWaypoint, mine: boolean, toast: (message: string) => void): HTMLElement {
  const coords = `${w.x} ${w.y} ${w.z}`;
  const copy = el('button', { type: 'button', title: t('Kopiuj współrzędne') }, el('i', { className: 'fa-solid fa-copy' }));
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(coords).catch(() => undefined);
    toast(t('Skopiowano współrzędne'));
  });
  return el('div', { className: 'fr-bubble fr-invite fr-waypoint' }, el('i', { className: 'fa-solid fa-location-dot' }),
    el('div', { className: 'grow' },
      el('b', { textContent: mine ? t('Wysłano punkt: {0}', w.name) : t('Punkt: {0}', w.name) }),
      el('small', { textContent: [coords, waypointDimension(w), waypointWorld(w)].filter(Boolean).join(' · ') }),
      mine ? '' : el('small', { className: 'muted', textContent: t('Pojawi się w grze na liście punktów (B).') })),
    copy);
}
