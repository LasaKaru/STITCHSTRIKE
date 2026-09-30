import { PLAYER } from './constants.ts';
import type { Box, Vec3 } from './world.ts';

/** Slab test. Returns entry distance along the (normalised) ray, or Infinity. */
export function rayBox(o: Vec3, d: Vec3, min: readonly number[], max: readonly number[], maxT: number): number {
  let tmin = 0;
  let tmax = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
      continue;
    }
    const inv = 1 / d[a];
    let t0 = (min[a] - o[a]) * inv;
    let t1 = (max[a] - o[a]) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function rayWorld(o: Vec3, d: Vec3, boxes: Box[], maxT: number): number {
  let best = maxT;
  for (const b of boxes) {
    const t = rayBox(o, d, b.min, b.max, best);
    if (t < best) best = t;
  }
  return best;
}

/** Players are hit-tested as an upright box matching their collision volume. */
export function rayPlayer(o: Vec3, d: Vec3, p: { x: number; y: number; z: number }, maxT: number): number {
  const r = PLAYER.radius;
  return rayBox(o, d, [p.x - r, p.y, p.z - r], [p.x + r, p.y + PLAYER.height, p.z + r], maxT);
}

export function hasLineOfSight(a: Vec3, b: Vec3, boxes: Box[]): boolean {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return true;
  d[0] /= len; d[1] /= len; d[2] /= len;
  return rayWorld(a, d, boxes, len) >= len - 1e-4;
}
