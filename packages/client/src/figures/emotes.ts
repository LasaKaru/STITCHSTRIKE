import * as THREE from 'three';
import type { FigureInstance } from './rig.ts';

/**
 * Emotes, layered over the normal pose: a friendly wave, a hopping cheer, a
 * little dance and a polite bow. The figure faces -Z; its right side is +X.
 */

export const EMOTE_SECONDS = 2.4;

const d = new THREE.Vector3();
const point = (f: FigureInstance, bone: string, x: number, y: number, z: number) => f.poser.point(bone, d.set(x, y, z));

/** Pose `kind` at `t` seconds into it (call right after the normal pose). */
export function poseEmote(f: FigureInstance, kind: number, t: number): void {
  const p = f.poser;
  // Ease in and out so it doesn't snap.
  const e = Math.max(0, Math.min(1, t * 5, (EMOTE_SECONDS - t) * 5));
  if (e <= 0) return;
  switch (kind) {
    case 0: { // Wave: right arm up, forearm swinging side to side.
      const s = Math.sin(t * 10);
      point(f, 'upperArmR', 0.55, 0.75 * e + (1 - e) * -1, -0.15);
      point(f, 'foreArmR', 0.15 + s * 0.45, 1, -0.15);
      point(f, 'handR', 0.1 + s * 0.5, 1, -0.1);
      break;
    }
    case 1: { // Cheer: hop with both arms up, pumping.
      const hop = Math.abs(Math.sin(t * 6.5));
      p.setHips(0, hop * 0.09 * e, 0);
      for (const [n, sx] of [['R', 1], ['L', -1]] as const) {
        const pump = Math.sin(t * 13 + (sx > 0 ? 0 : 1)) * 0.15;
        point(f, `upperArm${n}`, 0.35 * sx, e, -0.05);
        point(f, `foreArm${n}`, (0.15 + pump) * sx, 1, 0);
      }
      break;
    }
    case 2: { // Dance: hips sway, arms roll the "knitting needles".
      const b = t * 5.5;
      p.setHips(Math.sin(b) * 0.05 * e, Math.abs(Math.sin(b * 2)) * 0.03 * e, 0);
      p.rotate('hips', 0, Math.sin(b) * 0.35 * e, 0);
      p.rotate('chest', 0, -Math.sin(b) * 0.25 * e, Math.sin(b) * 0.12 * e);
      point(f, 'upperArmR', 0.7, 0.35 + Math.sin(b) * 0.6 * e, -0.35);
      point(f, 'upperArmL', -0.7, 0.35 - Math.sin(b) * 0.6 * e, -0.35);
      point(f, 'foreArmR', 0.15 + Math.cos(b * 2) * 0.3, 0.6, -1);
      point(f, 'foreArmL', -0.15 - Math.cos(b * 2) * 0.3, 0.6, -1);
      break;
    }
    default: { // Bow: fold at the waist, arms at the sides, head down.
      p.rotate('spine', -0.55 * e, 0, 0);
      p.rotate('chest', -0.3 * e, 0, 0);
      p.rotate('head', -0.3 * e, 0, 0);
      point(f, 'upperArmR', 0.15, -1, 0.15 * e);
      point(f, 'upperArmL', -0.15, -1, 0.15 * e);
      point(f, 'foreArmR', 0.05, -1, 0.1);
      point(f, 'foreArmL', -0.05, -1, 0.1);
      break;
    }
  }
}
