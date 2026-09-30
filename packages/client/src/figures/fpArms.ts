import * as THREE from 'three';
import { buildFigure, instantiate, type BoneDef, type FigureDef } from './rig.ts';
import { limb, roundBox, rotXYZ, sphere, torus, type Prim, type V3 } from './sdf.ts';

/**
 * First-person arms: knitted sleeves and gloved hands sculpted in the pose of
 * holding the blaster. Coordinates are in the view-model holder's space
 * (forward -Z, +X right, +Y up); the blaster grip sits near the origin.
 */

function hand(P: Prim[], bone: string, wrist: V3, dir: V3, side: number, gripAxis: V3, grip: V3, gripR: number): void {
  // Palm.
  const palm: V3 = [wrist[0] + dir[0] * 0.035, wrist[1] + dir[1] * 0.035, wrist[2] + dir[2] * 0.035];
  P.push(roundBox(palm, [0.017, 0.03, 0.026], 0.012, { bone, region: 'gloves', k: 0.012 }, rotXYZ(Math.atan2(dir[2], -dir[1]), 0, -side * 0.3)));
  // Four fingers wrapping around the grip cylinder, and a thumb over the top.
  const up = gripAxis;
  for (let f = 0; f < 4; f++) {
    const along = -0.018 + f * 0.013;
    const c: V3 = [grip[0] + up[0] * along, grip[1] + up[1] * along, grip[2] + up[2] * along];
    let prev: V3 | null = null;
    for (let s = 0; s <= 4; s++) {
      const a = -0.6 + (s / 4) * 2.6; // wrap angle around the grip
      const p: V3 = [c[0] + side * Math.cos(a) * (gripR + 0.012), c[1] + Math.sin(a) * 0.004, c[2] + Math.sin(a) * (gripR + 0.012)];
      if (prev) P.push(limb(prev, p, 0.0105, 0.0095, { bone, region: 'gloves', k: 0.006 }));
      prev = p;
    }
  }
  const t0: V3 = [palm[0] - side * 0.02, palm[1] + 0.01, palm[2] - 0.01];
  const t1: V3 = [grip[0] - side * 0.018, grip[1] + 0.03, grip[2] - 0.035];
  P.push(limb(t0, t1, 0.012, 0.01, { bone, region: 'gloves', k: 0.01 }));
  P.push(sphere(palm, 0.02, { bone, region: 'gloves', k: 0.02 }));
}

export function fpArmsDef(jacket: number, gloves = 0x3b3f4a): FigureDef {
  const rw: V3 = [0.03, -0.085, 0.085];
  const re: V3 = [0.14, -0.3, 0.42];
  const lw: V3 = [-0.045, -0.075, -0.12];
  const le: V3 = [-0.3, -0.3, 0.12];
  const bones: BoneDef[] = [
    { name: 'root', parent: null, head: [0, 0, 0.3], tail: [0, 0, 0.5], radius: 0.05 },
    { name: 'foreArmR', parent: 'root', head: re, tail: rw, radius: 0.036 },
    { name: 'handR', parent: 'foreArmR', head: rw, tail: [0.01, -0.05, 0.03], radius: 0.028 },
    { name: 'foreArmL', parent: 'root', head: le, tail: lw, radius: 0.034 },
    { name: 'handL', parent: 'foreArmL', head: lw, tail: [-0.01, -0.04, -0.2], radius: 0.026 },
  ];
  const P: Prim[] = [];
  const norm = (a: V3, b: V3): V3 => { const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l]; };
  // Sleeves with a forearm bulge and ribbed cuffs.
  P.push(limb(re, rw, 0.046, 0.033, { bone: 'foreArmR', region: 'sleeve', k: 0.02 }));
  P.push(limb(le, lw, 0.044, 0.032, { bone: 'foreArmL', region: 'sleeve', k: 0.02 }));
  const cuff = (w: V3, e: V3, bone: string) => {
    const d = norm(e, w);
    const c: V3 = [w[0] - d[0] * 0.03, w[1] - d[1] * 0.03, w[2] - d[2] * 0.03];
    const rx = Math.atan2(d[2], d[1]);
    const rz = -Math.atan2(d[0], Math.hypot(d[1], d[2]));
    P.push(torus(c, 0.034, 0.013, { bone, region: 'cuff', k: 0.01 }, rotXYZ(rx, 0, rz)));
  };
  cuff(rw, re, 'foreArmR');
  cuff(lw, le, 'foreArmL');
  hand(P, 'handR', rw, norm(re, rw), 1, [0, 1, 0.3], [0.0, -0.06, 0.04], 0.02);
  hand(P, 'handL', lw, norm(le, lw), -1, [0, 0, 1], [0.0, -0.045, -0.2], 0.05);
  return {
    name: `fparms-${jacket.toString(16)}`,
    bones,
    prims: P,
    cell: 0.004,
    density: 60,
    regions: {
      sleeve: { pattern: 'stocking', color: jacket, gauge: 1 },
      cuff: { pattern: 'rib', color: new THREE.Color(jacket).multiplyScalar(0.72).getHex(), gauge: 1.2 },
      gloves: { pattern: 'garter', color: gloves, gauge: 1.2 },
    },
  };
}

export function createFpArms(jacket: number): THREE.Object3D {
  const f = instantiate(buildFigure(fpArmsDef(jacket)));
  f.root.traverse((o) => { o.renderOrder = 5; o.castShadow = false; });
  return f.root;
}
