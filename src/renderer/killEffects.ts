import { CanvasTexture, NearestFilter, type Object3D, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';

/**
 * Kill effects in the skin preview (the launcher's and the website's): a short burst of little
 * pixel pictures of our own around the figure, standing in for the game's particles (the mod plays
 * them where a mob or player the wearer killed falls, see KillEffects.java). Units are the model's
 * pixels: feet at y -16, the top of the head at 16.
 */

/** In the order of the menus (the same as the server's catalog and the mod's list). */
export const KILL_EFFECT_IDS = ['lightning', 'blood', 'heartburst', 'firework', 'soulrise', 'enderpoof',
  'confetti', 'blast', 'shatter', 'coins', 'ghost', 'flamering'] as const;

/** The pictures, as rows of pixels: a letter is a colour of the palette, '.' is see-through. */
const PICTURES: Record<string, { rows: string[]; palette: Record<string, string> }> = {
  dot: { rows: ['.ww.', 'wwww', 'wwww', '.ww.'], palette: { w: '#ffffff' } },
  spark: { rows: ['..w..', '..w..', 'wwwww', '..w..', '..w..'], palette: { w: '#ffffff' } },
  heart: { rows: ['.rr.rr.', 'rpprrrr', 'rprrrrr', '.rrrrr.', '..rrr..', '...r...'], palette: { r: '#ff3b5c', p: '#ffb3c1' } },
  coin: { rows: ['.yyyy.', 'yllyyo', 'ylyyyo', 'yyyyyo', 'yyyyoo', '.oooo.'], palette: { y: '#ffd23f', l: '#fff3a8', o: '#c98a0a' } },
  ghost: {
    rows: ['..wwww..', '.wwwwww.', 'wwwwwwww', 'wkwwwkww', 'wkwwwkww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'w.ww.ww.'],
    palette: { w: '#f4f6ff', k: '#14141c' },
  },
  flame: { rows: ['..y..', '.yy..', '.yoy.', 'yoooy', 'orrro', '.rrr.'], palette: { y: '#fff3a0', o: '#ffa21f', r: '#e8461b' } },
  soul: { rows: ['..c..', '.cc..', '.cbc.', 'cbbbc', 'bdddb', '.ddd.'], palette: { c: '#d8ffff', b: '#5fe3f0', d: '#1f9fb4' } },
  puff: { rows: ['..wwww..', '.wwwwww.', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', '.wwwwww.', '..wwww..'], palette: { w: '#ffffff' } },
  ice: { rows: ['.w.', 'wbw', '.b.'], palette: { w: '#ffffff', b: '#9fd8ff' } },
};

interface Part {
  sprite: Sprite;
  age: number;
  life: number;
  delay: number;
  vx: number; vy: number; vz: number;
  /** Pulls down (negative) per second. */
  gravity: number;
  /** Slows the speed down by this share per second (0: never). */
  drag: number;
  spin: number;
  /** The size it starts and ends with. */
  size: [number, number];
  /** A coin turning: its width swings with time. */
  flip?: boolean;
  /** A ghost swaying side to side as it rises. */
  sway?: number;
}

type Spawn = (picture: string, at: [number, number, number], o?: { v?: [number, number, number]; tint?: number; life?: number; delay?: number; gravity?: number; drag?: number; size?: number | [number, number]; spin?: number; flip?: boolean; sway?: number; aspect?: number }) => void;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** A random direction, evenly over a sphere. */
function direction(): [number, number, number] {
  const y = rnd(-1, 1), a = rnd(0, Math.PI * 2), r = Math.sqrt(1 - y * y);
  return [Math.cos(a) * r, y, Math.sin(a) * r];
}
const COLORS = [0xff3b3b, 0xffd93b, 0x3bff6e, 0x3bc8ff, 0xc63bff, 0xff7ad9];
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** What each effect throws out, once per burst (the `delay`s spread it over its second or two). */
const BURSTS: Record<string, (spawn: Spawn) => void> = {
  lightning: (spawn) => {
    for (const [delay, tint, size] of [[0, 0xeaf6ff, 2.2], [0.12, 0xb8e2ff, 1.4]] as const) {
      let x = 0, z = 0;
      for (let y = 60; y > -16; y -= 1.6) {
        x = Math.max(-8, Math.min(8, x + rnd(-1.6, 1.6)));
        z = Math.max(-8, Math.min(8, z + rnd(-1.6, 1.6)));
        spawn('dot', [x, y, z], { tint, life: 0.35, delay, size });
      }
    }
    for (let i = 0; i < 18; i++) {
      const d = direction();
      spawn('spark', [0, -15, 0], { v: [d[0] * 30, Math.abs(d[1]) * 24, d[2] * 30], tint: 0x9fe7ff, life: 0.5, drag: 2, size: [2.2, 0.6] });
    }
  },
  blood: (spawn) => {
    for (let i = 0; i < 34; i++) {
      const d = direction();
      spawn('dot', [rnd(-4, 4), rnd(-10, 10), rnd(-3, 3)], { v: [d[0] * 16, 10 + d[1] * 10, d[2] * 16], tint: pick([0x7a0000, 0xb00000, 0x8a0a0a]), life: 0.9, gravity: -70, size: rnd(1.4, 2.4) });
    }
  },
  heartburst: (spawn) => {
    [0, 0.15, 0.3].forEach((delay, ring) => {
      const n = 8 - ring;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + ring;
        spawn('heart', [Math.cos(a) * (10 + ring * 2), -2 + ring * 7, Math.sin(a) * (10 + ring * 2)], { v: [0, 10, 0], life: 1, delay, size: [3, 3.6] });
      }
    });
  },
  firework: (spawn) => {
    const a = pick(COLORS), b = pick(COLORS);
    for (let i = 0; i < 46; i++) {
      const d = direction();
      spawn('dot', [0, 12, 0], { v: [d[0] * 22, d[1] * 22, d[2] * 22], tint: i % 2 ? a : b, life: 1.1, drag: 1.6, gravity: -10, size: [2, 1] });
    }
    for (let i = 0; i < 14; i++) {
      const d = direction();
      spawn('spark', [0, 12, 0], { v: [d[0] * 18, d[1] * 18, d[2] * 18], life: 0.7, drag: 1.5, size: [2.4, 0.8] });
    }
  },
  soulrise: (spawn) => {
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      spawn('soul', [Math.cos(a) * 9, -15, Math.sin(a) * 9], { v: [0, 3, 0], life: 0.8, size: 2.4 });
    }
    for (let i = 0; i < 14; i++) spawn('soul', [rnd(-5, 5), rnd(-14, 0), rnd(-3, 3)], { v: [0, rnd(12, 18), 0], life: 1.2, delay: i * 0.08, size: [3, 2] });
  },
  enderpoof: (spawn) => {
    for (let i = 0; i < 44; i++) {
      const d = direction();
      spawn('dot', [0, 0, 0], { v: [d[0] * 22, d[1] * 22, d[2] * 22], tint: pick([0xc070ff, 0x8a2be2, 0xe0a0ff]), life: 0.75, drag: 1.2, size: [2.2, 0.4] });
    }
    for (let i = 0; i < 6; i++) spawn('puff', [rnd(-4, 4), rnd(-8, 8), rnd(-3, 3)], { tint: 0xe9d8ff, life: 0.5, delay: 0.05, size: [3, 8] });
  },
  confetti: (spawn) => {
    for (let i = 0; i < 56; i++) {
      spawn('dot', [rnd(-16, 16), rnd(10, 16), rnd(-12, 12)], { v: [rnd(-4, 4), rnd(2, 8), rnd(-4, 4)], tint: pick(COLORS), life: 1.7, gravity: -22, drag: 0.6, size: 1.8, aspect: 0.5, spin: rnd(-8, 8) });
    }
  },
  blast: (spawn) => {
    spawn('puff', [0, 0, 0], { tint: 0xffd27a, life: 0.25, size: [8, 16] });
    for (let i = 0; i < 8; i++) {
      const d = direction();
      spawn('puff', [d[0] * 4, d[1] * 8, d[2] * 4], { v: [d[0] * 10, d[1] * 8 + 4, d[2] * 10], tint: pick([0x9a9a9a, 0xc8c8c8, 0x6e6e6e]), life: 0.9, delay: 0.05, size: [4, 11] });
    }
    for (let i = 0; i < 12; i++) {
      const d = direction();
      spawn('flame', [0, 0, 0], { v: [d[0] * 26, d[1] * 20, d[2] * 26], life: 0.5, drag: 2, size: [2.4, 1] });
    }
  },
  shatter: (spawn) => {
    for (let i = 0; i < 32; i++) {
      const d = direction();
      spawn('ice', [rnd(-4, 4), rnd(-12, 12), rnd(-3, 3)], { v: [d[0] * 22, 12 + d[1] * 12, d[2] * 22], tint: pick([0xcff2ff, 0x9fd8ff, 0xffffff]), life: 1, gravity: -55, spin: rnd(-10, 10), size: rnd(1.6, 2.6) });
    }
    for (let i = 0; i < 12; i++) spawn('dot', [rnd(-10, 10), rnd(-12, 12), rnd(-8, 8)], { tint: 0xe8f8ff, life: 0.6, size: [1.6, 0.2] });
  },
  coins: (spawn) => {
    for (let i = 0; i < 20; i++) {
      spawn('coin', [rnd(-2, 2), 2, rnd(-2, 2) + 4], { v: [rnd(-14, 14), rnd(22, 34), rnd(-10, 14)], life: 1.3, delay: i * 0.025, gravity: -85, size: 2.6, flip: true });
    }
  },
  ghost: (spawn) => {
    spawn('ghost', [0, -6, 6], { v: [0, 13, 0], life: 1.7, size: [8, 7], sway: 3 });
    for (let i = 0; i < 5; i++) spawn('soul', [rnd(-4, 4), rnd(-10, 0), rnd(-3, 3)], { v: [0, 10, 0], life: 0.8, size: 2 });
  },
  flamering: (spawn) => {
    for (const [delay, n] of [[0, 28], [0.2, 20]] as const) {
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        spawn('flame', [Math.cos(a) * 5, -15, Math.sin(a) * 5], { v: [Math.cos(a) * 22, 2, Math.sin(a) * 22], life: 0.8, delay, drag: 0.8, size: [2.8, 1.4] });
      }
    }
  },
};

/** How often the worn effect plays again while it is shown, in seconds. */
const EVERY = 2.4;

export class KillEffectPreview {
  private parts: Part[] = [];
  private textures = new Map<string, Texture>();
  private kind = '';
  private wait = 0;

  constructor(private holder: Object3D) {}

  /** Plays this effect every few seconds (none: stops); a new one starts at once. */
  set(kind: string | undefined) {
    const next = kind && BURSTS[kind] ? kind : '';
    if (next === this.kind) return;
    this.kind = next;
    this.wait = 0.25;
  }

  private play(kind: string) {
    BURSTS[kind]?.(this.spawn);
  }

  update(dt: number) {
    if (this.kind && (this.wait -= dt) <= 0) {
      this.wait = EVERY;
      this.play(this.kind);
    }
    for (const p of this.parts) {
      if (p.delay > 0) {
        p.delay -= dt;
        p.sprite.visible = p.delay <= 0;
        continue;
      }
      p.age += dt;
      const slow = Math.max(0, 1 - p.drag * dt);
      p.vx *= slow;
      p.vz *= slow;
      p.vy = p.vy * slow + p.gravity * dt;
      p.sprite.position.x += p.vx * dt + (p.sway ? Math.cos(p.age * 4) * p.sway * dt * 4 : 0);
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const f = Math.min(1, p.age / p.life);
      const size = p.size[0] + (p.size[1] - p.size[0]) * f;
      const material = p.sprite.material as SpriteMaterial;
      material.rotation += p.spin * dt;
      p.sprite.scale.set(size * (p.flip ? Math.max(0.15, Math.abs(Math.cos(p.age * 10))) : (p.sprite.userData.aspect as number) ?? 1), size, 1);
      material.opacity = Math.min(1, (1 - f) * 3);
    }
    for (const p of this.parts.filter((x) => x.age >= x.life)) {
      this.holder.remove(p.sprite);
      (p.sprite.material as SpriteMaterial).dispose();
    }
    this.parts = this.parts.filter((x) => x.age < x.life);
  }

  dispose() {
    for (const p of this.parts) {
      this.holder.remove(p.sprite);
      (p.sprite.material as SpriteMaterial).dispose();
    }
    this.parts = [];
    for (const t of this.textures.values()) t.dispose();
  }

  private spawn: Spawn = (picture, at, o = {}) => {
    const material = new SpriteMaterial({ map: this.texture(picture), transparent: true, alphaTest: 0.05, depthWrite: false });
    if (o.tint !== undefined) material.color.setHex(o.tint);
    const sprite = new Sprite(material);
    sprite.position.set(at[0], at[1], at[2]);
    sprite.userData.aspect = o.aspect ?? 1;
    const size: [number, number] = typeof o.size === 'number' ? [o.size, o.size] : o.size ?? [2, 2];
    sprite.scale.set(size[0], size[0], 1);
    const delay = o.delay ?? 0;
    sprite.visible = delay <= 0;
    this.holder.add(sprite);
    const [vx, vy, vz] = o.v ?? [0, 0, 0];
    this.parts.push({ sprite, age: 0, life: o.life ?? 1, delay, vx, vy, vz, gravity: o.gravity ?? 0, drag: o.drag ?? 0, spin: o.spin ?? 0, size, flip: o.flip, sway: o.sway });
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
