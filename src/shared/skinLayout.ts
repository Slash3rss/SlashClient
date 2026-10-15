/**
 * Where each body part lives on a 64×64 Minecraft skin. Every part is a box unfolded
 * the same way: top and bottom in the first row, then right, front, left and back.
 */

export type Face = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back';
export interface SkinRegion { part: string; face: Face; outer: boolean; x: number; y: number; w: number; h: number }

/** The six faces of a box of `w`×`h`×`d` pixels whose texture starts at (x, y). */
export function boxFaces(x: number, y: number, w: number, h: number, d: number): Record<Face, { x: number; y: number; w: number; h: number }> {
  return {
    top: { x: x + d, y, w, h: d },
    bottom: { x: x + d + w, y, w, h: d },
    right: { x, y: y + d, w: d, h },
    front: { x: x + d, y: y + d, w, h },
    left: { x: x + d + w, y: y + d, w: d, h },
    back: { x: x + 2 * d + w, y: y + d, w, h },
  };
}

/** Parts as [name, inner layer origin, outer layer origin, width, height, depth]. Arms are 3 px wide on slim (Alex) skins. */
function parts(slim: boolean): [string, [number, number], [number, number], number, number, number][] {
  const arm = slim ? 3 : 4;
  return [
    ['Głowa', [0, 0], [32, 0], 8, 8, 8],
    ['Tułów', [16, 16], [16, 32], 8, 12, 4],
    ['Prawa ręka', [40, 16], [40, 32], arm, 12, 4],
    ['Lewa ręka', [32, 48], [48, 48], arm, 12, 4],
    ['Prawa noga', [0, 16], [0, 32], 4, 12, 4],
    ['Lewa noga', [16, 48], [0, 48], 4, 12, 4],
  ];
}

export function skinRegions(slim: boolean): SkinRegion[] {
  const out: SkinRegion[] = [];
  for (const [part, inner, outer, w, h, d] of parts(slim)) {
    for (const [origin, isOuter] of [[inner, false], [outer, true]] as const) {
      for (const [face, r] of Object.entries(boxFaces(origin[0], origin[1], w, h, d))) out.push({ part, face: face as Face, outer: isOuter, ...r });
    }
  }
  return out;
}

/** The region under a pixel, or undefined for the unused parts of the texture. */
export function regionAt(regions: SkinRegion[], x: number, y: number): SkinRegion | undefined {
  return regions.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

/**
 * Turns a legacy 64×32 skin (RGBA, 64 px wide) into a 64×64 one: the left arm and leg
 * did not exist then, so they become mirror images of the right ones, as the game does.
 */
export function upgradeLegacySkin(legacy: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(64 * 64 * 4));
  out.set(legacy.subarray(0, 64 * 32 * 4));
  const copy = (sx: number, sy: number, dx: number, dy: number, w: number, h: number) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const from = ((sy + y) * 64 + sx + (w - 1 - x)) * 4;
        out.set(legacy.subarray(from, from + 4), ((dy + y) * 64 + dx + x) * 4);
      }
    }
  };
  for (const [src, dst] of [[[0, 16], [16, 48]], [[40, 16], [32, 48]]] as const) {
    const a = boxFaces(src[0], src[1], 4, 12, 4);
    const b = boxFaces(dst[0], dst[1], 4, 12, 4);
    // mirrored: the outer side (right) becomes the outer side of the other limb (left)
    const pairs: [Face, Face][] = [['top', 'top'], ['bottom', 'bottom'], ['front', 'front'], ['back', 'back'], ['right', 'left'], ['left', 'right']];
    for (const [f, g] of pairs) copy(a[f].x, a[f].y, b[g].x, b[g].y, a[f].w, a[f].h);
  }
  return out;
}

/**
 * Pixels connected to (x, y) inside the same face with exactly the same colour, for the
 * fill bucket. Staying inside one face keeps a fill from leaking onto other body parts.
 */
export function floodRegion(pixels: Uint8ClampedArray, region: SkinRegion, x: number, y: number): number[] {
  const at = (px: number, py: number) => (py * 64 + px) * 4;
  const start = at(x, y);
  const target = pixels.slice(start, start + 4);
  const same = (i: number) => pixels[i] === target[0] && pixels[i + 1] === target[1] && pixels[i + 2] === target[2] && pixels[i + 3] === target[3];
  const seen = new Set<number>();
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < region.x || py < region.y || px >= region.x + region.w || py >= region.y + region.h) continue;
    const i = at(px, py);
    if (seen.has(i) || !same(i)) continue;
    seen.add(i);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return [...seen];
}
