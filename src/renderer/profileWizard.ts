import { locale, t } from '../shared/i18n';
import { newestRelease, wizardVersions } from '../shared/firstRun';
import { PERF_PRESETS, partOn, suggestedPreset, type PerfPreset } from '../shared/perfPresets';
import { recommendedMemoryMb } from '../main/jvm';
import type { SlashApi } from '../main/preload';
import { control, el, icon } from './dialog';

/**
 * "Nowy profil": a small guide in a window of its own instead of an empty profile – the game (version and
 * loader), how it runs (memory, performance mods, the mode for slower computers) and its name. The profile
 * is made only at the end; "Pusty profil" still makes one with every setting left to the profile's form.
 */

type Loader = 'fabric' | 'vanilla' | 'quilt' | 'neoforge' | 'forge';
interface Profile {
  id: string; name: string; versionId: string; loader: string; loaderVersion: string; memoryMb: number; hud?: boolean;
  perfPreset?: PerfPreset; perfOff?: string[];
}
interface Store { systemMemoryMb: number; platform?: string; arch?: string; hudVersions?: string[] }

export interface ProfileWizardDeps {
  api: SlashApi;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  store: () => Store;
  /** The new profile picked in the Profiles view. */
  created: (profileId: string) => void;
}

/** The mode for slower computers' presets, as the player reads them. */
export function presetName(preset: PerfPreset): string {
  return { off: t('Wyłączony'), light: t('Lekki – słabszy laptop'), lighter: t('Bardzo lekki – stary komputer'), pi: t('Raspberry Pi i inne ARM') }[preset];
}

/** What each preset does, in a sentence. */
export function presetAbout(preset: string): string {
  return ({
    light: t('Zasięg widzenia 8, szybka grafika, mniej cząsteczek, bez cieni postaci. Limit FPS i pamięć zostają Twoje.'),
    lighter: t('Zasięg widzenia 6, szybka grafika bez chmur i cieni, mało cząsteczek, limit 60 FPS, 2–3 GB pamięci dla gry.'),
    pi: t('Zasięg widzenia 4, wszystko na minimum, limit 30 FPS z synchronizacją pionową, do 2 GB pamięci, grafika przez OpenGL.'),
  } as Record<string, string>)[preset] ?? '';
}

const OTHER_LOADERS: { id: Loader; name: string }[] = [{ id: 'quilt', name: 'Quilt' }, { id: 'neoforge', name: 'NeoForge' }, { id: 'forge', name: 'Forge' }];
/** How many mods the performance set adds (for the memory suggestion). */
const PERF_MOD_COUNT = 7;
const gb = (mb: number) => (mb / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 });

export function createProfileWizard(deps: ProfileWizardDeps) {
  const { api } = deps;
  const STEPS = [
    { title: 'Gra', icon: 'fa-cube' },
    { title: 'Wydajność', icon: 'fa-gauge-high' },
    { title: 'Nazwa', icon: 'fa-tag' },
  ];
  let modal: HTMLElement | undefined;
  let step = 0;
  let versions: { id: string; type: string }[] | undefined;
  let allVersions = false;
  const choice = {
    versionId: '', loader: 'fabric' as Loader, otherLoader: 'neoforge' as Loader, perf: true, memoryMb: 0, memoryTouched: false,
    preset: 'off' as PerfPreset, name: '', nameTouched: false,
  };

  const fabricLike = () => choice.loader === 'fabric' || choice.loader === 'quilt';
  const hudVersions = () => new Set(deps.store().hudVersions ?? []);
  const versionLabel = (id: string) => (id === 'latest-release' ? t('Najnowsze wydanie') : id);
  const loaderName = (l: Loader) => ({ fabric: 'Fabric', vanilla: 'Minecraft', quilt: 'Quilt', neoforge: 'NeoForge', forge: 'Forge' })[l];
  // a preset with its mods part brings the performance mods too
  const perfMods = () => fabricLike() && (choice.perf || partOn(choice.preset, [], 'mods'));
  const recommended = () => recommendedMemoryMb(deps.store().systemMemoryMb || 8192, choice.loader, perfMods() ? PERF_MOD_COUNT : 0);
  const defaultName = () => `${choice.loader === 'fabric' ? 'SlashClient' : loaderName(choice.loader)} ${versionLabel(choice.versionId || 'latest-release')}`;

  async function open() {
    if (modal) return;
    const s = deps.store();
    step = 0;
    allVersions = false;
    Object.assign(choice, {
      versionId: '', loader: 'fabric', perf: true, memoryMb: 0, memoryTouched: false, name: '', nameTouched: false,
      preset: suggestedPreset(s.systemMemoryMb, navigator.hardwareConcurrency || 0, s.platform ?? '', s.arch ?? ''),
    });
    modal = el('div', { className: 'modal pw' });
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('click', (e) => e.target === modal && close());
    document.addEventListener('keydown', onKey, true);
    document.body.append(modal);
    if (versions) choice.versionId = newestRelease(versions) ?? '';
    render();
    if (!versions) {
      versions = await api.listVersions().catch(() => []) as { id: string; type: string }[];
      // the newest release by its number (the profile and its name say which one it is)
      if (!choice.versionId) choice.versionId = newestRelease(versions) ?? '';
      if (modal) render();
    }
  }

  function close() {
    modal?.remove();
    modal = undefined;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !modal) return;
    e.stopPropagation();
    close();
  }

  function go(to: number) {
    step = Math.max(0, Math.min(STEPS.length - 1, to));
    render();
  }

  function tile(opts: { icon: string; title: string; sub: string; selected: boolean; onPick: () => void; badge?: string }) {
    const b = el('button', { type: 'button', className: `wz-tile${opts.selected ? ' selected' : ''}` },
      el('span', { className: 'wz-tile-icon' }, el('i', { className: opts.icon })),
      el('span', { className: 'wz-tile-text' }, el('b', { textContent: opts.title }), el('small', { textContent: opts.sub })),
      ...(opts.badge ? [el('span', { className: 'wz-tile-badge', textContent: opts.badge })] : []),
      el('span', { className: 'wz-tile-check' }, icon('fa-circle-check')));
    b.setAttribute('aria-pressed', String(opts.selected));
    b.addEventListener('click', opts.onPick);
    return b;
  }

  // ---------- frame ----------

  function render() {
    if (!modal) return;
    const rail = el('ol', { className: 'pw-steps' }, ...STEPS.map((s, i) => {
      const li = el('li', { className: i < step ? 'done' : i === step ? 'current' : '' },
        el('span', { className: 'wz-dot' }, i < step ? icon('fa-check') : String(i + 1)), el('span', { textContent: t(s.title) }));
      if (i < step) li.addEventListener('click', () => go(i));
      return li;
    }));
    const body = el('div', { className: 'pw-body' });
    const foot = el('div', { className: 'pw-foot' });
    const closeBtn = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
    closeBtn.addEventListener('click', close);
    modal.replaceChildren(el('div', { className: 'modal-box glass-panel pw-box' }, closeBtn,
      el('div', { className: 'pw-head' }, el('h2', { className: 'gradient-title', textContent: t('Nowy profil') }), rail), body, foot));
    [gameStep, perfStep, nameStep][step](body);
    footer(foot);
  }

  function footer(foot: HTMLElement) {
    const back = el('button', { type: 'button' }, icon('fa-arrow-left'), ' ', t('Wstecz'));
    back.addEventListener('click', () => go(step - 1));
    const last = step === STEPS.length - 1;
    const next = el('button', { type: 'button', className: 'primary' }, last ? t('Utwórz profil') : t('Dalej'), ' ', icon(last ? 'fa-check' : 'fa-arrow-right'));
    next.addEventListener('click', () => (last ? void create(next) : go(step + 1)));
    // the old way, for players who set everything up themselves
    const blank = el('button', { type: 'button', className: 'pw-blank' }, icon('fa-file'), ' ', t('Pusty profil'));
    blank.title = t('Profil z domyślnymi ustawieniami, wszystko ustawisz w jego formularzu');
    blank.addEventListener('click', () => void createBlank());
    foot.append(step === 0 ? blank : back, el('span', { className: 'grow' }), next);
    next.focus();
  }

  // ---------- 1. the game ----------

  function gameStep(body: HTMLElement) {
    const hud = hudVersions();
    const select = control<HTMLSelectElement>('select', { className: 'wz-version' });
    select.dataset.noI18n = '';
    if (!versions) select.append(control<HTMLOptionElement>('option', { value: '', textContent: t('Ładuję wersje Minecrafta…') }));
    else {
      const releases = allVersions ? versions.filter((v) => v.type === 'release').map((v) => ({ id: v.id, hud: hud.has(v.id) })) : wizardVersions(versions, [...hud]);
      const list = [{ id: 'latest-release', hud: false }, ...releases];
      for (const v of list) {
        select.append(control<HTMLOptionElement>('option', { value: v.id, textContent: v.hud ? `${v.id}  ·  ${t('SlashClient HUD')}` : versionLabel(v.id), selected: v.id === (choice.versionId || 'latest-release') }));
      }
    }
    select.addEventListener('change', () => { choice.versionId = select.value === 'latest-release' ? '' : select.value; render(); });
    const all = control<HTMLInputElement>('input', { type: 'checkbox', checked: allVersions });
    all.addEventListener('change', () => { allVersions = all.checked; render(); });
    const hint = el('small', { className: 'muted' });
    if (choice.loader === 'fabric' && choice.versionId) {
      hint.textContent = hud.has(choice.versionId)
        ? t('SlashClient HUD działa w tej wersji: FPS, CPS, pancerz, klawisze i więcej.')
        : t('SlashClient HUD nie jest jeszcze dostępny dla {0}. Wersje z HUD: {1}.', choice.versionId, [...hud].join(', ') || '—');
    }
    const pick = (loader: Loader) => () => {
      choice.loader = loader;
      if (!choice.memoryTouched) choice.memoryMb = 0;
      render();
    };
    const other = OTHER_LOADERS.some((l) => l.id === choice.loader);
    const otherSelect = control<HTMLSelectElement>('select', { className: 'pw-other-loader' });
    for (const l of OTHER_LOADERS) otherSelect.append(control<HTMLOptionElement>('option', { value: l.id, textContent: l.name, selected: l.id === (other ? choice.loader : choice.otherLoader) }));
    otherSelect.addEventListener('click', (e) => e.stopPropagation());
    otherSelect.addEventListener('change', () => {
      choice.otherLoader = otherSelect.value as Loader;
      pick(choice.otherLoader)();
    });
    const otherTile = tile({ icon: 'fa-solid fa-puzzle-piece', title: t('Inny loader modów'), sub: t('Dla paczek modów spoza Fabric'), selected: other, onPick: pick(choice.otherLoader) });
    otherTile.querySelector('.wz-tile-text')!.append(otherSelect);
    body.append(
      el('div', { className: 'wz-field' }, el('h4', { className: 'wz-label', textContent: t('Wersja Minecrafta') }),
        el('div', { className: 'row pw-version-row' }, select, el('label', { className: 'check' }, all, el('span', { textContent: t('Wszystkie wersje') }))), hint),
      el('h4', { className: 'wz-label', textContent: t('Rodzaj gry') }),
      el('div', { className: 'wz-tiles pw-tiles' },
        tile({ icon: 'fa-solid fa-wand-magic-sparkles', title: t('Fabric + SlashClient HUD'), sub: t('Mody, HUD, kosmetyki i znajomi w grze'), badge: t('zalecane'), selected: choice.loader === 'fabric', onPick: pick('fabric') }),
        tile({ icon: 'fa-solid fa-cube', title: t('Czysta gra (vanilla)'), sub: t('Minecraft bez żadnych dodatków'), selected: choice.loader === 'vanilla', onPick: pick('vanilla') }),
        otherTile),
    );
  }

  // ---------- 2. how it runs ----------

  function perfStep(body: HTMLElement) {
    const s = deps.store();
    const sys = s.systemMemoryMb || 8192;
    // the mode for slower computers
    const preset = control<HTMLSelectElement>('select', { name: 'pwPreset' });
    for (const p of PERF_PRESETS) preset.append(control<HTMLOptionElement>('option', { value: p, textContent: presetName(p), selected: p === choice.preset }));
    preset.addEventListener('change', () => {
      choice.preset = preset.value as PerfPreset;
      if (!choice.memoryTouched) choice.memoryMb = 0;
      render();
    });
    const suggested = suggestedPreset(s.systemMemoryMb, navigator.hardwareConcurrency || 0, s.platform ?? '', s.arch ?? '');
    // performance mods (Fabric and Quilt): a preset's mods part brings them anyway
    const inPreset = partOn(choice.preset, [], 'mods');
    const perf = control<HTMLInputElement>('input', { type: 'checkbox', checked: perfMods(), disabled: !fabricLike() || inPreset });
    perf.addEventListener('change', () => {
      choice.perf = perf.checked;
      if (!choice.memoryTouched) choice.memoryMb = 0;
      render();
    });
    // memory
    if (!choice.memoryMb) choice.memoryMb = recommended();
    const max = Math.max(4096, Math.floor((sys - 2048) / 512) * 512);
    const range = control<HTMLInputElement>('input', { type: 'range', min: '1024', max: String(max), step: '512', value: String(Math.min(choice.memoryMb, max)) });
    const value = el('b', { textContent: `${gb(Number(range.value))} GB` });
    range.addEventListener('input', () => {
      choice.memoryMb = Number(range.value);
      choice.memoryTouched = true;
      value.textContent = `${gb(choice.memoryMb)} GB`;
    });
    body.append(
      el('div', { className: 'wz-field' }, el('h4', { className: 'wz-label' }, t('Pamięć RAM'), ' ', value), range,
        el('small', { className: 'muted', textContent: t('Zalecane dla Twojego komputera ({0} GB RAM): {1} GB.', gb(sys), gb(recommended())) })),
      el('label', { className: `check wz-check${!fabricLike() || inPreset ? ' off' : ''}` }, perf,
        el('span', { textContent: inPreset ? t('Mody poprawiające wydajność (w trybie dla słabszych komputerów)') : t('Zainstaluj mody poprawiające wydajność (Sodium, Lithium…)') })),
      el('div', { className: 'wz-field' },
        el('h4', { className: 'wz-label', textContent: t('Tryb dla słabszych komputerów') }), preset,
        el('small', { className: 'muted', textContent: [presetAbout(choice.preset) || t('Gra z Twoimi ustawieniami grafiki.'),
          suggested !== 'off' ? t('dla tego komputera polecamy: {0}', presetName(suggested)) : ''].filter(Boolean).join(' ') })),
    );
  }

  // ---------- 3. the name ----------

  function nameStep(body: HTMLElement) {
    if (!choice.nameTouched) choice.name = defaultName();
    const input = control<HTMLInputElement>('input', { value: choice.name, maxLength: 64 });
    input.dataset.noI18n = '';
    input.addEventListener('input', () => {
      choice.name = input.value;
      choice.nameTouched = true;
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && modal?.querySelector<HTMLButtonElement>('.pw-foot .primary')?.click());
    const row = (ic: string, label: string, text: string) => el('li', {}, icon(ic), el('span', { className: 'muted', textContent: label }), el('b', { textContent: text }));
    body.append(
      el('div', { className: 'wz-field' }, el('h4', { className: 'wz-label', textContent: t('Nazwa profilu') }), input),
      el('ul', { className: 'pw-summary' },
        row('fa-cube', t('Gra'), `${choice.loader === 'fabric' ? t('Fabric + SlashClient HUD') : loaderName(choice.loader)} · ${versionLabel(choice.versionId || 'latest-release')}`),
        row('fa-memory', t('Pamięć RAM'), `${gb(choice.memoryMb || recommended())} GB`),
        row('fa-bolt', t('Mody wydajności'), perfMods() ? t('tak') : t('nie')),
        row('fa-gauge-high', t('Tryb dla słabszych komputerów'), presetName(choice.preset))),
    );
    setTimeout(() => input.select());
  }

  // ---------- making the profile ----------

  async function create(btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.replaceChildren(el('span', { className: 'spinner' }), ' ', t('Tworzę profil…'));
    try {
      const base = (await api.newProfile()) as Profile;
      const fabric = choice.loader === 'fabric';
      const profile: Profile = {
        ...base, name: choice.name.trim() || defaultName(), versionId: choice.versionId || 'latest-release', loader: choice.loader, loaderVersion: '',
        hud: fabric, memoryMb: choice.memoryMb || recommended(), perfPreset: choice.preset, perfOff: [],
      };
      const id = (await api.saveProfile(profile)) as string;
      const mods = perfMods();
      close();
      deps.created(id);
      // performance mods in the background (a task card shows the progress)
      if (mods) {
        const plan = (await api.perfPlan(id)) as { projectId?: string; title: string; installed: boolean }[];
        const items = plan.filter((p) => p.projectId && !p.installed).map((p) => ({ projectId: p.projectId!, title: p.title }));
        if (items.length) await api.installPerf(id, items);
      }
    } catch (err) {
      deps.toast(deps.errorText(err), true);
      if (modal) render();
    }
  }

  async function createBlank() {
    try {
      const id = (await api.saveProfile(await api.newProfile())) as string;
      close();
      deps.created(id);
    } catch (err) {
      deps.toast(deps.errorText(err), true);
    }
  }

  return { open };
}
