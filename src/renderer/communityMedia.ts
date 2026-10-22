import { locale, t } from '../shared/i18n';
import { control, el, icon, modalWindow } from './dialog';

/**
 * Pictures and polls in a community's chat (server 0.9.30+; communities.ts draws the chat).
 *
 * A picture is not end-to-end encrypted there: the server keeps it as a JPEG for the members (the
 * launcher scales it and the server leaves out its metadata), so its card has no lock. A poll is a
 * message with a question and 2–10 options: one or several choices, an optional end; the results
 * show to everyone and move live (`community-poll`), and a vote may change until the end. Older
 * launchers see the message's text instead ("[Zdjęcie]", or the question with the options).
 */

/** `removed`: taken down by its sender or a moderator (0.9.36+; `expired` then too, for older launchers). */
export interface CommunityImage { id: string; w: number; h: number; size: number; expired?: boolean; removed?: boolean }
export interface Poll {
  question: string; options: { text: string; votes: number }[]; multiple: boolean; voters: number;
  endsAt?: number; closed?: boolean; closedAt?: number;
  /** The reader's own choices (pushed versions have none: they are kept from the one we had). */
  mine?: number[];
}

/** Whether a poll takes votes now (not closed early, not past its end). */
export const pollOpen = (p: Poll, now = Date.now()) => !p.closed && !(p.endsAt && p.endsAt <= now);

/** Each option's share in whole percent of the votes cast (a multiple-choice poll: of the voters). */
export function pollPercents(p: Poll): number[] {
  const total = p.multiple ? p.voters : p.options.reduce((n, o) => n + o.votes, 0);
  return p.options.map((o) => (total ? Math.round((o.votes / total) * 100) : 0));
}

/** A pushed poll (it says nothing of who voted for what): my choices kept from the one we had. */
export function keepMyVotes(old: Poll | undefined, next: Poll): Poll {
  return old?.mine && !next.mine ? { ...next, mine: old.mine } : next;
}

/** What my vote becomes when I click an option: one choice swaps (or is taken back), several toggle. */
export function nextVote(p: Poll, option: number): number[] {
  const mine = p.mine ?? [];
  if (!p.multiple) return mine.includes(option) ? [] : [option];
  return mine.includes(option) ? mine.filter((o) => o !== option) : [...mine, option].sort((a, b) => a - b);
}

/** "1 głos", "3 głosy", "5 głosów" (and "osoby" for those who voted on several). */
export function votesText(n: number): string {
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return n === 1 ? t('{0} głos', n) : few ? t('{0} głosy', n) : t('{0} głosów', n);
}

/** When a poll ends, in words: "Koniec: 21.10, 18:00", or that it has ended. */
export function pollEndText(p: Poll, now = Date.now()): string {
  if (!pollOpen(p, now)) return t('Ankieta zakończona');
  if (!p.endsAt) return t('Bez terminu');
  return t('Koniec: {0}', new Date(p.endsAt).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }));
}

/** The poll's ends to choose from, in minutes (0: none). */
export const POLL_ENDS = [0, 60, 6 * 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60];
const endText = (minutes: number) => (!minutes ? t('Bez terminu') : minutes < 1440 ? t('{0} h', minutes / 60) : minutes === 1440 ? t('1 dzień') : t('{0} dni', minutes / 1440));

/** A new poll as the server takes it, or what is wrong with it. */
export function pollDraft(question: string, options: string[], multiple: boolean, endMinutes: number, now = Date.now()): { poll: { question: string; options: string[]; multiple: boolean; endsAt?: number } } | { error: string } {
  const q = question.replace(/\s+/g, ' ').trim();
  const opts = options.map((o) => o.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!q) return { error: t('Wpisz pytanie.') };
  if (opts.length < 2) return { error: t('Ankieta potrzebuje co najmniej dwóch odpowiedzi.') };
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { error: t('Odpowiedzi muszą się różnić.') };
  return { poll: { question: q, options: opts.slice(0, 10), multiple, ...(endMinutes ? { endsAt: now + endMinutes * 60_000 } : {}) } };
}

interface Api {
  socialApi: (method: string, path: string, body?: unknown) => Promise<any>;
  socialCommunityImage?: (communityId: string, id: string) => Promise<string>;
}

export function createCommunityMedia(deps: { api: Api; toast: (message: string, isError?: boolean) => void; errorText: (err: unknown) => string }) {
  const { api } = deps;
  /** Pictures already here, as data: addresses. */
  const pictures = new Map<string, Promise<string>>();

  /** The picture over the whole window; a click or Esc closes it. */
  function showPicture(src: string) {
    const close = () => {
      box.remove();
      removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const box = el('div', { className: 'fr-lightbox' }, el('img', { src, alt: '' }));
    box.addEventListener('click', close);
    addEventListener('keydown', onKey);
    document.body.append(box);
  }

  /** A picture in a community's chat: fetched on first sight (the box keeps its shape meanwhile), bigger on click. */
  function pictureCard(community: string, image: CommunityImage, mine: boolean): HTMLElement {
    const card = el('div', { className: `fr-bubble fr-image fr-com-image${mine ? ' mine' : ''}` });
    if (image.expired || !api.socialCommunityImage) {
      card.append(icon('fa-image'), el('span', { textContent: image.removed ? t('Zdjęcie usunięte') : image.expired ? t('Zdjęcie wygasło i zniknęło z serwera.') : t('Zdjęcie') }));
      card.classList.add('unreadable');
      return card;
    }
    const w = image.w && image.h ? Math.min(260, image.w) : 260;
    const h = image.w && image.h ? Math.round((w * image.h) / image.w) : 146;
    const img = el('img', { alt: t('Zdjęcie'), width: w, height: h });
    card.append(img);
    let url = pictures.get(image.id);
    if (!url) {
      url = api.socialCommunityImage(community, image.id);
      pictures.set(image.id, url);
      url.catch(() => pictures.delete(image.id));
    }
    url.then((src) => {
      img.src = src;
      img.addEventListener('click', () => showPicture(src));
    }, () => {
      card.replaceChildren(icon('fa-image'), el('span', { textContent: t('Zdjęcia nie ma już na serwerze.') }));
      card.classList.add('unreadable');
    });
    return card;
  }

  /**
   * A poll: the question, each option as a bar with its share (mine marked; a click votes while it
   * is open and I may), how many voted and when it ends; its author and moderators close it early.
   */
  function pollCard(m: { id: number; community: string; channel: string; poll: Poll }, opts: { canVote: boolean; canClose: boolean; changed: (poll: Poll) => void }): HTMLElement {
    const p = m.poll;
    const open = pollOpen(p);
    const percents = pollPercents(p);
    const mine = new Set(p.mine ?? []);
    const vote = async (option: number) => {
      try {
        const res = await api.socialApi('POST', `/v1/communities/${m.community}/channels/${m.channel}/messages/${m.id}/vote`, { options: nextVote(p, option) });
        if (res?.message?.poll) opts.changed(res.message.poll);
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      }
    };
    const bar = (pct: number) => {
      const b = el('span', { className: 'fr-poll-bar' });
      b.style.width = `${pct}%`;
      return b;
    };
    const rows = p.options.map((o, i) => {
      const chosen = mine.has(i);
      const b = el('button', { type: 'button', className: `fr-poll-option${chosen ? ' mine' : ''}`, disabled: !open || !opts.canVote },
        bar(percents[i]),
        el('i', { className: chosen ? `fa-solid ${p.multiple ? 'fa-square-check' : 'fa-circle-dot'}` : `fa-regular ${p.multiple ? 'fa-square' : 'fa-circle'}` }),
        el('span', { className: 'grow fr-poll-text', textContent: o.text }),
        el('b', { className: 'fr-poll-pct', textContent: `${percents[i]}%` }),
        el('small', { className: 'muted', textContent: String(o.votes) }));
      b.title = votesText(o.votes);
      b.addEventListener('click', () => void vote(i));
      return b;
    });
    const foot = el('div', { className: 'fr-poll-foot' },
      el('small', { className: 'muted grow', textContent: `${votesText(p.multiple ? p.voters : p.options.reduce((n, o) => n + o.votes, 0))}${p.multiple ? ` · ${t('kilka odpowiedzi')}` : ''} · ${pollEndText(p)}` }));
    if (open && opts.canClose) {
      const close = el('button', { type: 'button', className: 'fr-poll-close', title: t('Zakończ głosowanie teraz') }, icon('fa-lock'), ` ${t('Zakończ')}`);
      close.addEventListener('click', async () => {
        try {
          const res = await api.socialApi('POST', `/v1/communities/${m.community}/channels/${m.channel}/messages/${m.id}/poll/close`);
          if (res?.message?.poll) opts.changed(res.message.poll);
        } catch (err) {
          deps.toast(deps.errorText(err), true);
        }
      });
      foot.append(close);
    }
    return el('div', { className: `fr-bubble fr-poll${open ? '' : ' closed'}` },
      el('div', { className: 'fr-poll-head' }, icon('fa-square-poll-horizontal'), el('b', { textContent: p.question })), ...rows, foot);
  }

  /** "Nowa ankieta": the question, 2–10 answers, one or several choices, an end. True when it was sent. */
  function pollWindow(send: (poll: object) => Promise<boolean>, maxOptions = 10) {
    const question = control<HTMLInputElement>('input', { placeholder: t('Pytanie'), maxLength: 300 });
    const list = el('div', { className: 'fr-poll-inputs' });
    const add = el('button', { type: 'button', className: 'link-button' }, icon('fa-plus'), t(' Dodaj odpowiedź'));
    const option = (value = '') => {
      const input = control<HTMLInputElement>('input', { placeholder: t('Odpowiedź {0}', list.childElementCount + 1), maxLength: 80, value });
      const remove = el('button', { type: 'button', className: 'icon-btn', title: t('Usuń odpowiedź') }, icon('fa-xmark'));
      const row = el('div', { className: 'row fr-poll-input' }, input, remove);
      remove.addEventListener('click', () => {
        if (list.childElementCount <= 2) return;
        row.remove();
        renumber();
      });
      list.append(row);
      renumber();
      return input;
    };
    const renumber = () => {
      [...list.querySelectorAll('input')].forEach((x, i) => ((x as HTMLInputElement).placeholder = t('Odpowiedź {0}', i + 1)));
      add.classList.toggle('hidden', list.childElementCount >= maxOptions);
    };
    option();
    option();
    add.addEventListener('click', () => option().focus());
    const multiple = control<HTMLInputElement>('input', { type: 'checkbox' });
    const end = control<HTMLSelectElement>('select', {});
    end.append(...POLL_ENDS.map((m) => el('option', { value: String(m), textContent: endText(m) })));
    end.value = String(24 * 60);
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    const go = el('button', { type: 'button', className: 'primary' }, icon('fa-square-poll-horizontal'), t(' Utwórz ankietę'));
    const done = modalWindow(t('Nowa ankieta'), [
      question, list, add,
      el('label', { className: 'row fr-check' }, multiple, el('span', { textContent: t('Można wybrać kilka odpowiedzi') })),
      el('label', { className: 'fr-field' }, el('span', { className: 'muted', textContent: t('Koniec głosowania') }), end),
      el('p', { className: 'muted', textContent: t('Wyniki widzą wszyscy na bieżąco; głos można zmienić do końca ankiety.') }),
    ], [cancel, go], undefined, 'fr-group-modal fr-com-modal fr-poll-modal');
    cancel.addEventListener('click', done);
    go.addEventListener('click', async () => {
      const draft = pollDraft(question.value, [...list.querySelectorAll('input')].map((x) => (x as HTMLInputElement).value), multiple.checked, Number(end.value));
      if ('error' in draft) return deps.toast(draft.error, true);
      go.disabled = true;
      const ok = await send(draft.poll);
      go.disabled = false;
      if (ok) done();
    });
    question.focus();
  }

  return { pictureCard, pollCard, pollWindow, showPicture };
}
