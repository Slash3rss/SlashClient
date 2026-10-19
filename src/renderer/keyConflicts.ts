import { t } from '../shared/i18n';
import { control, el, icon } from './dialog';

/**
 * "Konflikty klawiszy" in a profile's settings: actions of the game and of mods bound to the same
 * key in options.txt, each extra one with a suggested free key, and one button that rebinds them.
 * The main process only writes options.txt while the game is closed (the game rewrites it on exit).
 */

interface Action { action: string; label: string; vanilla: boolean }
interface Fix extends Action { to: string; toLabel: string }
interface Report {
  exists: boolean;
  running: boolean;
  shared?: boolean;
  conflicts: { key: string; keyLabel: string; actions: Action[] }[];
  fixes: Fix[];
  free: { key: string; label: string }[];
}

export interface KeyConflictsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

export function createKeyConflicts(root: HTMLElement, deps: KeyConflictsDeps) {
  const { api, toast, errorText } = deps;
  let profileId: string | undefined;
  let lastRunning: boolean | undefined;
  let busy = false;
  /** Answers for an older profile are dropped. */
  let seq = 0;

  const recheck = el('button', { type: 'button', title: t('Sprawdź ponownie') }, icon('fa-rotate'));
  const body = el('div', { className: 'keys-body' });
  root.append(
    el('div', { className: 'row bench-head' }, el('h3', {}, icon('fa-keyboard'), ' ', t('Konflikty klawiszy')), recheck),
    el('p', { className: 'muted', textContent: t('Akcje gry i modów przypisane do tego samego klawisza w options.txt. Naprawa przenosi dodatkowe akcje na wolne klawisze.') }),
    body,
  );
  recheck.addEventListener('click', () => void load(true));

  async function load(force = false) {
    if (!profileId) return;
    const mine = ++seq;
    if (force) body.replaceChildren(el('p', { className: 'muted', textContent: t('Sprawdzanie…') }));
    try {
      const report = (await api.keyConflicts(profileId)) as Report;
      if (mine === seq) render(report);
    } catch (err) {
      if (mine === seq) body.replaceChildren(el('p', { className: 'muted', textContent: errorText(err) }));
    }
  }

  function render(report: Report) {
    lastRunning = report.running;
    if (!report.exists) {
      body.replaceChildren(el('p', { className: 'muted keys-empty' }, icon('fa-circle-info'), ' ', t('Profil nie ma jeszcze pliku options.txt: uruchom grę raz, żeby go utworzyć.')));
      return;
    }
    if (!report.conflicts.length) {
      body.replaceChildren(el('p', { className: 'keys-ok' }, icon('fa-circle-check'), ' ', t('Brak konfliktów: każdy klawisz ma jedną akcję.')));
      return;
    }
    const fixes = new Map(report.fixes.map((f) => [f.action, f]));
    const selects = new Map<string, HTMLSelectElement>();
    const rows = report.conflicts.map((c) =>
      el('div', { className: 'keys-row' },
        el('div', { className: 'keys-key' }, el('kbd', { textContent: c.keyLabel })),
        el('div', { className: 'keys-actions' },
          ...c.actions.map((a, i) => {
            const fix = fixes.get(a.action);
            const line = el('div', { className: 'keys-action' },
              el('span', { className: `tag ${a.vanilla ? 'release' : 'mode'}`, textContent: a.vanilla ? t('gra') : t('mod') }),
              el('span', { className: 'keys-name', textContent: a.label, title: a.action }));
            if (i > 0 && fix) {
              const select = control<HTMLSelectElement>('select', { className: 'keys-select', title: t('Nowy klawisz') });
              for (const f of [{ key: fix.to, label: fix.toLabel }, ...report.free.filter((k) => k.key !== fix.to)]) {
                select.append(control<HTMLOptionElement>('option', { value: f.key, textContent: f.label }));
              }
              select.value = fix.to;
              selects.set(a.action, select);
              line.append(el('span', { className: 'keys-arrow' }, icon('fa-arrow-right')), select);
            } else if (i === 0) {
              line.append(el('span', { className: 'muted keys-stays', textContent: t('zostaje') }));
            }
            return line;
          }))));
    const fixAll = el('button', { type: 'button', className: 'primary' }, icon('fa-wand-magic-sparkles'), ' ', t('Napraw konflikty'));
    fixAll.disabled = report.running || !selects.size;
    fixAll.addEventListener('click', async () => {
      if (busy) return;
      const chosen = [...selects].map(([action, s]) => ({ action, to: s.value }));
      // two moved actions must not land on the same new key
      if (new Set(chosen.map((c) => c.to)).size !== chosen.length) return toast(t('Wybierz różne klawisze dla przenoszonych akcji.'), true);
      busy = true;
      fixAll.disabled = true;
      try {
        const n = await api.applyKeyChanges(profileId, chosen);
        toast(t('Zmieniono klawisze: {0}', n));
        await load();
      } catch (err) {
        toast(errorText(err), true);
        fixAll.disabled = false;
      } finally {
        busy = false;
      }
    });
    body.replaceChildren(
      ...(report.running ? [el('div', { className: 'notice', textContent: t('Gra jest uruchomiona: zamknij ją, żeby zmienić klawisze (gra nadpisuje options.txt przy wyjściu).') })] : []),
      el('div', { className: 'keys-list' }, ...rows),
      ...(report.shared ? [el('p', { className: 'muted keys-shared' }, icon('fa-link'), ' ', t('Ten profil ma wspólne ustawienia gry: zmiana obejmie wszystkie profile, które je współdzielą.'))] : []),
      el('div', { className: 'row keys-footer' }, el('span', { className: 'muted grow', textContent: t('Konflikty: {0}', report.conflicts.length) }), fixAll),
    );
  }

  return {
    /** Shows the profile; reloads when it is another one or its game started or stopped. */
    open(id: string | undefined, running: boolean) {
      if (id === profileId && running === lastRunning) return;
      const changed = id !== profileId;
      profileId = id;
      lastRunning = running;
      if (changed) body.replaceChildren(el('p', { className: 'muted', textContent: t('Sprawdzanie…') }));
      void load();
    },
  };
}
