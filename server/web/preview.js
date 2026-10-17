// The 3D figure of the site's cosmetics, the launcher's own: the player's skin (or ours) with the
// cape, wings or elytra on its back, the trail, aura and pet from the game's pictures and models.
// The code is the launcher's, bundled as /vendor/preview3d.js (window.SlashPreview); the game's
// pictures are in /vendor/mc (listed in index.json).

/** Capes drawn as a loop of frames (vendor/capes/<id>_<n>.png), as in the game. */
const ANIMATED = new Set(['aurora', 'inferno', 'waves', 'pulse', 'matrix', 'storm', 'vortex', 'starfall']);
const FRAMES = 8;

let loading;
/** The launcher's preview code and the game's pictures (path → address). */
export function library() {
  loading ??= Promise.all([
    window.SlashPreview ? Promise.resolve() : new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/preview3d.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    }),
    fetch('/vendor/mc/index.json').then((r) => r.json()).catch(() => []),
  ]).then(([, paths]) => ({ lib: window.SlashPreview, pictures: Object.fromEntries(paths.map((p) => [p, `/vendor/mc/${p}.png`])) }));
  return loading;
}

/** The icon of a trail, aura or pet from the game's pictures, put into `box` once they are here. */
export async function gameIconInto(box, id) {
  try {
    const { lib, pictures } = await library();
    const icon = lib.cosmeticIcon(pictures, id);
    if (icon) box.replaceChildren(lib.gameIcon(icon.srcs, icon.tint));
  } catch {
    // the icon from Font Awesome stays
  }
}

export class Preview {
  /** `box` gets the canvas; `uuid` is a Minecraft account whose skin to show (else ours). */
  static async create(box, { width = 260, height = 340, uuid } = {}) {
    const { lib, pictures } = await library();
    const p = new Preview(lib, pictures, box, width, height);
    await p.skin(uuid);
    return p;
  }

  constructor(lib, pictures, box, width, height) {
    this.box = box;
    const canvas = document.createElement('canvas');
    box.append(canvas);
    this.viewer = new lib.SkinViewer({ canvas, width, height, zoom: 0.85 });
    this.viewer.animation = new lib.IdleAnimation();
    this.viewer.autoRotate = true;
    this.viewer.autoRotateSpeed = 0.6;
    this.viewer.controls.enableZoom = false;
    this.cosmetics = new lib.CosmeticPreview(this.viewer, pictures);
  }

  async skin(uuid) {
    if (uuid) {
      try {
        // asked first for the model (slim arms or not); the picture then comes from the browser's cache
        const url = `/v1/skin/${uuid}`;
        const res = await fetch(url);
        if (res.ok) {
          await this.viewer.loadSkin(url, { model: res.headers.get('x-skin-model') === 'slim' ? 'slim' : 'default' });
          return;
        }
      } catch {
        // our own skin below
      }
    }
    await this.viewer.loadSkin('/vendor/skin-default.png', { model: 'default' });
  }

  /** What the figure wears: { cape, wings, elytra, trail, aura, pet } (ids or empty). */
  async show(worn) {
    clearInterval(this.capeTimer);
    this.cosmetics.show({ trail: worn.trail || undefined, aura: worn.aura || undefined, pet: worn.pet || undefined });
    // wings take the back first (as in the game), then an elytra, then the cape
    if (worn.wings) await this.viewer.loadCape(`/vendor/wings/${worn.wings}.png`, { backEquipment: 'elytra' });
    else if (worn.elytra) await this.viewer.loadCape(`/vendor/elytra/${worn.elytra}.png`, { backEquipment: 'elytra' });
    else if (worn.cape) {
      await this.viewer.loadCape(`/vendor/capes/${worn.cape}.png`, { backEquipment: 'cape' });
      if (ANIMATED.has(worn.cape)) {
        let f = 0;
        const id = worn.cape;
        this.capeTimer = setInterval(() => {
          if (!document.hidden) this.viewer.loadCape(`/vendor/capes/${id}_${f = (f + 1) % FRAMES}.png`, { backEquipment: 'cape' });
        }, 150);
      }
    } else this.viewer.loadCape(null);
  }

  dispose() {
    clearInterval(this.capeTimer);
    this.cosmetics.dispose();
    this.viewer.dispose();
    this.box.replaceChildren();
  }
}
