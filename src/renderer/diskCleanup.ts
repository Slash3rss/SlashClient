import { t } from '../shared/i18n';
import { confirmDialog, control, el, fmtSize, icon } from './dialog';

/**
 * "Sprzątanie miejsca" in Settings: what the launcher's data takes, and the things that can go
 * (only provably unused ones, worked out by the main process). Everything chosen goes to the
 * system trash after the player sees the list and the total and confirms.
 */

type Group = 'runtimes' | 'versions' | 'libraries' | 'logs' | 'backups' | 'caches' | 'orphans';
interface Item { id: string; group: Group; label: string; detail: string; bytes: number; files: number; selected: boolean }
interface Report { categories: { key: string; label: string; bytes: number }[]; items: Item[]; notes: string[]; olderThanDays: number }

export interface DiskCleanupDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

const GROUPS: { group: Group; icon: string; title: string }[] = [
  { group: 'runtimes', icon: 'fa-mug-hot', title: 'Nieużywana Java' },
  { group: 'versions', icon: 'fa-cube', title: 'Nieużywane wersje gry' },
  { group: 'libraries', icon: 'fa-book', title: 'Nieużywane biblioteki' },
  { group: 'logs', icon: 'fa-file-lines', title: 'Stare logi' },
  { group: 'backups', icon: 'fa-box-archive', title: 'Stare kopie zapasowe' },
  { group: 'caches', icon: 'fa-database', title: 'Pamięć podręczna' },
  { group: 'orphans', icon: 'fa-folder-minus', title: 'Foldery usuniętych profili' },
];

export function createDiskCleanup(root: HTMLElement, deps: DiskCleanupDeps) {
  const { api, toast, errorText } = deps;
  let report: Report | undefined;
  let running = false;
  const chosen = new Set<string>();

  const days = control<HTMLSelectElement>('select', { className: 'disk-days' });
  for (const d of [7, 30, 90, 180]) days.append(control<HTMLOptionElement>('option', { value: String(d), textContent: t('{0} dni', d) }));
  days.value = '30';
  const scan = el('button', { type: 'button', className: 'primary' }, icon('fa-magnifying-glass-chart'), ' ', t('Sprawdź'));
  const body = el('div', { className: 'disk-body' });
  const notice = el('div', { className: 'notice hidden', textContent: t('Gra jest uruchomiona: zamknij ją, żeby posprzątać.') });
  const total = el('span', { className: 'grow' });
  const clean = el('button', { type: 'button', className: 'danger' }, icon('fa-trash-can'), ' ', t('Przenieś do kosza'));
  const footer = el('div', { className: 'row disk-footer hidden' }, total, clean);

  root.append(
    el('h3', {}, icon('fa-broom'), ' ', t('Sprzątanie miejsca')),
    el('p', { className: 'muted', textContent: t('Sprawdza, ile miejsca zajmują dane launchera, i pokazuje, co można bezpiecznie usunąć: rzeczy, których nie potrzebuje żaden profil, oraz stare logi i kopie zapasowe. Wszystko trafia do kosza systemowego.') }),
    el('div', { className: 'row disk-controls' },
      el('label', { className: 'field disk-days-field' }, el('span', { className: 'label', textContent: t('Logi i kopie zapasowe starsze niż') }), days),
      scan),
    notice, body, footer,
  );

  const selectedItems = () => (report?.items ?? []).filter((i) => chosen.has(i.id));
  function renderFooter() {
    const items = selectedItems();
    const bytes = items.reduce((a, i) => a + i.bytes, 0);
    footer.classList.toggle('hidden', !report?.items.length);
    total.textContent = items.length ? t('Zaznaczone: {0} ({1})', items.length, fmtSize(bytes)) : t('Nic nie zaznaczono');
    clean.disabled = running || !items.length;
    notice.classList.toggle('hidden', !running || !report);
  }

  function render() {
    if (!report) return;
    const sum = report.categories.reduce((a, c) => a + c.bytes, 0);
    const biggest = Math.max(1, ...report.categories.map((c) => c.bytes));
    const rows = report.categories.map((c) => {
      const bar = el('div', { className: 'disk-bar' }, el('div', {}));
      (bar.firstChild as HTMLElement).style.width = `${(c.bytes / biggest) * 100}%`;
      return el('div', { className: 'disk-cat' }, el('span', { textContent: c.label }), bar, el('b', { textContent: fmtSize(c.bytes) }));
    });
    const parts: HTMLElement[] = [
      el('div', { className: 'disk-cats' }, ...rows, el('div', { className: 'disk-cat sum' }, el('span', { textContent: t('Razem') }), el('span'), el('b', { textContent: fmtSize(sum) }))),
      ...report.notes.map((n) => el('div', { className: 'notice', textContent: n })),
    ];
    if (!report.items.length) parts.push(el('p', { className: 'muted disk-clean', textContent: t('Nie ma nic do posprzątania.') }));
    for (const g of GROUPS) {
      const items = report.items.filter((i) => i.group === g.group);
      if (!items.length) continue;
      const groupBytes = items.reduce((a, i) => a + i.bytes, 0);
      parts.push(el('h4', { className: 'disk-group' }, icon(g.icon), ' ', t(g.title), el('small', { className: 'muted', textContent: fmtSize(groupBytes) })));
      parts.push(el('div', { className: 'join-list disk-list' }, ...items.map((item) => {
        const box = control<HTMLInputElement>('input', { type: 'checkbox', checked: chosen.has(item.id) });
        box.addEventListener('change', () => {
          if (box.checked) chosen.add(item.id);
          else chosen.delete(item.id);
          renderFooter();
        });
        return el('label', { className: 'join-choice perf-choice' }, box,
          el('div', { className: 'grow' }, el('b', { textContent: item.label }), el('small', { textContent: item.detail })),
          el('span', { className: 'disk-size', textContent: fmtSize(item.bytes) }));
      })));
    }
    body.replaceChildren(...parts);
    renderFooter();
  }

  async function runScan() {
    scan.disabled = true;
    const label = [...scan.childNodes];
    scan.replaceChildren(el('span', { className: 'spinner' }), ' ', t('Sprawdzanie…'));
    try {
      report = await api.scanDisk(Number(days.value));
      chosen.clear();
      for (const i of report!.items) if (i.selected) chosen.add(i.id);
      render();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      scan.disabled = false;
      scan.replaceChildren(...label);
    }
  }

  async function runClean() {
    const items = selectedItems();
    if (!items.length || running) return;
    const bytes = items.reduce((a, i) => a + i.bytes, 0);
    const go = await confirmDialog({
      title: t('Przenieść do kosza {0}?', fmtSize(bytes)),
      body: [
        el('div', { className: 'join-list disk-confirm' }, ...items.map((i) => el('div', { className: 'disk-confirm-row' },
          el('span', { className: 'grow', textContent: `${t(GROUPS.find((g) => g.group === i.group)!.title)}: ${i.label}` }), el('b', { textContent: fmtSize(i.bytes) })))),
        el('p', { className: 'muted', textContent: t('Wszystko trafi do kosza systemowego, więc możesz to jeszcze przywrócić. Wersje, biblioteki i Java pobiorą się znowu, jeśli kiedyś będą potrzebne.') }),
      ],
      ok: t('Przenieś do kosza'),
      okIcon: 'fa-trash-can',
      danger: true,
    });
    if (!go) return;
    clean.disabled = true;
    const label = [...clean.childNodes];
    clean.replaceChildren(el('span', { className: 'spinner' }), ' ', t('Sprzątanie…'));
    try {
      const res: { removed: number; bytes: number; failed: string[] } = await api.cleanDisk(items.map((i) => i.id));
      if (res.failed.length) toast(t('Zwolniono {0}. Nie udało się przenieść do kosza {1} elementów.', fmtSize(res.bytes), res.failed.length), true);
      else toast(t('Zwolniono {0}', fmtSize(res.bytes)));
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      clean.replaceChildren(...label);
    }
    await runScan();
  }

  scan.addEventListener('click', () => void runScan());
  clean.addEventListener('click', () => void runClean());
  // a running game keeps its files: cleaning waits until it closes
  api.on('store', (s: { runningProfiles?: string[] }) => {
    running = (s.runningProfiles ?? []).length > 0;
    renderFooter();
  });
  api.getStore().then((s: { runningProfiles?: string[] }) => {
    running = (s.runningProfiles ?? []).length > 0;
    renderFooter();
  }).catch(() => {});
}
