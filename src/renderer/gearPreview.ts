import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace, Texture } from 'three';
import type { SkinViewer } from 'skinview3d';
import { boxQuads } from '../shared/clothing';
import { TAIL_BASE, TAIL_OVERLAP, flameScale, gearBoxes, gearItem, gearLayout, tailAngles, type GearItem, type TailItem } from '../shared/gear';

/**
 * A back item and a tail on the skin preview's figure (src/shared/gear.ts): our own boxes and
 * pictures fixed to its body, built as the game builds them (each part turned z, y, x round its
 * pivot). The tail sways slowly standing and swings with the figure's steps when it walks (read
 * from its legs), and hangs lower when a cape is on the figure; a jet's flames flicker.
 * Units are the model's pixels; the game's model space points y down and faces -z.
 */
export class GearPreview {
  private worn: { back?: string; tail?: string } = {};
  private built: { holder: Object3D; meshes: Mesh[] }[] = [];
  private tails: { item: TailItem; segments: Group[][] }[] = [];
  private flames: Group[] = [];
  private textures = new Map<string, Texture>();
  private key = '';
  /** The legs' swing over the last second (time, angle), to swing the tail with the steps. */
  private legs: [number, number][] = [];
  private amp = 0;

  /** `dir` is where the pictures are (<id>.png). */
  constructor(private viewer: SkinViewer, private dir = 'img/gear/') {}

  show(back?: string, tail?: string) {
    this.worn = { back: back || undefined, tail: tail || undefined };
    const key = `${this.worn.back ?? ''}|${this.worn.tail ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    this.clear();
    for (const id of [this.worn.back, this.worn.tail]) {
      const item = id ? gearItem(id) : undefined;
      if (item) this.build(item);
    }
  }

  private build(item: GearItem) {
    const material = new MeshStandardMaterial({ map: this.texture(item.id), transparent: true, alphaTest: 0.1, side: DoubleSide });
    const uvs = gearLayout(item);
    const boxes = gearBoxes(item);
    const meshes: Mesh[] = [];
    const mesh = (indices: number[]): Mesh => {
      const pos: number[] = [], uv: number[] = [], index: number[] = [];
      for (const i of indices) for (const q of boxQuads(boxes[i].box, uvs[i])) {
        const base = pos.length / 3;
        for (const c of q.corners) {
          pos.push(c[0], c[1], c[2]);
          uv.push(c[3], 1 - c[4]);
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const m = new Mesh(geometry, material);
      meshes.push(m);
      return m;
    };
    const part = (at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): Group => {
      const g = new Group();
      g.position.set(...at);
      g.rotation.set(rot[0], rot[1], rot[2], 'ZYX');
      return g;
    };
    // the game's model space points y down and faces -z; the body's group sits at its middle
    const holder = new Group();
    holder.scale.set(1, -1, -1);
    holder.position.y = 6;
    if (item.slot === 'back') {
      item.boxes.forEach((b, i) => {
        const g = part(b.pivot ?? [0, 0, 0], b.rot);
        g.add(mesh([i]));
        holder.add(g);
        if (b.flame) this.flames.push(g);
      });
    } else {
      let i = 0;
      const segments: Group[][] = [];
      for (const c of item.chains) {
        let parent: Object3D = holder;
        let at: [number, number, number] = TAIL_BASE;
        const chain: Group[] = [];
        for (const s of c.segments) {
          const g = part(at);
          const own = [i++];
          for (const _ of s.extras ?? []) own.push(i++);
          g.add(mesh(own));
          parent.add(g);
          chain.push(g);
          parent = g;
          at = [0, 0, s.size[2] - TAIL_OVERLAP];
        }
        segments.push(chain);
      }
      this.tails.push({ item, segments });
    }
    this.viewer.playerObject.skin.body.add(holder);
    this.built.push({ holder, meshes });
    this.update(0, performance.now() / 1000);
  }

  private texture(id: string): Texture {
    let t = this.textures.get(id);
    if (!t) {
      const img = new Image();
      t = new Texture(img);
      const tex = t;
      img.onload = () => { tex.needsUpdate = true; };
      img.src = `${this.dir}${id}.png`;
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.colorSpace = SRGBColorSpace;
      this.textures.set(id, t);
    }
    return t;
  }

  /** Moves the tail and the flames; once a frame. */
  update(dt: number, time: number) {
    if (!this.built.length) return;
    // how far the legs swing now, and where they were a moment ago (a piece further along the tail follows later)
    const leg = this.viewer.playerObject.skin.leftLeg.rotation.x;
    this.legs.push([time, leg]);
    while (this.legs.length && this.legs[0][0] < time - 1) this.legs.shift();
    this.amp = Math.max(Math.abs(leg), this.amp - dt * 0.8);
    const walk = Math.min(1, this.amp / 0.45);
    const legAt = (ago: number) => {
      for (let i = this.legs.length - 1; i >= 0; i--) if (this.legs[i][0] <= time - ago) return this.legs[i][1];
      return this.legs[0]?.[1] ?? 0;
    };
    const player = this.viewer.playerObject;
    const caped = player.backEquipment === 'cape' && player.cape.visible;
    for (const t of this.tails) {
      t.segments.forEach((chain, c) => chain.forEach((g, i) => {
        // the game's swing is sin(phase − 0.7·piece): here the legs' own swing, a little later each piece
        const swing = this.amp > 0.01 ? legAt(i * 0.07) / this.amp : 0;
        const [pitch, yaw] = tailAngles(t.item, c, i, time, walk, Math.asin(Math.max(-1, Math.min(1, swing))) + i * 0.7, caped);
        g.rotation.set(pitch, yaw, 0, 'ZYX');
      }));
    }
    this.flames.forEach((g, i) => g.scale.set(1, flameScale(time, i), 1));
  }

  private clear() {
    for (const b of this.built) {
      b.holder.parent?.remove(b.holder);
      for (const m of b.meshes) m.geometry.dispose();
      (b.meshes[0]?.material as MeshStandardMaterial | undefined)?.dispose();
    }
    this.built = [];
    this.tails = [];
    this.flames = [];
  }

  dispose() {
    this.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
