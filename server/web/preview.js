// The 3D figure of the site's cosmetics, the launcher's own: the player's skin (or ours) with the
// cape, wings or elytra on its back, the trail, aura and pet from the game's pictures and models,
// the clothing, shoes and things on the hands, face and ears (/vendor/clothing), the suits (/vendor/suits), the held
// shield and weapon (/vendor/held), the back item and tail (/vendor/gear), the ring (/vendor/rings) and the prop pushed
// in front (/vendor/props), the leaf auras' leaves (/vendor/particles).
// The code is the launcher's, bundled as /vendor/preview3d.js (window.SlashPreview); the game's
// pictures are in /vendor/mc (listed in index.json).

/** Whether animations are off: "Animacje: wył." in the footer (siteBanner.js), or the system's reduced motion. */
const still = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Capes drawn as a loop of frames (vendor/capes/<id>_<n>.png), as in the game. */
const ANIMATED = new Map([
  ...['aurora', 'inferno', 'waves', 'pulse', 'matrix', 'storm', 'vortex', 'starfall', 'skyup_chmury'].map((id) => [id, 8]),
  // the ranks' capes: a light sweeping across the logo
  ...['staff_admin', 'staff_support', 'staff_partner', 'staff_friend', 'staff_friend_pink'].map((id) => [id, 16]),
]);

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
    const icon = lib.cosmeticIcon(pictures, id, '/vendor/particles/');
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
    // "Animacje: wył." (siteBanner.js) or the system's reduced motion: the figure stands still, now and when switched
    const applyMotion = () => {
      this.viewer.autoRotate = !still();
      if (this.viewer.animation) this.viewer.animation.paused = still();
    };
    addEventListener('slashclient-motion', applyMotion);
    applyMotion();
    this.viewer.autoRotateSpeed = 0.6;
    this.viewer.controls.enableZoom = false;
    this.cosmetics = new lib.CosmeticPreview(this.viewer, pictures, '/vendor/clothing/', '/vendor/pets/', '/vendor/suits/', '/vendor/held/', '/vendor/gear/', '/vendor/rings/', '/vendor/props/', '/vendor/particles/');
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

  /** What the figure wears: { cape, wings, elytra, trail, aura, pet, hat, top, kill, suit, shield, weapon, shoes, hands, face, ears, back, tail, ring, move, prop, walk } (ids or empty; a kill effect plays every few seconds, a movement effect in a loop; a suit hides the hat, the top, the shoes, the hands, the face and the ears; the shield and weapon are held; `walk`: seen from the side, walking with the prop). */
  async show(worn) {
    clearInterval(this.capeTimer);
    this.cosmetics.show(Object.fromEntries(Object.entries(worn).map(([slot, id]) => [slot, id || undefined])));
    // a tall hat (or ears, horns, a suit's crest or plume) stands above the head: the figure a little smaller, so it stays in view
    // (and the prop's own view, from the side, smaller still: the wheelbarrow reaches out in front)
    this.viewer.zoom = worn.walk ? 0.62 : worn.hat || worn.ears || worn.suit ? 0.72 : 0.85;
    // a back item takes the back first (as in the game), then wings, then an elytra, then the cape
    if (worn.back) this.viewer.loadCape(null);
    else if (worn.wings) await this.viewer.loadCape(`/vendor/wings/${worn.wings}.png`, { backEquipment: 'elytra' });
    else if (worn.elytra) await this.viewer.loadCape(`/vendor/elytra/${worn.elytra}.png`, { backEquipment: 'elytra' });
    else if (worn.cape) {
      await this.viewer.loadCape(`/vendor/capes/${worn.cape}.png`, { backEquipment: 'cape' });
      if (ANIMATED.has(worn.cape)) {
        let f = 0;
        const id = worn.cape;
        const frames = ANIMATED.get(id);
        this.capeTimer = setInterval(() => {
          if (!document.hidden && !still()) this.viewer.loadCape(`/vendor/capes/${id}_${f = (f + 1) % frames}.png`, { backEquipment: 'cape' });
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
