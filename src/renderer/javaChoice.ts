import { el } from './dialog';
import { locale, t } from '../shared/i18n';
import { effectiveJavaVendor, isJavaVendor, JAVA_VENDOR_NAMES, type JavaVendor } from '../shared/javaVendors';

/**
 * The Java choice in a profile's settings (Mojang's, Temurin, GraalVM, Zulu or a path of the
 * player's own), the default for profiles in Settings, and "Porównaj w benchmarku": the test scene
 * on the profile's Java and on the one picked, with the measured difference. The downloads and
 * the runs live in the main process (src/main/javaVendors.ts, src/main/javaCompare.ts).
 */

interface JavaProfile { id: string; javaPath: string; javaVendor?: string; hud?: boolean; loader: string }
interface Fps { avg: number; low1: number }
interface CompareRun { vendor: JavaVendor; release?: string; result: { fps: Fps; version: string } }
interface Comparison { at: number; version: string; runs: [CompareRun, CompareRun]; avgChange: number; low1Change: number }

export interface JavaChoiceDeps {
  api: any;
  $: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
  editing: () => string | undefined;
  profile: (id: string) => JavaProfile | undefined;
  defaultVendor: () => string | undefined;
  accountId: () => string;
  running: (profileId: string) => boolean;
  /** The progress card in the corner (the launch's stages show in it). */
  startCard: (title: string) => void;
  finishCard: (ok: boolean, message: string) => void;
}

const name = (v: JavaVendor) => t(JAVA_VENDOR_NAMES[v]);
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
const fps = (n: number) => Math.round(n).toLocaleString(locale());

export function initJavaChoice(d: JavaChoiceDeps) {
  const { api, $ } = d;
  const select = () => $<HTMLSelectElement>('#java-vendor');
  /** The profile whose comparison runs now. */
  let comparing: string | undefined;
  let cardOpen = false;

  /** The vendor the select stands for now ("as in Settings" resolved); undefined for a path of the player's own. */
  function picked(): JavaVendor | undefined {
    const v = select().value;
    if (v === 'custom') return undefined;
    return effectiveJavaVendor(v, d.defaultVendor());
  }

  /** The Java the saved profile plays on. */
  function saved(p: JavaProfile): JavaVendor | undefined {
    return p.javaPath ? undefined : effectiveJavaVendor(p.javaVendor, d.defaultVendor());
  }

  function refresh() {
    const id = d.editing();
    const p = id ? d.profile(id) : undefined;
    const v = select().value;
    select().options[0].textContent = t('Jak w ustawieniach ({0})', name(effectiveJavaVendor('', d.defaultVendor())));
    $('#java-path-field').classList.toggle('hidden', v !== 'custom');
    const chosen = picked();
    $('#java-hint').textContent = !chosen ? t('Gra uruchomi się na Javie z tej ścieżki.')
      : chosen === 'mojang' ? t('Java, którą Mojang dobiera do wersji gry.')
        : t('Launcher pobierze {0} w wersji, której potrzebuje ta wersja gry. Gdy jej nie ma albo pobieranie się nie uda, gra uruchomi się na Javie od Mojang.', name(chosen));
    const button = $<HTMLButtonElement>('#java-compare');
    const current = p ? saved(p) : undefined;
    // the comparison runs the SlashClient test scene: it needs the mod (a profile with the HUD)
    let note = '';
    if (!p) note = '';
    else if (comparing) note = comparing === p.id ? t('Trwa porównanie…') : t('Trwa porównanie w innym profilu.');
    else if (!current) note = t('Porównanie działa z Javą pobieraną przez launcher (bez własnej ścieżki).');
    else if (!chosen || chosen === current) note = t('Wybierz wyżej inną Javę, żeby porównać ją z obecną ({0}).', name(current));
    else if (p.hud === false || !['vanilla', 'fabric'].includes(p.loader)) note = t('Scena testowa działa z modem SlashClient: w profilu Fabric lub vanilla z włączonym HUD.');
    else note = t('Dwa przeloty sceny testowej, około 2 × 1,5 minuty: {0}, potem {1}. Gra zamknie się sama po każdym.', name(current), name(chosen));
    $('#java-compare-note').textContent = note;
    button.disabled = !!comparing || !p || !current || !chosen || chosen === current || p.hud === false || !['vanilla', 'fabric'].includes(p.loader);
  }

  function renderComparison(c: Comparison | undefined) {
    const box = $('#java-compare-result');
    if (!c) return box.replaceChildren();
    const best = Math.max(1, ...c.runs.map((r) => r.result.fps.avg));
    const rows = c.runs.map((r) => {
      const bar = el('div', { className: 'bench-bar' }, el('div'));
      (bar.firstElementChild as HTMLElement).style.width = `${Math.max(4, (r.result.fps.avg / best) * 100).toFixed(1)}%`;
      const low = el('div', { className: 'bench-bar low' }, el('div'));
      (low.firstElementChild as HTMLElement).style.width = `${Math.max(2, (r.result.fps.low1 / best) * 100).toFixed(1)}%`;
      return el('div', { className: 'java-run' },
        el('div', { className: 'java-run-top' },
          el('b', { textContent: name(r.vendor) }),
          el('span', { className: 'muted', textContent: r.release ?? '' }),
          el('span', { className: 'java-run-fps', textContent: t('średnio {0} FPS · 1% low {1} FPS', fps(r.result.fps.avg), fps(r.result.fps.low1)) })),
        bar, low);
    });
    const tone = (n: number) => (Math.abs(n) < 1 ? '' : n > 0 ? 'up' : 'down');
    box.replaceChildren(el('div', { className: 'java-compare-card' },
      el('div', { className: 'java-compare-head' },
        el('b', { textContent: t('Porównanie Javy') }),
        el('small', { className: 'muted', textContent: `Minecraft ${c.version} · ${new Date(c.at).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })}` })),
      ...rows,
      el('div', { className: 'java-compare-diff' },
        el('span', { textContent: t('{0} względem {1}:', name(c.runs[1].vendor), name(c.runs[0].vendor)) }),
        el('span', { className: `bench-change ${tone(c.avgChange)}`, textContent: t('średnio {0}', signed(c.avgChange)) }),
        el('span', { className: `bench-change ${tone(c.low1Change)}`, textContent: t('1% low {0}', signed(c.low1Change)) })),
      el('small', { className: 'muted', textContent: t('Wynik jednego pomiaru na tym komputerze; różnice w granicach kilku procent mogą być przypadkowe.') })));
  }

  async function showLast(profileId: string) {
    const list: Comparison[] = await api.javaComparisons(profileId).catch(() => []);
    if (d.editing() === profileId && comparing !== profileId) renderComparison(list[0]);
  }

  async function compare() {
    const id = d.editing();
    const p = id ? d.profile(id) : undefined;
    const other = picked();
    if (!p || !other || comparing) return;
    if (d.running(p.id)) return d.toast(t('Ten profil już działa.'), true);
    comparing = p.id;
    refresh();
    $('#java-compare-result').replaceChildren(el('p', { className: 'muted loading-text', textContent: t('Przygotowanie…') }));
    try {
      const c: Comparison = await api.javaCompare(p.id, d.accountId(), other);
      if (cardOpen) d.finishCard(true, t('{0}: średnio {1}, 1% low {2}', name(c.runs[1].vendor), signed(c.avgChange), signed(c.low1Change)));
      comparing = undefined;
      if (d.editing() === p.id) renderComparison(c);
    } catch (err) {
      if (cardOpen) d.finishCard(false, d.errorText(err));
      else d.toast(d.errorText(err), true);
      comparing = undefined;
      if (d.editing() === p.id) void showLast(p.id);
    } finally {
      cardOpen = false;
      comparing = undefined;
      refresh();
    }
  }

  api.on('javaCompare:progress', ({ profileId, step, steps, vendor }: { profileId: string; step: number; steps: number; vendor: JavaVendor }) => {
    if (cardOpen) d.finishCard(true, t('Pomiar zakończony'));
    d.startCard(t('Porównanie Javy {0}/{1}: {2}', step, steps, name(vendor)));
    cardOpen = true;
    if (d.editing() === profileId) $('#java-compare-result').replaceChildren(el('p', { className: 'muted loading-text', textContent: t('Pomiar {0} z {1}: {2}', step, steps, name(vendor)) }));
  });
  // the chosen Java was not there (or did not download): the game starts on Mojang's, and the player hears why
  api.on('launch:notice', ({ message }: { message: string }) => d.toast(message, true));

  select().addEventListener('change', refresh);
  $('#java-compare').addEventListener('click', () => void compare());

  return {
    /** Fills the choice from the profile. */
    load(p: JavaProfile) {
      select().value = p.javaPath ? 'custom' : isJavaVendor(p.javaVendor) ? p.javaVendor : '';
      refresh();
      if (comparing !== p.id) void showLast(p.id);
    },
    /** What the form saves: a path of the player's own, or a vendor ('' = as in Settings). */
    values(data: FormData): { javaVendor: '' | JavaVendor; javaPath: string } {
      const v = String(data.get('javaVendor') ?? '');
      const path = String(data.get('javaPath') ?? '').trim();
      if (v === 'custom') return { javaVendor: '', javaPath: path };
      return { javaVendor: isJavaVendor(v) ? v : '', javaPath: '' };
    },
    refresh,
    /** The default in Settings. */
    renderSettings() {
      $<HTMLSelectElement>('#settings-java-vendor').value = effectiveJavaVendor('', d.defaultVendor());
    },
    settingsValue(): JavaVendor {
      return effectiveJavaVendor($<HTMLSelectElement>('#settings-java-vendor').value, 'mojang');
    },
  };
}
