// Ranks on the pages (ranks.ts on the server): the Slash logo in the rank's colour, or the rank's
// own icon, and a chip with it and the rank's name.
import { el } from './common.js';

/** The badge: the rank's icon when it has one, else the logo (img/badge.svg as a mask) in its colour. */
export function rankBadge(rank) {
  if (rank.icon) {
    const img = el('img', { class: 'rank-icon', src: rank.icon, alt: '' });
    img.addEventListener('error', () => img.replaceWith(rankBadge({ ...rank, icon: undefined })));
    return img;
  }
  const logo = el('span', { class: 'rank-logo' });
  logo.style.setProperty('--rank', rank.color);
  return logo;
}

/** A chip: the badge and the name (`en`: the English name), in the rank's colour. */
export function rankChip(rank, en = false, title = '') {
  const chip = el('span', { class: 'chip rank-chip', title: title || (en ? rank.descriptionEn : rank.description) || '' }, rankBadge(rank), en ? rank.nameEn || rank.name : rank.name);
  chip.style.setProperty('--rank', rank.color);
  return chip;
}
