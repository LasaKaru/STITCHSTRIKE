import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { circleClear, type World } from '@stitchstrike/shared';
import type { StitchPattern } from '../wool/stitches.ts';
import { lumpy, mesh, rng, tangle, wool } from './woolKit.ts';

/**
 * Messy things: a scatter of small knitted clutter over the floor or lawn.
 * Items are low enough to walk over, avoid furniture, Heartspools and build
 * pads, and are baked into one merged mesh per material.
 */

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

type Item = { geo: THREE.BufferGeometry; pattern: StitchPattern; color: number; gauge?: number };

const COLORS = [0xd8262e, 0x3a5da8, 0x8bcb3a, 0xffc94a, 0xe8742a, 0xb46fd6, 0xefe3c8, 0x6fd6ff];

function sock(r: () => number): THREE.BufferGeometry {
  const pts = [new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.9, 0.12, 0.1), new THREE.Vector3(1.4, 0.12, 0.25), new THREE.Vector3(1.6, 0.12, 0.7), new THREE.Vector3(1.55, 0.12, 1.0)];
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.22, 10, false);
  g.scale(1, 0.55, 1);
  g.rotateY(r() * Math.PI * 2);
  return g;
}

function crayon(r: () => number): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6);
  const tip = new THREE.ConeGeometry(0.1, 0.25, 6).translate(0, 0.68, 0);
  const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
  g.rotateZ(Math.PI / 2).translate(0, 0.1, 0).rotateY(r() * Math.PI * 2);
  return g;
}

function ball(r: () => number): THREE.BufferGeometry {
  const rad = 0.25 + r() * 0.35;
  return new THREE.SphereGeometry(rad, 16, 12).translate(0, rad, 0);
}

function block(r: () => number): THREE.BufferGeometry {
  const s = 0.4 + r() * 0.3;
  return new RoundedBoxGeometry(s, s, s, 2, 0.06).rotateY(r() * 3).rotateX(r() < 0.4 ? Math.PI / 2 : 0).translate(0, s / 2, 0);
}

function buttons(r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    parts.push(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14).rotateX(r() * 0.3).translate((r() - 0.5) * 1.2, 0.03 + i * 0.005, (r() - 0.5) * 1.2).toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

function paper(r: () => number): THREE.BufferGeometry {
  return lumpy(0.28 + r() * 0.15, 0.9, Math.floor(r() * 1000), 1).scale(1, 0.75, 1).translate(0, 0.22, 0);
}

function openBook(r: () => number): THREE.BufferGeometry {
  const a = flat(new RoundedBoxGeometry(0.9, 0.08, 1.2, 1, 0.02).rotateZ(0.12).translate(-0.45, 0.08, 0));
  const b = flat(new RoundedBoxGeometry(0.9, 0.08, 1.2, 1, 0.02).rotateZ(-0.12).translate(0.45, 0.08, 0));
  return mergeGeometries([a, b])!.rotateY(r() * Math.PI * 2);
}

function stick(r: () => number): THREE.BufferGeometry {
  const l = 1.2 + r() * 2;
  const main = new THREE.CylinderGeometry(0.05, 0.08, l, 6).rotateZ(Math.PI / 2).translate(0, 0.08, 0).toNonIndexed();
  const twig = new THREE.CylinderGeometry(0.025, 0.04, l * 0.35, 5).rotateZ(Math.PI / 2 - 0.6).translate(l * 0.15, 0.14, 0.05).toNonIndexed();
  return mergeGeometries([main, twig])!.rotateY(r() * Math.PI * 2);
}

function frisbee(r: () => number): THREE.BufferGeometry {
  const rim = new THREE.TorusGeometry(0.6, 0.07, 8, 24).rotateX(Math.PI / 2).toNonIndexed();
  const disc = new THREE.CylinderGeometry(0.6, 0.6, 0.04, 24).toNonIndexed();
  return mergeGeometries([rim, disc])!.rotateX((r() - 0.5) * 0.3).translate(0, 0.08, 0);
}

export interface MessOptions {
  count: number;
  seed: number;
  outdoor: boolean;
  /** Optional XZ rectangle to scatter in (defaults to the world bounds). */
  area?: { min: [number, number]; max: [number, number] };
}

export function scatterMess(group: THREE.Group, world: World, o: MessOptions): void {
  const r = rng(o.seed);
  const area = o.area ?? world.bounds;
  const avoid = [...world.coop.cores.map((c) => ({ x: c[0], z: c[2], r: 2.6 })), ...world.coop.pads.map((p) => ({ x: p.pos[0], z: p.pos[2], r: 1.6 }))];
  const byMat = new Map<string, { item: Item; geos: THREE.BufferGeometry[] }>();
  const makers: ((r: () => number) => Item)[] = [
    (r) => ({ geo: sock(r), pattern: 'rib', color: COLORS[Math.floor(r() * COLORS.length)], gauge: 2 }),
    (r) => ({ geo: ball(r), pattern: 'crochet', color: COLORS[Math.floor(r() * COLORS.length)], gauge: 2 }),
    (r) => ({ geo: block(r), pattern: 'garter', color: COLORS[Math.floor(r() * COLORS.length)], gauge: 2 }),
    (r) => ({ geo: buttons(r), pattern: 'felt', color: COLORS[Math.floor(r() * COLORS.length)] }),
    (r) => ({ geo: paper(r), pattern: 'felt', color: 0xf2ecdc }),
  ];
  if (o.outdoor) {
    makers.push(
      (r) => ({ geo: stick(r), pattern: 'rib', color: 0x6a4a2a, gauge: 3 }),
      (r) => ({ geo: stick(r), pattern: 'rib', color: 0x7a5a3a, gauge: 3 }),
      (r) => ({ geo: frisbee(r), pattern: 'garter', color: COLORS[Math.floor(r() * 4)], gauge: 2 }),
    );
  } else {
    makers.push(
      (r) => ({ geo: crayon(r), pattern: 'felt', color: COLORS[Math.floor(r() * COLORS.length)] }),
      (r) => ({ geo: openBook(r), pattern: 'garter', color: COLORS[Math.floor(r() * COLORS.length)], gauge: 2 }),
    );
  }
  let placed = 0;
  for (let tries = 0; tries < o.count * 20 && placed < o.count; tries++) {
    const x = area.min[0] + r() * (area.max[0] - area.min[0]);
    const z = area.min[1] + r() * (area.max[1] - area.min[1]);
    if (!circleClear(world.boxes, x, z, 0.9, 3)) continue;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
    const item = makers[Math.floor(r() * makers.length)](r);
    const geo = flat(item.geo).translate(x, 0, z);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    const key = `${item.pattern}-${item.color}-${item.gauge ?? 1}`;
    if (!byMat.has(key)) byMat.set(key, { item, geos: [] });
    byMat.get(key)!.geos.push(geo);
    placed++;
  }
  for (const { item, geos } of byMat.values()) {
    const merged = mergeGeometries(geos);
    if (merged) group.add(mesh(merged, wool(item.pattern, item.color, item.gauge ?? 1)));
  }
  // A few long tangled strands of loose yarn.
  for (let i = 0; i < Math.ceil(o.count / 25); i++) {
    const x = area.min[0] + r() * (area.max[0] - area.min[0]);
    const z = area.min[1] + r() * (area.max[1] - area.min[1]);
    if (!circleClear(world.boxes, x, z, 1.5, 3)) continue;
    const pts = tangle(new THREE.Vector3(x, 0, z), 1.2 + r(), 3, Math.floor(r() * 1e6));
    group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.06, 6, false), wool('rib', COLORS[i % COLORS.length], 4)));
  }
}
