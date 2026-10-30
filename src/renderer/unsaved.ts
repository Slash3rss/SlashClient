import { t } from '../shared/i18n';
import { el, icon } from './dialog';

/**
 * "Masz niezapisane zmiany": a bar at the bottom of the window while a form with a "Zapisz" button
 * has changes the player has not saved, with that form's save and a way back to what was saved. It
 * stays when the player goes to another view, so the changes are not lost without a word.
 */

interface Tracked {
  form: HTMLFormElement;
  dirty: boolean;
  /** What has changes, e.g. "w profilu „SlashClient 26.3”". */
  label: () => string;
  revert: () => void;
}

const tracked: Tracked[] = [];
let bar: HTMLElement | undefined;

/**
 * Watches a form's named fields (fields saved on their own, `autosaved`, do not count); `clean()` after
 * a save or when the form is filled again.
 */
export function trackUnsaved(form: HTMLFormElement, opts: { label: () => string; revert: () => void; autosaved?: string[] }) {
  const entry: Tracked = { form, dirty: false, label: opts.label, revert: opts.revert };
  tracked.push(entry);
  const mark = (e: Event) => {
    const name = (e.target as HTMLInputElement).name;
    if (!name || opts.autosaved?.includes(name) || entry.dirty) return;
    entry.dirty = true;
    update();
  };
  form.addEventListener('input', mark);
  form.addEventListener('change', mark);
  return {
    isDirty: () => entry.dirty,
    clean: () => {
      if (!entry.dirty) return;
      entry.dirty = false;
      update();
    },
  };
}

function update() {
  const dirty = tracked.find((x) => x.dirty);
  if (!dirty) {
    if (bar) {
      const node = bar;
      bar = undefined;
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 200);
    }
    return;
  }
  const revert = el('button', { type: 'button' }, icon('fa-rotate-left'), ' ', t('Cofnij'));
  revert.addEventListener('click', () => {
    dirty.dirty = false;
    dirty.revert();
    update();
  });
  const save = el('button', { type: 'button', className: 'primary' }, icon('fa-floppy-disk'), ' ', t('Zapisz'));
  save.addEventListener('click', () => dirty.form.requestSubmit());
  const content = [icon('fa-circle-exclamation'), el('span', { className: 'unsaved-text' }, el('b', { textContent: t('Masz niezapisane zmiany') }), ' ', dirty.label()),
    el('span', { className: 'grow' }), revert, save];
  if (bar) bar.replaceChildren(...content);
  else {
    bar = el('div', { className: 'unsaved-bar' }, ...content);
    bar.setAttribute('role', 'status');
    document.body.append(bar);
  }
}
