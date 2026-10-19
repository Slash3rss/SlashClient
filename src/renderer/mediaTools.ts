import { locale, t } from '../shared/i18n';
import { confirmDialog, control, el, fmtSize, icon } from './dialog';

/**
 * The gallery's extras: trimming a clip (a window with the clip, two handles for the start and
 * the end and a preview of the chosen part) and sharing a screenshot or clip by link on the
 * SlashClient website, with a list of one's links. The cutting and the upload live in the main
 * process (src/main/clipTrim.ts, mediaShare.ts); this is only the page.
 */

interface GalleryFile { file: string; name: string; createdAt: number; sizeBytes: number }
interface ClipInfo { frames: number; fps: number; width: number; height: number; durationMs: number; trimmable: boolean }
interface SharedMedia { id: string; kind: 'image' | 'clip'; url: string; size: number; durationMs: number; title: string; views: number; createdAt: number; expiresAt: number }

export interface MediaToolDeps {
  api: any;
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  toast: (message: string, isError?: boolean) => void;
  /** Lists the gallery again (after a trimmed copy was saved). */
  refresh: () => void;
}

/** "0:05.3" from seconds. */
export function clipTime(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/** Keeps a start/end pair inside the clip, at least `min` frames apart, moving only the one being dragged. */
export function clampRange(start: number, end: number, frames: number, moved: 'start' | 'end', min = 1): [number, number] {
  const last = Math.max(0, frames - 1);
  let s = Math.round(Math.max(0, Math.min(last, start)));
  let e = Math.round(Math.max(0, Math.min(last, end)));
  if (e - s < min) {
    if (moved === 'start') s = Math.max(0, e - min);
    else e = Math.min(last, s + min);
    // still too close: the clip's edge stopped the dragged one, so the other gives way
    if (e - s < min) {
      if (moved === 'start') e = Math.min(last, s + min);
      else s = Math.max(0, e - min);
    }
  }
  return [s, e];
}

const frameUrl = (file: string, frame: number) => `slash-media://clip/?path=${encodeURIComponent(file)}&frame=${frame}`;
const errorOf = (err: unknown) => String((err as Error)?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** A window of the launcher's style; `onClose` runs once, whichever way it is closed. */
function modal(className: string, title: string, body: (Node | string)[], onClose?: () => void) {
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));
  const box = el('div', { className: 'modal' },
    el('div', { className: `modal-box glass-panel ${className}` }, close, el('div', { className: 'modal-body' }, el('h2', { textContent: title }), ...body)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      done();
    }
  };
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  close.addEventListener('click', done);
  box.addEventListener('click', (e) => e.target === box && done());
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);
  return { box, close: done };
}

export function createMediaTools(d: MediaToolDeps) {
  const { api, guard, toast } = d;

  // ---------- trimming ----------

  async function openTrim(profileId: string, clip: GalleryFile) {
    const info: ClipInfo | undefined = await guard(() => api.clipInfo(profileId, clip.name));
    if (!info) return;
    if (!info.trimmable || info.frames < 2) {
      toast(t('Tego klipu nie da się przyciąć (to nie jest klip zapisany w grze).'), true);
      return;
    }
    const total = info.frames;
    const frameMs = 1000 / info.fps;
    let start = 0;
    let end = total - 1;
    let at = 0;
    let playing = false;
    let loop = false;
    let started = 0;
    let startAt = 0;
    let ticket = 0;
    let raf = 0;

    const canvas = el('canvas', { className: 'trim-canvas', width: info.width, height: info.height });
    const ctx = canvas.getContext('2d')!;
    const playBtn = el('button', { type: 'button', className: 'icon-btn', title: t('Odtwórz / pauza (spacja)') }, icon('fa-play'));
    const previewBtn = el('button', { type: 'button', title: t('Odtwarza tylko wybrany fragment, w pętli') }, icon('fa-repeat'), ' ', t('Podgląd fragmentu'));
    const track = el('div', { className: 'trim-track' });
    const sel = el('div', { className: 'trim-selection' });
    const head = el('div', { className: 'trim-head' });
    const startHandle = el('button', { type: 'button', className: 'trim-handle start', title: t('Początek (strzałki: o klatkę)') });
    const endHandle = el('button', { type: 'button', className: 'trim-handle end', title: t('Koniec (strzałki: o klatkę)') });
    startHandle.setAttribute('aria-label', t('Początek'));
    endHandle.setAttribute('aria-label', t('Koniec'));
    track.append(sel, head, startHandle, endHandle);
    const startLabel = el('span');
    const endLabel = el('span');
    const lengthLabel = el('b');
    const timeLabel = el('span', { className: 'trim-time' });
    const setStart = el('button', { type: 'button', title: t('Początek w miejscu odtwarzania') }, icon('fa-arrow-right-to-bracket'), ' ', t('Początek tutaj'));
    const setEnd = el('button', { type: 'button', title: t('Koniec w miejscu odtwarzania') }, t('Koniec tutaj'), ' ', icon('fa-arrow-left-long'));
    const save = el('button', { type: 'button', className: 'primary' }, icon('fa-scissors'), ' ', t('Zapisz przyciętą kopię'));
    const saveShare = el('button', { type: 'button' }, icon('fa-share-nodes'), ' ', t('Zapisz i udostępnij'));

    const pct = (frame: number) => `${(frame / Math.max(1, total - 1)) * 100}%`;
    function paint() {
      sel.style.left = pct(start);
      sel.style.width = `calc(${pct(end)} - ${pct(start)})`;
      startHandle.style.left = pct(start);
      endHandle.style.left = pct(end);
      head.style.left = pct(at);
      startLabel.textContent = t('Początek: {0}', clipTime((start * frameMs) / 1000));
      endLabel.textContent = t('Koniec: {0}', clipTime(((end + 1) * frameMs) / 1000));
      lengthLabel.textContent = t('Długość: {0}', clipTime(((end - start + 1) * frameMs) / 1000));
      timeLabel.textContent = `${clipTime((at * frameMs) / 1000)} / ${clipTime((total * frameMs) / 1000)}`;
    }
    // frames are decoded one after another: only the newest asked one is drawn
    async function draw(frame: number) {
      const mine = ++ticket;
      const img = new Image();
      img.src = frameUrl(clip.file, frame);
      try {
        await img.decode();
      } catch {
        return;
      }
      if (mine === ticket) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    function seek(frame: number) {
      at = Math.max(0, Math.min(total - 1, Math.round(frame)));
      paint();
      void draw(at);
    }
    function setPlaying(on: boolean, onlySelection = loop) {
      playing = on;
      loop = on && onlySelection;
      playBtn.firstElementChild!.className = `fa-solid ${on ? 'fa-pause' : 'fa-play'}`;
      previewBtn.classList.toggle('active', loop);
      cancelAnimationFrame(raf);
      if (!on) return;
      if (loop && (at < start || at >= end)) at = start;
      if (!loop && at >= total - 1) at = 0;
      started = performance.now();
      startAt = at;
      raf = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      if (!playing) return;
      let frame = startAt + Math.floor((now - started) / frameMs);
      const stop = loop ? end : total - 1;
      if (frame > stop) {
        if (!loop) {
          seek(stop);
          setPlaying(false);
          return;
        }
        started = now;
        startAt = start;
        frame = start;
      }
      if (frame !== at) seek(frame);
      raf = requestAnimationFrame(tick);
    }
    function move(which: 'start' | 'end', frame: number) {
      [start, end] = clampRange(which === 'start' ? frame : start, which === 'end' ? frame : end, total, which);
      seek(which === 'start' ? start : end);
      if (playing) setPlaying(false);
    }
    const frameAt = (clientX: number) => {
      const r = track.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * (total - 1);
    };
    for (const [handle, which] of [[startHandle, 'start'], [endHandle, 'end']] as const) {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        handle.focus();
        const onMove = (ev: PointerEvent) => move(which, frameAt(ev.clientX));
        const onUp = () => {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
      handle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? Math.round(info.fps) : 1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          move(which, (which === 'start' ? start : end) + (e.key === 'ArrowLeft' ? -step : step));
        }
      });
    }
    // a click on the track moves the playhead there; dragging scrubs
    track.addEventListener('pointerdown', (e) => {
      track.setPointerCapture(e.pointerId);
      setPlaying(false);
      seek(frameAt(e.clientX));
      const onMove = (ev: PointerEvent) => seek(frameAt(ev.clientX));
      const onUp = () => {
        track.removeEventListener('pointermove', onMove);
        track.removeEventListener('pointerup', onUp);
      };
      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerup', onUp);
    });
    playBtn.addEventListener('click', () => setPlaying(!playing, false));
    canvas.addEventListener('click', () => setPlaying(!playing, false));
    previewBtn.addEventListener('click', () => setPlaying(!loop, true));
    setStart.addEventListener('click', () => move('start', at));
    setEnd.addEventListener('click', () => move('end', at));

    const view = modal('trim-box', t('Przytnij klip'), [
      el('p', { className: 'muted', textContent: t('Przeciągnij uchwyty, żeby wybrać fragment. Przycięta kopia zapisze się obok oryginału, bez utraty jakości (oryginał zostaje).') }),
      el('div', { className: 'trim-stage' }, canvas),
      el('div', { className: 'trim-controls' }, playBtn, track, timeLabel),
      el('div', { className: 'trim-facts row' }, startLabel, endLabel, lengthLabel),
      el('div', { className: 'row trim-actions' }, setStart, setEnd, previewBtn, el('span', { className: 'push' }), saveShare, save),
    ], () => {
      playing = false;
      cancelAnimationFrame(raf);
    });
    const onKey = (e: KeyboardEvent) => {
      if (!view.box.isConnected) return document.removeEventListener('keydown', onKey);
      if (e.target instanceof HTMLButtonElement && e.target.classList.contains('trim-handle')) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying(!playing, false);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        seek(at + (e.key === 'ArrowLeft' ? -1 : 1));
      }
    };
    document.addEventListener('keydown', onKey);

    async function saveCopy(share: boolean) {
      const full = start === 0 && end === total - 1;
      if (full && !share) {
        toast(t('Wybierz krótszy fragment: teraz to cały klip.'), true);
        return;
      }
      setPlaying(false);
      for (const b of [save, saveShare]) b.disabled = true;
      try {
        const name: string = full ? clip.name : await api.trimClip(profileId, clip.name, start, end);
        if (!full) toast(t('Zapisano przyciętą kopię: {0}', name));
        view.close();
        d.refresh();
        if (share) await shareFile(profileId, 'clips', name);
      } catch (err) {
        toast(errorOf(err), true);
      } finally {
        for (const b of [save, saveShare]) b.disabled = false;
      }
    }
    save.addEventListener('click', () => saveCopy(false));
    saveShare.addEventListener('click', () => saveCopy(true));
    seek(0);
  }

  // ---------- sharing ----------

  /** Asks, then uploads; the link lands in the clipboard. */
  async function shareFile(profileId: string, folder: 'screenshots' | 'clips', name: string) {
    const title = control<HTMLInputElement>('input', { type: 'text', maxLength: 80, placeholder: t('Tytuł (opcjonalnie)'), className: 'grow' });
    const ok = await confirmDialog({
      title: folder === 'clips' ? t('Udostępnić klip?') : t('Udostępnić zrzut ekranu?'),
      body: [
        el('p', { className: 'muted', textContent: t('Plik trafi na stronę SlashClient, a link do niego skopiuje się do schowka. Każdy, kto dostanie link, zobaczy go (bez logowania). Link działa 30 dni; usuniesz go wcześniej w „Moje linki”.') }),
        title,
      ],
      ok: t('Udostępnij'),
      okIcon: 'fa-share-nodes',
    });
    if (!ok) return;
    toast(t('Wysyłam…'));
    try {
      const media: SharedMedia = await api.shareMedia(profileId, folder, name, title.value.trim() || undefined);
      toast(t('Link skopiowany do schowka: {0}', media.url));
    } catch (err) {
      toast(errorOf(err), true);
    }
  }

  /** The player's own links: open, copy, take down. */
  async function openMine() {
    const list = el('div', { className: 'project-list media-links' }, el('p', { className: 'muted', textContent: t('Wczytuję…') }));
    modal('join-box media-links-box', t('Moje linki'), [
      el('p', { className: 'muted', textContent: t('Zrzuty i klipy udostępnione na stronie SlashClient. Każdy link wygasa po 30 dniach.') }),
      list,
    ]);
    const render = async () => {
      let items: SharedMedia[];
      try {
        items = await api.listSharedMedia();
      } catch (err) {
        list.replaceChildren(el('p', { className: 'muted', textContent: errorOf(err) }));
        return;
      }
      if (!items.length) {
        list.replaceChildren(el('p', { className: 'muted', textContent: t('Nie masz jeszcze udostępnionych zrzutów ani klipów.') }));
        return;
      }
      const day = (at: number) => new Date(at).toLocaleDateString(locale(), { dateStyle: 'medium' });
      list.replaceChildren(...items.map((m) => {
        const open = el('button', { type: 'button', className: 'icon-btn', title: t('Otwórz w przeglądarce') }, icon('fa-arrow-up-right-from-square'));
        // links open in the system browser (setWindowOpenHandler)
        open.addEventListener('click', () => window.open(m.url, '_blank'));
        const copy = el('button', { type: 'button', className: 'icon-btn', title: t('Kopiuj link') }, el('i', { className: 'fa-regular fa-copy' }));
        copy.addEventListener('click', async () => {
          await navigator.clipboard.writeText(m.url);
          toast(t('Skopiowano link.'));
        });
        const remove = el('button', { type: 'button', className: 'icon-btn danger', title: t('Usuń link') }, el('i', { className: 'fa-regular fa-trash-can' }));
        remove.addEventListener('click', async () => {
          if (!confirm(t('Usunąć ten link? Nikt już go nie otworzy.'))) return;
          await guard(() => api.deleteSharedMedia(m.id));
          void render();
        });
        return el('div', { className: 'project' },
          el('div', { className: 'clip-icon' }, icon(m.kind === 'clip' ? 'fa-film' : 'fa-image')),
          el('div', { className: 'project-main' },
            el('b', { textContent: m.title || (m.kind === 'clip' ? t('Klip') : t('Zrzut ekranu')) }),
            el('div', { className: 'project-meta' },
              el('span', { textContent: fmtSize(m.size) }),
              el('span', { textContent: t('Wyświetlenia: {0}', m.views) }),
              el('span', { textContent: t('Wygasa {0}', day(m.expiresAt)) }))),
          el('div', { className: 'project-actions' }, open, copy, remove));
      }));
    };
    void render();
  }

  return { openTrim, shareFile, openMine };
}
