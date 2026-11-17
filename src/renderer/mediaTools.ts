import { locale, t } from '../shared/i18n';
import { ask, confirmDialog, control, el, fmtSize, icon } from './dialog';
import { webmPlan, type WebmQuality } from '../shared/webm';

/**
 * The gallery's extras: trimming a clip (a window with the clip, two handles for the start and
 * the end and a preview of the chosen part) and sharing a screenshot or clip by link on the
 * SlashClient website, with a list of one's links. The cutting and the upload live in the main
 * process (src/main/clipTrim.ts, mediaShare.ts); this is only the page.
 */

interface GalleryFile { file: string; name: string; createdAt: number; sizeBytes: number }
interface ClipInfo { frames: number; fps: number; width: number; height: number; durationMs: number; trimmable: boolean; kind?: 'avi' | 'webm' }
/** A clip being made into a WebM (main/clipConvert.ts). */
export interface ConvertState { file: string; state: 'queued' | 'working' | 'done' | 'failed'; progress: number; result?: string; error?: string; part: boolean }
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
/** A WebM clip for the launcher's own <video>. */
export const videoUrl = (file: string) => `slash-media://file/?path=${encodeURIComponent(file)}`;
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
    const isWebm = info.kind === 'webm';
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
    // a WebM is shown by the browser's own player: seeking and playing are its
    const video = el('video', { className: 'trim-canvas', muted: true, preload: 'auto' });
    if (isWebm) video.src = videoUrl(clip.file);
    const screen = isWebm ? video : canvas;
    const progress = el('div', { className: 'progress webm-progress hidden' }, el('div'));
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
    const saveWebm = el('button', { type: 'button', className: 'icon-btn', title: t('Zapisz wybrany fragment jako WebM: plik, który Discord odtwarza od razu w czacie') }, el('i', { className: 'fa-brands fa-discord' }));
    saveWebm.setAttribute('aria-label', t('Zapisz jako WebM'));

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
      if (isWebm) {
        if (!playing) video.currentTime = (frame + 0.5) / info!.fps;
        return;
      }
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
      if (isWebm && !on) video.pause();
      if (!on) return;
      if (loop && (at < start || at >= end)) at = start;
      if (!loop && at >= total - 1) at = 0;
      if (isWebm) {
        video.currentTime = (at + 0.5) / info!.fps;
        void video.play().catch(() => {});
      }
      started = performance.now();
      startAt = at;
      raf = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      if (!playing) return;
      if (isWebm) {
        const frame = Math.min(total - 1, Math.floor(video.currentTime * info!.fps));
        const stop = loop ? end : total - 1;
        if (frame >= stop || video.ended) {
          if (!loop) {
            setPlaying(false);
            seek(stop);
            return;
          }
          video.currentTime = (start + 0.5) / info!.fps;
          at = start;
        } else if (frame !== at) {
          at = frame;
          paint();
        }
        raf = requestAnimationFrame(tick);
        return;
      }
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
    screen.addEventListener('click', () => setPlaying(!playing, false));
    previewBtn.addEventListener('click', () => setPlaying(!loop, true));
    setStart.addEventListener('click', () => move('start', at));
    setEnd.addEventListener('click', () => move('end', at));

    const view = modal('trim-box', t('Przytnij klip'), [
      el('p', { className: 'muted', textContent: isWebm
        ? t('Przeciągnij uchwyty, żeby wybrać fragment. Przycięta kopia WebM zapisze się obok oryginału (oryginał zostaje).')
        : t('Przeciągnij uchwyty, żeby wybrać fragment. Przycięta kopia zapisze się obok oryginału, bez utraty jakości (oryginał zostaje).') }),
      el('div', { className: 'trim-stage' }, screen),
      el('div', { className: 'trim-controls' }, playBtn, track, timeLabel),
      el('div', { className: 'trim-facts row' }, startLabel, endLabel, lengthLabel),
      el('div', { className: 'row trim-actions' }, setStart, setEnd, previewBtn, el('span', { className: 'push' }), ...(isWebm ? [] : [saveWebm]), saveShare, save),
      progress,
    ], () => {
      playing = false;
      cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (cutting) void api.cancelClipConvert(profileId, clip.name);
    });
    let cutting = false;
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
      let stopWatching = () => {};
      try {
        let name: string;
        if (full) name = clip.name;
        else if (isWebm) {
          // a WebM part is encoded again (the cut lands on any frame), with a bar meanwhile
          cutting = true;
          progress.classList.remove('hidden');
          stopWatching = watchConvert(clip.file, (p) => ((progress.firstElementChild as HTMLElement).style.width = `${Math.round(p * 100)}%`));
          name = await api.convertClip(profileId, clip.name, { from: start, to: end });
        } else name = await api.trimClip(profileId, clip.name, start, end);
        if (!full) toast(t('Zapisano przyciętą kopię: {0}', name));
        view.close();
        d.refresh();
        if (share) await shareFile(profileId, 'clips', name);
      } catch (err) {
        if (view.box.isConnected || !cutting) toast(errorOf(err), true);
      } finally {
        cutting = false;
        stopWatching();
        progress.classList.add('hidden');
        for (const b of [save, saveShare]) b.disabled = false;
      }
    }
    save.addEventListener('click', () => saveCopy(false));
    saveWebm.addEventListener('click', () => {
      setPlaying(false);
      const full = start === 0 && end === total - 1;
      void convertClip(profileId, clip, info, full ? undefined : [start, end], () => view.close());
    });
    saveShare.addEventListener('click', () => saveCopy(true));
    seek(0);
  }

  // ---------- WebM for Discord ----------

  /** Follows one clip's conversion; returns the function that stops following. */
  function watchConvert(file: string, onProgress: (p: number) => void): () => void {
    return api.on('clips:convert', (st: ConvertState) => st.file === file && st.state === 'working' && onProgress(st.progress));
  }

  /**
   * Makes a WebM of an older AVI clip (whole: the AVI then goes to the system's trash) or of a
   * part of it, in the background converter: Discord plays WebM in the chat, AVI it does not.
   */
  async function convertClip(profileId: string, clip: GalleryFile, known?: ClipInfo, range?: [number, number], onSaved?: () => void) {
    const info: ClipInfo | undefined = known ?? await guard(() => api.clipInfo(profileId, clip.name));
    if (!info) return;
    if (!info.trimmable || info.frames < 2 || info.kind !== 'avi') {
      toast(t('Tego klipu nie da się zapisać jako WebM (to nie jest klip zapisany w grze).'), true);
      return;
    }
    const [from, to] = range ?? [0, info.frames - 1];
    const durationMs = ((to - from + 1) * 1000) / info.fps;
    const settings = ((await api.getStore().catch(() => undefined)) as { settings?: { clipsWebmQuality?: WebmQuality } } | undefined)?.settings;
    const quality = control<HTMLSelectElement>('select', { className: 'grow' });
    quality.append(
      el('option', { value: 'discord', textContent: t('Discord: do 10 MB') }),
      el('option', { value: 'high', textContent: t('Wysoka jakość (większy plik)') }));
    quality.value = settings?.clipsWebmQuality === 'high' ? 'high' : 'discord';
    const facts = el('p', { className: 'muted webm-facts' });
    const describe = () => {
      const plan = webmPlan(info.width, info.height, durationMs, quality.value as WebmQuality);
      facts.textContent = `${clipTime(durationMs / 1000)} · ${plan.width}×${plan.height} · ${
        plan.maxBytes ? t('najwyżej {0}', fmtSize(plan.maxBytes)) : t('około {0}', fmtSize((plan.bitrate / 8) * (durationMs / 1000)))}`;
    };
    // the choice is the launcher's setting: new clips are made at this size too
    quality.addEventListener('change', () => {
      describe();
      void api.saveSettings({ clipsWebmQuality: quality.value }).catch(() => {});
    });
    describe();
    const bar = el('div');
    const progress = el('div', { className: 'progress webm-progress hidden' }, bar);
    const status = el('span', { className: 'muted webm-status' });
    const start = el('button', { type: 'button', className: 'primary' }, icon('fa-file-video'), ' ', t('Zapisz WebM'));
    const cancel = el('button', { type: 'button' }, t('Anuluj'));
    let working = false;
    const whole = !range;
    const view = modal('join-box webm-box', t('Zapisz jako WebM'), [
      el('p', { className: 'muted', textContent: whole
        ? t('Discord odtwarza pliki WebM od razu w czacie (klipów AVI nie). Plik WebM zapisze się obok, a klip AVI, gdy WebM jest gotowy i sprawdzony, trafi do kosza systemu (da się go stamtąd przywrócić).')
        : t('Discord odtwarza pliki WebM od razu w czacie (klipów AVI nie). Wybrany fragment zapisze się obok klipu jako WebM, a oryginał zostaje.') }),
      el('label', { className: 'row webm-quality' }, el('span', { textContent: t('Rozmiar') }), quality),
      facts,
      progress,
      el('div', { className: 'row join-actions' }, status, el('span', { className: 'push' }), cancel, start),
    ], () => working && void api.cancelClipConvert(profileId, clip.name));
    cancel.addEventListener('click', () => (working ? void api.cancelClipConvert(profileId, clip.name) : view.close()));
    start.addEventListener('click', async () => {
      working = true;
      start.disabled = true;
      quality.disabled = true;
      progress.classList.remove('hidden');
      bar.style.width = '0%';
      status.textContent = t('Koduję…');
      const began = performance.now();
      const stop = watchConvert(clip.file, (p) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        status.textContent = t('Koduję… {0}%', Math.round(p * 100));
      });
      try {
        const name: string = await api.convertClip(profileId, clip.name, whole ? { replace: true } : { from, to });
        working = false;
        view.close();
        onSaved?.();
        d.refresh();
        toast(t('Zapisano {0} (w {1} s). Przeciągnij go z listy klipów do Discorda.', name, ((performance.now() - began) / 1000).toFixed(1)));
      } catch (err) {
        working = false;
        if (!view.box.isConnected) return;
        start.disabled = false;
        quality.disabled = false;
        progress.classList.add('hidden');
        const message = errorOf(err);
        status.textContent = message === t('Przerwano.') ? message : '';
        if (message !== t('Przerwano.')) toast(message, true);
      } finally {
        stop();
      }
    });
  }

  /** A WebM clip in the launcher's own player (the system may have none for WebM, e.g. macOS). */
  function openPlayer(clip: GalleryFile) {
    const video = el('video', { className: 'clip-player', controls: true, autoplay: true, loop: true });
    video.src = videoUrl(clip.file);
    modal('trim-box clip-player-box', clip.name.replace(/\.webm$/i, ''), [el('div', { className: 'trim-stage' }, video)], () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }

  /** The first frame of a WebM clip as a JPEG: the server shows it as the link's preview picture. */
  async function posterOf(file: string): Promise<Uint8Array | undefined> {
    const video = el('video', { muted: true, preload: 'auto' });
    try {
      video.src = videoUrl(file);
      await new Promise<void>((ok, fail) => {
        video.onloadeddata = () => ok();
        video.onerror = () => fail(new Error('no video'));
        setTimeout(() => fail(new Error('timeout')), 10_000);
      });
      const k = Math.min(1, 1280 / video.videoWidth);
      const canvas = el('canvas', { width: Math.round(video.videoWidth * k), height: Math.round(video.videoHeight * k) });
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
    } catch {
      return undefined;
    } finally {
      video.removeAttribute('src');
      video.load();
    }
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
      const file = folder === 'clips' && /\.webm$/i.test(name) ? (await api.listClips(profileId) as GalleryFile[]).find((c) => c.name === name)?.file : undefined;
      const poster = file ? await posterOf(file) : undefined;
      const media: SharedMedia = await api.shareMedia(profileId, folder, name, title.value.trim() || undefined, poster);
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
          if (!(await ask(t('Usunąć ten link? Nikt już go nie otworzy.'), t('Usuń'), { danger: true, okIcon: 'fa-trash-can' }))) return;
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

  return { openTrim, convertClip, openPlayer, watchConvert, shareFile, openMine };
}
