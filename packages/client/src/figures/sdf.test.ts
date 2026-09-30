import { describe, expect, it } from 'vitest';
import { ellipsoid, evalSDF, limb, meshSDF, sphere } from './sdf.ts';

describe('SDF mesher', () => {
  it('meshes a sphere onto the true surface with outward normals', () => {
    const r = 0.3;
    const prims = [sphere([0.1, 0.2, 0], r, { bone: 'b', region: 'skin' })];
    const m = meshSDF(prims, 0.02);
    expect(m.indices.length).toBeGreaterThan(300);
    let maxErr = 0;
    let badNormals = 0;
    for (let v = 0; v < m.positions.length / 3; v++) {
      const x = m.positions[v * 3] - 0.1, y = m.positions[v * 3 + 1] - 0.2, z = m.positions[v * 3 + 2];
      const l = Math.hypot(x, y, z);
      maxErr = Math.max(maxErr, Math.abs(l - r));
      if (x * m.normals[v * 3] + y * m.normals[v * 3 + 1] + z * m.normals[v * 3 + 2] < 0.95 * l) badNormals++;
    }
    expect(maxErr).toBeLessThan(0.002);
    expect(badNormals).toBe(0);
    // Counter-clockwise winding seen from outside (three.js front faces).
    let inward = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const out = [a[0] - 0.1, a[1] - 0.2, a[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) inward++;
    }
    expect(inward).toBe(0);
  });

  it('produces a closed surface (every edge shared by two triangles)', () => {
    const prims = [
      ellipsoid([0, 0, 0], [0.2, 0.3, 0.15], { bone: 'a', region: 'x' }),
      limb([0, 0.2, 0], [0.3, 0.5, 0], 0.08, 0.04, { bone: 'b', region: 'y', k: 0.05 }),
    ];
    const m = meshSDF(prims, 0.015);
    const count = new Map<string, number>();
    for (let t = 0; t < m.indices.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = m.indices[t + e], b = m.indices[t + ((e + 1) % 3)];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        count.set(key, (count.get(key) ?? 0) + 1);
      }
    }
    const open = [...count.values()].filter((c) => c !== 2).length;
    expect(open / count.size).toBeLessThan(0.002);
    // Owner assignment picks the limb where the limb is.
    const tip = m.positions.findIndex((_, i) => i % 3 === 0 && m.positions[i] > 0.28);
    expect(m.owner[tip / 3]).toBe(1);
  });

  it('round cone distance is exact on its axis', () => {
    const p = limb([0, 0, 0], [0, 1, 0], 0.2, 0.1, { bone: 'b', region: 'x' });
    expect(p.d(0.2, 0, 0)).toBeCloseTo(0, 3);
    expect(p.d(0, 1.1, 0)).toBeCloseTo(0, 3);
    expect(evalSDF([p], 0, 0.5, 0)).toBeLessThan(0);
  });
});
