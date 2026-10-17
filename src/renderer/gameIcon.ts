// Icons for cosmetics from the game's own pictures, shared by the launcher and the website.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The part of a picture that is not transparent: [x, y, width, height]. */
function opaqueBox(img: HTMLImageElement): [number, number, number, number] {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (data[(y * c.width + x) * 4 + 3] < 16) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? [0, 0, c.width, c.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/**
 * A small icon from the game's pictures, pixel-sharp and tinted the way the game tints them (its
 * particles are white): one picture filling it (a spawn egg), or a little cluster of particles.
 */
export function gameIcon(srcs: string[], tint?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-icon';
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // [x, y, size] in the 64×64 icon: one big particle with two smaller ones around it
  const spots = srcs.length === 1 ? [[0, 0, 64]] : [[18, 16, 34], [2, 4, 20], [42, 40, 18]];
  Promise.all(srcs.map((src) => loadImage(src))).then((imgs) => {
    imgs.forEach((img, i) => {
      const [x, y, size] = spots[i] ?? spots[0];
      // only the visible part (a soul is a small wisp in a big picture), as large as fits, by whole pixels
      const [bx, by, bw, bh] = opaqueBox(img);
      const k = Math.max(1, Math.floor(size / Math.max(bw, bh)));
      const w = bw * k, h = bh * k;
      // a picture of its own, tinted, then stamped onto the icon
      const one = document.createElement('canvas');
      one.width = w;
      one.height = h;
      const o = one.getContext('2d')!;
      o.imageSmoothingEnabled = false;
      o.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
      if (tint) {
        o.globalCompositeOperation = 'multiply';
        o.fillStyle = tint;
        o.fillRect(0, 0, w, h);
        o.globalCompositeOperation = 'destination-in';
        o.drawImage(img, bx, by, bw, bh, 0, 0, w, h);
      }
      ctx.drawImage(one, x + Math.floor((size - w) / 2), y + Math.floor((size - h) / 2));
    });
  }).catch(() => undefined);
  return canvas;
}
