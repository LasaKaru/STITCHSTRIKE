import * as THREE from 'three';
import { bead, metal, wood } from '../scene/materials.ts';
import type { StitchPattern } from '../wool/stitches.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import type { Accessory, BoneDef, FigureDef, FigureInstance, RegionDef } from './rig.ts';
import { ellipsoid, evalSDF, limb, rotXYZ, roundBox, sphere, torus, type Prim, type V3 } from './sdf.ts';

/**
 * A realistic knitted action figure: anatomical sculpt (skull, jaw, brow,
 * nose, pecs, deltoids, biceps, quads, calves) dressed in knitted clothes.
 * Figures face -Z; +X is their right. Bind pose is an A-pose, 1.5 units tall.
 */

export interface HumanoidOptions {
  name: string;
  scale?: number;
  /** Shoulder width / muscle mass multipliers. */
  shoulders?: number;
  muscle?: number;
  belly?: number;
  armLength?: number;
  headSize?: number;
  headwear?: 'beanie' | 'helmet' | 'hair' | 'none';
  beard?: 'full' | 'mustache' | 'none';
  glasses?: boolean;
  gloves?: boolean;
  belt?: boolean;
  jacketButtons?: boolean;
  eyes?: 'bead' | 'glow';
  eyeColor?: number;
  colors: {
    skin: number;
    jacket: number;
    trim: number;
    pants: number;
    boots: number;
    gloves?: number;
    hat?: number;
    hair?: number;
    beard?: number;
    mustache?: number;
    belt?: number;
  };
  /** Override stitch patterns per region. */
  patterns?: Partial<Record<string, StitchPattern>>;
  cell?: number;
  /** Merge clothing regions into per-pattern draw groups (in-game crowds). */
  merged?: boolean;
}

const PI = Math.PI;

export function humanoidDef(o: HumanoidOptions): FigureDef {
  const S = o.scale ?? 1;
  const sh = o.shoulders ?? 1;
  const mu = o.muscle ?? 1;
  const arm = o.armLength ?? 1;
  const hs = o.headSize ?? 1;
  const v = (x: number, y: number, z: number): V3 => [x * S, y * S, z * S];

  // ---------------------------------------------------------------- skeleton
  const shoulderX = 0.17 * sh;
  const armDrop = PI / 4; // A-pose
  const ua = 0.26 * arm, fa = 0.23 * arm, ha = 0.085;
  const bones: BoneDef[] = [
    { name: 'hips', parent: null, head: v(0, 0.8, 0), tail: v(0, 0.95, 0), radius: 0.13 * S },
    { name: 'spine', parent: 'hips', head: v(0, 0.95, 0), tail: v(0, 1.1, 0), radius: 0.14 * S * (o.belly ?? 1) },
    { name: 'chest', parent: 'spine', head: v(0, 1.1, 0), tail: v(0, 1.24, 0), radius: 0.16 * S * sh },
    { name: 'neck', parent: 'chest', head: v(0, 1.24, 0), tail: v(0, 1.31, 0), radius: 0.045 * S },
    { name: 'head', parent: 'neck', head: v(0, 1.31, 0), tail: v(0, 1.51, 0), radius: 0.085 * S * hs },
  ];
  for (const side of [1, -1]) {
    const n = side > 0 ? 'R' : 'L';
    const sx = side;
    const shoulder: V3 = [shoulderX * sx, 1.215, 0];
    const elbow: V3 = [shoulder[0] + Math.cos(armDrop) * ua * sx, shoulder[1] - Math.sin(armDrop) * ua, 0];
    const wrist: V3 = [elbow[0] + Math.cos(armDrop) * fa * sx, elbow[1] - Math.sin(armDrop) * fa, 0];
    const tip: V3 = [wrist[0] + Math.cos(armDrop) * ha * sx, wrist[1] - Math.sin(armDrop) * ha, 0];
    bones.push(
      { name: `clavicle${n}`, parent: 'chest', head: v(0.02 * sx, 1.21, 0), tail: v(...shoulder), radius: 0.05 * S },
      { name: `upperArm${n}`, parent: `clavicle${n}`, head: v(...shoulder), tail: v(...elbow), radius: 0.045 * S * mu, seam: [0, 0, 1] },
      { name: `foreArm${n}`, parent: `upperArm${n}`, head: v(...elbow), tail: v(...wrist), radius: 0.035 * S * mu, seam: [0, 0, 1] },
      { name: `hand${n}`, parent: `foreArm${n}`, head: v(...wrist), tail: v(...tip), radius: 0.03 * S, seam: [0, 0, 1] },
      { name: `thigh${n}`, parent: 'hips', head: v(0.09 * sx, 0.79, 0), tail: v(0.1 * sx, 0.43, 0), radius: 0.068 * S * mu },
      { name: `shin${n}`, parent: `thigh${n}`, head: v(0.1 * sx, 0.43, 0), tail: v(0.1 * sx, 0.075, 0), radius: 0.048 * S * mu },
      { name: `foot${n}`, parent: `shin${n}`, head: v(0.1 * sx, 0.075, 0), tail: v(0.1 * sx, 0.03, -0.13), radius: 0.045 * S },
    );
  }
  const bone = (name: string) => bones.find((b) => b.name === name)!;

  // ---------------------------------------------------------------- sculpt
  const P: Prim[] = [];
  const add = (p: Prim) => { P.push(p); return p; };
  const jacket = 'jacket';
  const handRegion = o.gloves ? 'gloves' : 'skin';

  // Torso (under a knitted jacket).
  const belly = o.belly ?? 1;
  add(ellipsoid(v(0, 0.83, 0.005), v(0.135, 0.095, 0.095 * Math.max(1, belly * 0.9)), { bone: 'hips', region: 'pants', k: 0.04 * S }));
  for (const sx of [1, -1]) add(ellipsoid(v(0.06 * sx, 0.8, 0.05), v(0.07, 0.08, 0.06), { bone: 'hips', region: 'pants', k: 0.04 * S }));
  add(ellipsoid(v(0, 0.98, -0.005 * belly), v(0.12 * belly, 0.12, 0.085 * belly), { bone: 'spine', region: jacket, k: 0.05 * S }));
  add(ellipsoid(v(0, 1.12, 0.005), v(0.155 * sh, 0.13, 0.1), { bone: 'chest', region: jacket, k: 0.05 * S }));
  add(ellipsoid(v(0, 1.12, 0.04), v(0.15 * sh, 0.11, 0.07), { bone: 'chest', region: jacket, k: 0.04 * S }));
  for (const sx of [1, -1]) {
    add(ellipsoid(v(0.065 * sx * sh, 1.15, -0.055), v(0.075 * mu, 0.055 * mu, 0.045 * mu), { bone: 'chest', region: jacket, k: 0.035 * S }));
    add(limb(v(0.03 * sx, 1.24, 0.01), v(0.15 * sx * sh, 1.215, 0.01), 0.04 * S * mu, 0.035 * S * mu, { bone: 'chest', region: jacket, k: 0.035 * S }));
  }
  // Neck and head (crocheted face).
  add(limb(v(0, 1.22, 0.005), v(0, 1.33, 0.005), 0.042 * S, 0.038 * S, { bone: 'neck', region: 'skin', k: 0.03 * S }));
  const hv = (x: number, y: number, z: number): V3 => v(x * hs, 1.31 + (y - 1.31) * hs, z * hs);
  add(ellipsoid(hv(0, 1.415, 0.008), v(0.078 * hs, 0.092 * hs, 0.088 * hs), { bone: 'head', region: 'skin', k: 0.03 * S }));
  add(ellipsoid(hv(0, 1.365, -0.018), v(0.066 * hs, 0.07 * hs, 0.07 * hs), { bone: 'head', region: 'skin', k: 0.03 * S }));
  add(sphere(hv(0, 1.316, -0.056), 0.026 * S * hs, { bone: 'head', region: 'skin', k: 0.03 * S }));
  for (const sx of [1, -1]) {
    add(sphere(hv(0.04 * sx, 1.385, -0.056), 0.024 * S * hs, { bone: 'head', region: 'skin', k: 0.025 * S }));
    add(ellipsoid(hv(0.078 * sx, 1.395, 0.005), v(0.012 * hs, 0.028 * hs, 0.02 * hs), { bone: 'head', region: 'skin', k: 0.012 * S }));
    add(sphere(hv(0.032 * sx, 1.402, -0.078), 0.019 * S * hs, { bone: 'head', region: 'skin', k: 0.012 * S, sub: true }));
  }
  add(limb(hv(-0.046, 1.426, -0.07), hv(0.046, 1.426, -0.07), 0.016 * S * hs, 0.016 * S * hs, { bone: 'head', region: 'skin', k: 0.02 * S }));
  add(limb(hv(0, 1.425, -0.078), hv(0, 1.376, -0.104), 0.012 * S * hs, 0.019 * S * hs, { bone: 'head', region: 'skin', k: 0.01 * S }));
  add(limb(hv(-0.023, 1.343, -0.077), hv(0.023, 1.343, -0.077), 0.01 * S * hs, 0.01 * S * hs, { bone: 'head', region: 'skin', k: 0.012 * S }));

  // Arms.
  for (const sx of [1, -1]) {
    const n = sx > 0 ? 'R' : 'L';
    const ub = bone(`upperArm${n}`), fb = bone(`foreArm${n}`), hb = bone(`hand${n}`);
    const tilt = rotXYZ(0, 0, sx * PI / 4);
    add(sphere(v(0.175 * sx * sh, 1.205, 0), 0.058 * S * mu, { bone: `upperArm${n}`, region: jacket, k: 0.04 * S }));
    add(limb(ub.head, ub.tail, 0.047 * S * mu, 0.037 * S * mu, { bone: `upperArm${n}`, region: jacket, k: 0.03 * S }));
    const mid = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    add(ellipsoid(mid(ub.head, ub.tail, 0.5).map((x, i) => x + (i === 2 ? -0.012 * S : 0)) as V3, v(0.034 * mu, 0.07 * arm, 0.034 * mu), { bone: `upperArm${n}`, region: jacket, k: 0.025 * S }, tilt));
    add(sphere(ub.tail, 0.036 * S * mu, { bone: `foreArm${n}`, region: jacket, k: 0.03 * S }));
    add(limb(fb.head, fb.tail, 0.037 * S * mu, 0.027 * S, { bone: `foreArm${n}`, region: jacket, k: 0.03 * S }));
    add(ellipsoid(mid(fb.head, fb.tail, 0.3), v(0.034 * mu, 0.06 * arm, 0.03 * mu), { bone: `foreArm${n}`, region: jacket, k: 0.03 * S }, tilt));
    // Ribbed cuff at the wrist.
    add(torus(mid(fb.head, fb.tail, 0.93), 0.027 * S, 0.011 * S, { bone: `foreArm${n}`, region: 'trim', k: 0.008 * S }, tilt));
    // Gloved hand: palm, knuckles, curled fingers and a thumb.
    const dir: V3 = [Math.cos(PI / 4) * sx, -Math.sin(PI / 4), 0];
    const palmC = mid(hb.head, hb.tail, 0.45);
    add(roundBox(palmC, v(0.014, 0.034, 0.026), 0.01 * S, { bone: `hand${n}`, region: handRegion, k: 0.015 * S }, tilt));
    for (let f = 0; f < 4; f++) {
      const z = (-0.02 + f * 0.013) * S;
      const base: V3 = [hb.tail[0] - dir[0] * 0.012 * S, hb.tail[1] - dir[1] * 0.012 * S, z];
      const tipP: V3 = [base[0] + dir[0] * 0.045 * S - sx * 0.012 * S, base[1] + dir[1] * 0.045 * S, z - 0.004 * S];
      add(limb(base, tipP, 0.0095 * S, 0.008 * S, { bone: `hand${n}`, region: handRegion, k: 0.008 * S }));
    }
    add(limb([palmC[0], palmC[1], palmC[2] - 0.024 * S], [palmC[0] + dir[0] * 0.03 * S - sx * 0.01 * S, palmC[1] + dir[1] * 0.03 * S, palmC[2] - 0.045 * S], 0.011 * S, 0.009 * S, { bone: `hand${n}`, region: handRegion, k: 0.01 * S }));
  }

  // Legs (knitted trousers, felt boots).
  for (const sx of [1, -1]) {
    const n = sx > 0 ? 'R' : 'L';
    const tb = bone(`thigh${n}`), sb = bone(`shin${n}`);
    add(limb(tb.head, tb.tail, 0.075 * S * mu, 0.05 * S * mu, { bone: `thigh${n}`, region: 'pants', k: 0.04 * S }));
    add(ellipsoid(v(0.1 * sx, 0.6, -0.02), v(0.062 * mu, 0.14, 0.06 * mu), { bone: `thigh${n}`, region: 'pants', k: 0.04 * S }));
    add(sphere(v(0.1 * sx, 0.43, -0.012), 0.047 * S * mu, { bone: `shin${n}`, region: 'pants', k: 0.03 * S }));
    add(limb(sb.head, v(0.1 * sx, 0.17, 0), 0.047 * S * mu, 0.038 * S, { bone: `shin${n}`, region: 'pants', k: 0.03 * S }));
    add(ellipsoid(v(0.1 * sx, 0.31, 0.024), v(0.046 * mu, 0.09, 0.044 * mu), { bone: `shin${n}`, region: 'pants', k: 0.03 * S }));
    add(limb(v(0.1 * sx, 0.04, 0.01), v(0.1 * sx, 0.18, 0.005), 0.047 * S, 0.046 * S, { bone: `shin${n}`, region: 'boots', k: 0.015 * S }));
    add(torus(v(0.1 * sx, 0.18, 0.004), 0.046 * S, 0.012 * S, { bone: `shin${n}`, region: 'boots', k: 0.008 * S }));
    add(roundBox(v(0.1 * sx, 0.035, -0.05), v(0.036, 0.022, 0.08), 0.017 * S, { bone: `foot${n}`, region: 'boots', k: 0.03 * S }));
    add(roundBox(v(0.1 * sx, 0.011, -0.05), v(0.042, 0.009, 0.092), 0.006 * S, { bone: `foot${n}`, region: 'soles', k: 0.006 * S }));
  }

  // Jacket details: high ribbed collar, hem band, chest pockets.
  add(torus(v(0, 1.235, 0.008), 0.056 * S, 0.02 * S, { bone: 'chest', region: 'trim', k: 0.012 * S }, rotXYZ(0.15, 0, 0), 1, 0.95));
  add(torus(v(0, 1.265, 0.012), 0.052 * S, 0.017 * S, { bone: 'neck', region: 'trim', k: 0.012 * S }, rotXYZ(0.2, 0, 0)));
  add(torus(v(0, 0.885, 0), 0.128 * S, 0.018 * S, { bone: 'spine', region: 'trim', k: 0.01 * S }, undefined, 1.02 * Math.max(1, belly), 0.74 * Math.max(1, belly)));
  if (o.belt !== false) add(torus(v(0, 0.855, 0.003), 0.127 * S, 0.016 * S, { bone: 'hips', region: 'belt', k: 0.006 * S }, undefined, 1.04, 0.76));
  for (const sx of [1, -1]) add(roundBox(v(0.075 * sx * sh, 1.1, -0.1), v(0.034, 0.03, 0.006), 0.006 * S, { bone: 'chest', region: jacket, k: 0.008 * S }));

  // Headwear and facial hair.
  if (o.headwear === 'beanie') {
    add(ellipsoid(hv(0, 1.448, 0.012), v(0.086 * hs, 0.074 * hs, 0.094 * hs), { bone: 'head', region: 'hat', k: 0.01 * S }));
    add(torus(hv(0, 1.425, 0.01), 0.083 * S * hs, 0.02 * S, { bone: 'head', region: 'hatBand', k: 0.008 * S }, rotXYZ(-0.12, 0, 0), 1, 1.08));
    add(sphere(hv(0, 1.535, 0.015), 0.032 * S * hs, { bone: 'head', region: 'pompom', k: 0.01 * S }));
  } else if (o.headwear === 'helmet') {
    add(ellipsoid(hv(0, 1.448, 0.01), v(0.094 * hs, 0.078 * hs, 0.1 * hs), { bone: 'head', region: 'hat', k: 0.008 * S }));
    add(torus(hv(0, 1.418, 0.008), 0.095 * S * hs, 0.013 * S, { bone: 'head', region: 'hatBand', k: 0.006 * S }, rotXYZ(-0.1, 0, 0), 1.02, 1.1));
  } else if (o.headwear === 'hair') {
    // Spiky felted tufts (like the bearded figure in the reference photo).
    for (let i = 0; i < 9; i++) {
      const a = -PI * 0.8 + (i / 8) * PI * 1.6;
      const base = hv(Math.sin(a) * 0.05, 1.47, Math.cos(a) * 0.05 + 0.015);
      const tipP = hv(Math.sin(a) * 0.066, 1.512, Math.cos(a) * 0.07 + 0.03);
      add(limb(base, tipP, 0.022 * S * hs, 0.009 * S * hs, { bone: 'head', region: 'hair', k: 0.012 * S }));
    }
    add(ellipsoid(hv(0, 1.462, 0.012), v(0.083 * hs, 0.058 * hs, 0.092 * hs), { bone: 'head', region: 'hair', k: 0.012 * S }));
  }
  if (o.beard === 'full') {
    // Felted beard along the jaw and chin, leaving the cheeks bare.
    add(ellipsoid(hv(0, 1.318, -0.05), v(0.056 * hs, 0.036 * hs, 0.04 * hs), { bone: 'head', region: 'beard', k: 0.015 * S }));
    add(sphere(hv(0, 1.292, -0.055), 0.03 * S * hs, { bone: 'head', region: 'beard', k: 0.015 * S }));
    for (const sx of [1, -1]) add(limb(hv(0.062 * sx, 1.37, -0.02), hv(0.04 * sx, 1.315, -0.05), 0.014 * S * hs, 0.02 * S * hs, { bone: 'head', region: 'beard', k: 0.015 * S }));
  }
  if (o.beard === 'full' || o.beard === 'mustache') {
    for (const sx of [1, -1]) {
      add(limb(hv(0.004 * sx, 1.362, -0.098), hv(0.05 * sx, 1.35, -0.078), 0.016 * S * hs, 0.011 * S * hs, { bone: 'head', region: 'mustache', k: 0.012 * S }));
      add(limb(hv(0.05 * sx, 1.35, -0.078), hv(0.066 * sx, 1.366, -0.06), 0.011 * S * hs, 0.005 * S * hs, { bone: 'head', region: 'mustache', k: 0.01 * S }));
    }
  }

  // ---------------------------------------------------------------- regions (materials)
  const c = o.colors;
  const pat = (r: string, d: StitchPattern) => o.patterns?.[r] ?? d;
  const regions: Record<string, RegionDef> = {
    skin: { pattern: pat('skin', 'crochet'), color: c.skin, gauge: 2.3 },
    jacket: { pattern: pat('jacket', 'stocking'), color: c.jacket, gauge: 1.35 },
    trim: { pattern: 'rib', color: c.trim, gauge: 1.5 },
    pants: { pattern: pat('pants', 'stocking'), color: c.pants, gauge: 1.4 },
    belt: { pattern: 'garter', color: c.belt ?? 0x4a3526, gauge: 2 },
    boots: { pattern: 'felt', color: c.boots, fuzz: 1.2 },
    soles: { pattern: 'felt', color: 0x2a2320, roughness: 0.8 },
    gloves: { pattern: 'garter', color: c.gloves ?? 0x3b3f4a, gauge: 2 },
    hat: { pattern: o.headwear === 'helmet' ? 'felt' : 'rib', color: c.hat ?? c.trim, gauge: 1.5 },
    hatBand: { pattern: 'rib', color: c.hat ?? c.trim, gauge: 1.8 },
    pompom: { pattern: 'felt', color: c.trim, fuzz: 2.4 },
    hair: { pattern: 'felt', color: c.hair ?? 0x6b6b70, fuzz: 2 },
    beard: { pattern: 'felt', color: c.beard ?? 0x7a7a80, fuzz: 2.2 },
    mustache: { pattern: 'felt', color: c.mustache ?? c.hair ?? 0x4a3024, fuzz: 1.8 },
  };

  // ---------------------------------------------------------------- hard accessories
  const acc: Accessory[] = [];
  const eyeMat = () => {
    if (o.eyes === 'glow') {
      const m = bead(0x111111);
      m.emissive = new THREE.Color(o.eyeColor ?? 0xff4030);
      m.emissiveIntensity = 2.5;
      return m;
    }
    return bead();
  };
  for (const sx of [1, -1]) {
    acc.push({
      bone: 'head',
      build: () => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.017 * S * hs, 20, 14), eyeMat());
        e.position.set(...hv(0.032 * sx, 1.402, -0.072));
        const glint = new THREE.Mesh(new THREE.SphereGeometry(0.004 * S * hs, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        glint.position.set(0.005 * S * sx, 0.006 * S, -0.014 * S * hs);
        if (o.eyes !== 'glow') e.add(glint);
        return e;
      },
    });
  }
  if (o.glasses) {
    acc.push({
      bone: 'head',
      build: () => {
        const g = new THREE.Group();
        const frame = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.18, clearcoat: 1 });
        for (const sx of [1, -1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026 * S * hs, 0.0045 * S, 10, 32), frame);
          ring.position.set(...hv(0.033 * sx, 1.402, -0.098));
          ring.scale.set(1.1, 0.95, 1);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025 * S * hs, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0.9, transparent: true, opacity: 0.25 }));
          lens.position.copy(ring.position);
          const temple = new THREE.Mesh(new THREE.BoxGeometry(0.004 * S, 0.006 * S, 0.1 * S * hs), frame);
          temple.position.set(...hv(0.074 * sx, 1.405, -0.05));
          g.add(ring, lens, temple);
        }
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * S, 0.004 * S, 0.02 * S, 8), frame);
        bridge.rotation.z = PI / 2;
        bridge.position.set(...hv(0, 1.41, -0.1));
        g.add(bridge);
        return g;
      },
    });
  }
  if (o.jacketButtons !== false) {
    acc.push({
      bone: 'chest',
      build: () => {
        const g = new THREE.Group();
        const m = wood(0xd9b38a);
        const probe = P.filter((p) => !p.sub);
        for (const y of [0.97, 1.05, 1.13]) {
          // Sit each button on the sculpted surface.
          let z = -0.2 * S;
          while (z < 0 && evalSDF(probe, 0, y * S, z) > 0) z += 0.002 * S;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * S, 0.014 * S, 0.006 * S, 16), m);
          b.rotation.x = PI / 2;
          b.position.set(0, y * S, z - 0.002 * S);
          g.add(b);
        }
        return g;
      },
    });
  }
  if (o.belt !== false) {
    acc.push({
      bone: 'hips',
      build: () => {
        const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.018 * S, 0.005 * S, 8, 4), metal(0xd8b060, 0.3));
        buckle.rotation.z = PI / 4;
        buckle.position.set(0, 0.855 * S, -0.1 * S);
        return buckle;
      },
    });
  }

  return { name: o.name, bones, prims: P, regions, cell: (o.cell ?? 0.011) * S, density: 24 / Math.sqrt(S), accessories: acc, mergeRegions: o.merged };
}

// ---------------------------------------------------------------- animation

export interface HumanoidPose {
  t: number;
  /** Ground speed as a fraction of run speed (0..~1.4). */
  speed: number;
  /** Walk cycle phase (radians), advanced by distance travelled. */
  phase: number;
  /** Aim pitch in radians (look up/down). */
  pitch: number;
  crouch: number;
  airborne: boolean;
  /** Holding a weapon two-handed (else arms swing). */
  aiming: boolean;
  /** Extra forward lean (brutes), radians. */
  hunch?: number;
  /** 0..1 knocked-down blend. */
  downed?: number;
}

const tmpV = new THREE.Vector3();

/** Procedural animation: walk/run cycle, two-handed aim via IK, crouch, jump, knock-down. */
export function poseHumanoid(f: FigureInstance, st: HumanoidPose, scale = 1, gun?: THREE.Object3D): void {
  const p = f.poser;
  p.reset();
  const stride = Math.min(1.2, st.speed);
  const ph = st.phase;
  const breath = Math.sin(st.t * 2.2) * 0.02;

  // Hips: bob, sway and crouch.
  const bob = -Math.abs(Math.cos(ph)) * 0.02 * stride + 0.01 * stride;
  p.setHips(Math.sin(ph) * 0.012 * stride * scale, (bob - st.crouch * 0.18) * scale, 0);
  p.rotate('hips', 0, Math.sin(ph) * 0.12 * stride, 0);
  const lean = (st.hunch ?? 0) + stride * 0.08 + st.crouch * 0.25;
  p.rotate('spine', lean * 0.5 + breath * 0.3, -Math.sin(ph) * 0.1 * stride, 0);
  p.rotate('chest', lean * 0.5 + (st.aiming ? st.pitch * 0.35 : 0) - breath * 0.5, -Math.sin(ph) * 0.06 * stride, 0);
  p.rotate('neck', -(st.hunch ?? 0) * 0.6, 0, 0);
  p.rotate('head', st.pitch * (st.aiming ? 0.45 : 0.8) - lean * 0.4, 0, 0);

  // Legs.
  for (const [n, sgn] of [['R', 1], ['L', -1]] as const) {
    const swing = Math.sin(ph) * sgn;
    const knee = (0.15 + 0.85 * Math.max(0, Math.cos(ph) * sgn)) * stride;
    let thigh = swing * 0.55 * stride + st.crouch * 1.0;
    let shin = -knee * 1.1 - st.crouch * 1.7;
    if (st.airborne) { thigh = 0.55 + (sgn > 0 ? 0.25 : -0.15); shin = -1.0; }
    p.rotate(`thigh${n}`, thigh, 0, 0);
    p.rotate(`shin${n}`, shin, 0, 0);
    p.rotate(`foot${n}`, -(thigh + shin) * 0.6, 0, 0);
  }

  // Arms: relaxed swing, or both hands on the blaster via IK.
  if (st.aiming && gun) {
    const chest = p.worldPos('chest');
    const pitchQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(st.pitch, 0, 0));
    const grip = new THREE.Vector3(0.1, -0.02, -0.32).multiplyScalar(scale).applyQuaternion(pitchQ).add(chest);
    const fore = new THREE.Vector3(0.03, 0.03, -0.5).multiplyScalar(scale).applyQuaternion(pitchQ).add(chest);
    p.ik('upperArmR', 'foreArmR', grip, tmpV.set(1, -1.2, 0.3));
    p.ik('upperArmL', 'foreArmL', fore, tmpV.set(-1, -1.2, -0.2));
    const aim = new THREE.Vector3(0, 0, -1).applyQuaternion(pitchQ);
    p.point('handR', aim.clone().add(new THREE.Vector3(0, -0.3, 0)));
    p.point('handL', aim.clone().add(new THREE.Vector3(0.3, -0.5, 0)));
    gun.position.copy(grip);
    gun.quaternion.copy(pitchQ);
  } else {
    for (const [n, sgn] of [['R', 1], ['L', -1]] as const) {
      const swing = -Math.sin(ph) * sgn * 0.5 * stride;
      p.rotate(`upperArm${n}`, swing, 0, -sgn * (0.62 - breath));
      p.rotate(`foreArm${n}`, -0.25 - stride * 0.4, 0, 0);
    }
  }

  // Knocked down: fold at the hips and knees (the caller tips the root over).
  const down = st.downed ?? 0;
  if (down > 0) {
    p.rotate('spine', -0.3 * down, 0, 0);
    for (const n of ['R', 'L']) {
      p.rotate(`thigh${n}`, 0.4 * down, 0, n === 'R' ? 0.2 * down : -0.2 * down);
      p.rotate(`upperArm${n}`, -0.8 * down, 0, n === 'R' ? -0.4 : 0.4);
    }
  }
}

/** Material helper for props held by figures. */
export function knitMat(color: number, pattern: StitchPattern, uv: [number, number], gauge = 1.5): THREE.Material {
  return createWoolMaterial({ color, pattern, uvSize: uv, gauge });
}
