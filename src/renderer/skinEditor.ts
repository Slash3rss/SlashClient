import { IdleAnimation, SkinViewer } from 'skinview3d';
import { t } from '../shared/i18n';
import { floodRegion, regionAt, skinRegions, upgradeLegacySkin, type SkinRegion } from '../shared/skinLayout';

/**
 * Pixel editor for 64×64 skins: the unfolded texture on the left (each texture pixel
 * drawn as a SCALE×SCALE square), a live 3D model on the right.
 */

const SCALE = 8;
const SIZE = 64 * SCALE;
const MAX_UNDO = 60;
const DEFAULT_COLORS = ['#000000', '#3f3f3f', '#7f7f7f', '#ffffff', '#f5c6a5', '#c58c66', '#8d5524', '#4a2f1b', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60'];

type Tool = 'pen' | 'eraser' | 'fill' | 'picker';
type Layer = 'both' | 'inner' | 'outer';

export interface SkinEditorOptions {
  dataUrl: string;
  slim: boolean;
  name: string;
  /** Only Microsoft accounts can wear the result; offline ones can still save it to the library. */
  canUse: boolean;
  onUse: (dataUrl: string, slim: boolean) => Promise<void>;
  onSave: (dataUrl: string, name: string, slim: boolean) => Promise<void>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const input = (props: { type: string; value?: string; title?: string; checked?: boolean; placeholder?: string; maxLength?: number }): HTMLInputElement => Object.assign(document.createElement('input'), props);
const icon = (name: string) => el('i', { className: `fa-solid ${name}` });

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('Nie udało się wczytać skina.')));
    img.src = src;
  });
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgb = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

let recent: string[] = [];
try {
  recent = JSON.parse(localStorage.getItem('skinEditor.recent') ?? '[]');
} catch {
  recent = [];
}

export async function openSkinEditor(opts: SkinEditorOptions): Promise<void> {
  // the texture itself, always 64×64
  const skin = el('canvas', { width: 64, height: 64 });
  const sctx = skin.getContext('2d', { willReadFrequently: true })!;
  const img = await loadImage(opts.dataUrl);
  sctx.drawImage(img, 0, 0);
  if (img.height === 32) sctx.putImageData(new ImageData(upgradeLegacySkin(sctx.getImageData(0, 0, 64, 32).data), 64, 64), 0, 0);

  let slim = opts.slim;
  let regions = skinRegions(slim);
  let tool: Tool = 'pen';
  let layer: Layer = 'both';
  let color = '#e53935';
  let grid = true;
  let hover: { x: number; y: number } | undefined;
  const undo: ImageData[] = [];
  const redo: ImageData[] = [];

  // ---- layout ----
  const view = el('canvas', { className: 'se-canvas', width: SIZE, height: SIZE });
  const vctx = view.getContext('2d')!;
  const where = el('div', { className: 'se-where muted', textContent: ' ' });
  const previewCanvas = el('canvas', { width: 220, height: 300 });
  const tools: [Tool, string, string, string][] = [
    ['pen', 'fa-pencil', t('Ołówek'), 'B'],
    ['eraser', 'fa-eraser', t('Gumka'), 'E'],
    ['fill', 'fa-fill-drip', t('Wypełnianie'), 'G'],
    ['picker', 'fa-eye-dropper', t('Pipeta'), 'I'],
  ];
  const toolButtons = tools.map(([id, ic, label, key]) => {
    const b = el('button', { type: 'button', className: 'icon-btn', title: `${label} (${key})` }, icon(ic));
    b.dataset.tool = id;
    b.addEventListener('click', () => setTool(id));
    return b;
  });
  const colorInput = input({ type: 'color', value: color, title: t('Kolor') });
  colorInput.addEventListener('input', () => setColor(colorInput.value, false));
  colorInput.addEventListener('change', () => setColor(colorInput.value));
  const swatches = el('div', { className: 'se-swatches' });
  const undoBtn = el('button', { type: 'button', className: 'icon-btn', title: t('Cofnij (Ctrl+Z)') }, icon('fa-rotate-left'));
  const redoBtn = el('button', { type: 'button', className: 'icon-btn', title: t('Ponów (Ctrl+Y)') }, icon('fa-rotate-right'));
  undoBtn.addEventListener('click', () => history(undo, redo));
  redoBtn.addEventListener('click', () => history(redo, undo));
  const layerSeg = el('div', { className: 'segmented' });
  for (const [id, label] of [['both', t('Obie warstwy')], ['inner', t('Wewnętrzna')], ['outer', t('Zewnętrzna')]] as const) {
    const b = el('button', { type: 'button', textContent: label });
    b.dataset.layer = id;
    b.addEventListener('click', () => {
      layer = id;
      layerSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      draw();
      refreshPreview();
    });
    layerSeg.append(b);
  }
  layerSeg.firstElementChild!.classList.add('active');
  const modelSeg = el('div', { className: 'segmented' });
  for (const [id, label] of [[false, t('Steve (klasyczny)')], [true, t('Alex (smukły)')]] as const) {
    const b = el('button', { type: 'button', textContent: label, className: id === slim ? 'active' : '' });
    b.addEventListener('click', () => {
      slim = id;
      regions = skinRegions(slim);
      modelSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      draw();
      refreshPreview(true);
    });
    modelSeg.append(b);
  }
  const gridBox = input({ type: 'checkbox', checked: grid });
  gridBox.addEventListener('change', () => {
    grid = gridBox.checked;
    draw();
  });
  const nameInput = input({ type: 'text', value: opts.name, placeholder: t('Nazwa skina'), maxLength: 40 });
  const download = el('button', { type: 'button' }, icon('fa-download'), t(' Pobierz PNG'));
  const save = el('button', { type: 'button' }, icon('fa-bookmark'), t(' Zapisz w bibliotece'));
  const use = el('button', { type: 'button', className: 'primary' }, icon('fa-check'), t(' Ustaw na koncie'));
  use.classList.toggle('hidden', !opts.canUse);
  const close = el('button', { type: 'button', className: 'icon-btn modal-close', title: t('Zamknij') }, icon('fa-xmark'));

  const modal = el('div', { className: 'modal' },
    el('div', { className: 'modal-box glass-panel se-box' }, close,
      el('div', { className: 'modal-body' },
        el('h2', { textContent: t('Edytor skina') }),
        el('div', { className: 'se-main' },
          el('div', { className: 'se-tools' }, ...toolButtons, el('span', { className: 'se-sep' }), undoBtn, redoBtn, el('span', { className: 'se-sep' }), colorInput),
          el('div', { className: 'se-paint' }, view, where),
          el('div', { className: 'se-side' },
            el('div', { className: 'se-preview' }, previewCanvas),
            modelSeg,
            layerSeg,
            el('label', { className: 'check' }, gridBox, t(' Siatka')),
            el('div', { className: 'field' }, t('Ostatnie kolory'), swatches),
            el('p', { className: 'muted se-help', textContent: t('Prawy przycisk myszy zmazuje, Alt + klik pobiera kolor.') }))),
        el('div', { className: 'row se-actions' }, nameInput, download, save, use))));
  document.body.append(modal);

  // ---- 3D preview, redrawn at most once a frame ----
  const viewer = new SkinViewer({ canvas: previewCanvas, width: 220, height: 300 });
  viewer.controls.enableZoom = false;
  viewer.animation = new IdleAnimation();
  let previewQueued = false;
  function refreshPreview(modelChanged = false) {
    if (previewQueued && !modelChanged) return;
    previewQueued = true;
    requestAnimationFrame(async () => {
      previewQueued = false;
      await viewer.loadSkin(skin, { model: slim ? 'slim' : 'default' });
      viewer.playerObject.skin.setInnerLayerVisible(layer !== 'outer');
      viewer.playerObject.skin.setOuterLayerVisible(layer !== 'inner');
    });
  }

  // ---- drawing the enlarged texture ----
  const editable = (r: SkinRegion | undefined) => !!r && (layer === 'both' || (layer === 'outer') === r.outer);
  const pattern = (() => {
    const c = el('canvas', { width: SCALE * 2, height: SCALE * 2 });
    const x = c.getContext('2d')!;
    x.fillStyle = '#2a2f3a';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#353b48';
    x.fillRect(0, 0, SCALE, SCALE);
    x.fillRect(SCALE, SCALE, SCALE, SCALE);
    return vctx.createPattern(c, 'repeat')!;
  })();

  function draw() {
    vctx.imageSmoothingEnabled = false;
    vctx.fillStyle = '#0d1018';
    vctx.fillRect(0, 0, SIZE, SIZE);
    for (const r of regions) {
      vctx.fillStyle = pattern;
      vctx.fillRect(r.x * SCALE, r.y * SCALE, r.w * SCALE, r.h * SCALE);
    }
    vctx.drawImage(skin, 0, 0, SIZE, SIZE);
    // pixels that cannot be edited right now are dimmed
    vctx.fillStyle = 'rgba(8, 10, 16, .72)';
    for (const r of regions) if (!editable(r)) vctx.fillRect(r.x * SCALE, r.y * SCALE, r.w * SCALE, r.h * SCALE);
    if (grid) {
      vctx.strokeStyle = 'rgba(255, 255, 255, .07)';
      vctx.lineWidth = 1;
      vctx.beginPath();
      for (let i = 1; i < 64; i++) {
        vctx.moveTo(i * SCALE + 0.5, 0);
        vctx.lineTo(i * SCALE + 0.5, SIZE);
        vctx.moveTo(0, i * SCALE + 0.5);
        vctx.lineTo(SIZE, i * SCALE + 0.5);
      }
      vctx.stroke();
    }
    vctx.strokeStyle = 'rgba(96, 165, 250, .35)';
    for (const r of regions) vctx.strokeRect(r.x * SCALE + 0.5, r.y * SCALE + 0.5, r.w * SCALE - 1, r.h * SCALE - 1);
    if (hover) {
      vctx.strokeStyle = '#fff';
      vctx.lineWidth = 2;
      vctx.strokeRect(hover.x * SCALE + 1, hover.y * SCALE + 1, SCALE - 2, SCALE - 2);
    }
  }

  // ---- editing ----
  function snapshot() {
    undo.push(sctx.getImageData(0, 0, 64, 64));
    if (undo.length > MAX_UNDO) undo.shift();
    redo.length = 0;
    updateHistoryButtons();
  }
  function history(from: ImageData[], to: ImageData[]) {
    const state = from.pop();
    if (!state) return;
    to.push(sctx.getImageData(0, 0, 64, 64));
    sctx.putImageData(state, 0, 0);
    updateHistoryButtons();
    draw();
    refreshPreview();
  }
  function updateHistoryButtons() {
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
  }

  function paint(x: number, y: number, erase: boolean) {
    if (!editable(regionAt(regions, x, y))) return;
    if (erase) sctx.clearRect(x, y, 1, 1);
    else {
      sctx.fillStyle = color;
      sctx.clearRect(x, y, 1, 1);
      sctx.fillRect(x, y, 1, 1);
    }
  }
  function fill(x: number, y: number) {
    const region = regionAt(regions, x, y);
    if (!region || !editable(region)) return;
    const data = sctx.getImageData(0, 0, 64, 64);
    const [r, g, b] = rgb(color);
    for (const i of floodRegion(data.data, region, x, y)) data.data.set([r, g, b, 255], i);
    sctx.putImageData(data, 0, 0);
  }
  function pick(x: number, y: number) {
    const [r, g, b, a] = sctx.getImageData(x, y, 1, 1).data;
    if (a) setColor(hex(r, g, b));
  }

  function setTool(next: Tool) {
    tool = next;
    toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
    view.dataset.tool = next;
  }
  function setColor(next: string, remember = true) {
    color = next;
    colorInput.value = next;
    if (remember) {
      recent = [next, ...recent.filter((c) => c !== next)].slice(0, 8);
      try {
        localStorage.setItem('skinEditor.recent', JSON.stringify(recent));
      } catch {
        // the palette is only a convenience
      }
      renderSwatches();
    }
  }
  function renderSwatches() {
    const colors = [...recent, ...DEFAULT_COLORS.filter((c) => !recent.includes(c))].slice(0, 16);
    swatches.replaceChildren(...colors.map((c) => {
      const b = el('button', { type: 'button', className: 'se-swatch', title: c });
      b.style.background = c;
      b.addEventListener('click', () => {
        setColor(c);
        if (tool === 'eraser' || tool === 'picker') setTool('pen');
      });
      return b;
    }));
  }

  const cell = (e: PointerEvent) => {
    const box = view.getBoundingClientRect();
    return {
      x: Math.min(63, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * 64))),
      y: Math.min(63, Math.max(0, Math.floor(((e.clientY - box.top) / box.height) * 64))),
    };
  };
  let stroke: { last: { x: number; y: number }; erase: boolean } | undefined;
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('pointerdown', (e) => {
    const p = cell(e);
    if (tool === 'picker' || e.altKey) return pick(p.x, p.y);
    snapshot();
    if (tool === 'fill' && e.button === 0) fill(p.x, p.y);
    else {
      const erase = tool === 'eraser' || e.button === 2;
      paint(p.x, p.y, erase);
      stroke = { last: p, erase };
      view.setPointerCapture(e.pointerId);
    }
    draw();
    refreshPreview();
  });
  view.addEventListener('pointermove', (e) => {
    const p = cell(e);
    if (!hover || hover.x !== p.x || hover.y !== p.y) {
      hover = p;
      const r = regionAt(regions, p.x, p.y);
      where.textContent = r ? `${t(r.part)} · ${t(FACE_NAMES[r.face])}${r.outer ? ` · ${t('warstwa zewnętrzna')}` : ''} (${p.x}, ${p.y})` : `(${p.x}, ${p.y})`;
      if (!stroke) draw();
    }
    if (!stroke) return;
    // fast moves skip cells, so connect the two points with a line
    const { last, erase } = stroke;
    const steps = Math.max(Math.abs(p.x - last.x), Math.abs(p.y - last.y));
    for (let i = 1; i <= steps; i++) paint(Math.round(last.x + ((p.x - last.x) * i) / steps), Math.round(last.y + ((p.y - last.y) * i) / steps), erase);
    stroke.last = p;
    draw();
    refreshPreview();
  });
  const endStroke = () => (stroke = undefined);
  view.addEventListener('pointerup', endStroke);
  view.addEventListener('pointercancel', endStroke);
  view.addEventListener('pointerleave', () => {
    hover = undefined;
    if (!stroke) draw();
  });

  // ---- keyboard ----
  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') history(...(e.shiftKey ? [redo, undo] : [undo, redo]) as [ImageData[], ImageData[]]);
    else if ((e.ctrlKey || e.metaKey) && key === 'y') history(redo, undo);
    else if (e.key === 'Escape') finish();
    else {
      const hit = tools.find(([, , , k]) => k.toLowerCase() === key);
      if (!hit) return;
      setTool(hit[0]);
    }
    e.preventDefault();
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);

  // ---- leaving ----
  const changed = () => undo.length > 0;
  function finish(force = false) {
    if (!force && changed() && !confirm(t('Zamknąć edytor? Niezapisane zmiany przepadną.'))) return;
    document.removeEventListener('keydown', onKey, true);
    viewer.dispose();
    modal.remove();
  }
  close.addEventListener('click', () => finish());
  modal.addEventListener('click', (e) => e.target === modal && finish());
  download.addEventListener('click', () => {
    const a = el('a', { href: skin.toDataURL('image/png'), download: `${nameInput.value.trim() || 'skin'}.png` });
    a.click();
  });
  async function run(button: HTMLButtonElement, work: () => Promise<void>) {
    button.disabled = true;
    try {
      await work();
      finish(true);
    } catch {
      // the caller already told the player what went wrong
    } finally {
      button.disabled = false;
    }
  }
  save.addEventListener('click', () => run(save, () => opts.onSave(skin.toDataURL('image/png'), nameInput.value.trim() || opts.name, slim)));
  use.addEventListener('click', () => run(use, () => opts.onUse(skin.toDataURL('image/png'), slim)));

  setTool('pen');
  renderSwatches();
  updateHistoryButtons();
  draw();
  refreshPreview(true);
}

const FACE_NAMES = { top: 'góra', bottom: 'spód', right: 'prawy bok', front: 'przód', left: 'lewy bok', back: 'tył' } as const;
