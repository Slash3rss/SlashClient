import { Object3D, Sprite, SpriteMaterial, Texture, Vector3 } from 'three';

/**
 * The rocket boots' little flames in the skin preview: the game's flame particle, puffed out under
 * both heels (where their nozzles are) and falling away, as the mod shows them in the game.
 * Units are the model's pixels, like the rest of the preview.
 */
export class RocketFlames {
  private live: { sprite: Sprite; age: number; life: number; vy: number }[] = [];
  private due = 0;
  private at = new Vector3();

  /** `space` holds the flames (they stay where they were made); `feet` are the legs they come from. */
  constructor(private space: Object3D, private texture: () => Texture | undefined) {}

  update(dt: number, feet: Object3D[] | undefined) {
    if (feet) {
      this.due += dt * 16;
      while (this.due >= 1) {
        this.due--;
        const leg = feet[Math.floor(Math.random() * feet.length)];
        const map = this.texture();
        if (!map) break;
        // just under the heel's nozzle: 12 pixels down the leg, a little behind it (the leg's own space: y down from the hip, the back at -z)
        this.at.set((Math.random() - 0.5) * 2, -11.5, -3.2);
        leg.localToWorld(this.at);
        this.space.worldToLocal(this.at);
        const sprite = new Sprite(new SpriteMaterial({ map, transparent: true, alphaTest: 0.05, depthWrite: false }));
        const size = 1 + Math.random() * 0.8;
        sprite.scale.set(size, size, 1);
        sprite.position.copy(this.at);
        this.space.add(sprite);
        this.live.push({ sprite, age: 0, life: 0.25 + Math.random() * 0.2, vy: -10 - Math.random() * 6 });
      }
    } else this.due = 0;
    for (const p of this.live) {
      p.age += dt;
      p.sprite.position.y += p.vy * dt;
      const left = 1 - p.age / p.life;
      p.sprite.scale.setScalar(Math.max(0.2, p.sprite.scale.x * (1 - dt * 2)));
      (p.sprite.material as SpriteMaterial).opacity = Math.min(1, left * 2);
    }
    for (const p of this.live.filter((x) => x.age >= x.life)) {
      this.space.remove(p.sprite);
      (p.sprite.material as SpriteMaterial).dispose();
    }
    this.live = this.live.filter((x) => x.age < x.life);
  }

  dispose() {
    this.update(0, undefined);
    for (const p of this.live) {
      this.space.remove(p.sprite);
      (p.sprite.material as SpriteMaterial).dispose();
    }
    this.live = [];
  }
}
