import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StitchPattern } from '../wool/stitches.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';

/** Shared building blocks for knitted environments. */

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/** Cached world-space (triplanar) wool material: one shader program for all of them. */
export function wool(pattern: StitchPattern, color: number, gauge = 1, roughness = 0.92): THREE.MeshPhysicalMaterial {
  const key = `${pattern}-${color}-${gauge}-${roughness}`;
  let m = cache.get(key);
  if (!m) {
    m = createWoolMaterial({ color, pattern, uvSize: [1, 1], triplanar: true, gauge, roughness });
    cache.set(key, m);
  }
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material, cast = true): THREE.Mesh {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))), mat, cast);
}

/** Seeded random, so every client knits the same garden. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A lumpy felted blob (hedges, foliage clumps, rocks). */
export function lumpy(radius: number, bumps: number, seed: number, detail = 3): THREE.BufferGeometry {
  // Weld the icosphere first so the displaced blob gets smooth normals, not facets.
  const ico = new THREE.IcosahedronGeometry(radius, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const r = rng(seed);
  const centres = Array.from({ length: 7 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let k = 0;
    for (const c of centres) k += Math.max(0, n.dot(c)) ** 3;
    const wobble = Math.sin(n.x * 9 + seed) * Math.sin(n.y * 7) * Math.sin(n.z * 8) * 0.5;
    v.multiplyScalar(1 + bumps * (k * 0.35 + wobble * 0.3));
    p.setXYZ(i, v.x, v.y, v.z);
    uv[i * 2] = Math.atan2(n.z, n.x) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / Math.PI + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A strand of yarn along random wiggles (tangles, hoses, strings). */
export function yarnTube(points: THREE.Vector3[], radius: number, mat: THREE.Material, segments = 64): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), mat);
}

export function tangle(center: THREE.Vector3, size: number, loops: number, seed: number): THREE.Vector3[] {
  const r = rng(seed);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < loops * 8; i++) {
    const a = i * 0.8 + r() * 0.6;
    const rad = size * (0.4 + r() * 0.6);
    pts.push(new THREE.Vector3(center.x + Math.cos(a) * rad, center.y + 0.04 + r() * size * 0.25, center.z + Math.sin(a) * rad * (0.6 + r() * 0.4)));
  }
  return pts;
}
