/**
 * Signed-distance sculpting for organic figures. Characters are described as
 * smooth unions of anatomical primitives (ellipsoids, tapered limbs, boxes)
 * and meshed with a sparse Surface Nets pass. No model files required.
 */

export type V3 = [number, number, number];

export interface Prim {
  /** Signed distance at a point (negative inside). */
  d(x: number, y: number, z: number): number;
  min: V3;
  max: V3;
  /** Bone the surface of this primitive follows. */
  bone: string;
  /** Material region (e.g. 'skin', 'jacket', 'boots'). */
  region: string;
  /** Smooth-union blend radius. */
  k: number;
  /** Carve instead of add (eye sockets, mouth). */
  sub?: boolean;
}

export interface PrimOpts { bone: string; region: string; k?: number; sub?: boolean }

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

/** 3x3 rotation (row-major) that maps world offsets into a primitive's local frame. */
export type M3 = [number, number, number, number, number, number, number, number, number];

export function rotXYZ(rx: number, ry: number, rz: number): M3 {
  // Local = R^T * world, where R = Rz * Ry * Rx; we store R^T.
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
  const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
  return [r00, r10, r20, r01, r11, r21, r02, r12, r22];
}

function apply(m: M3 | undefined, x: number, y: number, z: number): V3 {
  if (!m) return [x, y, z];
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

function box(c: V3, r: number): { min: V3; max: V3 } {
  return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] };
}

export function sphere(c: V3, r: number, o: PrimOpts): Prim {
  return { ...box(c, r), ...o, k: o.k ?? 0.02, d: (x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r };
}

/** Ellipsoid (IQ's bound), optionally rotated. */
export function ellipsoid(c: V3, r: V3, o: PrimOpts, rot?: M3): Prim {
  const m = Math.max(r[0], r[1], r[2]);
  return {
    ...box(c, m), ...o, k: o.k ?? 0.02,
    d: (x, y, z) => {
      const [px, py, pz] = apply(rot, x - c[0], y - c[1], z - c[2]);
      const k0 = len3(px / r[0], py / r[1], pz / r[2]);
      const k1 = len3(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
    },
  };
}

/** Tapered limb between two points (IQ's round cone). */
export function limb(a: V3, b: V3, ra: number, rb: number, o: PrimOpts): Prim {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const m = Math.max(ra, rb);
  return {
    min: [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m],
    max: [Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m],
    ...o, k: o.k ?? 0.02,
    d: (x, y, z) => {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yv = pax * bax + pay * bay + paz * baz;
      const zv = yv - l2;
      const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * l2;
      const z2 = zv * zv * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - ra;
    },
  };
}

export function roundBox(c: V3, half: V3, radius: number, o: PrimOpts, rot?: M3): Prim {
  const m = len3(half[0], half[1], half[2]) + radius;
  return {
    ...box(c, m), ...o, k: o.k ?? 0.015,
    d: (x, y, z) => {
      const [px, py, pz] = apply(rot, x - c[0], y - c[1], z - c[2]);
      const qx = Math.abs(px) - half[0], qy = Math.abs(py) - half[1], qz = Math.abs(pz) - half[2];
      const out = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return out + Math.min(Math.max(qx, qy, qz), 0) - radius;
    },
  };
}

/** Torus around the local Y axis; scale stretches the ring into an ellipse (belts, collars, cuffs). */
export function torus(c: V3, R: number, r: number, o: PrimOpts, rot?: M3, sx = 1, sz = 1): Prim {
  const m = R * Math.max(sx, sz) + r;
  return {
    ...box(c, m), ...o, k: o.k ?? 0.01,
    d: (x, y, z) => {
      const [px, py, pz] = apply(rot, x - c[0], y - c[1], z - c[2]);
      const qx = Math.hypot(px / sx, pz / sz) - R;
      return Math.hypot(qx, py) - r;
    },
  };
}

// ---------------------------------------------------------------- evaluation

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function evalSDF(prims: Prim[], x: number, y: number, z: number): number {
  let d = 1e9;
  for (const p of prims) if (!p.sub) d = smin(d, p.d(x, y, z), p.k);
  for (const p of prims) if (p.sub) d = smax(d, -p.d(x, y, z), p.k);
  return d;
}

/** Index of the additive primitive whose surface is closest (region/bone owner). */
export function ownerOf(prims: Prim[], x: number, y: number, z: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < prims.length; i++) {
    if (prims[i].sub) continue;
    const d = prims[i].d(x, y, z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- meshing

export interface SDFMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** Owning primitive index per vertex (into the input prims array). */
  owner: Int32Array;
}

/**
 * Sparse Surface Nets. A coarse pass finds blocks near the surface; only those
 * are sampled finely. Vertices are then projected onto the true surface and
 * given analytic-gradient normals, which keeps silhouettes smooth.
 */
export function meshSDF(allPrims: Prim[], cell: number, pad = 0.04): SDFMesh {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of allPrims) {
    if (p.sub) continue;
    for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.min[a]); max[a] = Math.max(max[a], p.max[a]); }
  }
  for (let a = 0; a < 3; a++) { min[a] -= pad; max[a] += pad; }
  const B = 4; // fine cells per coarse block
  const C = cell * B;
  const nb = [0, 1, 2].map((a) => Math.ceil((max[a] - min[a]) / C)) as V3;
  const n = nb.map((v) => v * B) as V3; // fine cells per axis
  const np = n.map((v) => v + 1) as V3; // fine points per axis
  const pidx = (i: number, j: number, k: number) => (k * np[1] + j) * np[0] + i;

  // Candidate primitives per block (AABB overlap with margin).
  const margin = C * 1.5;
  const blockCands: Prim[][] = [];
  const blockActive = new Uint8Array(nb[0] * nb[1] * nb[2]);
  const blockSign = new Int8Array(nb[0] * nb[1] * nb[2]);
  const bidx = (i: number, j: number, k: number) => (k * nb[1] + j) * nb[0] + i;
  for (let bk = 0; bk < nb[2]; bk++) for (let bj = 0; bj < nb[1]; bj++) for (let bi = 0; bi < nb[0]; bi++) {
    const lo: V3 = [min[0] + bi * C, min[1] + bj * C, min[2] + bk * C];
    const cands = allPrims.filter((p) =>
      p.max[0] + p.k + margin > lo[0] && p.min[0] - p.k - margin < lo[0] + C &&
      p.max[1] + p.k + margin > lo[1] && p.min[1] - p.k - margin < lo[1] + C &&
      p.max[2] + p.k + margin > lo[2] && p.min[2] - p.k - margin < lo[2] + C);
    const b = bidx(bi, bj, bk);
    blockCands[b] = cands;
    const hasAdd = cands.some((p) => !p.sub);
    const d = hasAdd ? evalSDF(cands, lo[0] + C / 2, lo[1] + C / 2, lo[2] + C / 2) : 1e9;
    blockSign[b] = d < 0 ? -1 : 1;
    blockActive[b] = Math.abs(d) < C * 1.3 ? 1 : 0;
  }

  // Fine samples: exact inside active blocks, sign of the block elsewhere.
  const vals = new Float32Array(np[0] * np[1] * np[2]);
  const evaluated = new Uint8Array(vals.length);
  for (let k = 0; k < np[2]; k++) for (let j = 0; j < np[1]; j++) for (let i = 0; i < np[0]; i++) {
    const b = bidx(Math.min(nb[0] - 1, Math.floor(i / B)), Math.min(nb[1] - 1, Math.floor(j / B)), Math.min(nb[2] - 1, Math.floor(k / B)));
    vals[pidx(i, j, k)] = blockSign[b] * 1e3;
  }
  for (let bk = 0; bk < nb[2]; bk++) for (let bj = 0; bj < nb[1]; bj++) for (let bi = 0; bi < nb[0]; bi++) {
    const b = bidx(bi, bj, bk);
    if (!blockActive[b]) continue;
    const cands = blockCands[b];
    for (let k = bk * B; k <= bk * B + B; k++) for (let j = bj * B; j <= bj * B + B; j++) for (let i = bi * B; i <= bi * B + B; i++) {
      const p = pidx(i, j, k);
      if (evaluated[p]) continue;
      evaluated[p] = 1;
      vals[p] = evalSDF(cands, min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
    }
  }

  // One vertex per sign-changing cell.
  const cidx = (i: number, j: number, k: number) => (k * n[1] + j) * n[0] + i;
  const cellVert = new Int32Array(n[0] * n[1] * n[2]).fill(-1);
  const pos: number[] = [];
  const corners: V3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  const activeCells: number[] = [];
  for (let bk = 0; bk < nb[2]; bk++) for (let bj = 0; bj < nb[1]; bj++) for (let bi = 0; bi < nb[0]; bi++) {
    if (!blockActive[bidx(bi, bj, bk)]) continue;
    for (let k = bk * B; k < bk * B + B; k++) for (let j = bj * B; j < bj * B + B; j++) for (let i = bi * B; i < bi * B + B; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        cv[c] = vals[pidx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
        if (cv[c] < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [e0, e1] of edges) {
        const a = cv[e0], b = cv[e1];
        if ((a < 0) === (b < 0)) continue;
        const t = a / (a - b);
        sx += corners[e0][0] + (corners[e1][0] - corners[e0][0]) * t;
        sy += corners[e0][1] + (corners[e1][1] - corners[e0][1]) * t;
        sz += corners[e0][2] + (corners[e1][2] - corners[e0][2]) * t;
        cnt++;
      }
      cellVert[cidx(i, j, k)] = pos.length / 3;
      pos.push(min[0] + (i + sx / cnt) * cell, min[1] + (j + sy / cnt) * cell, min[2] + (k + sz / cnt) * cell);
      activeCells.push(i, j, k);
    }
  }

  // Quads across every sign-changing grid edge.
  const idx: number[] = [];
  for (let q = 0; q < activeCells.length; q += 3) {
    const i = activeCells[q], j = activeCells[q + 1], k = activeCells[q + 2];
    const v0 = vals[pidx(i, j, k)];
    for (let axis = 0; axis < 3; axis++) {
      const di = axis === 0 ? 1 : 0, dj = axis === 1 ? 1 : 0, dk = axis === 2 ? 1 : 0;
      const v1 = vals[pidx(i + di, j + dj, k + dk)];
      if ((v0 < 0) === (v1 < 0)) continue;
      // The 4 cells around this edge.
      let c1: number, c2: number, c3: number;
      if (axis === 0) { if (j < 1 || k < 1) continue; c1 = cidx(i, j - 1, k); c2 = cidx(i, j - 1, k - 1); c3 = cidx(i, j, k - 1); }
      else if (axis === 1) { if (i < 1 || k < 1) continue; c1 = cidx(i, j, k - 1); c2 = cidx(i - 1, j, k - 1); c3 = cidx(i - 1, j, k); }
      else { if (i < 1 || j < 1) continue; c1 = cidx(i - 1, j, k); c2 = cidx(i - 1, j - 1, k); c3 = cidx(i, j - 1, k); }
      const a = cellVert[cidx(i, j, k)], b = cellVert[c1], c = cellVert[c2], d = cellVert[c3];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      // Counter-clockwise seen from outside, so three.js front faces point out.
      if (v0 < 0) idx.push(a, b, c, a, c, d);
      else idx.push(a, d, c, a, c, b);
    }
  }

  // Project onto the surface and take analytic normals.
  const vcount = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(vcount * 3);
  const owner = new Int32Array(vcount);
  const h = cell * 0.25;
  for (let v = 0; v < vcount; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const b = bidx(
      Math.min(nb[0] - 1, Math.max(0, Math.floor((x - min[0]) / C))),
      Math.min(nb[1] - 1, Math.max(0, Math.floor((y - min[1]) / C))),
      Math.min(nb[2] - 1, Math.max(0, Math.floor((z - min[2]) / C))),
    );
    const cands = blockCands[b];
    let gx = 0, gy = 0, gz = 1;
    for (let it = 0; it < 3; it++) {
      const d = evalSDF(cands, x, y, z);
      gx = evalSDF(cands, x + h, y, z) - evalSDF(cands, x - h, y, z);
      gy = evalSDF(cands, x, y + h, z) - evalSDF(cands, x, y - h, z);
      gz = evalSDF(cands, x, y, z + h) - evalSDF(cands, x, y, z - h);
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (it === 2) break;
      // Don't let a vertex wander outside its cell neighbourhood.
      const step = Math.max(-cell, Math.min(cell, d));
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    normals[v * 3] = gx; normals[v * 3 + 1] = gy; normals[v * 3 + 2] = gz;
    const o = ownerOf(cands, x, y, z);
    owner[v] = o >= 0 ? allPrims.indexOf(cands[o]) : 0;
  }
  return { positions, normals, indices: new Uint32Array(idx), owner };
}
