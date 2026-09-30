import * as THREE from 'three';
import { bead } from '../scene/materials.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { buildFigure, instantiate, type Accessory, type BoneDef, type FigureDef, type FigureInstance } from './rig.ts';
import { ellipsoid, limb, sphere, torus, type Prim, type V3 } from './sdf.ts';

/** Non-humanoid enemies: a jointed crochet spider-crab and a felted moth. */

export type CreatureInstance = FigureInstance;

function glowEye(r: number, color: number, at: V3): Accessory {
  return {
    bone: 'head',
    build: () => {
      const m = bead(0x111111);
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 2.4;
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), m);
      e.position.set(...at);
      return e;
    },
  };
}

// ---------------------------------------------------------------- Scuttler

const LEG_ANGLES = [-0.75, 0, 0.7];

function scuttlerDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'body', parent: null, head: [0, 0.3, 0.06], tail: [0, 0.31, -0.14], radius: 0.13 },
    { name: 'abdomen', parent: 'body', head: [0, 0.32, 0.08], tail: [0, 0.36, 0.42], radius: 0.16 },
    { name: 'head', parent: 'body', head: [0, 0.3, -0.14], tail: [0, 0.28, -0.3], radius: 0.085 },
  ];
  const P: Prim[] = [
    ellipsoid([0, 0.3, -0.03], [0.14, 0.09, 0.15], { bone: 'body', region: 'shell', k: 0.04 }),
    ellipsoid([0, 0.36, 0.25], [0.17, 0.14, 0.2], { bone: 'abdomen', region: 'shell', k: 0.05 }),
    ellipsoid([0, 0.29, -0.2], [0.085, 0.07, 0.08], { bone: 'head', region: 'shell', k: 0.04 }),
  ];
  // Crocheted stripes around the abdomen.
  for (const [z, r] of [[0.17, 0.155], [0.27, 0.165], [0.37, 0.12]] as const) {
    P.push(torus([0, 0.36, z], r, 0.018, { bone: 'abdomen', region: 'stripe', k: 0.012 }, [1, 0, 0, 0, 0, 1, 0, -1, 0], 1, 0.8));
  }
  for (const sx of [1, -1]) {
    P.push(limb([0.03 * sx, 0.25, -0.26], [0.02 * sx, 0.18, -0.3], 0.018, 0.008, { bone: 'head', region: 'legs', k: 0.012 }));
  }
  for (let i = 0; i < 3; i++) {
    for (const sx of [1, -1]) {
      const n = `${sx > 0 ? 'R' : 'L'}${i}`;
      const a = LEG_ANGLES[i];
      const dir: V3 = [Math.cos(a) * sx, 0, Math.sin(a)];
      const attach: V3 = [0.1 * sx, 0.3, -0.04 + i * 0.07];
      const hip: V3 = [attach[0] + dir[0] * 0.09, 0.34, attach[2] + dir[2] * 0.09];
      const knee: V3 = [attach[0] + dir[0] * 0.3, 0.5, attach[2] + dir[2] * 0.3];
      const foot: V3 = [attach[0] + dir[0] * 0.58, 0.015, attach[2] + dir[2] * 0.58];
      bones.push(
        { name: `coxa${n}`, parent: 'body', head: attach, tail: hip, radius: 0.03 },
        { name: `femur${n}`, parent: `coxa${n}`, head: hip, tail: knee, radius: 0.028 },
        { name: `tibia${n}`, parent: `femur${n}`, head: knee, tail: foot, radius: 0.022 },
      );
      P.push(
        limb(attach, hip, 0.035, 0.03, { bone: `coxa${n}`, region: 'legs', k: 0.02 }),
        limb(hip, knee, 0.03, 0.026, { bone: `femur${n}`, region: 'legs', k: 0.015 }),
        sphere(knee, 0.03, { bone: `tibia${n}`, region: 'stripe', k: 0.012 }),
        limb(knee, foot, 0.025, 0.01, { bone: `tibia${n}`, region: 'legs', k: 0.015 }),
      );
    }
  }
  return {
    name: 'scuttler', bones, prims: P, cell: 0.012, density: 14,
    regions: {
      shell: { pattern: 'crochet', color: 0x6a3c9a, gauge: 1.2 },
      stripe: { pattern: 'rib', color: 0x9ae06a, gauge: 1.5 },
      legs: { pattern: 'rib', color: 0x2a1f3a, gauge: 1.8 },
    },
    accessories: [
      glowEye(0.02, 0x9aff5a, [0.035, 0.32, -0.27]), glowEye(0.02, 0x9aff5a, [-0.035, 0.32, -0.27]),
      glowEye(0.012, 0x9aff5a, [0.06, 0.33, -0.24]), glowEye(0.012, 0x9aff5a, [-0.06, 0.33, -0.24]),
    ],
  };
}

export function createScuttler(): CreatureInstance {
  return instantiate(buildFigure(scuttlerDef()));
}

const axisTmp = new THREE.Vector3();

/** Tripod gait: legs R0/L1/R2 step while L0/R1/L2 push, then swap. */
export function poseScuttler(f: CreatureInstance, t: number, phase: number, amp: number): void {
  const p = f.poser;
  p.reset();
  p.setHips(0, Math.abs(Math.sin(phase)) * 0.02 * amp, 0);
  p.rotate('body', Math.sin(phase * 2) * 0.03 * amp, 0, Math.sin(phase) * 0.04 * amp);
  p.rotate('abdomen', Math.sin(t * 3) * 0.08, Math.sin(phase) * 0.1 * amp, 0);
  for (let i = 0; i < 3; i++) {
    for (const sx of [1, -1]) {
      const n = `${sx > 0 ? 'R' : 'L'}${i}`;
      const group = (i + (sx > 0 ? 0 : 1)) % 2;
      const ph = phase + group * Math.PI;
      const lift = Math.max(0, Math.sin(ph)) * amp;
      const swing = Math.cos(ph) * 0.4 * amp;
      const a = LEG_ANGLES[i];
      axisTmp.set(-Math.sin(a), 0, Math.cos(a) * sx).normalize();
      p.rotate(`coxa${n}`, 0, swing * sx, 0);
      p.rotateAxis(`femur${n}`, axisTmp, lift * 0.55 * sx);
      p.rotateAxis(`tibia${n}`, axisTmp, -lift * 0.35 * sx);
    }
  }
}

// ---------------------------------------------------------------- Moth

function wingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#8a7560');
  grad.addColorStop(1, '#c9b494');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // Eye spot and wavy bands, like a felted appliqué.
  for (const [r, col] of [[46, '#3a2a20'], [34, '#e8c070'], [20, '#2a1c14'], [7, '#f4eadc']] as const) {
    g.fillStyle = col;
    g.beginPath(); g.arc(150, 130, r, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(60,40,28,.55)';
  g.lineWidth = 7;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let y = 0; y <= 256; y += 8) g.lineTo(60 + k * 70 + Math.sin(y * 0.06 + k) * 10, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wing(side: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.2, 0.22, 0.52, 0.2, 0.58, 0.02);
  s.bezierCurveTo(0.6, -0.14, 0.34, -0.2, 0.18, -0.26);
  s.bezierCurveTo(0.08, -0.22, 0.02, -0.1, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 24);
  // Normalise UVs to 0..1 for the painted pattern.
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.6, (uv.getY(i) + 0.26) / 0.48);
  const mat = createWoolMaterial({ color: 0xffffff, pattern: 'felt', uvSize: [0.6, 0.5], fuzz: 1.6 });
  mat.map = wingTexture();
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(side, 1, 1);
  return m;
}

function mothDef(): FigureDef {
  const bones: BoneDef[] = [
    { name: 'thorax', parent: null, head: [0, 0.35, 0.02], tail: [0, 0.35, -0.1], radius: 0.07 },
    { name: 'abdomen', parent: 'thorax', head: [0, 0.35, 0.02], tail: [0, 0.32, 0.3], radius: 0.06 },
    { name: 'head', parent: 'thorax', head: [0, 0.36, -0.1], tail: [0, 0.36, -0.19], radius: 0.05 },
    { name: 'wingR', parent: 'thorax', head: [0.05, 0.38, -0.05], tail: [0.55, 0.38, -0.05], radius: 0.02 },
    { name: 'wingL', parent: 'thorax', head: [-0.05, 0.38, -0.05], tail: [-0.55, 0.38, -0.05], radius: 0.02 },
  ];
  const P: Prim[] = [
    ellipsoid([0, 0.35, -0.04], [0.07, 0.065, 0.085], { bone: 'thorax', region: 'fur', k: 0.03 }),
    ellipsoid([0, 0.33, 0.15], [0.055, 0.05, 0.16], { bone: 'abdomen', region: 'body', k: 0.03 }),
    sphere([0, 0.36, -0.15], 0.048, { bone: 'head', region: 'fur', k: 0.03 }),
  ];
  for (const z of [0.08, 0.15, 0.22]) P.push(torus([0, 0.33, z], 0.05, 0.01, { bone: 'abdomen', region: 'fur', k: 0.01 }, [1, 0, 0, 0, 0, 1, 0, -1, 0], 1, 0.9));
  for (const sx of [1, -1]) {
    // Feathery antennae and little legs.
    P.push(limb([0.02 * sx, 0.39, -0.17], [0.09 * sx, 0.5, -0.27], 0.008, 0.005, { bone: 'head', region: 'antenna', k: 0.008 }));
    for (let i = 0; i < 3; i++) P.push(limb([0.04 * sx, 0.3, -0.07 + i * 0.05], [0.09 * sx, 0.24, -0.1 + i * 0.07], 0.009, 0.006, { bone: 'thorax', region: 'antenna', k: 0.008 }));
  }
  return {
    name: 'moth', bones, prims: P, cell: 0.009, density: 16,
    regions: {
      fur: { pattern: 'felt', color: 0x9a8a74, fuzz: 2.6 },
      body: { pattern: 'rib', color: 0x7a6a56, gauge: 1.6 },
      antenna: { pattern: 'felt', color: 0x4a3a2c },
    },
    accessories: [
      glowEye(0.02, 0xffd24a, [0.03, 0.37, -0.185]), glowEye(0.02, 0xffd24a, [-0.03, 0.37, -0.185]),
      { bone: 'wingR', build: () => { const w = wing(1); w.position.set(0.05, 0.38, -0.05); return w; } },
      { bone: 'wingL', build: () => { const w = wing(-1); w.position.set(-0.05, 0.38, -0.05); return w; } },
    ],
  };
}

export function createMoth(): CreatureInstance {
  return instantiate(buildFigure(mothDef()));
}

export function poseMoth(f: CreatureInstance, t: number, seed = 0): void {
  const p = f.poser;
  p.reset();
  const flap = Math.sin(t * 17 + seed);
  p.setHips(0, Math.sin(t * 17 + seed + 0.8) * 0.02, 0);
  p.rotate('thorax', 0.15 + Math.sin(t * 2 + seed) * 0.05, 0, Math.sin(t * 1.3 + seed) * 0.1);
  p.rotate('abdomen', -0.1 + flap * 0.06, 0, 0);
  p.rotate('wingR', 0, 0, 0.15 + flap * 0.85);
  p.rotate('wingL', 0, 0, -0.15 - flap * 0.85);
}
