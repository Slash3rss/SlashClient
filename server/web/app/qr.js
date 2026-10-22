// A small QR code encoder for the "get it on your phone" page: the app's address as a code the
// phone's camera reads, made here (no outside service sees who opens the page). Byte mode,
// error correction level M, versions 1–10 (up to 213 bytes: plenty for an address).

// per version (1–10), level M: all codewords, error correction codewords per block, blocks
const TOTAL = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---- Reed–Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ----

function mul(a, b) {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r;
}

function divisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = mul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = mul(root, 2);
  }
  return out;
}

function remainder(data, div) {
  const out = new Array(div.length).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    for (let i = 0; i < out.length; i++) out[i] ^= mul(div[i], factor);
  }
  return out;
}

// ---- the codewords: data in byte mode, padded, split in blocks, error correction, interleaved ----

function codewords(bytes, v) {
  const blocks = BLOCKS[v - 1];
  const ecc = ECC[v - 1];
  const capacity = TOTAL[v - 1] - ecc * blocks;
  const bits = [];
  const put = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  const short = Math.floor(TOTAL[v - 1] / blocks) - ecc;
  const shortCount = blocks - (TOTAL[v - 1] % blocks);
  const div = divisor(ecc);
  const dataBlocks = [];
  const eccBlocks = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const length = short + (i < shortCount ? 0 : 1);
    const block = data.slice(at, at + length);
    at += length;
    dataBlocks.push(block);
    eccBlocks.push(remainder(block, div));
  }
  const out = [];
  for (let i = 0; i <= short; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecc; i++) for (const b of eccBlocks) out.push(b[i]);
  return out;
}

// ---- the matrix ----

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(v, words, mask) {
  const size = 17 + 4 * v;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, on) => {
    dark[y][x] = on;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = ALIGN[v - 1];
  const last = align.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      // not over the finder patterns
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // format bits: level M (00) and the mask, BCH(15,5), the fixed XOR
  const format = (() => {
    const data = mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  })();
  const bit = (n, i) => ((n >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(format, i));
  set(8, 7, bit(format, 6));
  set(8, 8, bit(format, 7));
  set(7, 8, bit(format, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(format, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(format, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(format, i));
  set(8, size - 8, true);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(bits, i));
      set(b, a, bit(bits, i));
    }
  }
  // the codewords, two columns at a time in a zigzag from the bottom right, masked
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y][x]) continue;
        const on = i < words.length * 8 && bit(words[i >>> 3], 7 - (i & 7));
        i++;
        dark[y][x] = on !== MASKS[mask](x, y);
      }
    }
  }
  return dark;
}

/** How hard a matrix is to read (the standard's rules for runs, blocks, finder look-alikes and balance). */
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    const s = line.map((d) => (d ? '1' : '0')).join('');
    for (const pattern of ['10111010000', '00001011101']) for (let at = s.indexOf(pattern); at >= 0; at = s.indexOf(pattern, at + 1)) score += 40;
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  const darkCount = m.reduce((n, row) => n + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((darkCount * 20) / (size * size) - 10)) * 10;
  return score;
}

/** The QR code of `text`: rows of booleans (true: dark), without the quiet zone. */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const v = TOTAL.findIndex((total, i) => (total - ECC[i] * BLOCKS[i]) * 8 >= 4 + (i + 1 < 10 ? 8 : 16) + bytes.length * 8) + 1;
  if (!v) throw new Error('too_long');
  const words = codewords(bytes, v);
  let best;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, words, mask);
    const score = penalty(m);
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** The code as an SVG element (one path, with the 4-module quiet zone), `px` wide. */
export function qrSvg(text, px = 220) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => {
    if (on) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  }));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  const back = document.createElementNS(ns, 'rect');
  back.setAttribute('width', String(n));
  back.setAttribute('height', String(n));
  back.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#0a0d14');
  svg.append(back, path);
  return svg;
}
