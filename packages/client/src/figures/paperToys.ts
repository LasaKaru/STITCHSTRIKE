import * as THREE from 'three';
import { spawnFigure } from './cast.ts';
import type { HumanoidOptions } from './humanoid.ts';
import { buildFigure, instantiate, type FigureDef, type FigureInstance, type FigureTemplate } from './rig.ts';
import { sphere } from './sdf.ts';

/**
 * Two more of the Baron's recruits: a squadron-folded paper plane (ruled
 * notebook paper, red margin line, a doodled roundel) and the Yo-Yo
 * Slinger, a knitted sock-monkey with a wooden yo-yo on a string.
 */

let paperTex: THREE.CanvasTexture | null = null;
function notebookPaper(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ec';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80, 130, 210, 0.55)';
  g.lineWidth = 2;
  for (let y = 20; y < 256; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.strokeStyle = 'rgba(220, 70, 70, 0.7)';
  g.beginPath(); g.moveTo(40, 0); g.lineTo(40, 256); g.stroke();
  // A doodled target roundel on each wing.
  for (const [x, y] of [[150, 90], [150, 180]]) {
    g.fillStyle = '#d8262e'; g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbf7ec'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f5a9a'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
  }
  paperTex = new THREE.CanvasTexture(c);
  paperTex.colorSpace = THREE.SRGBColorSpace;
  return paperTex;
}

/** Folded-plane triangles (nose at -Z), UVs spread over the notebook page. */
function planeGeometry(): THREE.BufferGeometry {
  const L = 0.9, W = 0.45, keel = 0.12;
  // Each wing: nose, wingtip at the back, root at the back. The keel hangs below the spine.
  const v = [
    0, 0.12, -L / 2, -W, 0.14, L / 2, 0, 0.1, L / 2,
    0, 0.12, -L / 2, 0, 0.1, L / 2, W, 0.14, L / 2,
    0, 0.12, -L / 2, 0, 0.1, L / 2, 0, 0.1 - keel, L / 2 - 0.05,
  ];
  const uv = [0.95, 0.5, 0.1, 0.95, 0.1, 0.5, 0.95, 0.5, 0.1, 0.5, 0.1, 0.05, 0.95, 0.5, 0.1, 0.5, 0.2, 0.45];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const templates = new Map<string, FigureTemplate>();

function planeDef(): FigureDef {
  return {
    name: 'paper-plane',
    bones: [{ name: 'body', parent: null, head: [0, 0.12, 0.4], tail: [0, 0.12, -0.4], radius: 0.05 }],
    // A paper plane has no stuffing: the folded sheet is all there is (one tiny crease knot keeps the rig happy).
    prims: [sphere([0, 0.11, -0.4], 0.025, { bone: 'body', region: 'paper', k: 0.01 })],
    regions: { paper: { pattern: 'felt', color: 0xfbf7ec, gauge: 2 } },
    cell: 0.012, density: 14,
    accessories: [{
      bone: 'body',
      build: () => {
        const m = new THREE.Mesh(planeGeometry(), new THREE.MeshStandardMaterial({ map: notebookPaper(), roughness: 0.85, side: THREE.DoubleSide }));
        m.castShadow = true;
        m.name = 'sheet';
        return m;
      },
    }],
  };
}

export function createPlane(): FigureInstance {
  let t = templates.get('plane');
  if (!t) { t = buildFigure(planeDef()); templates.set('plane', t); }
  return instantiate(t);
}

/** Banks and bobs; noses down in a dive. */
export function posePlane(f: FigureInstance, t: number, id: number, dive: number): void {
  const p = f.poser;
  p.reset();
  p.rotate('body', -dive * 0.6 + Math.sin(t * 2.3 + id) * 0.06, 0, Math.sin(t * 1.7 + id) * 0.35);
}

export function yoyoOptions(): HumanoidOptions {
  return {
    name: 'yoyo-slinger',
    headwear: 'beanie', beard: 'none', gloves: true, eyes: 'bead',
    jacketButtons: false, muscle: 0.9, cell: 0.016, merged: true, scale: 0.95,
    colors: { skin: 0x9a8a7a, jacket: 0xd8262e, trim: 0xefe3c8, pants: 0x6a6a74, boots: 0xefe3c8, gloves: 0xefe3c8, hat: 0x2f5a9a },
    patterns: { jacket: 'rib', pants: 'garter' },
  };
}

/** The Yo-Yo Slinger, with a wooden yo-yo on a string from its right hand. */
export function createYoYo(): FigureInstance {
  const f = spawnFigure(yoyoOptions());
  const hand = f.bones.get('handR');
  if (hand) {
    const rig = new THREE.Group();
    rig.name = 'yoyo';
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 5), new THREE.MeshStandardMaterial({ color: 0xefe3c8 }));
    string.name = 'string';
    const toy = new THREE.Group();
    toy.name = 'toy';
    const half = new THREE.MeshPhysicalMaterial({ color: 0xffc94a, roughness: 0.3, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 20).rotateZ(Math.PI / 2), half);
      disc.position.x = s * 0.03;
      toy.add(disc);
    }
    toy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8262e })));
    rig.add(string, toy);
    hand.add(rig);
  }
  return f;
}

/** Yo-yo going up and down on its string; flung far out while yanking (fling 0..1). */
export function poseYoYo(f: FigureInstance, t: number, fling: number): void {
  const rig = f.root.getObjectByName('yoyo');
  if (!rig) return;
  const len = 0.15 + (Math.sin(t * 5) * 0.5 + 0.5) * 0.35 + fling * 2.2;
  const toy = rig.getObjectByName('toy')!;
  const string = rig.getObjectByName('string')!;
  // Hang straight down in figure space, whatever the hand is doing.
  rig.quaternion.copy(rig.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(f.root.getWorldQuaternion(new THREE.Quaternion())));
  const dir = fling > 0 ? new THREE.Vector3(0, 0.3, -1).normalize() : new THREE.Vector3(0, -1, 0);
  toy.position.copy(dir).multiplyScalar(len);
  toy.rotation.x = t * 20;
  string.position.copy(dir).multiplyScalar(len / 2);
  string.scale.y = len;
  string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}
