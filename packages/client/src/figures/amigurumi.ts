import * as THREE from 'three';
import { bead } from '../scene/materials.ts';
import type { StitchPattern } from '../wool/stitches.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import type { HumanoidOptions } from './humanoid.ts';
import type { Accessory, BoneDef, FigureDef, RegionDef } from './rig.ts';
import { ellipsoid, limb, rotXYZ, sphere, torus, type Prim, type V3 } from './sdf.ts';

/**
 * Amigurumi: the cosy hand-crocheted doll style of stop-motion knit films.
 * A big round crochet head (about a third of the figure), tiny bead eyes,
 * felt blush on the cheeks, a stitched smile and a button nose; a chubby
 * sweater body with a ribbed turtleneck, stubby limbs, mitten hands and
 * round felt shoes. Same skeleton (bone names, A-pose, facing -Z, 1.5 units
 * tall) as the realistic figures, so every animation, aim pose and held
 * weapon works unchanged.
 */

/** Head centre and radius at scale 1, for props that sit on the head (the boss's hat and ears). */
export const AMI_HEAD = { y: 1.17, r: 0.27 };

const PI = Math.PI;

export function amigurumiDef(o: HumanoidOptions): FigureDef {
  const S = o.scale ?? 1;
  const sh = o.shoulders ?? 1;
  const mu = o.muscle ?? 1;
  const belly = o.belly ?? 1;
  const hs = o.headSize ?? 1;
  const arm = o.armLength ?? 1;
  const v = (x: number, y: number, z: number): V3 => [x * S, y * S, z * S];
  const HR = AMI_HEAD.r * hs;
  const HY = AMI_HEAD.y + (hs - 1) * 0.12;
  /** A point on the head, from unit-head coordinates (x right, y up, z back; -z is the face). */
  const hp = (x: number, y: number, z: number): V3 => v(x * HR, HY + y * HR, z * HR);

  // ---------------------------------------------------------------- skeleton
  const shoulderX = 0.165 * sh;
  const shoulderY = 0.84;
  const drop = PI / 4;
  // Stubby, but long enough to reach the blaster grip with both hands.
  const ua = 0.2 * arm, fa = 0.17 * arm, ha = 0.07;
  const bones: BoneDef[] = [
    { name: 'hips', parent: null, head: v(0, 0.52, 0), tail: v(0, 0.62, 0), radius: 0.17 * S },
    { name: 'spine', parent: 'hips', head: v(0, 0.62, 0), tail: v(0, 0.74, 0), radius: 0.18 * S * belly },
    { name: 'chest', parent: 'spine', head: v(0, 0.74, 0), tail: v(0, 0.86, 0), radius: 0.17 * S * sh },
    { name: 'neck', parent: 'chest', head: v(0, 0.86, 0), tail: v(0, 0.92, 0), radius: 0.07 * S },
    { name: 'head', parent: 'neck', head: v(0, 0.92, 0), tail: v(0, HY + HR, 0), radius: HR * S },
  ];
  for (const sx of [1, -1]) {
    const n = sx > 0 ? 'R' : 'L';
    const shoulder: V3 = [shoulderX * sx, shoulderY, 0];
    const elbow: V3 = [shoulder[0] + Math.cos(drop) * ua * sx, shoulder[1] - Math.sin(drop) * ua, 0];
    const wrist: V3 = [elbow[0] + Math.cos(drop) * fa * sx, elbow[1] - Math.sin(drop) * fa, 0];
    const tip: V3 = [wrist[0] + Math.cos(drop) * ha * sx, wrist[1] - Math.sin(drop) * ha, 0];
    bones.push(
      { name: `clavicle${n}`, parent: 'chest', head: v(0.03 * sx, shoulderY, 0), tail: v(...shoulder), radius: 0.07 * S },
      { name: `upperArm${n}`, parent: `clavicle${n}`, head: v(...shoulder), tail: v(...elbow), radius: 0.065 * S * mu, seam: [0, 0, 1] },
      { name: `foreArm${n}`, parent: `upperArm${n}`, head: v(...elbow), tail: v(...wrist), radius: 0.06 * S * mu, seam: [0, 0, 1] },
      { name: `hand${n}`, parent: `foreArm${n}`, head: v(...wrist), tail: v(...tip), radius: 0.06 * S, seam: [0, 0, 1] },
      { name: `thigh${n}`, parent: 'hips', head: v(0.085 * sx, 0.52, 0), tail: v(0.09 * sx, 0.3, 0), radius: 0.085 * S * mu },
      { name: `shin${n}`, parent: `thigh${n}`, head: v(0.09 * sx, 0.3, 0), tail: v(0.09 * sx, 0.08, 0), radius: 0.075 * S * mu },
      { name: `foot${n}`, parent: `shin${n}`, head: v(0.09 * sx, 0.08, 0), tail: v(0.09 * sx, 0.04, -0.12), radius: 0.06 * S },
    );
  }
  const bone = (name: string) => bones.find((b) => b.name === name)!;
  const mid = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------------------------------------------------------------- sculpt
  const P: Prim[] = [];
  const add = (p: Prim) => { P.push(p); return p; };
  const handRegion = o.gloves ? 'gloves' : 'skin';

  // Chubby sweater body, rounded like a stuffed bean.
  add(ellipsoid(v(0, 0.69, 0.005), v(0.19 * sh * belly, 0.2, 0.165 * belly), { bone: 'spine', region: 'jacket', k: 0.06 * S }));
  add(ellipsoid(v(0, 0.8, 0.01), v(0.17 * sh, 0.11, 0.14), { bone: 'chest', region: 'jacket', k: 0.06 * S }));
  // Ribbed hem and the turtleneck (a thick folded collar).
  add(torus(v(0, 0.535, 0.005), 0.17 * S * belly, 0.032 * S, { bone: 'hips', region: 'trim', k: 0.015 * S }, undefined, 1.05, 0.9));
  add(torus(v(0, 0.885, 0.01), 0.085 * S, 0.042 * S, { bone: 'neck', region: 'trim', k: 0.02 * S }));
  add(torus(v(0, 0.925, 0.01), 0.075 * S, 0.035 * S, { bone: 'neck', region: 'trim', k: 0.02 * S }));
  // Trousers peeking out below the sweater.
  add(ellipsoid(v(0, 0.52, 0.005), v(0.16 * belly, 0.08, 0.14 * belly), { bone: 'hips', region: 'pants', k: 0.05 * S }));

  // Big round crochet head.
  add(ellipsoid(hp(0, 0, 0), v(HR, HR * 0.95, HR * 0.93), { bone: 'head', region: 'skin', k: 0.05 * S }));
  // Button nose, little ears.
  add(sphere(hp(0, -0.18, -0.92), 0.13 * HR * S, { bone: 'head', region: 'skin', k: 0.02 * S }));
  for (const sx of [1, -1]) add(ellipsoid(hp(0.97 * sx, -0.08, 0.02), v(0.13 * HR, 0.19 * HR, 0.11 * HR), { bone: 'head', region: 'skin', k: 0.03 * S }));

  // Stubby arms in chunky sleeves, ribbed cuffs, mitten hands.
  for (const sx of [1, -1]) {
    const n = sx > 0 ? 'R' : 'L';
    const ub = bone(`upperArm${n}`), fb = bone(`foreArm${n}`), hb = bone(`hand${n}`);
    const tilt = rotXYZ(0, 0, sx * PI / 4);
    add(sphere(ub.head, 0.072 * S * mu, { bone: `upperArm${n}`, region: 'jacket', k: 0.05 * S }));
    add(limb(ub.head, ub.tail, 0.066 * S * mu, 0.06 * S * mu, { bone: `upperArm${n}`, region: 'jacket', k: 0.04 * S }));
    add(limb(fb.head, fb.tail, 0.06 * S * mu, 0.055 * S * mu, { bone: `foreArm${n}`, region: 'jacket', k: 0.04 * S }));
    add(torus(mid(fb.head, fb.tail, 0.92), 0.05 * S * mu, 0.018 * S, { bone: `foreArm${n}`, region: 'trim', k: 0.01 * S }, tilt));
    const palm = mid(hb.head, hb.tail, 0.55);
    add(ellipsoid(palm, v(0.052, 0.068, 0.05), { bone: `hand${n}`, region: handRegion, k: 0.02 * S }, tilt));
    add(sphere([palm[0] - 0.01 * S * sx, palm[1] + 0.02 * S, palm[2] - 0.045 * S], 0.025 * S, { bone: `hand${n}`, region: handRegion, k: 0.015 * S }));
  }

  // Short legs and round felt shoes.
  for (const sx of [1, -1]) {
    const n = sx > 0 ? 'R' : 'L';
    const tb = bone(`thigh${n}`), sb = bone(`shin${n}`);
    add(limb(tb.head, tb.tail, 0.085 * S * mu, 0.075 * S * mu, { bone: `thigh${n}`, region: 'pants', k: 0.04 * S }));
    add(limb(sb.head, v(0.09 * sx, 0.11, 0), 0.075 * S * mu, 0.068 * S * mu, { bone: `shin${n}`, region: 'pants', k: 0.03 * S }));
    add(torus(v(0.09 * sx, 0.12, 0), 0.065 * S * mu, 0.016 * S, { bone: `shin${n}`, region: 'trim', k: 0.01 * S }));
    add(ellipsoid(v(0.09 * sx, 0.055, -0.035), v(0.068, 0.055, 0.1), { bone: `foot${n}`, region: 'boots', k: 0.03 * S }));
  }

  // Headwear.
  if (o.headwear === 'hair') {
    // A knitted hair cap over the crown and back of the head, with a fringe of locks.
    add(ellipsoid(hp(0, 0.4, 0.14), v(HR * 1.04, HR * 0.7, HR * 0.97), { bone: 'head', region: 'hair', k: 0.03 * S }));
    for (let i = 0; i < 7; i++) {
      const a = -0.75 + (i / 6) * 1.5;
      add(sphere(hp(Math.sin(a) * 0.7, 0.6 + Math.cos(a * 2) * 0.04, -Math.cos(a) * 0.68), 0.16 * HR * S, { bone: 'head', region: 'hair', k: 0.04 * S }));
    }
  } else if (o.headwear === 'beanie') {
    add(ellipsoid(hp(0, 0.34, 0.04), v(HR * 1.06, HR * 0.78, HR * 1.04), { bone: 'head', region: 'hat', k: 0.02 * S }));
    add(torus(hp(0, 0.18, 0.02), HR * 1.02 * S, 0.055 * HR * S * 1.6, { bone: 'head', region: 'hatBand', k: 0.015 * S }, rotXYZ(-0.12, 0, 0), 1, 1.02));
    add(sphere(hp(0, 1.08, 0.08), 0.3 * HR * S, { bone: 'head', region: 'pompom', k: 0.02 * S }));
  } else if (o.headwear === 'helmet') {
    add(ellipsoid(hp(0, 0.32, 0.04), v(HR * 1.08, HR * 0.8, HR * 1.06), { bone: 'head', region: 'hat', k: 0.015 * S }));
    add(torus(hp(0, 0.16, 0.02), HR * 1.07 * S, 0.06 * HR * S, { bone: 'head', region: 'hatBand', k: 0.01 * S }, rotXYZ(-0.1, 0, 0), 1.02, 1.08));
  } else {
    // Bald on top with fluffy tufts over the ears, like a knitted grandpa.
    for (const sx of [1, -1]) add(ellipsoid(hp(0.85 * sx, 0.28, 0.25), v(HR * 0.24, HR * 0.3, HR * 0.38), { bone: 'head', region: 'hair', k: 0.03 * S }));
  }

  // Facial hair.
  if (o.beard === 'full') {
    add(ellipsoid(hp(0, -0.58, -0.55), v(HR * 0.7, HR * 0.42, HR * 0.42), { bone: 'head', region: 'beard', k: 0.04 * S }));
    for (const sx of [1, -1]) add(ellipsoid(hp(0.68 * sx, -0.35, -0.48), v(HR * 0.25, HR * 0.38, HR * 0.3), { bone: 'head', region: 'beard', k: 0.04 * S }));
  }
  if (o.beard === 'full' || o.beard === 'mustache') {
    for (const sx of [1, -1]) {
      add(limb(hp(0.03 * sx, -0.34, -0.93), hp(0.32 * sx, -0.4, -0.8), 0.08 * HR * S, 0.05 * HR * S, { bone: 'head', region: 'mustache', k: 0.015 * S }));
    }
  }

  // ---------------------------------------------------------------- regions
  const c = o.colors;
  const pat = (r: string, d: StitchPattern) => o.patterns?.[r] ?? d;
  const regions: Record<string, RegionDef> = {
    skin: { pattern: pat('skin', 'crochet'), color: c.skin, gauge: 1.6 },
    jacket: { pattern: pat('jacket', 'stocking'), color: c.jacket, gauge: 1.0 },
    trim: { pattern: 'rib', color: c.trim, gauge: 1.2 },
    pants: { pattern: pat('pants', 'stocking'), color: c.pants, gauge: 1.1 },
    boots: { pattern: 'felt', color: c.boots, fuzz: 1.4 },
    gloves: { pattern: 'garter', color: c.gloves ?? c.trim, gauge: 1.6 },
    hat: { pattern: o.headwear === 'helmet' ? 'felt' : 'rib', color: c.hat ?? c.trim, gauge: 1.1 },
    hatBand: { pattern: 'rib', color: c.hat ?? c.trim, gauge: 1.4 },
    pompom: { pattern: 'felt', color: c.trim, fuzz: 2.8 },
    hair: { pattern: pat('hair', 'wound'), color: c.hair ?? 0x6b4a30, gauge: 1.4, fuzz: 1.6 },
    beard: { pattern: 'felt', color: c.beard ?? 0xd8d4cc, fuzz: 2.6 },
    mustache: { pattern: 'felt', color: c.mustache ?? c.hair ?? 0x4a3024, fuzz: 2 },
  };

  // ---------------------------------------------------------------- face: beads, blush, smile
  const acc: Accessory[] = [];
  const glow = o.eyes === 'glow';
  for (const sx of [1, -1]) {
    acc.push({
      bone: 'head',
      build: () => {
        const m = bead(0x101010);
        if (glow) { m.emissive = new THREE.Color(o.eyeColor ?? 0xff4030); m.emissiveIntensity = 2.4; }
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.1 * HR * S, 18, 12), m);
        e.scale.set(1, 1.15, 0.7);
        e.position.set(...hp(0.33 * sx, 0.04, -0.89));
        if (!glow) {
          const glint = new THREE.Mesh(new THREE.SphereGeometry(0.028 * HR * S, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          glint.position.set(0.03 * HR * S * sx, 0.045 * HR * S, -0.08 * HR * S);
          e.add(glint);
        }
        return e;
      },
    });
    if (!glow) {
      acc.push({
        bone: 'head',
        build: () => {
          // A round of pink felt on each cheek.
          const blush = new THREE.Mesh(new THREE.SphereGeometry(0.17 * HR * S, 16, 10), createWoolMaterial({ color: 0xe8867a, pattern: 'felt', uvSize: [0.1, 0.1], fuzz: 1.6 }));
          blush.scale.set(1, 0.72, 0.28);
          const at = hp(0.55 * sx, -0.22, -0.78);
          blush.position.set(...at);
          blush.lookAt(at[0] * 2.2, at[1], at[2] * 1.6);
          return blush;
        },
      });
    }
  }
  if (o.beard !== 'full') {
    acc.push({
      bone: 'head',
      build: () => {
        // A little stitched smile in dark yarn.
        const smile = new THREE.Mesh(new THREE.TorusGeometry(0.16 * HR * S, 0.018 * HR * S, 6, 16, PI * 0.8), createWoolMaterial({ color: glow ? 0x3a1010 : 0x5a2a1e, pattern: 'rib', uvSize: [0.05, 0.05], gauge: 3 }));
        smile.rotation.set(0, 0, PI * 1.1);
        smile.position.set(...hp(0, -0.36, -0.9));
        return smile;
      },
    });
  }
  if (o.glasses) {
    acc.push({
      bone: 'head',
      build: () => {
        const g = new THREE.Group();
        const frame = new THREE.MeshPhysicalMaterial({ color: 0x2a1a10, roughness: 0.3, clearcoat: 1 });
        for (const sx of [1, -1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 * HR * S, 0.025 * HR * S, 8, 28), frame);
          ring.position.set(...hp(0.33 * sx, 0.04, -0.97));
          g.add(ring);
        }
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * HR * S, 0.02 * HR * S, 0.25 * HR * S, 8), frame);
        bridge.rotation.z = PI / 2;
        bridge.position.set(...hp(0, 0.08, -1.0));
        g.add(bridge);
        return g;
      },
    });
  }

  return { name: o.name, bones, prims: P, regions, cell: (o.cell ?? 0.011) * S * 1.15, density: 18 / Math.sqrt(S), accessories: acc, mergeRegions: o.merged };
}
