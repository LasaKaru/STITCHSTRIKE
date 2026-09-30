import * as THREE from 'three';

/**
 * Procedural, tileable stitch maps (plan §13.3 layer 1). Each pattern is a
 * height field evaluated per pixel, turned into:
 *   normal: tangent-space normal map
 *   detail: R = cavity AO, G = per-stitch random (hand-dyed tint), B = fibre noise, A = height
 * Generated once at startup, so no texture files are needed for Phase 0.
 */

export type StitchPattern = 'stocking' | 'rib' | 'garter' | 'crochet' | 'felt' | 'wound';

export interface StitchMaps {
  normal: THREE.DataTexture;
  detail: THREE.DataTexture;
  /** Stitches across and up one tile, to convert a world density into a texture repeat. */
  cols: number;
  rows: number;
}

const SIZE = 512;

function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise with integer period. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const w = (a: number) => ((a % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, period * f, seed + i);
    amp *= 0.5;
    f *= 2;
  }
  return sum;
}

interface Sample { h: number; cell: number }

/** A round strand of yarn along segment a->b: height profile plus a plied twist. */
function strand(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number, twist: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  const d = Math.hypot(cx, cy);
  if (d >= r) return 0;
  const profile = Math.sqrt(1 - (d / r) * (d / r));
  const len = Math.sqrt(len2);
  // Signed distance across the strand, so the ply lines run diagonally.
  const across = (cx * dy - cy * dx) / len;
  const ply = 0.5 + 0.5 * Math.sin(((t * len) / (r * 0.8) + (across / r) * 1.3) * Math.PI * twist);
  return profile * (0.86 + 0.14 * ply);
}

/** Knit "V": two slanted legs meeting at the bottom of the cell, overlapping the next row. */
function knitV(px: number, py: number, w: number, h: number, r: number, lift: number): number {
  const left = strand(px, py, w * 0.5, -h * 0.12, w * 0.1, h * 1.08, r, 1);
  const right = strand(px, py, w * 0.5, -h * 0.12, w * 0.9, h * 1.08, r, 1);
  const shape = Math.max(left, right);
  // Legs rise toward the top where they pass over the row above.
  return shape * (0.78 + 0.22 * Math.max(0, Math.min(1, py / h))) * lift;
}

/** Horizontal purl bump. */
function purl(px: number, py: number, w: number, h: number, r: number): number {
  return strand(px, py, w * 0.05, h * 0.5, w * 0.95, h * 0.55, r, 1.5);
}

type CellFn = (px: number, py: number, cx: number, cy: number, w: number, h: number) => number;

function sampleCells(x: number, y: number, cols: number, rows: number, fn: CellFn, rowOffset = 0): Sample {
  const w = SIZE / cols, h = SIZE / rows;
  const cyBase = Math.floor(y / h);
  let best = 0;
  let cell = 0;
  // Neighbouring cells can overlap into this pixel, so test a 3x3 block.
  for (let oy = -1; oy <= 1; oy++) {
    const cy = cyBase + oy;
    const shift = (((cy % 2) + 2) % 2) * rowOffset * w;
    const cxBase = Math.floor((x - shift) / w);
    for (let ox = -1; ox <= 1; ox++) {
      const cx = cxBase + ox;
      const px = x - shift - cx * w;
      const py = y - cy * h;
      const v = fn(px, py, cx, cy, w, h);
      if (v > best) {
        best = v;
        cell = hash2(((cx % cols) + cols) % cols, ((cy % rows) + rows) % rows, 7);
      }
    }
  }
  return { h: best, cell };
}

interface PatternDef { cols: number; rows: number; sample(x: number, y: number): Sample }

const PATTERNS: Record<StitchPattern, PatternDef> = {
  // Small tiles (4-6 stitches) keep the integer UV repeat fine-grained, so a target
  // stitch density lands within one stitch on any size of part.
  stocking: {
    cols: 4, rows: 5,
    sample: (x, y) => sampleCells(x, y, 4, 5, (px, py, _cx, _cy, w, h) => knitV(px, py, w, h, w * 0.25, 1)),
  },
  rib: {
    cols: 4, rows: 5,
    sample: (x, y) => sampleCells(x, y, 4, 5, (px, py, cx, _cy, w, h) =>
      (((cx % 2) + 2) % 2 === 0 ? knitV(px, py, w, h, w * 0.27, 1) : purl(px, py, w, h, h * 0.24) * 0.45)),
  },
  garter: {
    cols: 4, rows: 6,
    sample: (x, y) => sampleCells(x, y, 4, 6, (px, py, _cx, cy, w, h) =>
      (((cy % 2) + 2) % 2 === 0 ? purl(px, py, w, h, h * 0.4) : knitV(px, py, w, h, w * 0.2, 0.6)), 0.5),
  },
  crochet: {
    cols: 4, rows: 4,
    sample: (x, y) => sampleCells(x, y, 4, 4, (px, py, _cx, _cy, w, h) => {
      // Single crochet: a short fat V under a horizontal top loop, packed tight.
      const v = knitV(px, py * 1.2, w, h, w * 0.27, 0.95);
      const loop = strand(px, py, w * 0.05, h * 0.84, w * 0.95, h * 0.84, h * 0.2, 1.5) * 0.85;
      return Math.max(v, loop);
    }, 0.5),
  },
  felt: {
    cols: 1, rows: 1,
    sample: (x, y) => ({ h: 0.35 + 0.65 * fbm(x / 32, y / 32, SIZE / 32, 3, 5), cell: 0.5 }),
  },
  wound: {
    cols: 24, rows: 24,
    sample: (x, y) => {
      // Three families of wound strands on integer lattice directions (so the tile wraps);
      // low-frequency noise picks which family lies on top.
      let best = 0;
      const families: [number, number, number][] = [[1, 3, 8], [2, -1, 11], [1, 1, 17]];
      families.forEach(([p, q, k], i) => {
        const f = ((((k * (p * x + q * y)) / SIZE) % 1) + 1) % 1;
        const d = Math.abs(f - 0.5) * 2;
        const strandH = Math.sqrt(Math.max(0, 1 - d * d));
        const layer = valueNoise(x / 64, y / 64, SIZE / 64, 11 + i);
        best = Math.max(best, strandH * (0.55 + 0.45 * layer));
      });
      return { h: best, cell: valueNoise(x / 32, y / 32, SIZE / 32, 5) };
    },
  },
};

function makeTexture(data: Uint8Array): THREE.DataTexture {
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<StitchPattern, StitchMaps>();

export function getStitchMaps(pattern: StitchPattern): StitchMaps {
  const hit = cache.get(pattern);
  if (hit) return hit;
  const def = PATTERNS[pattern];
  const height = new Float32Array(SIZE * SIZE);
  const cells = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = def.sample(x + 0.5, y + 0.5);
      // Fine fibre grain on top of the yarn shape.
      const grain = (valueNoise(x / 2, y / 2, SIZE / 2, 21) - 0.5) * 0.06;
      height[y * SIZE + x] = Math.max(0, s.h + grain * s.h);
      cells[y * SIZE + x] = s.cell;
    }
  }

  const normal = new Uint8Array(SIZE * SIZE * 4);
  const detail = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => height[(((y + SIZE) % SIZE) * SIZE) + ((x + SIZE) % SIZE)];
  const strength = pattern === 'felt' ? 3 : 6;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Sobel gradient with wrap-around so the tile stays seamless.
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -gx * strength / 8, ny = -gy * strength / 8, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * SIZE + x) * 4;
      normal[i] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;

      const h = height[y * SIZE + x];
      const ao = 0.35 + 0.65 * smooth(Math.min(1, h / 0.7));
      detail[i] = Math.round(ao * 255);
      detail[i + 1] = Math.round(cells[y * SIZE + x] * 255);
      detail[i + 2] = Math.round(hash2(x, y, 99) * 255);
      detail[i + 3] = Math.round(Math.min(1, h) * 255);
    }
  }

  const maps: StitchMaps = { normal: makeTexture(normal), detail: makeTexture(detail), cols: def.cols, rows: def.rows };
  cache.set(pattern, maps);
  return maps;
}

let fibreTex: THREE.DataTexture | null = null;

/** Per-texel random strand heights for shell fuzz (classic fur technique). */
export function getFibreTexture(): THREE.DataTexture {
  if (fibreTex) return fibreTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = hash2(i % N, Math.floor(i / N), 5);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  }
  fibreTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  fibreTex.wrapS = fibreTex.wrapT = THREE.RepeatWrapping;
  fibreTex.magFilter = THREE.NearestFilter;
  fibreTex.minFilter = THREE.NearestFilter;
  fibreTex.needsUpdate = true;
  return fibreTex;
}
