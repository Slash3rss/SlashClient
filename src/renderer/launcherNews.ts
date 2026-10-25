import { getLang, locale, t } from '../shared/i18n';
import { hasUnseen, updateIssues, type ChangelogPage, type LauncherRelease } from '../shared/launcherReleases';
import { compareVersion, parseNotes, type Block, type Inline } from '../../server/src/releaseNotes';
import { confirmDialog, control, el, icon, modalWindow } from './dialog';

/**
 * SlashClient's own releases, from the SlashClient server (/v1/changelog, server 0.9.40+):
 *  - "Nowości w launcherze" on the Play screen: a card per release (version, date, the "Nowość"
 *    badge as its title, notes to unfold), "Twoja wersja" on the installed one, "Aktualizuj" on a
 *    newer one, a dot on the tab while there is a release the player has not seen;
 *  - "Co nowego w SlashClient X" at the first start after an update (off in Settings or in the window);
 *  - Settings: "Historia zmian" (every release, older ones load while scrolling) and "Wróć do
 *    poprzedniej wersji" (the last few releases, installed like an update; automatic updates then
 *    pause until a newer release than the one left, with a switch to turn them back on).
 * An older server has no changelog: the tab and these buttons stay hidden.
 */

export interface LauncherNewsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** The installed version. */
  version: () => Promise<string>;
  settings: () => { changelogSeen?: string; whatsNewAfterUpdate?: boolean; updatesPausedUntil?: string } | undefined;
}

/** The update as the update bar knows it (updates.ts). */
interface UpdateState { state: string; version?: string; pausedUntil?: string; rollback?: string }

/** Opens a link in the system browser (the main process sends every new window there). */
const openLink = (href: string) => window.open(href, '_blank');

function inlineNodes(nodes: Inline[]): Node[] {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return document.createTextNode(n.text);
      case 'code': return el('code', { textContent: n.text });
      case 'strong': return el('strong', {}, ...inlineNodes(n.children));
      case 'em': return el('em', {}, ...inlineNodes(n.children));
      case 'link': {
        const a = el('a', { href: n.href, title: n.href }, ...inlineNodes(n.children));
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openLink(n.href);
        });
        return a;
      }
    }
  });
}

function blockNode(b: Block): HTMLElement {
  if (b.type === 'heading') return el(b.level <= 2 ? 'h3' : 'h4', {}, ...inlineNodes(b.children));
  if (b.type === 'paragraph') return el('p', {}, ...inlineNodes(b.children));
  const list = el(b.ordered ? 'ol' : 'ul');
  for (const item of b.items) list.append(el('li', {}, ...inlineNodes(item.children), ...(item.list ? [blockNode(item.list)] : [])));
  return list;
}

/**
 * A release's notes as page elements: built node by node from the parsed Markdown (text only ever
 * becomes text; links only https, opened in the browser), never as HTML. Not translated by the page.
 */
export function notesView(md: string): HTMLElement {
  const box = el('div', { className: 'article release-notes' });
  box.dataset.noI18n = '';
  const blocks = parseNotes(md);
  box.append(...(blocks.length ? blocks.map(blockNode) : [el('p', { className: 'muted', textContent: t('Brak opisu zmian.') })]));
  return box;
}

const fmtDate = (iso: string) => {
  const d = Date.parse(iso);
  return Number.isNaN(d) ? '' : new Date(d).toLocaleDateString(locale(), { dateStyle: 'long' });
};

export function createLauncherNews(d: LauncherNewsDeps) {
  const { api } = d;
  let available: boolean | undefined;
  let installed = '';
  let update: UpdateState = { state: 'idle' };
  let releases: LauncherRelease[] = [];
  let more = false;
  let loading = false;
  const listeners: ((on: boolean) => void)[] = [];

  async function page(before?: string, limit = 20): Promise<ChangelogPage | null> {
    return api.changelog(before, limit, getLang());
  }

  /** Shows or hides everything that needs the server's changelog. */
  function setAvailable(on: boolean) {
    available = on;
    document.querySelectorAll<HTMLElement>('[data-needs-changelog]').forEach((x) => x.classList.toggle('hidden', !on));
    for (const fn of listeners) fn(on);
  }

  function refreshDot() {
    const newest = releases[0]?.version;
    document.getElementById('launcher-news-dot')?.classList.toggle('hidden', !hasUnseen(newest, d.settings()?.changelogSeen, installed));
  }

  /** The tab is open: everything in it counts as seen. */
  async function markSeen() {
    const newest = releases[0]?.version;
    if (!newest || !hasUnseen(newest, d.settings()?.changelogSeen, installed)) return;
    const s = d.settings();
    if (s) s.changelogSeen = newest;
    refreshDot();
    await api.changelogPrefs({ seen: newest }).catch(() => {});
  }

  // ---- the tab ----

  function card(r: LauncherRelease): HTMLElement {
    const mine = compareVersion(r.version, installed) === 0;
    const newer = compareVersion(r.version, installed) > 0;
    const head = el('div', { className: 'ln-head' },
      el('b', { className: 'ln-version', textContent: `SlashClient ${r.version}` }),
      ...(mine ? [el('span', { className: 'tag ln-mine', textContent: t('Twoja wersja') })] : []),
      ...(newer ? [el('span', { className: 'tag ln-new', textContent: t('Nowa') })] : []),
      el('small', { className: 'muted', textContent: fmtDate(r.date) }));
    const notes = notesView(r.notes);
    notes.classList.add('hidden');
    const toggle = el('button', { type: 'button', className: 'ln-toggle' }, icon('fa-chevron-down'), ` ${t('Pokaż zmiany')}`);
    toggle.addEventListener('click', () => {
      const open = notes.classList.toggle('hidden') === false;
      toggle.replaceChildren(icon(open ? 'fa-chevron-up' : 'fa-chevron-down'), ` ${open ? t('Zwiń') : t('Pokaż zmiany')}`);
    });
    const actions = el('div', { className: 'row ln-actions' }, toggle);
    if (newer) {
      const go = el('button', { type: 'button', className: 'primary' }, icon('fa-circle-arrow-up'), ` ${t('Aktualizuj')}`);
      go.addEventListener('click', () => void updateNow(go));
      actions.append(go);
    }
    const box = el('article', { className: `ln-card${mine ? ' mine' : ''}` }, head);
    if (r.title) box.append(el('p', { className: 'ln-title', textContent: r.title }));
    box.append(actions, notes);
    box.dataset.version = r.version;
    return box;
  }

  /** A game runs: the update waits for it, and the player is told. */
  function afterGame(how: 'now' | 'after-game') {
    if (how === 'after-game') d.toast(t('Aktualizacja zainstaluje się, gdy zamkniesz grę.'));
  }

  /** "Aktualizuj": the update the launcher already knows (the bar at the top), or a check for it now. */
  async function updateNow(button: HTMLButtonElement) {
    if (update.state === 'ready' && !update.rollback) return afterGame(await api.installUpdate());
    if (update.state === 'dev') return d.toast(t('To wersja deweloperska – nie aktualizuje się sama.'), true);
    button.disabled = true;
    try {
      // a paused launcher (after going back) is asked first: updating means turning updates back on
      if (update.pausedUntil) await api.resumeUpdates();
      const u: UpdateState = await api.checkForUpdates();
      update = u;
      if (u.state === 'ready') return afterGame(await api.installUpdate());
      d.toast(u.state === 'none' ? t('Masz już najnowszą wersję, jaką serwer udostępnia.') : t('Pobieram nową wersję – gdy będzie gotowa, pasek na górze pozwoli uruchomić launcher ponownie.'), u.state === 'error');
    } catch (err) {
      d.toast(d.errorText(err), true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadTab(older = false) {
    const list = document.getElementById('launcher-news');
    if (!list || loading) return;
    loading = true;
    list.querySelector('.more')?.remove();
    list.querySelector('.news-failed')?.remove();
    if (!older) list.replaceChildren(el('p', { className: 'muted', textContent: t('Ładowanie…') }));
    try {
      const p = await page(older ? releases[releases.length - 1]?.version : undefined);
      if (!p) return setAvailable(false);
      setAvailable(true);
      releases = older ? [...releases, ...p.releases] : p.releases;
      more = p.more;
      if (!older) list.replaceChildren();
      list.append(...p.releases.map(card));
      if (!releases.length) list.append(el('p', { className: 'muted', textContent: t('Nie ma jeszcze żadnych wydań.') }));
      if (more) {
        const btn = el('button', { type: 'button', className: 'more' }, icon('fa-chevron-down'), ` ${t('Pokaż starsze')}`);
        btn.addEventListener('click', () => void loadTab(true));
        list.append(btn);
      }
      refreshDot();
    } catch {
      const retry = el('button', { type: 'button' }, icon('fa-rotate-right'), ` ${t('Spróbuj ponownie')}`);
      retry.addEventListener('click', () => void loadTab(older));
      const failed = el('div', { className: 'news-failed' }, el('p', { className: 'muted', textContent: t('Nie udało się pobrać nowości launchera.') }), retry);
      if (older) list.append(failed);
      else list.replaceChildren(failed);
    } finally {
      loading = false;
    }
  }

  // ---- "Co nowego" ----

  async function showWhatsNew(version: string) {
    const r: LauncherRelease | null = await api.changelogRelease(version, getLang()).catch(() => null);
    if (!r) return;
    const off = control<HTMLInputElement>('input', { type: 'checkbox', checked: d.settings()?.whatsNewAfterUpdate === false });
    off.addEventListener('change', () => {
      const s = d.settings();
      if (s) s.whatsNewAfterUpdate = !off.checked;
      syncSettings();
      void api.changelogPrefs({ whatsNew: !off.checked });
    });
    const history = el('button', { type: 'button' }, icon('fa-clock-rotate-left'), ` ${t('Historia zmian')}`);
    const ok = el('button', { type: 'button', className: 'primary' }, icon('fa-check'), ` ${t('Super!')}`);
    const close = modalWindow(t('Co nowego w SlashClient {0}', r.version), [
      el('small', { className: 'muted', textContent: fmtDate(r.date) }),
      ...(r.title ? [el('p', { className: 'ln-title', textContent: r.title })] : []),
      el('div', { className: 'ln-whatsnew-notes' }, notesView(r.notes)),
      el('label', { className: 'check' }, off, ` ${t('Nie pokazuj po aktualizacjach')}`),
    ], [history, ok], undefined, 'ln-modal');
    ok.addEventListener('click', () => close());
    history.addEventListener('click', () => {
      close();
      openHistory();
    });
    // the release counts as seen
    const s = d.settings();
    if (s && hasUnseen(r.version, s.changelogSeen, '0.0.0')) {
      s.changelogSeen = r.version;
      void api.changelogPrefs({ seen: r.version }).catch(() => {});
      refreshDot();
    }
  }

  // ---- "Historia zmian" ----

  function openHistory() {
    const list = el('div', { className: 'ln-history' });
    const status = el('p', { className: 'muted ln-history-status', textContent: t('Ładowanie…') });
    let shown: LauncherRelease[] = [];
    let hasMore = true;
    let busy = false;
    const row = (r: LauncherRelease) => {
      const details = el('details', { className: 'ln-history-item' });
      details.append(el('summary', {},
        el('b', { textContent: `SlashClient ${r.version}` }),
        ...(compareVersion(r.version, installed) === 0 ? [el('span', { className: 'tag ln-mine', textContent: t('Twoja wersja') })] : []),
        el('small', { className: 'muted', textContent: fmtDate(r.date) }),
        ...(r.title ? [el('span', { className: 'ln-title small', textContent: r.title })] : [])));
      // notes are built when first opened
      details.addEventListener('toggle', () => {
        if (details.open && details.childElementCount === 1) details.append(notesView(r.notes));
      });
      return details;
    };
    const next = async () => {
      if (busy || !hasMore) return;
      busy = true;
      status.textContent = t('Ładowanie…');
      try {
        const p = await page(shown[shown.length - 1]?.version, 15);
        if (!p) return void (status.textContent = t('Ten serwer nie ma historii zmian.'));
        const first = !shown.length;
        shown = [...shown, ...p.releases];
        hasMore = p.more && p.releases.length > 0;
        const rows = p.releases.map(row);
        list.append(...rows);
        // the newest release opened
        if (first && rows[0]) rows[0].open = true;
        status.textContent = hasMore ? '' : shown.length ? t('To już wszystkie wydania.') : t('Nie ma jeszcze żadnych wydań.');
        // a short page is filled until it can scroll
        if (hasMore && list.scrollHeight <= list.clientHeight + 40) setTimeout(() => void next(), 0);
      } catch (err) {
        status.textContent = t('Nie udało się pobrać historii zmian: {0}', d.errorText(err));
      } finally {
        busy = false;
      }
    };
    list.addEventListener('scroll', () => {
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 120) void next();
    });
    const ok = el('button', { type: 'button', className: 'primary', textContent: t('Zamknij') });
    const close = modalWindow(t('Historia zmian'), [list, status], [ok], undefined, 'ln-modal');
    ok.addEventListener('click', () => close());
    void next();
  }

  // ---- "Wróć do poprzedniej wersji" ----

  async function openRollback() {
    const body = el('div', { className: 'ln-rollback' }, el('p', { className: 'muted', textContent: t('Ładowanie…') }));
    const go = el('button', { type: 'button', className: 'danger', disabled: true }, icon('fa-clock-rotate-left'), ` ${t('Wróć do wybranej wersji')}`);
    const cancel = el('button', { type: 'button', textContent: t('Anuluj') });
    const close = modalWindow(t('Wróć do poprzedniej wersji'), [body], [cancel, go], undefined, 'ln-modal');
    cancel.addEventListener('click', () => close());
    let info: { current: string; min: string; packaged: boolean; os: string; releases: LauncherRelease[] } | null;
    try {
      info = await api.rollbackList(getLang());
    } catch (err) {
      body.replaceChildren(el('p', { className: 'muted', textContent: t('Nie udało się pobrać listy wersji: {0}', d.errorText(err)) }));
      return;
    }
    if (!info) {
      body.replaceChildren(el('p', { className: 'muted', textContent: t('Ten serwer nie udostępnia starszych wersji.') }));
      return;
    }
    let picked = '';
    const rows = info.releases.map((r) => {
      const radio = control<HTMLInputElement>('input', { type: 'radio', name: 'ln-rollback', value: r.version });
      radio.addEventListener('change', () => {
        picked = r.version;
        go.disabled = false;
        go.replaceChildren(icon('fa-clock-rotate-left'), ` ${t('Wróć do {0}', r.version)}`);
      });
      const notes = notesView(r.notes);
      notes.classList.add('hidden');
      const show = el('button', { type: 'button', className: 'link-btn' }, icon('fa-list'), ` ${t('Zmiany')}`);
      show.addEventListener('click', () => notes.classList.toggle('hidden'));
      // a version whose own update did not work here: said right at it
      const issues = updateIssues(r.version, info!.os);
      const issueBox = issues.length
        ? el('div', { className: 'ln-rollback-issue' }, icon('fa-triangle-exclamation'), el('span', { textContent: issues.map((i) => t(i.text)).join(' ') }))
        : undefined;
      return el('div', { className: `ln-rollback-row${issues.length ? ' has-issue' : ''}` },
        el('label', { className: 'ln-rollback-pick' }, radio, el('b', { textContent: `SlashClient ${r.version}` }), el('small', { className: 'muted', textContent: fmtDate(r.date) }),
          ...(issues.length ? [el('span', { className: 'ln-issue-tag', textContent: t('Problem z aktualizacją') })] : [])),
        show, ...(issueBox ? [issueBox] : []), notes);
    });
    const warn = (iconName: string, text: string) => el('li', {}, icon(iconName), el('span', { textContent: text }));
    body.replaceChildren(
      el('p', { textContent: t('Masz SlashClient {0}. Wybierz wersję, do której chcesz wrócić – zainstaluje się tak jak aktualizacja, po ponownym uruchomieniu.', info.current) }),
      rows.length ? el('div', { className: 'ln-rollback-list' }, ...rows) : el('p', { className: 'muted', textContent: t('Nie ma starszej wersji, do której można wrócić.') }),
      el('ul', { className: 'ln-warnings' },
        warn('fa-triangle-exclamation', t('Funkcje dodane w nowszych wersjach znikną, dopóki znów nie zaktualizujesz launchera.')),
        warn('fa-server', t('Starsze wersje launchera działają z obecnym serwerem SlashClient (znajomi, czat, kosmetyki).')),
        warn('fa-floppy-disk', t('Przed powrotem launcher zapisze kopię profili, kont i ustawień (folder config/rollback-backups). Starsze wersje zachowują profile, konta i ustawienia, których nie znają.')),
        warn('fa-pause', t('Automatyczne aktualizacje zostaną wstrzymane do wydania nowszego niż {0}. Możesz je włączyć z powrotem w Ustawieniach.', info.current)),
        warn('fa-circle-info', t('Do wyboru są wersje od {0} – starsze mogły zgubić listę profili, gdy przy starcie nie dało się odczytać pliku launcher.json.', info.min))),
    );
    if (!info.packaged) body.append(el('p', { className: 'muted', textContent: t('To wersja deweloperska – nie może wrócić do innej wersji.') }));
    go.addEventListener('click', async () => {
      if (!picked) return;
      const sure = await confirmDialog({
        title: t('Wrócić do SlashClient {0}?', picked),
        body: [
          el('p', { className: 'muted', textContent: t('Launcher pobierze wersję {0} i zainstaluje ją po ponownym uruchomieniu. Nowsze funkcje znikną.', picked) }),
          ...updateIssues(picked, info!.os).map((i) => el('p', { className: 'ln-rollback-issue' }, icon('fa-triangle-exclamation'), el('span', { textContent: t(i.text) }))),
        ],
        ok: t('Wróć do {0}', picked), okIcon: 'fa-clock-rotate-left', danger: true,
      });
      if (!sure) return;
      go.disabled = true;
      try {
        const res: { backup: string } = await api.rollback(picked);
        close();
        d.toast(t('Pobieram SlashClient {0}. Kopia ustawień: {1}', picked, res.backup));
      } catch (err) {
        go.disabled = false;
        const code = String((err as Error)?.message ?? err);
        d.toast(/update:dev/.test(code) ? t('To wersja deweloperska – nie może wrócić do innej wersji.') : /update:busy/.test(code) ? t('Trwa pobieranie aktualizacji – spróbuj, gdy się skończy.') : d.errorText(err), true);
      }
    });
  }

  // ---- Settings ----

  function syncSettings() {
    const s = d.settings();
    const whatsNew = document.getElementById('whats-new-toggle') as HTMLInputElement | null;
    if (whatsNew) whatsNew.checked = s?.whatsNewAfterUpdate !== false;
    const paused = update.pausedUntil ?? s?.updatesPausedUntil;
    document.getElementById('updates-paused')?.classList.toggle('hidden', !paused);
    const auto = document.getElementById('auto-updates') as HTMLInputElement | null;
    if (auto) auto.checked = !paused;
    const note = document.getElementById('updates-paused-note');
    if (note) note.textContent = paused ? t('Wstrzymane po powrocie do starszej wersji – włączą się same przy wydaniu nowszym niż {0}.', paused) : '';
  }

  function bindSettings() {
    document.getElementById('changelog-open')?.addEventListener('click', () => openHistory());
    document.getElementById('rollback-open')?.addEventListener('click', () => void openRollback());
    document.getElementById('whats-new-toggle')?.addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      const s = d.settings();
      if (s) s.whatsNewAfterUpdate = on;
      void api.changelogPrefs({ whatsNew: on });
    });
    document.getElementById('auto-updates')?.addEventListener('change', async (e) => {
      const box = e.target as HTMLInputElement;
      if (!box.checked) return syncSettings();
      box.disabled = true;
      try {
        update = await api.resumeUpdates();
        const s = d.settings();
        if (s) s.updatesPausedUntil = undefined;
        d.toast(t('Automatyczne aktualizacje są znów włączone.'));
        void api.checkForUpdates();
      } catch (err) {
        d.toast(d.errorText(err), true);
      } finally {
        box.disabled = false;
        syncSettings();
      }
    });
  }

  return {
    /** At start: whether the server has a changelog, the dot, "Co nowego" after an update. */
    async init() {
      installed = await d.version();
      bindSettings();
      api.on('update:status', (u: UpdateState) => {
        update = u;
        syncSettings();
      });
      update = await api.updateStatus().catch(() => update);
      syncSettings();
      await loadTab();
      if (!available) return;
      const pending: string | null = await api.whatsNewPending().catch(() => null);
      if (pending) await showWhatsNew(pending);
    },
    /** The tab was opened. */
    shown() {
      if (available === undefined || (!releases.length && !loading)) void loadTab();
      void markSeen();
    },
    /** The language changed: the notes come again in it. */
    reload() {
      if (available !== false) void loadTab();
    },
    syncSettings,
    onAvailable(fn: (on: boolean) => void) {
      listeners.push(fn);
      if (available !== undefined) fn(available);
    },
    openHistory,
    openRollback,
  };
}
