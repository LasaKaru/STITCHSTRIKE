import * as THREE from 'three';
import { bead, metal, plastic } from '../scene/materials.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { spawnFigure } from './cast.ts';
import type { HumanoidOptions } from './humanoid.ts';
import { buildFigure, instantiate, type Accessory, type BoneDef, type FigureDef, type FigureInstance, type FigureTemplate } from './rig.ts';
import { ellipsoid, limb, roundBox, sphere, torus, type Prim, type V3 } from './sdf.ts';

/**
 * The rest of Baron von Ravel's Mass-Knit Army, sculpted and rigged like the
 * rest of the cast: chattering teeth, a spinning top, tin soldiers, an RC
 * drone, the scissor snip and the boss, the Unraveller.
 */

const templates = new Map<string, FigureTemplate>();
function cached(def: () => FigureDef, name: string): FigureInstance {
  let t = templates.get(name);
  if (!t) { t = buildFigure(def()); templates.set(name, t); }
  return instantiate(t);
}

function glow(bone: string, r: number, color: number, at: V3): Accessory {
  return {
    bone,
    build: () => {
      const m = bead(0x111111);
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 2.6;
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m);
      e.position.set(...at);
      return e;
    },
  };
}

// ---------------------------------------------------------------- Chatter Teeth

function teethDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: [0, 0.16, 0.05], tail: [0, 0.16, -0.15], radius: 0.12 },
    { name: 'jaw', parent: 'body', head: [0, 0.14, 0.1], tail: [0, 0.1, -0.16], radius: 0.1 },
    { name: 'footL', parent: 'body', head: [-0.07, 0.08, 0.02], tail: [-0.08, 0.01, -0.02], radius: 0.03 },
    { name: 'footR', parent: 'body', head: [0.07, 0.08, 0.02], tail: [0.08, 0.01, -0.02], radius: 0.03 },
  ];
  const P: Prim[] = [
    // Upper gum and a row of chunky crocheted teeth.
    ellipsoid([0, 0.2, -0.03], [0.13, 0.055, 0.13], { bone: 'body', region: 'gum', k: 0.03 }),
    ellipsoid([0, 0.1, -0.03], [0.12, 0.045, 0.12], { bone: 'jaw', region: 'gum', k: 0.03 }),
  ];
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + (i / 6) * 2.2;
    const x = Math.sin(a) * 0.1, z = -0.03 - Math.cos(a) * 0.1;
    P.push(roundBox([x, 0.165, z], [0.018, 0.02, 0.012], 0.008, { bone: 'body', region: 'tooth', k: 0.006 }));
    P.push(roundBox([x * 0.95, 0.135, z * 0.95], [0.017, 0.018, 0.012], 0.008, { bone: 'jaw', region: 'tooth', k: 0.006 }));
  }
  for (const [sx, n] of [[-1, 'footL'], [1, 'footR']] as const) {
    P.push(ellipsoid([0.08 * sx, 0.03, 0], [0.04, 0.025, 0.06], { bone: n, region: 'shoe', k: 0.02 }));
    P.push(limb([0.07 * sx, 0.09, 0.02], [0.08 * sx, 0.04, 0], 0.012, 0.012, { bone: n, region: 'shoe', k: 0.01 }));
  }
  return {
    name: 'teeth', bones, prims: P, cell: 0.008, density: 18,
    regions: {
      gum: { pattern: 'stocking', color: 0xe86a8a, gauge: 1.8 },
      tooth: { pattern: 'crochet', color: 0xf6f1e4, gauge: 2 },
      shoe: { pattern: 'felt', color: 0xd8262e },
    },
    accessories: [
      { bone: 'body', build: () => {
        // Wind-up key on the back.
        const g = new THREE.Group();
        const m = metal(0xd9b24a, 0.25);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), m);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.z = 0.03;
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), m);
        bow.position.z = 0.065;
        bow.rotation.y = Math.PI / 2;
        g.add(shaft, bow);
        g.position.set(0, 0.18, 0.1);
        g.name = 'key';
        return g;
      } },
      glow('body', 0.012, 0xff4030, [0.04, 0.24, -0.08]), glow('body', 0.012, 0xff4030, [-0.04, 0.24, -0.08]),
    ],
  };
}

export function createTeeth(): FigureInstance {
  return cached(teethDef, 'teeth');
}

export function poseTeeth(f: FigureInstance, t: number, phase: number, amp: number): void {
  const p = f.poser;
  p.reset();
  p.setHips(0, Math.abs(Math.sin(phase * 2)) * 0.03 * amp, 0);
  p.rotate('jaw', -0.25 - Math.abs(Math.sin(t * 22)) * 0.45, 0, 0);
  p.rotate('footL', Math.sin(phase * 2) * 0.6 * amp, 0, 0);
  p.rotate('footR', -Math.sin(phase * 2) * 0.6 * amp, 0, 0);
  const key = f.root.getObjectByName('key');
  if (key) key.rotation.z = t * 6;
}

// ---------------------------------------------------------------- Spinning Top

function topDef(): FigureDef {
  const bones: BoneDef[] = [{ name: 'body', parent: null, head: [0, 0.05, 0], tail: [0, 0.9, 0], radius: 0.4 }];
  const P: Prim[] = [
    limb([0, 0.06, 0], [0, 0.42, 0], 0.03, 0.42, { bone: 'body', region: 'shell', k: 0.06 }),
    ellipsoid([0, 0.5, 0], [0.46, 0.14, 0.46], { bone: 'body', region: 'band', k: 0.05 }),
    limb([0, 0.55, 0], [0, 0.75, 0], 0.3, 0.12, { bone: 'body', region: 'shell', k: 0.05 }),
    limb([0, 0.72, 0], [0, 0.92, 0], 0.05, 0.045, { bone: 'body', region: 'handle', k: 0.02 }),
  ];
  for (const y of [0.3, 0.62]) P.push(torus([0, y, 0], y < 0.5 ? 0.3 : 0.24, 0.02, { bone: 'body', region: 'stripe', k: 0.01 }));
  return {
    name: 'top', bones, prims: P, cell: 0.012, density: 12,
    regions: {
      shell: { pattern: 'crochet', color: 0x2f7fe0, gauge: 1.2 },
      band: { pattern: 'rib', color: 0xffc94a, gauge: 1.4 },
      stripe: { pattern: 'garter', color: 0xd8262e, gauge: 1.6 },
      handle: { pattern: 'felt', color: 0xefe3c8 },
    },
    accessories: [glow('body', 0.03, 0xff4030, [0.2, 0.62, -0.26]), glow('body', 0.03, 0xff4030, [-0.2, 0.62, -0.26])],
  };
}

export function createTop(): FigureInstance {
  return cached(topDef, 'top');
}

export function poseTop(f: FigureInstance, t: number, id: number): void {
  const p = f.poser;
  p.reset();
  p.rotate('body', Math.sin(t * 2.3 + id) * 0.12, t * 16, Math.cos(t * 1.7 + id) * 0.12);
}

// ---------------------------------------------------------------- RC Drone

function droneDef(): FigureDef {
  const bones: BoneDef[] = [{ name: 'body', parent: null, head: [0, 0.2, 0.2], tail: [0, 0.2, -0.3], radius: 0.2 }];
  const P: Prim[] = [
    roundBox([0, 0.2, 0], [0.18, 0.08, 0.26], 0.06, { bone: 'body', region: 'shell', k: 0.04 }),
    ellipsoid([0, 0.28, -0.08], [0.12, 0.06, 0.14], { bone: 'body', region: 'canopy', k: 0.04 }),
  ];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const tip: V3 = [0.42 * sx, 0.22, 0.42 * sz];
    P.push(limb([0.1 * sx, 0.2, 0.12 * sz], tip, 0.035, 0.03, { bone: 'body', region: 'arm', k: 0.02 }));
    P.push(limb([tip[0], 0.2, tip[2]], [tip[0], 0.28, tip[2]], 0.05, 0.045, { bone: 'body', region: 'shell', k: 0.02 }));
  }
  return {
    name: 'drone', bones, prims: P, cell: 0.012, density: 12,
    regions: {
      shell: { pattern: 'garter', color: 0x2a2a30, gauge: 1.4 },
      canopy: { pattern: 'stocking', color: 0xd8262e, gauge: 1.6 },
      arm: { pattern: 'rib', color: 0x6a6a74, gauge: 1.8 },
    },
    accessories: [
      glow('body', 0.035, 0xff3020, [0, 0.2, -0.27]),
      { bone: 'body', build: () => {
        const g = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.05), plastic(0xefe3c8, 0.4));
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const r = new THREE.Group();
          r.position.set(0.42 * sx, 0.3, 0.42 * sz);
          r.add(blade.clone());
          const b2 = blade.clone();
          b2.rotation.y = Math.PI / 2;
          r.add(b2);
          r.name = 'rotor';
          g.add(r);
        }
        return g;
      } },
    ],
  };
}

export function createDrone(): FigureInstance {
  return cached(droneDef, 'drone');
}

export function poseDrone(f: FigureInstance, t: number, vx: number, vz: number): void {
  const p = f.poser;
  p.reset();
  p.rotate('body', Math.min(0.35, Math.hypot(vx, vz) * 0.08), 0, Math.sin(t * 2) * 0.05);
  f.root.traverse((o) => { if (o.name === 'rotor') o.rotation.y = t * 40; });
}

// ---------------------------------------------------------------- Scissor Snip

function snipDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: [0, 0.35, 0.2], tail: [0, 0.35, -0.15], radius: 0.25 },
    { name: 'clawL', parent: 'body', head: [-0.2, 0.4, -0.15], tail: [-0.25, 0.42, -0.55], radius: 0.05 },
    { name: 'clawR', parent: 'body', head: [0.2, 0.4, -0.15], tail: [0.25, 0.42, -0.55], radius: 0.05 },
  ];
  const P: Prim[] = [
    ellipsoid([0, 0.36, 0.02], [0.26, 0.16, 0.3], { bone: 'body', region: 'shell', k: 0.05 }),
    sphere([0, 0.46, -0.2], 0.08, { bone: 'body', region: 'shell', k: 0.05 }),
  ];
  for (const sx of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const z = -0.05 + i * 0.13;
      const bone = 'body';
      P.push(limb([0.18 * sx, 0.32, z], [0.34 * sx, 0.3, z + 0.04], 0.03, 0.025, { bone, region: 'leg', k: 0.015 }));
      P.push(limb([0.34 * sx, 0.3, z + 0.04], [0.44 * sx, 0.02, z + 0.08], 0.025, 0.012, { bone, region: 'leg', k: 0.015 }));
    }
    const claw = sx > 0 ? 'clawR' : 'clawL';
    P.push(limb([0.2 * sx, 0.4, -0.12], [0.26 * sx, 0.42, -0.3], 0.05, 0.05, { bone: claw, region: 'grip', k: 0.02 }));
  }
  return {
    name: 'snip', bones, prims: P, cell: 0.012, density: 12,
    regions: {
      shell: { pattern: 'crochet', color: 0xe8742a, gauge: 1.3 },
      leg: { pattern: 'rib', color: 0x2a1f1a, gauge: 1.8 },
      grip: { pattern: 'garter', color: 0xd8262e, gauge: 1.6 },
    },
    accessories: [
      glow('body', 0.03, 0x9aff5a, [0.05, 0.52, -0.26]), glow('body', 0.03, 0x9aff5a, [-0.05, 0.52, -0.26]),
      ...(['clawL', 'clawR'] as const).map((bone): Accessory => ({ bone, build: () => {
        // A pair of steel blades that snip open and shut.
        const g = new THREE.Group();
        const sx = bone === 'clawR' ? 1 : -1;
        g.position.set(0.26 * sx, 0.42, -0.3);
        const m = metal(0xdfe4ea, 0.18);
        for (const k of [-1, 1]) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), m);
          blade.rotation.x = -Math.PI / 2;
          blade.scale.set(0.35, 1, 1);
          blade.position.z = -0.2;
          const pivot = new THREE.Group();
          pivot.name = k < 0 ? 'bladeA' : 'bladeB';
          pivot.add(blade);
          g.add(pivot);
        }
        return g;
      } })),
    ],
  };
}

export function createSnip(): FigureInstance {
  return cached(snipDef, 'snip');
}

export function poseSnip(f: FigureInstance, t: number, phase: number, amp: number, cutting: boolean): void {
  const p = f.poser;
  p.reset();
  p.setHips(0, Math.abs(Math.sin(phase * 2)) * 0.02 * amp, 0);
  p.rotate('body', 0, Math.sin(phase) * 0.08 * amp, Math.sin(phase * 2) * 0.05 * amp);
  const open = cutting ? Math.abs(Math.sin(t * 9)) * 0.5 : 0.15 + Math.sin(t * 3) * 0.1;
  f.root.traverse((o) => {
    if (o.name === 'bladeA') o.rotation.y = open;
    if (o.name === 'bladeB') o.rotation.y = -open;
  });
  p.rotate('clawL', 0, -0.2 + Math.sin(t * 2) * 0.1, 0);
  p.rotate('clawR', 0, 0.2 - Math.sin(t * 2) * 0.1, 0);
}

// ---------------------------------------------------------------- Tin Soldier and the Unraveller (humanoids)

export function soldierOptions(): HumanoidOptions {
  return {
    name: 'tin-soldier',
    headwear: 'helmet', beard: 'mustache', gloves: true, eyes: 'glow', eyeColor: 0x6fd6ff,
    jacketButtons: true, muscle: 0.85, cell: 0.016, merged: true, scale: 0.9,
    colors: { skin: 0xd8c8b0, jacket: 0x2f5a9a, trim: 0xd9b24a, pants: 0x1e2a44, boots: 0x111114, gloves: 0xefe3c8, hat: 0x2a2a30, belt: 0xefe3c8, mustache: 0x2a1c14 },
    patterns: { jacket: 'garter', pants: 'rib' },
  };
}

export function bossOptions(): HumanoidOptions {
  return {
    name: 'unraveller',
    scale: 3.05, shoulders: 1.5, muscle: 1.6, belly: 1.6, armLength: 1.1, headSize: 1.2,
    headwear: 'none', beard: 'none', gloves: false, eyes: 'glow', eyeColor: 0xff2a1a,
    belt: true, jacketButtons: true, cell: 0.03, merged: true,
    colors: { skin: 0x8a5a3a, jacket: 0x6a2a4a, trim: 0xd9b24a, pants: 0x7a4a2e, boots: 0x3a2418, belt: 0x2a1a10 },
    patterns: { skin: 'felt', pants: 'felt' },
  };
}

/** The Unraveller: a giant felted bear in the Baron's velvet waistcoat, with a top hat and monocle. */
export function createBoss(): FigureInstance {
  const f = spawnFigure(bossOptions());
  const head = f.bones.get('head');
  if (head) {
    const S = 3.05;
    const fur = createWoolMaterial({ color: 0x8a5a3a, pattern: 'felt', uvSize: [0.6, 0.6], fuzz: 2 });
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 14, 10), fur);
      ear.position.set(0.075 * S * sx, 0.19 * S, 0.01 * S);
      ear.scale.z = 0.6;
      head.add(ear);
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 14, 10), createWoolMaterial({ color: 0xc89a78, pattern: 'felt', uvSize: [0.5, 0.5] }));
    snout.position.set(0, 0.06 * S, -0.08 * S);
    snout.scale.set(1, 0.75, 0.8);
    head.add(snout);
    const hatMat = createWoolMaterial({ color: 0x1e1e24, pattern: 'felt', uvSize: [1, 1] });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * S, 0.12 * S, 0.012 * S, 24), hatMat);
    brim.position.set(0, 0.215 * S, 0);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * S, 0.08 * S, 0.16 * S, 24), hatMat);
    crown.position.set(0, 0.3 * S, 0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.081 * S, 0.081 * S, 0.03 * S, 24), createWoolMaterial({ color: 0xd8262e, pattern: 'rib', uvSize: [1, 0.2] }));
    band.position.set(0, 0.24 * S, 0);
    head.add(brim, crown, band);
    const monocle = new THREE.Mesh(new THREE.TorusGeometry(0.025 * S, 0.004 * S, 8, 20), metal(0xd9b24a, 0.2));
    monocle.position.set(0.035 * S, 0.11 * S, -0.085 * S);
    head.add(monocle);
  }
  f.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return f;
}
