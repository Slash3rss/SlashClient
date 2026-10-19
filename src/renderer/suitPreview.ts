import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D, type Texture } from 'three';
import type { SkinViewer } from 'skinview3d';
import { boxQuads } from '../shared/clothing';
import { SUIT_TEXTURE, slimSuitBox, suitItem, suitLayout, suitPart, type SuitBone, type SuitBox } from '../shared/suits';

/**
 * A suit (src/shared/suits.ts) on the preview's figure: its boxes fixed to the head, body, arms
 * and legs, as the mod draws it. Its back (a backpack, a tail) gives way to a cape, wings, a back item or an
 * elytra on the figure, its own tail alone to a worn tail, as in the game.
 */
export class SuitPreview {
  private meshes: { mesh: Mesh; holder: Object3D }[] = [];
  /** What it was made for: the suit, the arms' width and whether the back is taken. */
  private made = '';

  constructor(private viewer: SkinViewer, private texture: (src: string) => Texture, private pictures = 'img/suits/') {}

  /**
   * Puts the suit on (again when the suit, the arms' width or the back changed); '' takes it off.
   * `backItem`: a back item worn (it takes the whole back, as a cape does), `tail`: a tail worn (it takes the suit's own tail's place).
   */
  wear(id: string | undefined, backItem = false, tail = false) {
    const skin = this.viewer.playerObject.skin;
    const slim = skin.modelType === 'slim';
    const back = backItem || this.viewer.playerObject.backEquipment !== null;
    const key = `${id ?? ''}|${slim}|${back}|${tail}`;
    if (key === this.made) return;
    this.made = key;
    this.clear();
    const suit = id ? suitItem(id) : undefined;
    if (!suit) return;
    // the figure's parts, and where the game's own pivot of each is in it (the body's group sits at its middle)
    const bones: Record<SuitBone, [Object3D, number]> = {
      head: [skin.head, 0], body: [skin.body, 6], right_arm: [skin.rightArm, 0], left_arm: [skin.leftArm, 0], right_leg: [skin.rightLeg, 0], left_leg: [skin.leftLeg, 0],
    };
    const material = new MeshStandardMaterial({ map: this.texture(`${this.pictures}${suit.id}.png`), transparent: true, alphaTest: 0.1, side: DoubleSide });
    const { uv, slimUv } = suitLayout(suit);
    const byBone = new Map<SuitBone, [SuitBox, [number, number]][]>();
    suit.boxes.forEach((b, i) => {
      if ((back && (suitPart(b) === 'back' || suitPart(b) === 'tail')) || (tail && suitPart(b) === 'tail')) return;
      const box: [SuitBox, [number, number]] = slim && slimUv[i] ? [slimSuitBox(b), slimUv[i]!] : [b, uv[i]];
      byBone.set(b.bone, [...(byBone.get(b.bone) ?? []), box]);
    });
    for (const [bone, boxes] of byBone) {
      const pos: number[] = [], uvs: number[] = [], index: number[] = [];
      for (const [box, at] of boxes) for (const q of boxQuads(box, at, SUIT_TEXTURE)) {
        const base = pos.length / 3;
        for (const c of q.corners) {
          pos.push(c[0], c[1], c[2]);
          uvs.push(c[3], 1 - c[4]);
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, material);
      // the game's model space points y down and faces -z
      const holder = new Group();
      holder.scale.set(1, -1, -1);
      holder.position.y = bones[bone][1];
      holder.add(mesh);
      bones[bone][0].add(holder);
      this.meshes.push({ mesh, holder });
    }
  }

  private clear() {
    const materials = new Set<MeshStandardMaterial>();
    for (const m of this.meshes) {
      m.holder.parent?.remove(m.holder);
      m.mesh.geometry.dispose();
      materials.add(m.mesh.material as MeshStandardMaterial);
    }
    for (const m of materials) m.dispose();
    this.meshes = [];
  }

  dispose() {
    this.made = '';
    this.clear();
  }
}
