import { getLang, LANGUAGES, locale, t } from '../shared/i18n';
import { isLowEndMachine, isPristineProfile, needsFirstRun, newestRelease, wizardVersions } from '../shared/firstRun';
import { recommendedMemoryMb } from '../main/jvm';
import type { SlashApi } from '../main/preload';

/**
 * The first-run wizard: a full-window guide through the first minutes (language, account,
 * importing other launchers, the first profile, comfort settings, friends). Every choice is saved
 * as soon as it is made, in the settings that already exist; it can be skipped at any step and
 * opened again from Settings. Static texts are Polish and translated by the page's dictionary.
 */

interface Account { id: string; type: 'offline' | 'msa'; name: string; uuid: string }
interface Profile {
  id: string; name: string; versionId: string; loader: string; loaderVersion: string; memoryMb: number; hud?: boolean;
  playTimeMs?: number; lastPlayedAt?: number; gameDir: string; modpack?: unknown;
}
interface Store {
  accounts: Account[];
  profiles: Profile[];
  settings: { selectedProfileId?: string; selectedAccountId?: string; closeOnLaunch: boolean; launcherWindow?: string; reduceMotion?: boolean;
    defaultMemoryMb?: number; discordEnabled: boolean; language: string; firstRunDone?: boolean };
  systemMemoryMb: number;
  hudVersions?: string[];
}
interface Found { key: string; source: string; sourceName: string; name: string; versionId: string; loader: string; mods: number; sharedDir: boolean }

export interface WizardDeps {
  api: SlashApi;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  /** The account's head, cut from its skin. */
  avatar: (account: { id: string }) => HTMLImageElement;
  /** Switches the whole launcher's language (saved, the page translated again). */
  switchLanguage: (lang: string) => Promise<void>;
  /** "Ogranicz animacje" applied at once (the setting is saved by the wizard). */
  setReduceMotion: (on: boolean) => void;
  /** The Friends view picks up a new SlashClient sign-in. */
  refreshFriends: () => void;
  /** Picks the profile on the Play tab and, when asked, starts it. */
  play: (profileId: string, start: boolean) => Promise<void>;
}

type StepId = 'welcome' | 'account' | 'import' | 'profile' | 'comfort' | 'friends' | 'done';
const STEPS: { id: StepId; title: string; icon: string }[] = [
  { id: 'welcome', title: 'Witaj', icon: 'fa-hand-sparkles' },
  { id: 'account', title: 'Konto Minecraft', icon: 'fa-user' },
  { id: 'import', title: 'Import', icon: 'fa-file-import' },
  { id: 'profile', title: 'Pierwszy profil', icon: 'fa-layer-group' },
  { id: 'comfort', title: 'Wygoda', icon: 'fa-sliders' },
  { id: 'friends', title: 'Znajomi', icon: 'fa-user-group' },
  { id: 'done', title: 'Gotowe', icon: 'fa-flag-checkered' },
];
/** How many mods the performance set adds (for the memory suggestion). */
const PERF_MOD_COUNT = 7;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[NoInfer<K>]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const icon = (cls: string) => el('i', { className: cls });
const gb = (mb: number) => (mb / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 });

export function createWizard(deps: WizardDeps) {
  const { api } = deps;
  let root: HTMLElement | undefined;
  let step = 0;
  let store: Store | undefined;
  let offStore: (() => void) | undefined;
  /** The Accounts view's own Microsoft card and offline form, lent to the account step and given back. */
  const borrowed: { node: HTMLElement; parent: Node; next: Node | null }[] = [];

  // what was chosen and done, for the summary
  let scan: Found[] | undefined;
  let scanning = false;
  const chosen = new Set<string>();
  let imported: string[] = [];
  let profileId: string | undefined;
  /** The profile this wizard made (going back and changing the choice updates it instead of making another). */
  let createdId: string | undefined;
  let profileSummary = '';
  let perfInstall: Promise<unknown> | undefined;
  let versionList: { id: string; hud: boolean }[] | undefined;
  const choice = { versionId: '', loader: 'fabric' as 'fabric' | 'vanilla', perf: true, memoryMb: 0, memoryTouched: false, forceNew: false };

  const motionReduced = () => document.documentElement.classList.contains('reduce-motion');
  const save = (s: Partial<Store['settings']>) => api.saveSettings(s).catch((err: unknown) => deps.toast(deps.errorText(err), true));
  const current = () => STEPS[step].id;

  async function refresh() {
    store = await api.getStore();
  }

  // ---------- opening and closing ----------

  /** On start: shown only on a brand new installation. */
  function maybeShow(s: Store | undefined) {
    if (s && needsFirstRun(s)) void open();
  }

  async function open() {
    if (root) return;
    await refresh();
    step = 0;
    scan = undefined;
    chosen.clear();
    imported = [];
    profileId = undefined;
    createdId = undefined;
    profileSummary = '';
    perfInstall = undefined;
    choice.memoryTouched = false;
    choice.forceNew = false;
    root = el('div', { className: 'wz', id: 'wizard' });
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Kreator pierwszego uruchomienia');
    document.body.append(root);
    document.body.classList.add('wz-open');
    // the account step shows new accounts as they are added
    offStore = api.on('store', (s: Store) => {
      store = s;
      if (current() === 'account') renderAccountList();
    });
    document.addEventListener('keydown', onKey);
    render();
  }

  /** Closes the wizard; finished or skipped, it does not come back on its own. */
  function close() {
    if (!root) return;
    giveBack();
    void save({ firstRunDone: true });
    offStore?.();
    document.removeEventListener('keydown', onKey);
    const node = root;
    root = undefined;
    document.body.classList.remove('wz-open');
    if (motionReduced()) node.remove();
    else {
      node.classList.add('wz-leaving');
      setTimeout(() => node.remove(), 260);
    }
  }

  function onKey(e: KeyboardEvent) {
    // Escape closes only when no other window (a confirmation) is open over it
    if (e.key === 'Escape' && root && !document.querySelector('.modal:not(.hidden)')) close();
  }

  function giveBack() {
    for (const b of borrowed.splice(0)) b.parent.insertBefore(b.node, b.next);
  }
  function borrow(node: HTMLElement | null | undefined, into: HTMLElement) {
    if (!node) return;
    if (!borrowed.some((b) => b.node === node)) borrowed.push({ node, parent: node.parentNode!, next: node.nextSibling });
    into.append(node);
  }

  function go(to: number) {
    step = Math.max(0, Math.min(STEPS.length - 1, to));
    render();
  }

  // ---------- frame ----------

  function render() {
    if (!root) return;
    giveBack();
    const rail = el('ol', { className: 'wz-steps' }, ...STEPS.map((s, i) => {
      const li = el('li', { className: i < step ? 'done' : i === step ? 'current' : '' },
        el('span', { className: 'wz-dot' }, i < step ? icon('fa-solid fa-check') : String(i + 1)), el('span', { textContent: s.title }));
      // steps already seen can be gone back to
      if (i < step) li.addEventListener('click', () => go(i));
      return li;
    }));
    const skipAll = el('button', { type: 'button', className: 'wz-skip-all' }, icon('fa-solid fa-forward'), ' Pomiń kreator');
    skipAll.title = 'Możesz go uruchomić ponownie w Ustawieniach.';
    skipAll.addEventListener('click', close);

    const body = el('div', { className: 'wz-body wz-enter' });
    const foot = el('footer', { className: 'wz-foot' });
    root.replaceChildren(
      el('div', { className: 'wz-drag' }),
      el('div', { className: 'wz-shell' },
        el('aside', { className: 'wz-rail glass-panel' },
          el('div', { className: 'wz-brand' }, el('img', { src: 'logo.png', alt: '' }), el('div', { className: 'brand-name' }, 'Slash', el('span', { textContent: 'Client' }))),
          rail, skipAll),
        el('section', { className: 'wz-main glass-panel' }, body, foot)),
    );
    const builders: Record<StepId, (body: HTMLElement, foot: HTMLElement) => void> = {
      welcome: welcomeStep, account: accountStep, import: importStep, profile: profileStep, comfort: comfortStep, friends: friendsStep, done: doneStep,
    };
    builders[current()](body, foot);
    body.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }

  function head(title: string, lead: string, iconCls = STEPS[step].icon) {
    return [el('div', { className: 'wz-badge' }, icon(`fa-solid ${iconCls}`)), el('h2', { className: 'gradient-title', textContent: title }), el('p', { className: 'wz-lead muted', textContent: lead })];
  }

  /** Back, "Pomiń" (this step, nothing saved) and the main button. */
  function footer(foot: HTMLElement, next: { label?: string; icon?: string; run?: (btn: HTMLButtonElement) => Promise<boolean | void> | boolean | void } = {}, canSkip = true) {
    const back = el('button', { type: 'button', className: 'wz-back' }, icon('fa-solid fa-arrow-left'), ' Wstecz');
    back.disabled = step === 0;
    back.addEventListener('click', () => go(step - 1));
    const skip = el('button', { type: 'button', className: 'wz-skip', textContent: 'Pomiń' });
    skip.title = 'Przejdź dalej bez zmian';
    skip.addEventListener('click', () => go(step + 1));
    const primary = el('button', { type: 'button', className: 'primary wz-next' }, next.label ?? 'Dalej', ' ', icon(`fa-solid ${next.icon ?? 'fa-arrow-right'}`));
    primary.dataset.autofocus = '';
    primary.addEventListener('click', async () => {
      if (primary.disabled) return;
      primary.disabled = true;
      try {
        const stay = await next.run?.(primary);
        if (stay !== true && root) go(step + 1);
      } catch (err) {
        deps.toast(deps.errorText(err), true);
      } finally {
        primary.disabled = false;
      }
    });
    foot.replaceChildren(back, el('span', { className: 'grow' }), ...(canSkip ? [skip] : []), primary);
    return primary;
  }

  /** A choice tile: a big button with an icon, a title and a line under it. */
  function tile(opts: { icon: string; title: string; sub?: string; selected: boolean; onPick: () => void; badge?: string }) {
    const b = el('button', { type: 'button', className: `wz-tile${opts.selected ? ' selected' : ''}` },
      el('span', { className: 'wz-tile-icon' }, icon(opts.icon)),
      el('span', { className: 'wz-tile-text' }, el('b', { textContent: opts.title }), ...(opts.sub ? [el('small', { textContent: opts.sub })] : [])),
      ...(opts.badge ? [el('span', { className: 'wz-tile-badge', textContent: opts.badge })] : []),
      el('span', { className: 'wz-tile-check' }, icon('fa-solid fa-circle-check')));
    b.setAttribute('aria-pressed', String(opts.selected));
    b.addEventListener('click', opts.onPick);
    return b;
  }

  // ---------- 1. welcome and language ----------

  function welcomeStep(body: HTMLElement, foot: HTMLElement) {
    body.append(
      ...head('Witaj w SlashClient!', 'Przygotujmy wszystko do gry. To zajmie minutę, a każdy krok możesz pominąć i zmienić później w Ustawieniach.'),
      el('h4', { className: 'wz-label', textContent: 'Język' }),
      el('div', { className: 'wz-tiles two' }, ...LANGUAGES.map((l) => tile({
        icon: 'fa-solid fa-language', title: l.name, sub: l.code === 'pl' ? 'Polski interfejs' : 'English interface', selected: getLang() === l.code,
        onPick: async () => {
          if (getLang() === l.code) return;
          await deps.switchLanguage(l.code);
          render();
        },
      }))),
      el('ul', { className: 'wz-points' },
        el('li', {}, icon('fa-solid fa-user'), el('span', { textContent: 'Konto Minecraft' })),
        el('li', {}, icon('fa-solid fa-layer-group'), el('span', { textContent: 'Profil z SlashClient HUD i modami wydajności' })),
        el('li', {}, icon('fa-solid fa-user-group'), el('span', { textContent: 'Znajomi i kosmetyki' }))),
    );
    footer(foot, { label: 'Zaczynamy' }, false);
  }

  // ---------- 2. Minecraft account ----------

  function renderAccountList() {
    const list = root?.querySelector('.wz-accounts');
    if (!list || !store) return;
    const selected = store.settings.selectedAccountId ?? store.accounts[0]?.id;
    list.replaceChildren(...store.accounts.map((a) =>
      el('li', { className: a.id === selected ? 'current' : '' }, deps.avatar(a),
        el('div', { className: 'grow' }, el('b', { textContent: a.name }), el('small', { textContent: a.type === 'msa' ? 'Microsoft' : 'Offline' })),
        ...(a.id === selected ? [el('span', { className: 'wz-in-use' }, icon('fa-solid fa-check'), ' Zalogowano')] : []))));
    list.classList.toggle('hidden', !store.accounts.length);
    root?.querySelector('.wz-account-hint')?.classList.toggle('hidden', !store.accounts.length);
  }

  function accountStep(body: HTMLElement, foot: HTMLElement) {
    const cards = el('div', { className: 'wz-account-cards' });
    body.append(
      ...head('Konto Minecraft', 'Zaloguj się kontem Microsoft, na którym masz Minecrafta, albo zagraj offline samym nickiem.'),
      el('ul', { className: 'wz-accounts hidden' }),
      el('p', { className: 'wz-account-hint muted hidden', textContent: 'Gotowe! Możesz przejść dalej albo dodać kolejne konto.' }),
      cards,
    );
    // the Accounts view's own sign-in: the same code box ("the code is already copied") and offline form
    borrow(document.querySelector<HTMLElement>('#ms-login')?.closest<HTMLElement>('.card'), cards);
    borrow(document.querySelector<HTMLElement>('#offline-form'), cards);
    renderAccountList();
    footer(foot);
  }

  // ---------- 3. importing other launchers ----------

  async function runScan() {
    scanning = true;
    try {
      scan = (await api.findInstances()) as Found[];
      // nothing picked to start with: copying a big modpack takes a while and space, the player chooses
      chosen.clear();
    } catch (err) {
      scan = [];
      deps.toast(deps.errorText(err), true);
    } finally {
      scanning = false;
    }
    if (current() === 'import') render();
  }

  function importStep(body: HTMLElement, foot: HTMLElement) {
    body.append(...head('Masz już inny launcher?', 'Szukamy profili z Prism, MultiMC, CurseForge, Modrinth App, oficjalnego launchera, Dawn i Feather. Zaznacz te, które chcesz przenieść: mody, światy i ustawienia zostaną skopiowane, oryginały zostają nietknięte.'));
    if (!scan) {
      body.append(el('div', { className: 'wz-scanning' }, el('span', { className: 'spinner' }), ' Szukam innych launcherów…'));
      if (!scanning) void runScan();
      footer(foot);
      return;
    }
    if (!scan.length) {
      body.append(el('div', { className: 'wz-empty' }, icon('fa-regular fa-folder-open'), el('span', { textContent: 'Nie znaleziono innych launcherów. Nic nie szkodzi – za chwilę utworzymy nowy profil.' })));
      footer(foot);
      return;
    }
    const count = () => t('Importuj zaznaczone ({0})', chosen.size);
    const list = el('div', { className: 'wz-import' });
    const all = el('button', { type: 'button', className: 'wz-link' }, icon('fa-solid fa-list-check'), chosen.size === scan.length ? ' Odznacz wszystkie' : ' Zaznacz wszystkie');
    all.addEventListener('click', () => {
      if (chosen.size === scan!.length) chosen.clear();
      else for (const f of scan!) chosen.add(f.key);
      render();
    });
    const groups = new Map<string, Found[]>();
    for (const f of scan) groups.set(f.sourceName, [...(groups.get(f.sourceName) ?? []), f]);
    for (const [name, items] of groups) {
      list.append(el('h4', { className: 'wz-label', textContent: name }));
      for (const f of items) {
        const box = el('input', { type: 'checkbox', checked: chosen.has(f.key) });
        box.addEventListener('change', () => {
          if (box.checked) chosen.add(f.key);
          else chosen.delete(f.key);
          next.replaceChildren(chosen.size ? count() : t('Dalej'), ' ', icon('fa-solid fa-arrow-right'));
        });
        const loader = f.loader && f.loader !== 'vanilla' ? ` · ${f.loader[0].toUpperCase()}${f.loader.slice(1)}` : '';
        list.append(el('label', { className: 'wz-import-row' }, box,
          el('span', { className: 'grow' }, el('b', { textContent: f.name }), el('small', { textContent: `${f.versionId}${loader}${f.mods ? ` · ${t('{0} modów', f.mods)}` : ''}` }))));
      }
    }
    body.append(el('div', { className: 'wz-import-head' }, el('span', { className: 'muted', textContent: t('Znalezione profile: {0}', scan.length) }), all), list);
    const next = footer(foot, {
      label: chosen.size ? count() : 'Dalej',
      run: async (btn) => {
        if (!chosen.size) return;
        btn.replaceChildren(el('span', { className: 'spinner' }), ' Importuję…');
        const created = ((await api.importInstances([...chosen])) as string[]) ?? [];
        imported = created;
        if (created.length) {
          profileId = created[0];
          await save({ selectedProfileId: created[0] });
          await refresh();
          profileSummary = t('Zaimportowane profile: {0}', created.length);
        }
      },
    });
  }

  // ---------- 4. the first profile ----------

  function recommended(): number {
    const sys = store?.systemMemoryMb ?? 8192;
    return recommendedMemoryMb(sys, choice.loader, choice.loader === 'fabric' && choice.perf ? PERF_MOD_COUNT : 0);
  }

  async function loadVersions() {
    try {
      const all = (await api.listVersions()) as { id: string; type: string }[];
      versionList = wizardVersions(all, store?.hudVersions ?? []);
      choice.versionId ||= newestRelease(all) ?? 'latest-release';
    } catch {
      versionList = [];
      choice.versionId ||= 'latest-release';
    }
    if (current() === 'profile') render();
  }

  function profileStep(body: HTMLElement, foot: HTMLElement) {
    if (imported.length && !choice.forceNew) {
      const names = imported.map((id) => store?.profiles.find((p) => p.id === id)?.name).filter(Boolean).join(', ');
      const again = el('button', { type: 'button', className: 'wz-link' }, icon('fa-solid fa-plus'), ' Mimo to utwórz nowy profil');
      again.addEventListener('click', () => { choice.forceNew = true; render(); });
      body.append(...head('Pierwszy profil', 'Twoje profile są już przeniesione – możesz od razu na nich grać.'),
        el('div', { className: 'wz-empty ok' }, icon('fa-solid fa-circle-check'), el('span', { textContent: t('Zaimportowano: {0}', names) })), again);
      footer(foot);
      return;
    }
    body.append(...head('Pierwszy profil', 'Profil to wersja gry z własnymi modami, światami i ustawieniami. Wybraliśmy to, co polecamy – wystarczy kliknąć Dalej.'));
    if (!versionList) {
      body.append(el('div', { className: 'wz-scanning' }, el('span', { className: 'spinner' }), ' Ładuję wersje Minecrafta…'));
      void loadVersions();
      footer(foot);
      return;
    }
    const hud = new Set(store?.hudVersions ?? []);
    // the version
    const select = el('select', { className: 'wz-version' });
    const options = versionList.length ? versionList : [{ id: 'latest-release', hud: false }];
    for (const v of options) {
      const label = v.id === 'latest-release' ? t('Najnowsze wydanie') : v.hud ? `${v.id}  ·  ${t('SlashClient HUD')}` : v.id;
      select.append(el('option', { value: v.id, textContent: label, selected: v.id === choice.versionId }));
    }
    select.dataset.noI18n = '';
    select.addEventListener('change', () => { choice.versionId = select.value; render(); });
    const versionHint = el('small', { className: 'muted' });
    if (choice.loader === 'fabric') {
      versionHint.textContent = hud.has(choice.versionId)
        ? t('SlashClient HUD działa w tej wersji: FPS, CPS, pancerz, klawisze i więcej.')
        : t('SlashClient HUD nie jest jeszcze dostępny dla {0}. Wersje z HUD: {1}.', choice.versionId, [...hud].join(', ') || '—');
    }
    // the loader
    const pick = (loader: 'fabric' | 'vanilla') => () => {
      choice.loader = loader;
      if (!choice.memoryTouched) choice.memoryMb = recommended();
      render();
    };
    const loaders = el('div', { className: 'wz-tiles two' },
      tile({ icon: 'fa-solid fa-wand-magic-sparkles', title: 'Fabric + SlashClient HUD', sub: 'Mody, HUD, kosmetyki i znajomi w grze', badge: 'zalecane', selected: choice.loader === 'fabric', onPick: pick('fabric') }),
      tile({ icon: 'fa-solid fa-cube', title: 'Czysta gra (vanilla)', sub: 'Minecraft bez żadnych dodatków', selected: choice.loader === 'vanilla', onPick: pick('vanilla') }));
    // performance mods (Fabric only)
    const perf = el('input', { type: 'checkbox', checked: choice.loader === 'fabric' && choice.perf, disabled: choice.loader !== 'fabric' });
    perf.addEventListener('change', () => {
      choice.perf = perf.checked;
      if (!choice.memoryTouched) choice.memoryMb = recommended();
      render();
    });
    // memory
    if (!choice.memoryMb) choice.memoryMb = recommended();
    const sys = store?.systemMemoryMb ?? 8192;
    const max = Math.max(4096, Math.floor((sys - 2048) / 512) * 512);
    const range = el('input', { type: 'range', min: '1024', max: String(max), step: '512', value: String(Math.min(choice.memoryMb, max)) });
    const value = el('b', { textContent: `${gb(Number(range.value))} GB` });
    range.addEventListener('input', () => {
      choice.memoryMb = Number(range.value);
      choice.memoryTouched = true;
      value.textContent = `${gb(choice.memoryMb)} GB`;
    });
    body.append(
      el('div', { className: 'wz-field' }, el('h4', { className: 'wz-label', textContent: 'Wersja Minecrafta' }), select, versionHint),
      el('h4', { className: 'wz-label', textContent: 'Rodzaj gry' }), loaders,
      el('label', { className: `check wz-check${choice.loader !== 'fabric' ? ' off' : ''}` }, perf, el('span', { textContent: 'Zainstaluj mody poprawiające wydajność (Sodium, Lithium…)' })),
      el('div', { className: 'wz-field' }, el('h4', { className: 'wz-label' }, t('Pamięć RAM'), ' ', value), range,
        el('small', { className: 'muted', textContent: t('Zalecane dla Twojego komputera ({0} GB RAM): {1} GB.', gb(sys), gb(recommended())) })),
    );
    footer(foot, { run: (btn) => createProfile(btn) });
  }

  async function createProfile(btn: HTMLButtonElement) {
    btn.replaceChildren(el('span', { className: 'spinner' }), ' Tworzę profil…');
    await refresh();
    const fabric = choice.loader === 'fabric';
    const versionId = choice.versionId || 'latest-release';
    const name = `${fabric ? 'SlashClient' : 'Minecraft'} ${versionId === 'latest-release' ? t('Najnowsze wydanie') : versionId}`;
    // the starting profile, never touched, becomes this one; otherwise (or opened again) a new one
    const made = store?.profiles.find((p) => p.id === createdId);
    const base = made
      ? made
      : store && store.profiles.length === 1 && isPristineProfile(store.profiles[0]) ? store.profiles[0] : ((await api.newProfile()) as Profile);
    const profile: Profile = { ...base, name, versionId, loader: choice.loader, loaderVersion: '', hud: fabric, memoryMb: choice.memoryMb || recommended() };
    const id = (await api.saveProfile(profile)) as string;
    profileId = createdId = id;
    imported = [];
    await save({ selectedProfileId: id, defaultMemoryMb: profile.memoryMb });
    profileSummary = `${name} · ${gb(profile.memoryMb)} GB RAM`;
    // performance mods: in the background (a task card shows the progress); "Graj" waits for them
    if (fabric && choice.perf) {
      profileSummary += ` · ${t('mody wydajności')}`;
      perfInstall = (async () => {
        const plan = (await api.perfPlan(id)) as { projectId?: string; title: string; installed: boolean }[];
        const items = plan.filter((p) => p.projectId && !p.installed).map((p) => ({ projectId: p.projectId!, title: p.title }));
        if (items.length) await api.installPerf(id, items);
      })().catch((err) => deps.toast(t('Nie udało się zainstalować modów wydajności: {0}', deps.errorText(err)), true));
    }
    await refresh();
  }

  // ---------- 5. comfort ----------

  function comfortStep(body: HTMLElement, foot: HTMLElement) {
    const s = store!.settings;
    const cores = navigator.hardwareConcurrency || 0;
    const lowEnd = isLowEndMachine(store?.systemMemoryMb, cores);
    // the suggestion only when the player has not chosen yet
    const reduce = el('input', { type: 'checkbox', checked: s.reduceMotion ?? lowEnd });
    const closeOn = el('input', { type: 'checkbox', checked: s.closeOnLaunch });
    const discord = el('input', { type: 'checkbox', checked: s.discordEnabled ?? true });
    // the same choices as Settings → "Okno launchera przy uruchomieniu"
    const original = document.querySelector<HTMLSelectElement>('#settings-form select[name="launcherWindow"]');
    const windowSel = (original?.cloneNode(true) as HTMLSelectElement | undefined) ?? el('select');
    windowSel.removeAttribute('name');
    windowSel.value = s.launcherWindow ?? '';
    const persist = () => {
      const reduceMotion = reduce.checked;
      if (reduceMotion !== !!store!.settings.reduceMotion) deps.setReduceMotion(reduceMotion);
      Object.assign(store!.settings, { reduceMotion, closeOnLaunch: closeOn.checked, discordEnabled: discord.checked, launcherWindow: windowSel.value });
      return save({ reduceMotion, closeOnLaunch: closeOn.checked, discordEnabled: discord.checked, launcherWindow: windowSel.value });
    };
    for (const input of [reduce, closeOn, discord, windowSel]) input.addEventListener('change', () => void persist());
    const machine = t('Twój komputer: {0} GB RAM, {1} rdzeni procesora.', gb(store?.systemMemoryMb ?? 0), cores || '?');
    body.append(
      ...head('Wygoda', 'Kilka ustawień launchera. Zmienisz je w każdej chwili w Ustawieniach.'),
      el('div', { className: 'wz-options' },
        el('label', { className: 'wz-option' }, reduce, el('span', { className: 'grow' }, el('b', { textContent: 'Ogranicz animacje' }),
          el('small', { textContent: lowEnd ? `${machine} ${t('Polecamy włączyć – launcher będzie lżejszy.')}` : `${machine} ${t('Animacje nie powinny go obciążać.')}` }))),
        el('label', { className: 'wz-option' }, closeOn, el('span', { className: 'grow' }, el('b', { textContent: 'Chowaj launcher podczas gry' }),
          el('small', { textContent: 'Wróci sam po zamknięciu gry.' }))),
        el('label', { className: 'wz-option' }, discord, el('span', { className: 'grow' }, el('b', { textContent: 'Pokazuj na Discordzie, w co grasz' }),
          el('small', { textContent: 'Status w profilu Discorda, gdy Discord jest włączony.' }))),
        el('div', { className: 'wz-option' }, icon('fa-regular fa-window-maximize'), el('span', { className: 'grow' }, el('b', { textContent: 'Okno launchera przy uruchomieniu' })), windowSel)),
    );
    footer(foot, { run: () => persist().then(() => undefined) });
  }

  // ---------- 6. friends ----------

  function friendsStep(body: HTMLElement, foot: HTMLElement) {
    body.append(...head('Znajomi i kosmetyki', 'Konto SlashClient to znajomi, czat i zaproszenia do gry – w launcherze i w grze – oraz peleryny, skrzydła i inne kosmetyki widoczne dla innych graczy SlashClient.'));
    const status = el('div', { className: 'wz-friends' }, el('span', { className: 'spinner' }));
    body.append(status, el('ul', { className: 'wz-points' },
      el('li', {}, icon('fa-solid fa-comments'), el('span', { textContent: 'Czat i zaproszenia na serwery' })),
      el('li', {}, icon('fa-solid fa-shirt'), el('span', { textContent: 'Kosmetyki widoczne w grze' })),
      el('li', {}, icon('fa-solid fa-trophy'), el('span', { textContent: 'Osiągnięcia i iskry' }))));
    footer(foot);
    void (async () => {
      const state = (await api.socialState().catch(() => undefined)) as { user?: { name?: string; handle?: string } } | undefined;
      if (current() !== 'friends') return;
      const msa = store?.accounts.find((a) => a.id === store?.settings.selectedAccountId && a.type === 'msa') ?? store?.accounts.find((a) => a.type === 'msa');
      if (state?.user) {
        status.replaceChildren(el('div', { className: 'wz-empty ok' }, icon('fa-solid fa-circle-check'),
          el('span', { textContent: t('Jesteś zalogowany jako {0}. Konto SlashClient loguje się razem z kontem Minecraft.', state.user.name ?? state.user.handle ?? '') })));
      } else if (msa) {
        const b = el('button', { type: 'button', className: 'primary' }, icon('fa-solid fa-cube'), t(' Zaloguj kontem {0}', msa.name));
        b.addEventListener('click', async () => {
          b.disabled = true;
          b.prepend(el('span', { className: 'spinner' }));
          try {
            const s = (await api.socialLoginMinecraft()) as { user?: { name?: string } };
            deps.refreshFriends();
            deps.toast(t('Zalogowano jako {0}', s.user?.name ?? msa.name));
            if (current() === 'friends') render();
          } catch (err) {
            deps.toast(deps.errorText(err), true);
            b.disabled = false;
            b.querySelector('.spinner')?.remove();
          }
        });
        status.replaceChildren(el('p', { className: 'muted', textContent: 'Jedno kliknięcie: konto SlashClient założy się samo z Twojego konta Minecraft.' }), b);
      } else {
        status.replaceChildren(el('div', { className: 'wz-empty' }, icon('fa-solid fa-circle-info'),
          el('span', { textContent: 'Znajomi wymagają konta Microsoft z Minecraftem. Możesz je dodać później w zakładce Konta – konto SlashClient założy się wtedy samo.' })));
      }
    })();
  }

  // ---------- 7. done ----------

  function doneStep(body: HTMLElement, foot: HTMLElement) {
    const s = store!.settings;
    const account = store?.accounts.find((a) => a.id === s.selectedAccountId) ?? store?.accounts[0];
    const selected = store?.profiles.find((p) => p.id === (profileId ?? s.selectedProfileId)) ?? store?.profiles[0];
    const row = (iconCls: string, label: string, value: Node | string) =>
      el('li', {}, icon(`fa-solid ${iconCls}`), el('span', { className: 'wz-sum-label', textContent: label }), el('span', { className: 'wz-sum-value' }, value));
    const accountValue = account
      ? el('span', { className: 'wz-sum-account' }, deps.avatar(account), `${account.name} (${account.type === 'msa' ? 'Microsoft' : 'Offline'})`)
      : t('brak – dodasz je w zakładce Konta');
    body.append(
      ...head('Wszystko gotowe!', 'Oto Twoje ustawienia. Kliknij Graj – pierwsze uruchomienie pobierze grę, to chwilę potrwa.'),
      el('ul', { className: 'wz-summary' },
        row('fa-language', t('Język'), LANGUAGES.find((l) => l.code === getLang())?.name ?? ''),
        row('fa-user', t('Konto'), accountValue),
        row('fa-layer-group', t('Profil'), profileSummary || selected?.name || '—'),
        row('fa-sliders', t('Animacje'), s.reduceMotion ? t('ograniczone') : t('pełne'))),
    );
    const play = el('button', { type: 'button', className: 'primary big wz-play' }, icon('fa-solid fa-play'), ' Graj');
    play.dataset.autofocus = '';
    play.addEventListener('click', async () => {
      play.disabled = true;
      const id = profileId ?? selected?.id;
      if (perfInstall) {
        play.replaceChildren(el('span', { className: 'spinner' }), ' Instaluję mody…');
        await perfInstall;
      }
      close();
      if (id) await deps.play(id, !!account).catch((err) => deps.toast(deps.errorText(err), true));
    });
    const later = el('button', { type: 'button', textContent: 'Zamknij kreator' });
    later.addEventListener('click', close);
    const back = el('button', { type: 'button', className: 'wz-back' }, icon('fa-solid fa-arrow-left'), ' Wstecz');
    back.addEventListener('click', () => go(step - 1));
    foot.replaceChildren(back, el('span', { className: 'grow' }), later, play);
  }

  // Settings → "Uruchom kreator ponownie"
  document.querySelector('#wizard-open')?.addEventListener('click', () => void open());

  return { maybeShow, open, close, isOpen: () => !!root };
}
