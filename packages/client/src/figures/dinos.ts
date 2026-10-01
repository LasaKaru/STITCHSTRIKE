import * as THREE from 'three';
import { bead } from '../scene/materials.ts';
import { buildFigure, instantiate, type Accessory, type BoneDef, type FigureDef, type FigureInstance, type FigureTemplate } from './rig.ts';
import { ellipsoid, limb, rotXYZ, sphere, type Prim, type V3 } from './sdf.ts';

/**
 * The Dino Stampede herd, knitted like the rest of the cast: a striped
 * raptor, a woolly triceratops with a polka-dot frill, a felt pterodactyl
 * and Rex, the Yarnasaur. All face -Z, feet on y = 0.
 */

const templates = new Map<string, FigureTemplate>();
function cached(def: () => FigureDef, name: string): FigureInstance {
  let t = templates.get(name);
  if (!t) { t = buildFigure(def()); templates.set(name, t); }
  return instantiate(t);
}

const scaleV = (v: V3, s: number): V3 => [v[0] * s, v[1] * s, v[2] * s];

/** Shiny button eyes. */
function eyes(bone: string, at: V3, r: number): Accessory[] {
  return [-1, 1].map((sx) => ({
    bone,
    build: () => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bead(0x0b0b0e));
      e.position.set(at[0] * sx, at[1], at[2]);
      return e;
    },
  }));
}

/** A row of felt teeth (or claws): little cream cones. */
function cones(bone: string, points: V3[], r: number, h: number, dir: V3, color = 0xf6f1e4): Accessory {
  return {
    bone,
    build: () => {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      const geo = new THREE.ConeGeometry(r, h, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
      for (const p of points) {
        const c = new THREE.Mesh(geo, m);
        c.position.set(...p);
        c.quaternion.copy(q);
        c.castShadow = true;
        g.add(c);
      }
      return g;
    },
  };
}

// ---------------------------------------------------------------- raptor and Rex (theropods)

interface TheropodOpts {
  name: string;
  /** Overall scale (raptor = 1). */
  S: number;
  /** Head size relative to the raptor's. */
  head: number;
  /** Arm length relative to the raptor's (Rex has tiny ones). */
  arm: number;
  /** Body girth. */
  girth: number;
  colors: { skin: number; belly: number; stripe: number };
  cell: number;
}

function theropodDef(o: TheropodOpts): FigureDef {
  const S = o.S;
  const v = (x: number, y: number, z: number): V3 => scaleV([x, y, z], S);
  const H = o.head;
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: v(0, 0.9, 0.15), tail: v(0, 0.95, -0.3), radius: 0.26 * S * o.girth },
    { name: 'neck', parent: 'body', head: v(0, 1.0, -0.3), tail: v(0, 1.22, -0.5), radius: 0.12 * S },
    { name: 'head', parent: 'neck', head: v(0, 1.22, -0.5), tail: v(0, 1.24, -0.5 - 0.35 * H), radius: 0.13 * S * H },
    { name: 'jaw', parent: 'head', head: v(0, 1.17, -0.56), tail: v(0, 1.12, -0.56 - 0.3 * H), radius: 0.06 * S * H },
    { name: 'tail1', parent: 'body', head: v(0, 0.93, 0.35), tail: v(0, 0.9, 0.85), radius: 0.14 * S },
    { name: 'tail2', parent: 'tail1', head: v(0, 0.9, 0.85), tail: v(0, 0.86, 1.4), radius: 0.07 * S },
  ];
  const P: Prim[] = [
    ellipsoid(v(0, 0.9, 0.02), v(0.25 * o.girth, 0.27 * o.girth, 0.42), { bone: 'body', region: 'skin', k: 0.08 * S }),
    ellipsoid(v(0, 0.8, -0.04), v(0.21 * o.girth, 0.22 * o.girth, 0.36), { bone: 'body', region: 'belly', k: 0.05 * S }),
    limb(v(0, 0.98, -0.28), v(0, 1.22, -0.5), 0.15 * S * Math.max(1, H * 0.8), 0.11 * S * H, { bone: 'neck', region: 'skin', k: 0.06 * S }),
    ellipsoid(v(0, 1.26, -0.5 - 0.16 * H), v(0.14 * H, 0.13 * H, 0.22 * H), { bone: 'head', region: 'skin', k: 0.05 * S }),
    ellipsoid(v(0, 1.22, -0.5 - 0.34 * H), v(0.1 * H, 0.08 * H, 0.1 * H), { bone: 'head', region: 'skin', k: 0.04 * S }),
    ellipsoid(v(0, 1.13, -0.56 - 0.18 * H), v(0.09 * H, 0.045 * H, 0.16 * H), { bone: 'jaw', region: 'belly', k: 0.02 * S }),
    limb(v(0, 0.94, 0.3), v(0, 0.9, 0.85), 0.17 * S * o.girth, 0.1 * S, { bone: 'tail1', region: 'skin', k: 0.06 * S }),
    limb(v(0, 0.9, 0.85), v(0, 0.86, 1.4), 0.1 * S, 0.03 * S, { bone: 'tail2', region: 'skin', k: 0.04 * S }),
  ];
  // Knitted stripes (raptor) or plates (Rex) down the back and tail.
  for (const [z, y, r] of [[-0.18, 1.12, 0.07], [0.02, 1.16, 0.08], [0.22, 1.13, 0.075], [0.45, 1.05, 0.065], [0.7, 1.0, 0.055], [0.95, 0.96, 0.045]] as const) {
    P.push(sphere(v(0, y * (o.girth > 1 ? 1.03 : 1), z), r * S, { bone: z > 0.85 ? 'tail2' : z > 0.32 ? 'tail1' : 'body', region: 'stripe', k: 0.03 * S }));
  }
  const acc: Accessory[] = [
    ...eyes('head', v(0.11 * H, 1.32, -0.5 - 0.2 * H), 0.035 * S * Math.sqrt(H)),
    cones('head', [-0.06, -0.02, 0.02, 0.06].flatMap((x) => [v(x * H, 1.165, -0.5 - 0.36 * H), v((x + 0.02) * H * 1.3, 1.165, -0.5 - 0.27 * H)]), 0.014 * S * H, 0.05 * S * H, [0, -1, 0]),
  ];
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'L' : 'R';
    bones.push(
      { name: `thigh${side}`, parent: 'body', head: v(0.17 * sx * o.girth, 0.85, 0.08), tail: v(0.2 * sx * o.girth, 0.48, -0.04), radius: 0.13 * S },
      { name: `shin${side}`, parent: `thigh${side}`, head: v(0.2 * sx * o.girth, 0.48, -0.04), tail: v(0.2 * sx * o.girth, 0.07, 0.14), radius: 0.06 * S },
      { name: `arm${side}`, parent: 'body', head: v(0.16 * sx * o.girth, 0.92, -0.3), tail: v(0.2 * sx * o.girth, 0.92 - 0.14 * o.arm, -0.3 - 0.14 * o.arm), radius: 0.04 * S },
    );
    P.push(
      limb(v(0.17 * sx * o.girth, 0.86, 0.08), v(0.2 * sx * o.girth, 0.48, -0.04), 0.15 * S * o.girth, 0.08 * S * o.girth, { bone: `thigh${side}`, region: 'skin', k: 0.05 * S }),
      limb(v(0.2 * sx * o.girth, 0.48, -0.04), v(0.2 * sx * o.girth, 0.08, 0.14), 0.065 * S * o.girth, 0.05 * S * o.girth, { bone: `shin${side}`, region: 'skin', k: 0.03 * S }),
      limb(v(0.2 * sx * o.girth, 0.05, 0.16), v(0.2 * sx * o.girth, 0.045, -0.12), 0.055 * S * o.girth, 0.04 * S * o.girth, { bone: `shin${side}`, region: 'belly', k: 0.03 * S }),
      limb(v(0.16 * sx * o.girth, 0.92, -0.28), v(0.2 * sx * o.girth, 0.92 - 0.14 * o.arm, -0.3 - 0.14 * o.arm), 0.05 * S, 0.035 * S, { bone: `arm${side}`, region: 'skin', k: 0.02 * S }),
    );
    // Toe claws (the raptor's famous sickle claw is the big one).
    acc.push(cones(`shin${side}`, [v(0.2 * sx * o.girth, 0.07, -0.16), v((0.2 * sx - 0.05) * o.girth, 0.07, -0.14), v((0.2 * sx + 0.05) * o.girth, 0.07, -0.14)], 0.018 * S, 0.06 * S, [0, -0.3, -1], 0x2a2420));
    if (o.arm > 0.7) acc.push(cones(`shin${side}`, [v(0.2 * sx * o.girth + 0.07 * sx, 0.14, -0.02)], 0.025 * S, 0.12 * S, [0, 0.6, -1], 0xf6f1e4));
  }
  return {
    name: o.name, bones, prims: P, cell: o.cell, density: 12 / Math.sqrt(S),
    regions: {
      skin: { pattern: 'stocking', color: o.colors.skin, gauge: 1.2 },
      belly: { pattern: 'rib', color: o.colors.belly, gauge: 1.4 },
      stripe: { pattern: 'garter', color: o.colors.stripe, gauge: 1.4 },
    },
    accessories: acc,
    mergeRegions: true,
  };
}

const RAPTOR: TheropodOpts = { name: 'raptor', S: 1, head: 1, arm: 1, girth: 1, cell: 0.016, colors: { skin: 0x5f9e4a, belly: 0xefe0b8, stripe: 0x2f5a2a } };
const REX: TheropodOpts = { name: 'rex', S: 3.7, head: 1.55, arm: 0.45, girth: 1.3, cell: 0.05, colors: { skin: 0x8a5a3a, belly: 0xe8c890, stripe: 0xd8742a } };

export function createRaptor(): FigureInstance {
  return cached(() => theropodDef(RAPTOR), 'raptor');
}

export function createRex(): FigureInstance {
  return cached(() => theropodDef(REX), 'rex');
}

/**
 * Theropod gait: legs swing in opposition, the tail sways for balance, the
 * jaw chatters. `act` (0..1) is a leap (raptor) or a roar (Rex): head up,
 * jaws wide.
 */
export function poseTheropod(f: FigureInstance, t: number, phase: number, amp: number, act: number, S = 1): void {
  const p = f.poser;
  p.reset();
  p.setHips(0, Math.abs(Math.sin(phase)) * 0.035 * amp * S, 0);
  for (const [side, off] of [['L', 0], ['R', Math.PI]] as const) {
    const ph = phase + off;
    p.rotate(`thigh${side}`, Math.sin(ph) * 0.55 * amp - act * 0.5, 0, 0);
    p.rotate(`shin${side}`, -Math.max(0, -Math.cos(ph)) * 0.7 * amp + act * 0.6, 0, 0);
    p.rotate(`arm${side}`, Math.sin(t * 4 + off) * 0.15 + act * 0.6, 0, 0);
  }
  p.rotate('body', Math.sin(phase * 2) * 0.03 * amp - act * 0.12, Math.sin(phase) * 0.05 * amp, 0);
  p.rotate('tail1', act * 0.25, Math.sin(phase) * 0.18 * amp + Math.sin(t * 1.3) * 0.06, 0);
  p.rotate('tail2', 0, Math.sin(phase - 0.6) * 0.25 * amp + Math.sin(t * 1.3 - 0.5) * 0.1, 0);
  p.rotate('neck', Math.sin(phase * 2) * 0.05 * amp + act * 0.45, Math.sin(t * 0.7) * 0.1 * (1 - act), 0);
  p.rotate('head', -act * 0.15, 0, 0);
  p.rotate('jaw', -(0.08 + Math.max(0, Math.sin(t * 3)) * 0.12 + act * 0.55), 0, 0);
}

// ---------------------------------------------------------------- the woolly triceratops

function trikeDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: [0, 1.1, 0.6], tail: [0, 1.15, -0.6], radius: 0.7 },
    { name: 'head', parent: 'body', head: [0, 1.05, -0.8], tail: [0, 0.9, -1.6], radius: 0.4 },
    { name: 'tail', parent: 'body', head: [0, 1.0, 0.95], tail: [0, 0.55, 1.9], radius: 0.25 },
  ];
  const P: Prim[] = [
    ellipsoid([0, 1.12, 0], [0.75, 0.66, 1.08], { bone: 'body', region: 'skin', k: 0.12 }),
    ellipsoid([0, 0.88, 0], [0.62, 0.48, 0.95], { bone: 'body', region: 'belly', k: 0.08 }),
    ellipsoid([0, 1.0, -1.1], [0.4, 0.38, 0.46], { bone: 'head', region: 'skin', k: 0.1 }),
    ellipsoid([0, 0.8, -1.52], [0.17, 0.2, 0.2], { bone: 'head', region: 'beak', k: 0.06 }),
    // The frill: a big knitted fan behind the head, with polka dots.
    ellipsoid([0, 1.48, -0.78], [0.88, 0.72, 0.1], { bone: 'head', region: 'frill', k: 0.08 }, rotXYZ(-0.45, 0, 0)),
    limb([0, 1.05, 0.9], [0, 0.55, 1.9], 0.32, 0.06, { bone: 'tail', region: 'skin', k: 0.08 }),
  ];
  for (const [x, y] of [[-0.5, 1.6], [0, 1.8], [0.5, 1.6], [-0.3, 1.25], [0.3, 1.25], [-0.7, 1.25], [0.7, 1.25]] as const) {
    P.push(sphere([x, y, -0.68 + (y - 1.48) * 0.4], 0.11, { bone: 'head', region: 'dots', k: 0.03 }));
  }
  // Knobbly back plates.
  for (const z of [-0.5, -0.1, 0.3, 0.7]) P.push(sphere([0, 1.74 - Math.abs(z) * 0.12, z], 0.13, { bone: 'body', region: 'dots', k: 0.05 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const n = `leg${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'F' : 'B'}`;
    bones.push({ name: n, parent: 'body', head: [0.5 * sx, 0.9, 0.55 * sz], tail: [0.55 * sx, 0.05, 0.55 * sz], radius: 0.2 });
    P.push(
      limb([0.5 * sx, 0.95, 0.55 * sz], [0.55 * sx, 0.12, 0.55 * sz], 0.24, 0.19, { bone: n, region: 'skin', k: 0.06 }),
      ellipsoid([0.55 * sx, 0.1, 0.55 * sz - 0.05], [0.22, 0.1, 0.25], { bone: n, region: 'belly', k: 0.04 }),
    );
  }
  return {
    name: 'trike', bones, prims: P, cell: 0.028, density: 9,
    regions: {
      skin: { pattern: 'stocking', color: 0x4a8a9a, gauge: 1.1 },
      belly: { pattern: 'rib', color: 0xe8dcc0, gauge: 1.3 },
      beak: { pattern: 'felt', color: 0x3a3430, gauge: 1.5 },
      frill: { pattern: 'garter', color: 0xe8742a, gauge: 1.1 },
      dots: { pattern: 'felt', color: 0xf2c84a, gauge: 1.5 },
    },
    accessories: [
      ...eyes('head', [0.3, 1.12, -1.25], 0.06),
      // Three horns: two long brow horns and a short nose horn.
      cones('head', [[-0.22, 1.38, -1.32], [0.22, 1.38, -1.32]], 0.1, 1.0, [0, 0.35, -1]),
      cones('head', [[0, 1.06, -1.52]], 0.09, 0.4, [0, 0.8, -0.6]),
    ],
    mergeRegions: true,
  };
}

export function createTrike(): FigureInstance {
  return cached(trikeDef, 'trike');
}

/** Diagonal-pair walk; when charging the head drops and the legs blur. */
export function poseTrike(f: FigureInstance, t: number, phase: number, amp: number, charge: number): void {
  const p = f.poser;
  p.reset();
  p.setHips(0, Math.abs(Math.sin(phase)) * 0.04 * amp, 0);
  for (const [n, off] of [['legLF', 0], ['legRB', 0], ['legRF', Math.PI], ['legLB', Math.PI]] as const) {
    p.rotate(n, Math.sin(phase + off) * 0.35 * amp, 0, 0);
  }
  p.rotate('body', Math.sin(phase * 2) * 0.02 * amp, 0, Math.sin(phase) * 0.03 * amp);
  p.rotate('head', -charge * 0.3 + Math.sin(t * 1.5) * 0.04, Math.sin(t * 0.8) * 0.12 * (1 - charge), 0);
  p.rotate('tail', 0, Math.sin(phase) * 0.2 * amp + Math.sin(t) * 0.05, 0);
}

// ---------------------------------------------------------------- the felt pterodactyl

function pteroDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: [0, 0.4, 0.3], tail: [0, 0.42, -0.2], radius: 0.15 },
    { name: 'head', parent: 'body', head: [0, 0.48, -0.25], tail: [0, 0.5, -0.7], radius: 0.1 },
  ];
  const P: Prim[] = [
    ellipsoid([0, 0.42, 0.05], [0.14, 0.13, 0.3], { bone: 'body', region: 'skin', k: 0.04 }),
    ellipsoid([0, 0.38, 0.05], [0.11, 0.1, 0.24], { bone: 'body', region: 'belly', k: 0.03 }),
    ellipsoid([0, 0.5, -0.38], [0.09, 0.09, 0.17], { bone: 'head', region: 'skin', k: 0.04 }),
    limb([0, 0.48, -0.48], [0, 0.45, -0.85], 0.055, 0.012, { bone: 'head', region: 'beak', k: 0.02 }),
    limb([0, 0.55, -0.38], [0, 0.66, -0.08], 0.05, 0.015, { bone: 'head', region: 'crest', k: 0.02 }),
  ];
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? 'L' : 'R';
    bones.push(
      { name: `wing${s}`, parent: 'body', head: [0.12 * sx, 0.46, -0.05], tail: [0.7 * sx, 0.46, -0.03], radius: 0.05 },
      { name: `tip${s}`, parent: `wing${s}`, head: [0.7 * sx, 0.46, -0.03], tail: [1.2 * sx, 0.43, 0.08], radius: 0.04 },
    );
    P.push(
      limb([0.12 * sx, 0.46, -0.08], [0.7 * sx, 0.46, -0.06], 0.04, 0.03, { bone: `wing${s}`, region: 'skin', k: 0.02 }),
      limb([0.7 * sx, 0.46, -0.06], [1.2 * sx, 0.43, 0.05], 0.03, 0.012, { bone: `tip${s}`, region: 'skin', k: 0.02 }),
      ellipsoid([0.42 * sx, 0.45, 0.06], [0.34, 0.05, 0.22], { bone: `wing${s}`, region: 'membrane', k: 0.03 }),
      ellipsoid([0.92 * sx, 0.44, 0.08], [0.32, 0.045, 0.16], { bone: `tip${s}`, region: 'membrane', k: 0.03 }),
    );
  }
  return {
    name: 'ptero', bones, prims: P, cell: 0.012, density: 13,
    regions: {
      skin: { pattern: 'stocking', color: 0x7a4a8a, gauge: 1.3 },
      belly: { pattern: 'rib', color: 0xefe0c8, gauge: 1.5 },
      beak: { pattern: 'felt', color: 0xe8b04a, gauge: 1.6 },
      crest: { pattern: 'garter', color: 0xd8262e, gauge: 1.6 },
      membrane: { pattern: 'felt', color: 0xb07ac0, gauge: 1.4 },
    },
    accessories: eyes('head', [0.075, 0.54, -0.42], 0.022),
    mergeRegions: true,
  };
}

export function createPtero(): FigureInstance {
  return cached(pteroDef, 'ptero');
}

/** Big slow flaps while circling; wings fold back into a dive when swooping. */
export function posePtero(f: FigureInstance, t: number, id: number, dive: number): void {
  const p = f.poser;
  p.reset();
  const flap = Math.sin(t * 5 + id) * 0.55 * (1 - dive);
  p.rotate('wingL', 0, dive * 0.6, -flap + dive * 0.2);
  p.rotate('wingR', 0, -dive * 0.6, flap - dive * 0.2);
  p.rotate('tipL', 0, dive * 0.5, -flap * 0.6);
  p.rotate('tipR', 0, -dive * 0.5, flap * 0.6);
  p.rotate('body', -dive * 0.5 + Math.sin(t * 5 + id) * 0.05, 0, Math.sin(t * 0.9 + id) * 0.15 * (1 - dive));
  p.rotate('head', dive * 0.3, Math.sin(t * 1.3 + id) * 0.2, 0);
}

export const REX_SCALE = REX.S;
