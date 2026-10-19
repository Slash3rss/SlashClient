import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace, Texture } from 'three';
import { boxQuads } from '../shared/clothing';
import type { SkinViewer } from 'skinview3d';

/**
 * The held item skins in the skin preview: the worn shield on the left arm and the worn sword or
 * bow in the right hand, placed as the game places an item in a hand in third person (the same
 * steps as the mod's menu figure, hud/…/ui/HeldFigure.java). A weapon is a box a pixel of its
 * sprite, a shield the game's shield model with our picture (64×64 layout).
 * Pictures: `<dir><id>.png` (scripts/make-held.mjs).
 */

const DEG = Math.PI / 180;

/** Third person display of the item model for the right hand: rotation (degrees), translation (pixels), scale. */
const DISPLAY: Record<string, [number[], number[], number]> = {
  sword: [[0, -90, 55], [0, 4, 0.5], 0.85],
  bow: [[-80, 260, -40], [-1, -2, 2.5], 0.9],
  // held in the left hand: the left hand's display, mirrored as the game mirrors it
  shield: [[0, -90, 0], [-10, 6, 12], 1],
};

export const heldKind = (id: string): 'shield' | 'sword' | 'bow' | undefined =>
  id.startsWith('shield_') ? 'shield' : id.startsWith('sword_') ? 'sword' : id.startsWith('bow_') ? 'bow' : undefined;

export class HeldPreview {
  private items: { holder: Object3D; dispose: () => void }[] = [];
  private shown = '';

  constructor(private viewer: SkinViewer, private dir: string) {}

  /** Holds these (missing or '' takes it away). */
  show(set: { shield?: string; weapon?: string }) {
    const key = `${set.shield ?? ''}|${set.weapon ?? ''}`;
    if (key === this.shown) return;
    this.shown = key;
    this.clear();
    for (const id of [set.shield, set.weapon]) if (id && heldKind(id)) this.hold(id);
  }

  private clear() {
    for (const i of this.items) {
      i.holder.parent?.remove(i.holder);
      i.dispose();
    }
    this.items = [];
  }

  private hold(id: string) {
    const kind = heldKind(id)!;
    const left = kind === 'shield';
    const side = left ? -1 : 1;
    const [rot, move, scale] = DISPLAY[kind];
    const skin = this.viewer.playerObject.skin;
    // in the game's model space (y down, facing -z), from the arm's pivot
    const holder = new Group();
    holder.scale.set(1, -1, -1);
    let at: Object3D = holder;
    const step = (f: (g: Group) => void) => {
      const g = new Group();
      f(g);
      at.add(g);
      at = g;
    };
    // ItemInHandLayer, then the display: one move or turn a step, as the game does them
    step((g) => (g.rotation.x = -90 * DEG));
    step((g) => (g.rotation.y = 180 * DEG));
    step((g) => g.position.set(side, 2, -10));
    step((g) => g.position.set(move[0], move[1], move[2]));
    step((g) => (g.rotation.x = rot[0] * DEG));
    step((g) => (g.rotation.y = rot[1] * DEG));
    step((g) => {
      g.rotation.z = rot[2] * DEG;
      g.scale.setScalar(scale);
    });
    step((g) => {
      g.position.set(-8, -8, -8);
      // the shield's renderer turns its model upside down and back to front
      if (left) g.scale.set(1, -1, -1);
    });
    const material = new MeshStandardMaterial({ transparent: true, alphaTest: 0.1, side: DoubleSide });
    const geometry = new BufferGeometry();
    at.add(new Mesh(geometry, material));
    (left ? skin.leftArm : skin.rightArm).add(holder);
    this.items.push({ holder, dispose: () => { geometry.dispose(); material.map?.dispose(); material.dispose(); } });

    const img = new Image();
    img.onload = () => {
      if (left) this.shieldGeometry(geometry, material, img);
      else this.weaponGeometry(geometry, material, img);
    };
    img.src = `${this.dir}${id}.png`;
  }

  /** The game's shield model: the plate 12×22×1 at (0, 0) and the handle 2×6×6 at (26, 0) of the 64×64 layout. */
  private shieldGeometry(geometry: BufferGeometry, material: MeshStandardMaterial, img: HTMLImageElement) {
    const map = new Texture(img);
    map.magFilter = NearestFilter;
    map.minFilter = NearestFilter;
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
    material.map = map;
    material.needsUpdate = true;
    const pos: number[] = [], uv: number[] = [], index: number[] = [];
    const boxes: [[number, number, number], [number, number, number], [number, number]][] = [
      [[-6, -11, -2], [12, 22, 1], [0, 0]],
      [[-1, -3, -1], [2, 6, 6], [26, 0]],
    ];
    for (const [from, size, at] of boxes) for (const q of boxQuads({ bone: 'left_arm', from, size }, at)) {
      const base = pos.length / 3;
      for (const c of q.corners) {
        pos.push(c[0], c[1], c[2]);
        uv.push(c[3], 1 - c[4]);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
  }

  /** A sword or bow as the game makes an item of a sprite: each pixel a box one pixel thick round the middle. */
  private weaponGeometry(geometry: BufferGeometry, material: MeshStandardMaterial, img: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 16, 16);
    const px = ctx.getImageData(0, 0, 16, 16).data;
    const pos: number[] = [], color: number[] = [];
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && px[(y * 16 + x) * 4 + 3] > 25;
    // sRGB to the linear colours the material works in
    const lin = (c: number) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!opaque(x, y)) continue;
      const i = (y * 16 + x) * 4;
      const rgb = [lin(px[i]), lin(px[i + 1]), lin(px[i + 2])];
      const x0 = x, x1 = x + 1, y0 = 15 - y, y1 = 16 - y, z0 = 7.5, z1 = 8.5;
      const faces: [boolean, number[][]][] = [
        [true, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
        [true, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
        [!opaque(x - 1, y), [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
        [!opaque(x + 1, y), [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
        [!opaque(x, y - 1), [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
        [!opaque(x, y + 1), [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ];
      for (const [shown, c] of faces) {
        if (!shown) continue;
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pos.push(...c[k]);
          color.push(...rgb);
        }
      }
    }
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(color, 3));
    geometry.computeVertexNormals();
    material.vertexColors = true;
    material.transparent = false;
    material.needsUpdate = true;
  }

  dispose() {
    this.clear();
    this.shown = '';
  }
}
