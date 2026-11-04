import { getLang, locale, t } from '../shared/i18n';
import { el } from './dialog';

/**
 * Sets in the cosmetics menu (servers from 0.9.70): items from several slots that go together. Each
 * shows its name, how many parts are ours, the parts themselves (the missing ones dimmed, with their
 * price or how to earn them) and a button that puts on every part we have in one request.
 */
export interface CosmeticSet { id: string; name: string; nameEn: string; parts: Record<string, string> }
export interface SetItem { id: string; slot: string; name: string; available: boolean; price?: number; owned?: boolean; rank?: string; supporter?: number; hint?: string; hintEn?: string }

/** The set's parts as catalogue items, in the set's order; a part the catalogue has not got is left out (exported for the tests). */
export function setParts<I extends SetItem>(set: CosmeticSet, catalog: I[]): I[] {
  return Object.entries(set.parts).map(([slot, id]) => catalog.find((c) => c.id === id && c.slot === slot)).filter((c): c is I => !!c);
}

/** What POST /v1/me gets to put on the parts we have: the cape apart, the rest as the loadout (exported for the tests). */
export function wearBody(parts: SetItem[]): { cape?: string; loadout?: Record<string, string> } {
  const owned = parts.filter((p) => p.available);
  const cape = owned.find((p) => p.slot === 'cape');
  const loadout = Object.fromEntries(owned.filter((p) => p.slot !== 'cape').map((p) => [p.slot, p.id]));
  return { ...(cape ? { cape: cape.id } : {}), ...(Object.keys(loadout).length ? { loadout } : {}) };
}

/** Whether every part we have is worn now (then the button says so). */
export function setWorn(parts: SetItem[], worn: Record<string, string | undefined>): boolean {
  const owned = parts.filter((p) => p.available);
  return owned.length > 0 && owned.every((p) => (worn[p.slot] ?? '') === p.id);
}

/** How to get a part we lack: its price in the shop, a rank, the supporters, an achievement, or the admins (exported for the tests). */
export function missingText(item: SetItem, sparks: (n: number) => string, rankName: (rank: string) => string): string {
  if (item.price && !item.owned) return t('{0}: w sklepie za {1}', item.name, sparks(item.price));
  if (item.rank) return t('{0}: tylko dla rangi {1}', item.name, rankName(item.rank));
  if (item.supporter) return t('{0}: dla wspierających projekt (Ustawienia → Wesprzyj projekt)', item.name);
  if (item.hint) return `${item.name}: ${getLang() === 'en' ? item.hintEn ?? item.hint : item.hint}`;
  return t('{0}: ekskluzywna, przyznaje ją admin', item.name);
}

export interface SetsView<I extends SetItem> {
  sets: CosmeticSet[];
  catalog: I[];
  worn: Record<string, string | undefined>;
  signedIn: boolean;
  picture: (item: I) => Node;
  sparks: (n: number) => string;
  rankName: (rank: string) => string;
  /** Puts on the set's parts we have. */
  wear: (set: CosmeticSet, body: ReturnType<typeof wearBody>, owned: number, all: number) => void;
  /** Buys a part from the shop. */
  buy: (item: I) => void;
  /** The figure tries on these parts (undefined: back to what is worn). */
  tryOn: (parts: I[] | undefined) => void;
}

/** The sets as cards: one per set that has any part this launcher knows. */
export function renderSets<I extends SetItem>(view: SetsView<I>): HTMLElement[] {
  return view.sets.map((set) => {
    const parts = setParts(set, view.catalog);
    const owned = parts.filter((p) => p.available);
    const missing = parts.filter((p) => !p.available);
    const worn = setWorn(parts, view.worn);
    const name = getLang() === 'en' ? set.nameEn : set.name;
    const button = el('button', { type: 'button', className: worn ? 'set-wear' : 'set-wear primary', disabled: !view.signedIn || !owned.length || worn },
      el('i', { className: `fa-solid ${worn ? 'fa-check' : 'fa-shirt'}` }), ` ${worn ? t('Założony') : t('Załóż zestaw')}`);
    button.addEventListener('click', () => view.wear(set, wearBody(parts), owned.length, parts.length));
    const tiles = parts.map((p) => {
      const forSale = !p.available && !!p.price && !p.owned;
      const b = el('button', { type: 'button', className: `cape-choice square set-part${p.available ? '' : ' locked'}${forSale ? ' for-sale' : ''}${(view.worn[p.slot] ?? '') === p.id ? ' active' : ''}`,
        title: p.available ? p.name : missingText(p, view.sparks, view.rankName) }, view.picture(p));
      if (forSale) b.append(el('span', { className: 'cape-price' }, el('span', { className: 'spark-sign', textContent: '✦' }), ` ${p.price!.toLocaleString(locale())}`));
      if (!p.available) b.append(el('i', { className: 'fa-solid fa-lock cape-lock' }));
      b.disabled = !view.signedIn || (!p.available && !forSale);
      if (forSale) b.addEventListener('click', () => view.buy(p));
      return b;
    });
    const card = el('div', { className: `set-card${worn ? ' worn' : ''}` },
      el('div', { className: 'set-head' }, el('b', { className: 'grow', textContent: name }),
        el('span', { className: `set-count${missing.length ? '' : ' full'}`, title: t('Masz / wszystkie części'), textContent: `${owned.length}/${parts.length}` }), button),
      el('div', { className: 'set-parts' }, ...tiles));
    if (missing.length) card.append(el('ul', { className: 'set-missing' }, ...missing.map((p) => el('li', { textContent: missingText(p, view.sparks, view.rankName) }))));
    card.addEventListener('mouseenter', () => view.tryOn(owned));
    card.addEventListener('mouseleave', () => view.tryOn(undefined));
    return card;
  });
}
