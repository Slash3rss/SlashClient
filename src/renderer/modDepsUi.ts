import { t } from '../shared/i18n';
import { neededBy, type DependantsChoice, type ModNode, type Orphan } from '../shared/modDeps';
import { control, el, icon, modalWindow } from './dialog';

/**
 * The Installed list's dependency parts: "Wymaga" / "Potrzebny dla" in a mod's details, the warning
 * before disabling or removing a mod others need, and the leftover libraries offered for removal.
 */

/** "1 mod", "3 mody", "12 modów" (and "22 mody"): Polish counts take three forms. */
export function modsCount(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (n === 1) return t('{0} mod', n);
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return t('{0} mody', n);
  return t('{0} modów', n);
}

const STATE_TEXT: Record<string, string> = { missing: 'brak', version: 'inna wersja', disabled: 'wyłączony' };

/** The details under a mod's row; `go` jumps to another mod of the list. */
export function depsDetails(node: ModNode | undefined, nodes: ModNode[] | undefined, go: (file: string) => void): HTMLElement {
  const box = el('div', { className: 'mod-deps' });
  if (!nodes) {
    box.append(el('p', { className: 'muted' }, el('span', { className: 'spinner' }), ` ${t('Wczytywanie zależności…')}`));
    return box;
  }
  if (!node) {
    box.append(el('p', { className: 'muted', textContent: t('Ten plik nie ma opisu moda (Fabric, Quilt, Forge), więc launcher nie zna jego zależności.') }));
    return box;
  }
  const byFile = new Map(nodes.map((n) => [n.file, n]));
  const entry = (label: string, file: string | undefined, tags: HTMLElement[], bad = false) => {
    const content = [icon(bad ? 'fa-circle-xmark' : file ? 'fa-cube' : 'fa-circle-question'), el('span', { className: 'mod-dep-name', textContent: label }), ...tags];
    if (!file) return el('li', { className: bad ? 'bad' : '' }, ...content);
    const b = el('button', { type: 'button', className: `mod-dep-link${bad ? ' bad' : ''}`, title: t('Pokaż ten mod na liście') }, ...content);
    b.addEventListener('click', () => go(file));
    return el('li', {}, b);
  };
  const tag = (text: string, cls = '') => el('span', { className: `tag ${cls}`.trim(), textContent: text });

  const requires = [...node.requires].sort((a, b) => Number(a.optional) - Number(b.optional));
  const reqList = el('ul', { className: 'mod-dep-list' }, ...requires.map((r) => {
    const provider = r.provider ? byFile.get(r.provider) : undefined;
    const tags: HTMLElement[] = [];
    if (r.ranges) tags.push(tag(r.ranges, 'muted-tag'));
    if (r.optional) tags.push(tag(t('opcjonalny')));
    if (r.state !== 'ok') tags.push(tag(t(STATE_TEXT[r.state]), r.optional && r.state === 'missing' ? '' : 'bad-tag'));
    if (r.state === 'version' && provider?.version) tags.push(tag(t('jest {0}', provider.version), 'muted-tag'));
    return entry(provider?.name ?? r.id, provider?.file, tags, !r.optional && r.state !== 'ok');
  }));
  const users = neededBy(nodes, node.file);
  const usedList = el('ul', { className: 'mod-dep-list' }, ...users.map(({ node: n, optional }) =>
    entry(n.name, n.file, [...(optional ? [tag(t('opcjonalnie'))] : []), ...(n.enabled ? [] : [tag(t('wyłączony'), 'muted-tag')])])));

  const notes: string[] = [];
  if (node.library) notes.push(t('Biblioteka: sama nic nie dodaje do gry, służy innym modom.'));
  if (node.origin === 'dependency') notes.push(t('Launcher zainstalował go jako zależność innego moda.'));
  box.append(
    el('div', { className: 'mod-dep-col' }, el('h4', {}, icon('fa-arrow-down'), ` ${t('Wymaga')}`),
      requires.length ? reqList : el('p', { className: 'muted', textContent: t('Nie wymaga innych modów.') })),
    el('div', { className: 'mod-dep-col' }, el('h4', {}, icon('fa-arrow-up'), ` ${t('Potrzebny dla')}`),
      users.length ? usedList : el('p', { className: 'muted', textContent: t('Żaden zainstalowany mod go nie wymaga.') })),
    ...(notes.length ? [el('p', { className: 'muted mod-dep-note', textContent: notes.join(' ') })] : []));
  return box;
}

/**
 * "Wyłączenie Fabric API zepsuje 12 modów": the mods that stop working and the choice of
 * cancelling, going ahead, or taking them along (disabled, also when the mod itself is removed).
 */
export function askDependants(kind: 'disable' | 'remove', names: string[], broken: ModNode[]): Promise<DependantsChoice> {
  return new Promise((resolve) => {
    let picked: DependantsChoice = 'cancel';
    const what = names.length === 1 ? names[0] : t('zaznaczonych ({0})', names.length);
    const title = kind === 'disable' ? t('Wyłączenie {0} zepsuje {1}', what, modsCount(broken.length)) : t('Usunięcie {0} zepsuje {1}', what, modsCount(broken.length));
    const shown = broken.slice(0, 12);
    const list = el('ul', { className: 'mod-launch-problems mod-broken-list' }, ...shown.map((n) => el('li', { textContent: n.name })),
      ...(broken.length > shown.length ? [el('li', { className: 'muted', textContent: t('…i {0} więcej', broken.length - shown.length) })] : []));
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const anyway = el('button', { type: 'button', className: 'danger' }, kind === 'disable' ? t('Wyłącz mimo to') : t('Usuń mimo to'));
    const together = el('button', { type: 'button', className: 'primary' }, icon('fa-link-slash'), ' ',
      kind === 'disable' ? t('Wyłącz razem z zależnymi ({0})', broken.length) : t('Usuń, a zależne wyłącz ({0})', broken.length));
    const close = modalWindow(title, [
      el('p', { className: 'muted', textContent: t('Te mody go wymagają i bez niego gra się z nimi nie uruchomi:') }), list,
      ...(kind === 'remove' ? [el('p', { className: 'muted', textContent: t('Zależne mody zostaną tylko wyłączone, nie usunięte.') })] : []),
    ], [cancel, anyway, together], () => resolve(picked), 'fr-group-modal mod-deps-modal');
    cancel.addEventListener('click', () => close());
    anyway.addEventListener('click', () => { picked = 'anyway'; close(); });
    together.addEventListener('click', () => { picked = 'together'; close(); });
    together.focus();
  });
}

/** Leftover libraries with a box each: resolves with the ones to remove (none when the player keeps them). */
export function pickOrphans(orphans: Orphan[]): Promise<ModNode[]> {
  return new Promise((resolve) => {
    let result: ModNode[] = [];
    const boxes = orphans.map((o) => {
      const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: o.ticked });
      const why = o.neededByDisabled.length ? t('potrzebna wyłączonym: {0}', o.neededByDisabled.join(', '))
        : o.node.origin === 'dependency' ? t('zainstalowana jako zależność')
        : t('nie wiadomo, czy dodałeś ją sam – sprawdź');
      const row = el('label', { className: 'orphan-row' }, box, el('span', {}, el('b', { textContent: o.node.name }), el('small', { textContent: why })));
      return { o, box, row };
    });
    const remove = el('button', { type: 'button', className: 'danger' }, icon('fa-trash-can'), ' ', t('Usuń zaznaczone'));
    const keep = el('button', { type: 'button' }, t('Zostaw'));
    const sync = () => { remove.disabled = !boxes.some((b) => b.box.checked); };
    boxes.forEach((b) => b.box.addEventListener('change', sync));
    sync();
    const close = modalWindow(t('Te biblioteki nie są już potrzebne'), [
      el('p', { className: 'muted', textContent: t('Żaden włączony mod ich już nie wymaga. Usunięte pliki trafią do kosza systemowego, a zaraz po usunięciu możesz to cofnąć.') }),
      el('div', { className: 'orphan-list' }, ...boxes.map((b) => b.row)),
    ], [keep, remove], () => resolve(result), 'fr-group-modal mod-deps-modal');
    keep.addEventListener('click', () => close());
    remove.addEventListener('click', () => { result = boxes.filter((b) => b.box.checked).map((b) => b.o.node); close(); });
  });
}
