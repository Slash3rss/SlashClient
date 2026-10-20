import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, NearestFilter, type Object3D, PlaneGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Texture } from 'three';

/**
 * Rings and movement effects in the skin preview (the launcher's and the website's). The ring is our own
 * picture (textures/ring, scripts/make-rings.mjs) laid flat under the feet, slowly turning and breathing,
 * as the mod draws it (RingEffects.java). A movement effect plays as a short loop: the figure hops for a
 * jump or a landing, footprints, sparks and petals are left behind as if it ran, a streak flies off, bubbles
 * rise; little pixel pictures of our own stand in for the game's particles (MoveEffects.java plays the real
 * ones). Units are the model's pixels: feet at y -16, the face towards +z.
 */

/** In the order of the menus (the same as the server's catalog and the mod's lists). */
export const RING_IDS = ['ring_runes', 'ring_flame', 'ring_frost', 'ring_rainbow', 'ring_mushroom', 'ring_galaxy', 'ring_halo', 'ring_toxic',
  // sold in the shop for sparks
  'ring_sparks', 'ring_ocean'] as const;
/** The animated rings and how many frames each has (<id>_<n>.png); the others are <id>.png. */
export const RING_FRAMES: Record<string, number> = { ring_runes: 8, ring_flame: 8, ring_rainbow: 8, ring_galaxy: 8, ring_toxic: 8 };
export const MOVE_IDS = ['move_steps', 'move_jump', 'move_landing', 'move_arrows', 'move_sprint', 'move_bubbles', 'move_petals'] as const;
/** The movement effects' icons (Font Awesome) and their colours, for the menus. */
export const MOVE_ICONS: Record<string, [string, string]> = {
  move_steps: ['fa-shoe-prints', '#9fe4ff'], move_jump: ['fa-cloud', '#f4f4f4'], move_landing: ['fa-burst', '#fff1a0'],
  move_arrows: ['fa-location-arrow', '#ffd84a'], move_sprint: ['fa-bolt', '#fff6b0'], move_bubbles: ['fa-circle-dot', '#7fd4ff'],
  move_petals: ['fa-spa', '#ffb7d5'],
};

/** The ring's picture (its first frame): where it is under `base` (img/rings/ or /vendor/rings/). */
export function ringSrc(base: string, id: string, frame = 0): string {
  return RING_FRAMES[id] ? `${base}${id}_${frame % RING_FRAMES[id]}.png` : `${base}${id}.png`;
}

/** The ring's icon for a grid: the left half of its picture (the right one is see-through). */
export function ringThumbnail(base: string, id: string, className = 'ring-icon'): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  d.style.backgroundImage = `url(${ringSrc(base, id)})`;
  d.style.backgroundSize = '200% 100%';
  d.style.backgroundPosition = '0 0';
  d.style.imageRendering = 'pixelated';
  return d;
}

/** The ring's width in the model's pixels (1.5 blocks, as RingEffects.SIZE). */
const RING_SIZE = 24;
const FRAME_MS = 140;

export class RingPreview {
  private mesh?: Mesh;
  private id = '';
  private textures = new Map<string, Texture>();

  constructor(private holder: Object3D, private base: string) {}

  set(id: string | undefined) {
    const next = id && (RING_IDS as readonly string[]).includes(id) ? id : '';
    if (next === this.id) return;
    this.id = next;
    if (!next) {
      if (this.mesh) this.holder.remove(this.mesh);
      return;
    }
    if (!this.mesh) {
      const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
      this.mesh = new Mesh(new PlaneGeometry(RING_SIZE, RING_SIZE), material);
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = -15.9;
      this.mesh.renderOrder = -1;
    }
    this.holder.add(this.mesh);
  }

  update(now: number) {
    if (!this.mesh || !this.id) return;
    const material = this.mesh.material as MeshBasicMaterial;
    const frames = RING_FRAMES[this.id];
    const map = this.texture(ringSrc(this.base, this.id, frames ? Math.floor(now / FRAME_MS) % frames : 0));
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    // once round in 14 seconds, breathing in and out a little
    this.mesh.rotation.z = ((now % 14_000) / 14_000) * Math.PI * 2;
    this.mesh.scale.setScalar(1 + 0.04 * Math.sin((now / 1000) * 2.2));
  }

  private texture(src: string): Texture {
    let t = this.textures.get(src);
    if (t) return t;
    const img = new Image();
    t = new Texture(img);
    const tex = t;
    img.onload = () => { tex.needsUpdate = true; };
    img.src = src;
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    // only the left square: the right one is the see-through underside the mod needs
    t.repeat.set(0.5, 1);
    this.textures.set(src, t);
    return t;
  }

  dispose() {
    if (this.mesh) {
      this.holder.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as MeshBasicMaterial).dispose();
    }
    for (const t of this.textures.values()) t.dispose();
  }
}

/** Little pictures, as rows of pixels: a letter is a colour of the palette, '.' is see-through. */
const PICTURES: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  dot: { rows: ['.ww.', 'wwww', 'wwww', '.ww.'], palette: { w: '#ffffff' } },
  spark: { rows: ['..w..', '..w..', 'wwwww', '..w..', '..w..'], palette: { w: '#ffffff' } },
  puff: { rows: ['..wwww..', '.wwwwww.', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', '.wwwwww.', '..wwww..'], palette: { w: '#ffffff' } },
  bubble: { rows: ['.bbb.', 'bw..b', 'b...b', 'b...b', '.bbb.'], palette: { b: '#bfe8ff', w: '#ffffff' } },
  petal: { rows: ['.pp.', 'pllp', 'pppp', '.pp.'], palette: { p: '#ff9cc8', l: '#ffd6e8' } },
  print: { rows: ['.ww.', 'wwww', 'wwww', 'wwww', '.ww.', '....', '.ww.', 'wwww', '.ww.'], palette: { w: '#ffffff' } },
};

interface Part {
  object: Sprite | Mesh;
  material: SpriteMaterial | MeshBasicMaterial;
  age: number;
  life: number;
  vx: number; vy: number; vz: number;
  gravity: number;
  drag: number;
  size: [number, number];
}

type Spawn = (picture: string, at: [number, number, number], o?: { v?: [number, number, number]; tint?: number; life?: number; gravity?: number; drag?: number; size?: number | [number, number]; flat?: boolean; turn?: number }) => void;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class MoveEffectPreview {
  private parts: Part[] = [];
  private textures = new Map<string, Texture>();
  private kind = '';
  private clock = 0;
  private due = 0;
  private left = false;

  /** `holder` gets the particles (it stays on the ground), `figure` hops. */
  constructor(private holder: Object3D, private figure: Object3D) {}

  /** Plays this effect in a loop (none: stops). */
  set(kind: string | undefined) {
    const next = kind && MOVE_ICONS[kind] ? kind : '';
    if (next === this.kind) return;
    this.kind = next;
    this.clock = 0;
    this.figure.position.y = 0;
  }

  update(dt: number) {
    const before = this.clock;
    this.clock += dt;
    const crossed = (period: number, at: number) => Math.floor((before - at) / period) !== Math.floor((this.clock - at) / period) && this.clock >= at;
    const every = (perSecond: number, make: () => void) => {
      this.due += dt * perSecond;
      while (this.due >= 1) {
        this.due--;
        make();
      }
    };
    let lift = 0;
    const spawn = this.spawn;
    switch (this.kind) {
      case 'move_steps':
        every(3, () => {
          this.left = !this.left;
          spawn('print', [this.left ? 2.2 : -2.2, -15.8, 1], { v: [0, 0, -14], tint: 0x9fe4ff, life: 1.6, size: 5, flat: true });
        });
        break;
      case 'move_sprint':
        every(18, () => spawn('spark', [rnd(-3, 3), -15, -3], { v: [rnd(-6, 6), rnd(6, 12), rnd(-26, -16)], tint: 0xfff6b0, life: 0.5, gravity: -40, size: [1.8, 0.6] }));
        break;
      case 'move_petals':
        every(7, () => spawn('petal', [rnd(-5, 5), rnd(-12, -8), rnd(-3, 2)], { v: [rnd(-2, 2), -2, -12], life: 1.6, gravity: -2, size: 1.8 }));
        break;
      case 'move_jump': {
        const period = 1.7, hop = 0.55, t = this.clock % period;
        if (t < hop) lift = 4 * 7 * (t / hop) * (1 - t / hop);
        if (crossed(period, 0)) for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 * i) / 12;
          spawn('puff', [Math.cos(a) * 4, -15.6, Math.sin(a) * 4], { v: [Math.cos(a) * 22, 0, Math.sin(a) * 22], tint: 0xf4f4f4, life: 0.6, drag: 3, size: [4, 2], flat: true });
        }
        break;
      }
      case 'move_landing': {
        const period = 2.4, hop = 0.85, t = this.clock % period;
        if (t < hop) lift = 4 * 11 * (t / hop) * (1 - t / hop);
        if (crossed(period, hop)) {
          for (let i = 0; i < 28; i++) {
            const a = (Math.PI * 2 * i) / 28;
            spawn('puff', [Math.cos(a) * 5, -15.6, Math.sin(a) * 5], { v: [Math.cos(a) * 40, 0, Math.sin(a) * 40], life: 0.7, drag: 2.2, size: [4, 1.5], flat: true });
          }
          this.sparkle(14, 1);
        }
        if (crossed(period, hop + 0.2)) this.sparkle(9, 0.7);
        break;
      }
      case 'move_arrows': {
        const period = 1.5, t = this.clock % period;
        // each dot where the shot was when it was left (also when frames come seldom)
        let at = t - dt;
        if (t < 0.45) every(70, () => {
          at = Math.min(t, at + 1 / 70);
          const k = Math.max(0, at) / 0.45;
          spawn('dot', [-6 - k * 42, 6 + k * 8 - k * k * 8, 4 + k * 22], { tint: Math.random() < 0.5 ? 0xffd84a : 0xffffff, life: 0.45, size: [1.4, 0.4] });
        });
        break;
      }
      case 'move_bubbles': {
        if (crossed(2.2, 0)) for (let i = 0; i < 18; i++) this.bubble(rnd(-14, 0));
        every(4, () => this.bubble(rnd(-12, 4)));
        break;
      }
      default:
        break;
    }
    // only while an effect plays: the viewer's own animations may move the figure otherwise
    if (this.kind) this.figure.position.y = lift;
    for (const p of this.parts) {
      p.age += dt;
      const slow = Math.max(0, 1 - p.drag * dt);
      p.vx *= slow;
      p.vz *= slow;
      p.vy = p.vy * slow + p.gravity * dt;
      p.object.position.x += p.vx * dt;
      p.object.position.y = Math.max(-15.9, p.object.position.y + p.vy * dt);
      p.object.position.z += p.vz * dt;
      const f = Math.min(1, p.age / p.life);
      const size = p.size[0] + (p.size[1] - p.size[0]) * f;
      p.object.scale.set(size, size, 1);
      p.material.opacity = Math.min(1, (1 - f) * 3);
    }
    for (const p of this.parts.filter((x) => x.age >= x.life)) {
      this.holder.remove(p.object);
      p.material.dispose();
    }
    this.parts = this.parts.filter((x) => x.age < x.life);
  }

  private sparkle(n: number, k: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('spark', [Math.cos(a) * 4, -14, Math.sin(a) * 4], { v: [Math.cos(a) * 14 * k, rnd(18, 30) * k, Math.sin(a) * 14 * k], tint: i % 2 ? 0xfff1a0 : 0xffffff, life: 0.8, gravity: -50, size: [2, 0.8] });
    }
  }

  private bubble(y: number) {
    this.spawn('bubble', [rnd(-10, 10), y, rnd(-8, 8)], { v: [rnd(-2, 2), rnd(8, 14), rnd(-2, 2)], life: 1.2, size: 2 });
  }

  dispose() {
    for (const p of this.parts) {
      this.holder.remove(p.object);
      p.material.dispose();
    }
    this.parts = [];
    this.figure.position.y = 0;
    for (const t of this.textures.values()) t.dispose();
  }

  private spawn: Spawn = (picture, at, o = {}) => {
    const map = this.texture(picture);
    const size: [number, number] = typeof o.size === 'number' ? [o.size, o.size] : o.size ?? [2, 2];
    let object: Sprite | Mesh, material: SpriteMaterial | MeshBasicMaterial;
    if (o.flat) {
      // lying on the ground: a little square of its own, turned to lie flat
      material = new MeshBasicMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false, side: DoubleSide });
      object = new Mesh(new PlaneGeometry(1, 1), material);
      object.rotation.x = -Math.PI / 2;
    } else {
      material = new SpriteMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false });
      object = new Sprite(material);
    }
    if (o.tint !== undefined) material.color.setHex(o.tint);
    object.position.set(at[0], at[1], at[2]);
    object.scale.set(size[0], size[0], 1);
    this.holder.add(object);
    const [vx, vy, vz] = o.v ?? [0, 0, 0];
    this.parts.push({ object, material, age: 0, life: o.life ?? 1, vx, vy, vz, gravity: o.gravity ?? 0, drag: o.drag ?? 0, size });
  };

  private texture(name: string): Texture {
    let t = this.textures.get(name);
    if (t) return t;
    const { rows, palette } = PICTURES[name] ?? PICTURES.dot;
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length;
    canvas.height = rows.length;
    const ctx = canvas.getContext('2d')!;
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (!palette[c]) return;
      ctx.fillStyle = palette[c];
      ctx.fillRect(x, y, 1, 1);
    }));
    t = new CanvasTexture(canvas);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    this.textures.set(name, t);
    return t;
  }
}
