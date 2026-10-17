import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace, Sprite, SpriteMaterial, Texture } from 'three';
import { PET_MODELS, type PetPart } from './petModels';
import type { SkinViewer } from 'skinview3d';

/**
 * What the game shows around a player, in the skin preview: the pet floating by the shoulder
 * (the mob's own model and picture) and the particles of trails and auras, made of the game's own
 * particle pictures (read from a downloaded game; without one, the preview shows neither).
 * Units are the model's pixels: feet at y -16, shoulders at 8, the face towards +z.
 */

type Kind = 'trail' | 'aura';
interface Effect {
  kind: Kind;
  /** Picture paths (particle/…), one picked per particle, or played in order as it ages. */
  frames: string[];
  animate?: boolean;
  /** RGB tint; 'rainbow' changes with each particle (note blocks). */
  tint?: number | 'rainbow';
  size: number;
  /** How a particle moves: rising, falling, drifting outwards, or flying in towards the body. */
  motion: 'rise' | 'fall' | 'drift' | 'inward';
  life: number;
}

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `particle/${prefix}_${i}`);
const EFFECTS: Record<string, Effect> = {
  hearts: { kind: 'trail', frames: ['particle/heart'], size: 3, motion: 'rise', life: 1.2 },
  sparks: { kind: 'trail', frames: ['particle/glow'], tint: 0x9fe7ff, size: 2.2, motion: 'drift', life: 0.7 },
  snow: { kind: 'trail', frames: range('generic', 8).reverse(), animate: true, tint: 0xe2f2ff, size: 2.4, motion: 'fall', life: 1.4 },
  notes: { kind: 'trail', frames: ['particle/note'], tint: 'rainbow', size: 3, motion: 'rise', life: 1.2 },
  flames: { kind: 'trail', frames: ['particle/flame'], size: 2.4, motion: 'rise', life: 0.8 },
  enchant: { kind: 'aura', frames: 'abcdefghijklmnop'.split('').map((c) => `particle/sga_${c}`), tint: 0xe8e8ff, size: 2.2, motion: 'inward', life: 1.4 },
  portal: { kind: 'aura', frames: range('generic', 8), animate: true, tint: 0xc070ff, size: 2.4, motion: 'inward', life: 1.2 },
  cherry: { kind: 'aura', frames: range('cherry', 12), size: 2.6, motion: 'fall', life: 2.2 },
  souls: { kind: 'aura', frames: range('soul', 11), animate: true, size: 3.2, motion: 'rise', life: 1.6 },
  royal: { kind: 'aura', frames: range('glitter', 8).reverse(), animate: true, tint: 0xffd54a, size: 2.6, motion: 'rise', life: 1.4 },
  clouds: { kind: 'trail', frames: range('generic', 8).reverse(), animate: true, tint: 0xf4f4f4, size: 3.4, motion: 'drift', life: 1.2 },
  stars: { kind: 'trail', frames: range('spark', 8).reverse(), animate: true, size: 2.4, motion: 'drift', life: 1 },
  bubbles: { kind: 'trail', frames: ['particle/bubble'], size: 2.2, motion: 'rise', life: 0.9 },
  emerald: { kind: 'trail', frames: ['particle/glint'], tint: 0x6bff7a, size: 2.4, motion: 'rise', life: 1 },
  soulfire: { kind: 'trail', frames: ['particle/soul_fire_flame'], size: 2.4, motion: 'rise', life: 0.8 },
  glow: { kind: 'aura', frames: ['particle/glow'], tint: 0x7dffd8, size: 2.2, motion: 'rise', life: 1.6 },
  magic: { kind: 'aura', frames: ['particle/enchanted_hit'], size: 2.4, motion: 'rise', life: 1.2 },
  amber: { kind: 'aura', frames: ['particle/glow'], tint: 0xffb02e, size: 2.2, motion: 'rise', life: 1.4 },
  sculk: { kind: 'aura', frames: range('sculk_soul', 10), animate: true, size: 3.2, motion: 'rise', life: 1.6 },
};

/** The pets' pictures (the bat's moved into a folder in 26.1) and their size next to the player. */
const PET_TEXTURES: Record<string, string[]> = {
  allay: ['entity/allay/allay'], vex: ['entity/illager/vex'], bat: ['entity/bat/bat', 'entity/bat'],
  parrot: ['entity/parrot/parrot_red_blue'], bee: ['entity/bee/bee'],
  blaze: ['entity/blaze/blaze', 'entity/blaze'], phantom: ['entity/phantom/phantom', 'entity/phantom'],
};
const PET_SCALE: Record<string, number> = { allay: 0.6, vex: 0.6, bat: 0.45, parrot: 0.55, bee: 0.5, blaze: 0.3, phantom: 0.5 };

/**
 * Frames that read well as an icon, where the first ones would not: the dots that start small,
 * and the soul, which is a brown puff of soul sand until it rises as a blue wisp.
 */
const ICON_FRAMES: Record<string, string[]> = {
  snow: ['particle/generic_7', 'particle/generic_5', 'particle/generic_4'],
  portal: ['particle/generic_7', 'particle/generic_5', 'particle/generic_6'],
  souls: ['particle/soul_8', 'particle/soul_9', 'particle/soul_8'],
  royal: ['particle/glitter_7', 'particle/glitter_5', 'particle/glitter_6'],
  clouds: ['particle/generic_7', 'particle/generic_6', 'particle/generic_5'],
  stars: ['particle/spark_7', 'particle/spark_5', 'particle/spark_6'],
  sculk: ['particle/sculk_soul_8', 'particle/sculk_soul_9', 'particle/sculk_soul_8'],
};

interface Particle { sprite: Sprite; effect: Effect; age: number; vx: number; vy: number; vz: number; frame: number }

export class CosmeticPreview {
  private textures = new Map<string, Texture>();
  private particles: Particle[] = [];
  private pet?: Object3D;
  private petId = '';
  private wings: { part: Object3D; base: number; side: number; axis: 'y' | 'z'; speed: number }[] = [];
  private trail?: Effect;
  private aura?: Effect;
  private spawnTrail = 0;
  private spawnAura = 0;
  private last = performance.now();
  private frame = 0;

  constructor(private viewer: SkinViewer, public pictures: Record<string, string>) {
    const tick = (now: number) => {
      this.update(Math.min(0.1, (now - this.last) / 1000), now / 1000);
      this.last = now;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Whether the game's pictures are here (a game has been downloaded). */
  get ready(): boolean {
    return Object.keys(this.pictures).length > 0;
  }

  private texture(path: string): Texture | undefined {
    const src = this.pictures[path];
    if (!src) return undefined;
    let t = this.textures.get(path);
    if (!t) {
      const img = new Image();
      t = new Texture(img);
      const tex = t;
      img.onload = () => { tex.needsUpdate = true; };
      img.src = src;
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.colorSpace = SRGBColorSpace;
      this.textures.set(path, t);
    }
    return t;
  }

  /** Shows what a set wears (the cape, wings and elytra are the viewer's own back equipment). */
  show(set: { trail?: string; aura?: string; pet?: string }) {
    this.trail = set.trail ? EFFECTS[set.trail] : undefined;
    this.aura = set.aura ? EFFECTS[set.aura] : undefined;
    if ((set.pet ?? '') === this.petId && (this.pet || !set.pet)) return;
    if (this.pet) this.viewer.playerWrapper.remove(this.pet);
    this.pet = undefined;
    this.wings = [];
    this.petId = set.pet ?? '';
    if (!set.pet) return;
    this.pet = this.petModel(set.pet) ?? this.eggSprite(set.pet);
    if (this.pet) this.viewer.playerWrapper.add(this.pet);
  }

  /** The mob, built from the game's model: one group per part, posed like the game poses it. */
  private petModel(id: string): Object3D | undefined {
    const shape = PET_MODELS[id];
    const map = this.texture(PET_TEXTURES[id]?.find((p) => this.pictures[p]) ?? '');
    if (!shape || !map) return undefined;
    const material = new MeshStandardMaterial({ map, transparent: true, alphaTest: 0.1, side: DoubleSide });
    const build = (part: PetPart): Group => {
      const g = new Group();
      const [x, y, z, rx, ry, rz] = part.pose;
      g.position.set(x, y, z);
      g.rotation.set(rx, ry, rz, 'ZYX');
      if (part.quads.length) {
        const pos: number[] = [], uv: number[] = [], index: number[] = [];
        for (const q of part.quads) {
          const base = pos.length / 3;
          for (let i = 0; i < 4; i++) {
            pos.push(q[i * 5], q[i * 5 + 1], q[i * 5 + 2]);
            uv.push(q[i * 5 + 3], 1 - q[i * 5 + 4]);
          }
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        g.add(new Mesh(geometry, material));
      }
      if (/^(left|right)_wing(_base)?$/.test(part.name)) {
        // bees, bats, parrots and phantoms beat their wings up and down, the others back and forth
        const axis = id === 'bee' || id === 'bat' || id === 'parrot' || id === 'phantom' ? 'z' : 'y';
        // the phantom glides with slow beats; the small ones buzz
        this.wings.push({ part: g, base: axis === 'z' ? rz : ry, side: part.name.startsWith('left') ? 1 : -1, axis, speed: id === 'phantom' ? 4 : axis === 'z' ? 18 : 9 });
      }
      for (const c of part.children) g.add(build(c));
      return g;
    };
    const model = build(shape);
    // the game's models point y down and face -z: turned to stand up and look where the player looks
    const holder = new Group();
    model.scale.set(1, -1, -1);
    holder.add(model);
    holder.scale.setScalar(PET_SCALE[id] ?? 0.6);
    return holder;
  }

  /** Without the mob's picture (an old game), its spawn egg. */
  private eggSprite(id: string): Sprite | undefined {
    const egg = this.texture(`item/${id}_spawn_egg`);
    if (!egg) return undefined;
    const sprite = new Sprite(new SpriteMaterial({ map: egg, transparent: true, alphaTest: 0.1 }));
    sprite.scale.set(8, 8, 1);
    return sprite;
  }

  private emit(effect: Effect) {
    const pick = effect.animate ? effect.frames[0] : effect.frames[Math.floor(Math.random() * effect.frames.length)];
    const map = this.texture(pick);
    if (!map) return;
    const material = new SpriteMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false });
    const tint = effect.tint === 'rainbow' ? [0xff5a5a, 0xffc04a, 0x7dff6a, 0x4ad8ff, 0xb46aff][Math.floor(Math.random() * 5)] : effect.tint;
    if (tint !== undefined) material.color.setHex(tint);
    const sprite = new Sprite(material);
    sprite.scale.set(effect.size, effect.size, 1);
    let vx = 0, vy = 0, vz = 0;
    if (effect.kind === 'trail') {
      // behind the feet, where a walking player has just been
      sprite.position.set((Math.random() - 0.5) * 8, -15 + Math.random() * 4, -4 - Math.random() * 4);
      vz = -6;
    } else {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 3;
      sprite.position.set(Math.cos(a) * r, -14 + Math.random() * 28, Math.sin(a) * r);
    }
    if (effect.motion === 'rise') vy = 6 + Math.random() * 3;
    if (effect.motion === 'fall') vy = -4 - Math.random() * 2;
    if (effect.motion === 'drift') { vx = (Math.random() - 0.5) * 10; vy = 3; }
    if (effect.motion === 'inward') { vx = -sprite.position.x * 0.8; vz = -sprite.position.z * 0.8; vy = (6 - sprite.position.y) * 0.4; }
    this.viewer.playerWrapper.add(sprite);
    this.particles.push({ sprite, effect, age: 0, vx, vy, vz, frame: 0 });
  }

  private update(dt: number, time: number) {
    if (this.pet) {
      // by the shoulder: the model's feet (24 px under its origin) a little above it, bobbing
      const scale = this.pet instanceof Sprite ? 0 : this.pet.scale.x;
      this.pet.position.set(10, 6 + 24 * scale + Math.sin(time * 2.2) * 1.2, -3);
      for (const w of this.wings) w.part.rotation[w.axis] = w.base + w.side * Math.sin(time * w.speed) * 0.35;
    }
    if (this.trail && (this.spawnTrail += dt) > 0.09) {
      this.spawnTrail = 0;
      this.emit(this.trail);
    }
    if (this.aura && (this.spawnAura += dt) > 0.12) {
      this.spawnAura = 0;
      this.emit(this.aura);
    }
    for (const p of this.particles) {
      p.age += dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const left = 1 - p.age / p.effect.life;
      (p.sprite.material as SpriteMaterial).opacity = Math.min(1, left * 3);
      if (p.effect.animate) {
        const f = Math.min(p.effect.frames.length - 1, Math.floor((p.age / p.effect.life) * p.effect.frames.length));
        if (f !== p.frame) {
          p.frame = f;
          const map = this.texture(p.effect.frames[f]);
          if (map) (p.sprite.material as SpriteMaterial).map = map;
        }
      }
    }
    for (const p of this.particles.filter((x) => x.age >= x.effect.life)) {
      this.viewer.playerWrapper.remove(p.sprite);
      (p.sprite.material as SpriteMaterial).dispose();
    }
    this.particles = this.particles.filter((x) => x.age < x.effect.life);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.show({});
    for (const p of this.particles) this.viewer.playerWrapper.remove(p.sprite);
    this.particles = [];
    for (const t of this.textures.values()) t.dispose();
  }
}

/**
 * The pictures for an item's icon in the grid: the pet's spawn egg, or three of the effect's
 * particles (a big one and two smaller, the way they look in the game); none without a game.
 */
export function cosmeticIcon(pictures: Record<string, string>, id: string): { srcs: string[]; tint?: string } | undefined {
  const egg = pictures[`item/${id}_spawn_egg`];
  if (egg) return { srcs: [egg] };
  const e = EFFECTS[id];
  if (!e) return undefined;
  const n = e.frames.length;
  const srcs = (ICON_FRAMES[id] ?? [e.frames[0], e.frames[Math.floor(n / 3)], e.frames[Math.floor((2 * n) / 3)]])
    .map((f) => pictures[f]).filter((x): x is string => !!x);
  if (!srcs.length) return undefined;
  const tint = typeof e.tint === 'number' ? `#${e.tint.toString(16).padStart(6, '0')}` : e.tint === 'rainbow' ? '#7dff6a' : undefined;
  return { srcs, tint };
}
