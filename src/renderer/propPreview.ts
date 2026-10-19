import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, Texture, type Object3D } from 'three';
import { HOLD, propItem, propLayout, propModel, propPose, propQuads, wheelTurn, type PropPart } from '../shared/props';
import type { SkinViewer } from 'skinview3d';

/**
 * A prop (src/shared/props.ts) in the skin preview: the wheelbarrow in front of the figure, its
 * grips in the figure's hands (both arms held forwards and down whatever the animation does),
 * the wheel on the ground. `walking` walks the figure on the spot, the wheel rolling with it, seen
 * from the side and a little from the front (the viewer stops turning and zooms out to fit it).
 * The figure's own model space: the SkinObject's origin is the neck, y up, the face towards +z;
 * the game's (y down, the face towards -z) is the same turned round x.
 */
/** The figure's turn while walking with its prop: from the side, a little from the front. */
const TURN = 1.05;

export class PropPreview {
  private holder?: Group;
  private wheel?: Object3D;
  private prop?: Object3D;
  private id = '';
  private material?: MeshStandardMaterial;
  private time = 0;
  private walk = false;
  /** How the viewer was before the prop's own view (turned and zoomed out for `walking`). */
  private before?: { autoRotate: boolean; zoom: number; turn: number };
  private readonly render: () => void;

  /** `base` is where the props' pictures are (<id>.png). */
  constructor(private viewer: SkinViewer, private base = 'img/props/') {
    // after the viewer's animation posed the figure and right before it is drawn: the arms hold the grips
    const draw = viewer.render.bind(viewer);
    this.render = draw;
    viewer.render = () => {
      this.pose();
      draw();
    };
  }

  get walking(): boolean {
    return this.walk;
  }

  set walking(on: boolean) {
    if (on === this.walk) return;
    this.walk = on;
    const v = this.viewer;
    if (on) {
      this.before = { autoRotate: v.autoRotate, zoom: v.zoom, turn: v.playerWrapper.rotation.y };
      v.autoRotate = false;
      v.playerWrapper.rotation.y = TURN;
      // the figure and the prop (13 pixels further on, in the middle) centred together
      v.playerWrapper.position.set(-Math.sin(TURN) * 13, 0, -Math.cos(TURN) * 13);
      v.zoom = Math.min(v.zoom, 0.62);
    } else if (this.before) {
      v.autoRotate = this.before.autoRotate;
      v.zoom = this.before.zoom;
      v.playerWrapper.rotation.y = this.before.turn;
      v.playerWrapper.position.set(0, 0, 0);
      this.before = undefined;
    }
  }

  /** Puts a prop in front of the figure ('' or undefined: none). */
  show(id?: string) {
    const item = id ? propItem(id) : undefined;
    if ((item?.id ?? '') === this.id) return;
    this.clear();
    if (!item) return;
    this.id = item.id;
    const texture = new Texture();
    const img = new Image();
    img.onload = () => {
      texture.image = img;
      texture.needsUpdate = true;
    };
    img.src = `${this.base}${item.id}.png`;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.colorSpace = SRGBColorSpace;
    this.material = new MeshStandardMaterial({ map: texture, alphaTest: 0.1, side: DoubleSide });
    const model = propModel(item);
    const uvs = propLayout(model);
    let n = 0;
    const build = (part: PropPart): Group => {
      const g = new Group();
      const [x, y, z, rx, ry, rz] = part.pose ?? [0, 0, 0, 0, 0, 0];
      g.position.set(x, y, z);
      g.rotation.set(rx, ry, rz, 'ZYX');
      if (part.boxes?.length) {
        const pos: number[] = [], uv: number[] = [], index: number[] = [];
        for (const b of part.boxes) for (const q of propQuads(b, uvs[n++])) {
          const at = pos.length / 3;
          for (const c of q.corners) {
            pos.push(c[0], c[1], c[2]);
            uv.push(c[3], 1 - c[4]);
          }
          index.push(at, at + 1, at + 2, at, at + 2, at + 3);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        g.add(new Mesh(geometry, this.material));
      }
      if (part.name === 'wheel') this.wheel = g;
      for (const c of part.children ?? []) g.add(build(c));
      return g;
    };
    this.prop = build(model);
    this.holder = new Group();
    this.holder.scale.set(1, -1, -1);
    this.holder.add(this.prop);
    this.viewer.playerObject.skin.add(this.holder);
  }

  private clear() {
    if (this.holder) {
      // the arms and legs the animation's again
      const skin = this.viewer.playerObject.skin;
      for (const limb of [skin.rightArm, skin.leftArm, skin.rightLeg, skin.leftLeg]) limb.rotation.x = 0;
      this.holder.parent?.remove(this.holder);
      this.holder.traverse((o) => { if (o instanceof Mesh) o.geometry.dispose(); });
    }
    this.material?.map?.dispose();
    this.material?.dispose();
    this.holder = this.prop = this.wheel = this.material = undefined;
    this.id = '';
  }

  /** Once a frame, before drawing: the arms on the grips, the legs walking, the prop placed. */
  private pose() {
    if (!this.prop) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (this.time || now));
    this.time = now;
    const skin = this.viewer.playerObject.skin;
    skin.rightArm.rotation.set(HOLD, 0, 0);
    skin.leftArm.rotation.set(HOLD, 0, 0);
    // the game's walk counts four a block, about 12 a second at a walk; the legs swing with it
    if (this.walk) this.walked += dt * 12;
    if (this.walk) {
      const swing = Math.sin(this.walked * 0.6662) * 0.7;
      skin.rightLeg.rotation.x = swing;
      skin.leftLeg.rotation.x = -swing;
    }
    // the shoulders are 2 pixels under the neck (in the game's space, y down)
    const p = propPose(-skin.rightArm.position.y, -skin.rightArm.position.z, HOLD);
    this.prop.position.set(0, p.y, p.z);
    this.prop.rotation.set(p.pitch, 0, 0, 'ZYX');
    if (this.wheel) this.wheel.rotation.x = wheelTurn(this.walked / 4);
  }
  private walked = 0;

  dispose() {
    this.walking = false;
    this.clear();
    this.viewer.render = this.render;
  }
}
