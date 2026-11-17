import { locale, t } from '../shared/i18n';
import { control, el, icon } from './dialog';

/**
 * "Pobieranie, grafika i klipy" in Settings: the download speed limit (all of the launcher's downloads),
 * starting games on the dedicated GPU and clips made into WebM. Each change is saved at once.
 */

export interface ToolSettingsDeps {
  api: any;
  toast: (message: string, isError?: boolean) => void;
  errorText: (err: unknown) => string;
}

/** MB/s; 0 = no limit. */
const LIMITS = [0, 0.5, 1, 2, 5, 10, 25, 50];

const limitLabel = (mb: number) => (mb ? `${mb.toLocaleString(locale())} MB/s` : t('Bez limitu'));

export function createToolSettings(root: HTMLElement, deps: ToolSettingsDeps) {
  const { api, toast, errorText } = deps;
  const limit = control<HTMLSelectElement>('select', { id: 'download-limit' });
  const gpu = control<HTMLInputElement>('input', { type: 'checkbox', id: 'dedicated-gpu' });
  const gpuRow = el('label', { className: 'check hidden' }, gpu,
    el('span', {}, t('Uruchamiaj grę na dedykowanej karcie graficznej'), ' ', el('span', { className: 'hint', textContent: t('dla laptopów z dwiema kartami') })));
  const gpuHint = el('p', { className: 'muted tools-hint hidden' });
  // clips from the game (Motion-JPEG AVI, the cheapest to record) made into WebM, which Discord plays
  const autoWebm = control<HTMLInputElement>('input', { type: 'checkbox', id: 'clips-auto-webm' });
  const webmQuality = control<HTMLSelectElement>('select', { id: 'clips-webm-quality' });
  webmQuality.append(
    control<HTMLOptionElement>('option', { value: 'discord', textContent: t('Discord: do 10 MB') }),
    control<HTMLOptionElement>('option', { value: 'high', textContent: t('Wysoka jakość (większy plik)') }));

  root.append(
    el('h3', {}, icon('fa-gauge'), ' ', t('Pobieranie, grafika i klipy')),
    el('label', { className: 'field tools-limit' },
      el('span', { className: 'label' }, t('Limit prędkości pobierania'), ' ', el('span', { className: 'hint', textContent: t('mody, modpacki, assety, biblioteki i Java') })),
      limit),
    gpuRow, gpuHint,
    el('label', { className: 'check' }, autoWebm,
      el('span', {}, t('Zamieniaj nowe klipy na WebM'), ' ', el('span', { className: 'hint', textContent: t('Discord odtwarza je w czacie; klip AVI z gry trafia potem do kosza') }))),
    el('label', { className: 'field tools-limit' }, el('span', { className: 'label' }, t('Rozmiar klipów WebM')), webmQuality),
  );

  function fill(settings: { downloadLimitMBps?: number; dedicatedGpu?: boolean; clipsAutoWebm?: boolean; clipsWebmQuality?: string }) {
    autoWebm.checked = settings.clipsAutoWebm !== false;
    webmQuality.value = settings.clipsWebmQuality === 'high' ? 'high' : 'discord';
    const current = settings.downloadLimitMBps ?? 0;
    const values = LIMITS.includes(current) ? LIMITS : [...LIMITS, current].sort((a, b) => a - b);
    limit.replaceChildren(...values.map((v) => control<HTMLOptionElement>('option', { value: String(v), textContent: limitLabel(v) })));
    limit.value = String(current);
    gpu.checked = !!settings.dedicatedGpu;
  }

  async function save(changes: Record<string, unknown>, message: string) {
    try {
      await api.saveSettings(changes);
      toast(message);
    } catch (err) {
      toast(errorText(err), true);
    }
  }

  limit.addEventListener('change', () => {
    const mb = Number(limit.value);
    void save({ downloadLimitMBps: mb }, mb ? t('Limit pobierania: {0}', limitLabel(mb)) : t('Pobieranie bez limitu'));
  });
  autoWebm.addEventListener('change', () => {
    void save({ clipsAutoWebm: autoWebm.checked }, autoWebm.checked ? t('Nowe klipy będą zamieniane na WebM') : t('Nowe klipy zostaną w AVI'));
  });
  webmQuality.addEventListener('change', () => {
    void save({ clipsWebmQuality: webmQuality.value }, t('Rozmiar klipów WebM: {0}', webmQuality.selectedOptions[0]?.textContent ?? ''));
  });
  gpu.addEventListener('change', () => {
    void save({ dedicatedGpu: gpu.checked }, gpu.checked ? t('Gra uruchomi się na dedykowanej karcie graficznej') : t('Wybór karty graficznej należy znowu do systemu'));
  });

  api.gpuSupported().then((supported: boolean) => {
    gpuRow.classList.toggle('hidden', !supported);
    gpuHint.classList.toggle('hidden', !supported);
    gpuHint.textContent = navigator.userAgent.includes('Windows')
      ? t('Windows: ustawia preferencję grafiki „Wysoka wydajność” dla Javy instalowanej przez launcher (jak w Ustawieniach → Ekran → Grafika). Wyłączenie usuwa to ustawienie.')
      : t('Linux: gra dostaje zmienne PRIME (DRI_PRIME=1, a ze sterownikiem NVIDIA __NV_PRIME_RENDER_OFFLOAD).');
  }).catch(() => {});
  api.getStore().then((s: { settings: Record<string, unknown> }) => fill(s.settings)).catch(() => {});
  api.on('store', (s: { settings: Record<string, unknown> }) => fill(s.settings));
}
