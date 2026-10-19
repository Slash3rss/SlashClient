// A shared screenshot or clip (/media/<id>). A picture is shown as it is; a clip is the game's
// Motion-JPEG AVI, which browsers cannot play in <video>, so its frames (each a whole JPEG) are
// read out of the file here and drawn one after another on a canvas.
import { $, api, el, errorText, fmtDate, icon, toast, token } from './common.js';

const id = location.pathname.split('/')[2] ?? '';

/** The video frames of an AVI, in file order: [offset, length] of each JPEG, and the frame time. */
export function aviFrames(buf) {
  const view = new DataView(buf);
  const tag = (at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (buf.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'AVI ') return undefined;
  const frames = [];
  let usPerFrame = 0;
  const walk = (start, end, inMovi) => {
    let at = start;
    while (at + 8 <= end) {
      const id = tag(at);
      const size = view.getUint32(at + 4, true);
      const data = at + 8;
      const cut = data + size > end;
      if (id === 'LIST') {
        const type = tag(data);
        if (type === 'hdrl' || type === 'strl' || type === 'movi' || type === 'rec ') walk(data + 4, Math.min(data + size, end), inMovi || type === 'movi');
      } else if (cut) return;
      else if (id === 'avih') usPerFrame = view.getUint32(data, true);
      else if (inMovi && (id === '00dc' || id === '00db') && size > 0) frames.push([data, size]);
      at = data + size + (size & 1);
    }
  };
  walk(12, Math.min(buf.byteLength, 8 + view.getUint32(4, true)), false);
  return { frames, usPerFrame: usPerFrame > 0 && usPerFrame < 10_000_000 ? usPerFrame : 33_333 };
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A canvas player for an MJPEG clip: play/pause, a seek bar and the time. */
async function clipPlayer(m, box) {
  const canvas = el('canvas', { class: 'media-canvas', width: m.width, height: m.height });
  const play = el('button', { type: 'button', class: 'icon-btn', title: 'Odtwórz / pauza' }, icon('fa-solid fa-play'));
  const seek = el('input', { type: 'range', min: '0', max: String(Math.max(0, m.frames - 1)), value: '0', class: 'grow' });
  const time = el('span', { class: 'muted small media-time', textContent: `0:00 / ${clock(m.durationMs / 1000)}` });
  const status = el('div', { class: 'media-loading muted' }, icon('fa-solid fa-circle-notch fa-spin'), ' Wczytuję klip…');
  box.replaceChildren(el('div', { class: 'media-stage' }, canvas, status), el('div', { class: 'media-controls row' }, play, seek, time));

  const res = await fetch(`/v1/media/${encodeURIComponent(id)}/file`);
  if (!res.ok) throw new Error('Nie udało się wczytać klipu.');
  const buf = await res.arrayBuffer();
  const avi = aviFrames(buf);
  if (!avi?.frames.length) throw new Error('Ten klip jest uszkodzony.');
  status.remove();
  const ctx = canvas.getContext('2d');
  const frameMs = avi.usPerFrame / 1000;
  const total = avi.frames.length;
  seek.max = String(total - 1);
  let index = 0;
  let playing = false;
  let started = 0;
  let startIndex = 0;
  let drawing = 0;

  // decoding is async: only the newest asked frame is drawn
  async function draw(i) {
    const ticket = ++drawing;
    const [at, len] = avi.frames[i];
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(buf, at, len)], { type: 'image/jpeg' })).catch(() => undefined);
    if (!bitmap) return;
    if (ticket === drawing) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  }
  function show(i) {
    index = Math.max(0, Math.min(total - 1, i));
    seek.value = String(index);
    time.textContent = `${clock((index * frameMs) / 1000)} / ${clock((total * frameMs) / 1000)}`;
    void draw(index);
  }
  function setPlaying(on) {
    playing = on;
    play.firstElementChild.className = `fa-solid ${on ? 'fa-pause' : 'fa-play'}`;
    if (on) {
      if (index >= total - 1) index = 0;
      started = performance.now();
      startIndex = index;
      requestAnimationFrame(tick);
    }
  }
  function tick(now) {
    if (!playing) return;
    const i = startIndex + Math.floor((now - started) / frameMs);
    if (i >= total) {
      show(total - 1);
      setPlaying(false);
      return;
    }
    if (i !== index) show(i);
    requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => setPlaying(!playing));
  canvas.addEventListener('click', () => setPlaying(!playing));
  seek.addEventListener('input', () => {
    show(Number(seek.value));
    if (playing) setPlaying(true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    if (e.key === ' ') {
      e.preventDefault();
      setPlaying(!playing);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setPlaying(false);
      show(index + (e.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  show(0);
  setPlaying(true);
}

async function load() {
  try {
    const { media: m, mine } = await api('GET', `/v1/media/${encodeURIComponent(id)}`);
    const clip = m.kind === 'clip';
    $('#media-kind').textContent = clip ? 'Klip' : 'Zrzut ekranu';
    $('#media-title').textContent = m.title || (clip ? 'Klip z gry' : 'Zrzut ekranu z gry');
    $('#media-meta').textContent = [
      m.ownerHandle ? `od @${m.ownerHandle}` : '',
      `${m.width}×${m.height}`,
      clip ? clock(m.durationMs / 1000) : '',
      `${(m.size / 1024 / 1024).toFixed(1)} MB`,
      `wysłany ${fmtDate(m.createdAt)}`,
      `zniknie ${fmtDate(m.expiresAt)}`,
    ].filter(Boolean).join(' · ');
    $('#media-download').href = `/v1/media/${encodeURIComponent(id)}/file?download`;
    $('#media-tools').classList.remove('hidden');
    $('#media-delete').classList.toggle('hidden', !mine);
    const box = $('#media-view');
    box.classList.remove('hidden');
    if (clip) await clipPlayer(m, box);
    else box.replaceChildren(el('a', { href: `/v1/media/${encodeURIComponent(id)}/file`, target: '_blank', rel: 'noopener' },
      el('img', { class: 'media-image', src: `/v1/media/${encodeURIComponent(id)}/file`, alt: m.title || 'Zrzut ekranu', width: m.width, height: m.height })));
  } catch (err) {
    $('#media-title').textContent = 'Nie znaleziono';
    $('#media-meta').textContent = err.code === 'not_found'
      ? 'Tego zrzutu ani klipu nie ma: link jest zły, właściciel go usunął albo już wygasł.'
      : errorText(err);
    $('#media-tools').classList.add('hidden');
    $('#media-view').classList.add('hidden');
  }
}

$('#media-copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href.split('#')[0]).catch(() => {});
  toast('Skopiowano link');
});
$('#media-delete').addEventListener('click', async () => {
  if (!confirm('Usunąć ten link? Nikt już go nie otworzy.')) return;
  try {
    await api('DELETE', `/v1/media/${encodeURIComponent(id)}`);
    toast('Usunięto');
    setTimeout(() => location.assign('/'), 800);
  } catch (err) {
    toast(errorText(err), true);
  }
});
load();
// the header shows who is signed in, like on the other pages
if (token.get()) {
  api('GET', '/v1/me').then((me) => {
    $('#nav-account .label').textContent = me.name;
    $('#nav-admin').classList.toggle('hidden', !me.admin);
  }).catch(() => {});
}
