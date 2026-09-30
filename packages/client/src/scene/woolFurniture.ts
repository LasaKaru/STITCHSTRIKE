import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Box } from '@stitchstrike/shared';
import type { StitchPattern } from '../wool/stitches.ts';

/**
 * Realistic furniture and toy clutter, all wool: every collision box is
 * dressed as the real object it stands for (bed with a draped duvet, desk
 * with turned legs, swivel chair, alphabet blocks...). Render-only details
 * never stick out into walkable space.
 */

type WoolFn = (pattern: StitchPattern, color: number, gauge?: number) => THREE.Material;

function m(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material): THREE.Mesh {
  return m(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), mat);
}

/** A plane draped over a box: flat on top, hanging folds down the sides. */
function drape(w: number, d: number, top: number, hang: number, folds: number): THREE.BufferGeometry {
  const segX = 60, segZ = 60;
  const W = w + hang * 2, D = d + hang;
  const g = new THREE.PlaneGeometry(W, D, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const ox = Math.max(0, Math.abs(x) - w / 2);
    const oz = Math.max(0, z - (D / 2 - hang));
    const over = Math.max(ox, oz);
    // Past the mattress edge the cloth hangs down with soft folds.
    const fold = Math.sin(x * folds) * 0.12 + Math.sin(z * folds * 0.7) * 0.1;
    let y = top + Math.sin(x * 1.3) * 0.06 + Math.cos(z * 1.1) * 0.05;
    let nx = x, nz = z;
    if (over > 0) {
      y = top - over * 1.05;
      if (ox > 0) nx = Math.sign(x) * (w / 2 + 0.12 + fold * 0.6 + over * 0.05);
      if (oz > 0) nz = D / 2 - hang + 0.12 + fold * 0.6 + over * 0.05;
    }
    p.setXYZ(i, nx, y, nz);
  }
  g.computeVertexNormals();
  return g;
}

function letterTexture(letter: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.setLineDash([10, 7]);
  g.strokeRect(12, 12, 104, 104);
  g.fillStyle = fg;
  g.font = 'bold 84px ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function renderFurniture(group: THREE.Group, b: Box, wool: WoolFn): boolean {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const add = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x, y, z); group.add(o); return o; };

  switch (b.shape) {
    case 'curtain': {
      // A long knitted curtain in deep folds, pooling on the floor: climbable.
      const geo = new THREE.PlaneGeometry(size[2], size[1], 24, 30);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i), v = pos.getY(i);
        pos.setZ(i, Math.sin(u * 5.5) * 0.28 + (v < -size[1] / 2 + 1 ? (1 - (v + size[1] / 2)) * 0.25 : 0));
      }
      geo.computeVertexNormals();
      const mat = wool('rib', b.color ?? 0xd9a441, 1.1);
      const cur = m(geo, mat);
      (cur.material as THREE.Material).side = THREE.DoubleSide;
      cur.rotation.y = Math.PI / 2;
      add(cur, b.max[0] - 0.1, c.y, c.z);
      const rod = m(new THREE.CylinderGeometry(0.12, 0.12, size[2] + 1.5, 10), wool('felt', 0x6a4a2e, 1));
      rod.rotation.x = Math.PI / 2;
      add(rod, b.max[0] - 0.05, b.max[1] + 0.1, c.z);
      return true;
    }
    case 'bed': {
      const frame = wool('felt', 0x8a5a3a, 1);
      // Frame rails and turned legs, a quilted mattress, a draped duvet, pillows.
      add(rbox(size[0], 1.2, size[2], 0.25, frame), c.x, 1.2, c.z);
      for (const [lx, lz] of [[b.min[0] + 0.5, b.max[2] - 0.5], [b.max[0] - 0.5, b.max[2] - 0.5]]) {
        add(m(new THREE.CylinderGeometry(0.35, 0.25, 0.8, 16), frame), lx, 0.4, lz);
      }
      add(rbox(size[0] - 0.3, 3.2, size[2] - 0.3, 0.6, wool('rib', 0xefe3c8, 0.9)), c.x, 3.3, c.z);
      const duvet = m(drape(size[0] - 0.2, size[2] * 0.72, 0, 2.6, 2.2), wool('stocking', 0x3a5da8, 0.8));
      (duvet.material as THREE.Material).side = THREE.DoubleSide;
      add(duvet, c.x, b.max[1] + 0.12, b.min[2] + size[2] * 0.28 + (size[2] * 0.72) / 2 - 1.3);
      const throwM = m(drape(size[0] * 0.8, 3.4, 0, 1.4, 3), wool('crochet', 0xe8742a, 0.9));
      (throwM.material as THREE.Material).side = THREE.DoubleSide;
      add(throwM, c.x, b.max[1] + 0.3, b.max[2] - 3.4);
      for (const px of [-2.4, 2.4]) {
        const pillow = rbox(4, 1.1, 2.6, 0.5, wool('rib', 0xf2ecdc, 1.1));
        pillow.rotation.x = -0.25;
        add(pillow, c.x + px, b.max[1] + 0.75, b.min[2] + 2.6);
      }
      return true;
    }
    case 'headboard': {
      const hb = rbox(size[0], size[1] + 0.6, size[2], 0.4, wool('felt', 0x8a5a3a, 1));
      add(hb, c.x, c.y + 0.3, c.z);
      // Buttoned upholstery.
      for (let i = 0; i < 5; i++) {
        const btn = m(new THREE.SphereGeometry(0.16, 12, 8), wool('felt', 0x5a3a26, 1));
        add(btn, b.min[0] + 1.3 + i * (size[0] - 2.6) / 4, c.y + 0.5, b.max[2] + 0.03);
      }
      return true;
    }
    case 'deskTop': {
      add(rbox(size[0] + 0.3, size[1] + 0.1, size[2] + 0.3, 0.2, wool('felt', 0xc8a878, 1.2)), c.x, c.y, c.z);
      // A knitted desk lamp and a stack of crocheted notebooks on top (behind the play edge).
      const lampMat = wool('rib', 0x2f7fe0, 1.4);
      const lamp = new THREE.Group();
      lamp.add(m(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 24), lampMat));
      const arm = m(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 10), lampMat);
      arm.position.set(0, 1.6, 0);
      arm.rotation.z = 0.35;
      lamp.add(arm);
      const shade = m(new THREE.ConeGeometry(0.9, 1.2, 24, 1, true), wool('garter', 0xffc94a, 1.2));
      shade.position.set(-0.8, 3.0, 0);
      shade.rotation.z = -0.6;
      (shade.material as THREE.Material).side = THREE.DoubleSide;
      lamp.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(3) }));
      bulb.position.set(-0.95, 2.75, 0);
      lamp.add(bulb);
      const light = new THREE.PointLight(0xffc98a, 3, 14, 1.8);
      light.position.set(-1.1, 2.4, 0);
      lamp.add(light);
      add(lamp, b.max[0] - 1.6, b.max[1] + 0.1, b.min[2] + 1.6);
      for (let i = 0; i < 3; i++) {
        const nb = rbox(2.4, 0.3, 1.8, 0.1, wool('crochet', [0xd8262e, 0x8bcb3a, 0xb46fd6][i], 1.5));
        nb.rotation.y = i * 0.2;
        add(nb, b.max[0] - 4.2, b.max[1] + 0.16 + i * 0.3, b.min[2] + 1.4);
      }
      return true;
    }
    case 'deskLeg': {
      const leg = m(new THREE.CylinderGeometry(size[0] * 0.42, size[0] * 0.32, size[1], 16), wool('felt', 0xa88858, 1.2));
      add(leg, c.x, c.y, c.z);
      return true;
    }
    case 'deskSide': {
      // Drawer pedestal with knitted fronts and wooden-button knobs.
      add(rbox(size[0], size[1], size[2], 0.12, wool('felt', 0xa88858, 1.2)), c.x, c.y, c.z);
      return true;
    }
    case 'chairSeat': {
      add(rbox(size[0], size[1] + 0.35, size[2], 0.25, wool('garter', 0xd8262e, 1.1)), c.x, c.y + 0.1, c.z);
      return true;
    }
    case 'chairBack': {
      const back = rbox(size[0], size[1], size[2] + 0.2, 0.3, wool('garter', 0xd8262e, 1.1));
      back.rotation.x = 0.08;
      add(back, c.x, c.y, c.z);
      return true;
    }
    case 'chairPost': {
      const metalish = wool('rib', 0x3b3f4a, 1.4);
      add(m(new THREE.CylinderGeometry(0.28, 0.32, size[1], 16), metalish), c.x, c.y, c.z);
      // Five-star base with felt castors (flat, so nothing blocks the floor).
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = m(new THREE.BoxGeometry(2.2, 0.22, 0.35), metalish);
        spoke.rotation.y = a;
        add(spoke, c.x + Math.cos(a) * 1.1, 0.35, c.z - Math.sin(a) * 1.1);
        add(m(new THREE.SphereGeometry(0.22, 12, 8), wool('felt', 0x1e1e22, 1)), c.x + Math.cos(a) * 2.1, 0.22, c.z - Math.sin(a) * 2.1);
      }
      return true;
    }
    case 'toyChest': {
      const chest = rbox(size[0], size[1] * 0.85, size[2], 0.18, wool('stocking', b.color ?? 0xe8742a, 1.3));
      add(chest, c.x, size[1] * 0.425, c.z);
      const lid = rbox(size[0] + 0.15, size[1] * 0.2, size[2] + 0.15, 0.12, wool('rib', 0xffc94a, 1.4));
      add(lid, c.x, size[1] * 0.9, c.z);
      return true;
    }
    case 'blocks': {
      // Stack of knitted alphabet blocks with embroidered letters.
      const s = Math.min(size[0], size[2]);
      const letters = [['A', '#d8262e'], ['B', '#3a5da8'], ['C', '#8bcb3a']] as const;
      const h = size[1] / 3;
      letters.forEach(([l, col], i) => {
        const cube = rbox(s * 0.95, h * 0.98, s * 0.95, 0.12, wool('garter', new THREE.Color(col).getHex(), 1.3));
        cube.rotation.y = (i - 1) * 0.3;
        add(cube, c.x, h * (i + 0.5), c.z);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.7, h * 0.7), new THREE.MeshStandardMaterial({ map: letterTexture(l, '#efe3c8', col), roughness: 1 }));
        face.position.set(0, 0, s * 0.476 + 0.01);
        cube.add(face);
      });
      return true;
    }
    case 'car': {
      const body = rbox(size[0], size[1] * 0.55, size[2], 0.25, wool('stocking', b.color ?? 0xd8262e, 1.3));
      add(body, c.x, size[1] * 0.45, c.z);
      const cab = rbox(size[0] * 0.7, size[1] * 0.4, size[2] * 0.5, 0.2, wool('rib', 0xefe3c8, 1.4));
      add(cab, c.x, size[1] * 0.85, c.z + size[2] * 0.05);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wheel = m(new THREE.TorusGeometry(0.28, 0.14, 10, 20), wool('garter', 0x1e1e22, 2));
        wheel.rotation.y = Math.PI / 2;
        add(wheel, c.x + dx * size[0] * 0.5, 0.36, c.z + dz * size[2] * 0.3);
      }
      return true;
    }
    case 'ruler': {
      add(rbox(size[0], size[1] * 0.5, size[2], 0.1, wool('rib', 0xffc94a, 2)), c.x, size[1] * 0.25, c.z);
      add(rbox(size[0] * 0.95, size[1] * 0.5, size[2] * 0.9, 0.2, wool('crochet', 0xefe3c8, 1.6)), c.x, size[1] * 0.72, c.z);
      return true;
    }
    case 'book': {
      const book = rbox(size[0], size[1], size[2], 0.08, wool('garter', b.color ?? 0x5e6b86, 1.3));
      add(book, c.x, c.y, c.z);
      const pages = rbox(size[0] * 0.95, size[1] * 0.94, size[2] * 0.8, 0.02, wool('rib', 0xf2ecdc, 3));
      add(pages, c.x, c.y, c.z + 0.05);
      return true;
    }
    case 'drum': {
      const r = Math.min(size[0], size[2]) / 2;
      add(m(new THREE.CylinderGeometry(r, r, size[1] * 0.9, 32), wool('stocking', b.color ?? 0xffc94a, 1.3)), c.x, size[1] * 0.45, c.z);
      add(m(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.18, 32), wool('felt', 0xf2ecdc, 1)), c.x, size[1] * 0.93, c.z);
      for (const y of [0.15, size[1] * 0.85]) add(m(new THREE.TorusGeometry(r, 0.09, 8, 32).rotateX(Math.PI / 2), wool('rib', 0xd8262e, 2)), c.x, y, c.z);
      // Zigzag lacing.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const lace = m(new THREE.CylinderGeometry(0.04, 0.04, size[1] * 0.75, 6), wool('rib', 0xefe3c8, 3));
        lace.rotation.z = (i % 2 ? 0.35 : -0.35);
        lace.rotation.y = -a;
        add(lace, c.x + Math.cos(a) * r * 1.01, size[1] * 0.5, c.z + Math.sin(a) * r * 1.01);
      }
      return true;
    }
    case 'bookStack': {
      const n = 5;
      const cols = [0xefe3c8, 0x3a5da8, 0xd8262e, 0x8bcb3a, 0xb46fd6];
      for (let i = 0; i < n; i++) {
        const bk = rbox(size[0] * (0.95 - (i % 2) * 0.05), size[1] / n * 0.96, size[2] * 1.3, 0.06, wool('garter', cols[i], 1.4));
        bk.rotation.y = (i % 3 - 1) * 0.08;
        add(bk, c.x, (i + 0.5) * size[1] / n, c.z);
      }
      return true;
    }
  }
  return false;
}

/** Knitted floorboards: plank-width strips in slightly different browns. */
export function knittedFloor(group: THREE.Group, b: Box, wool: WoolFn): void {
  const plank = 1.6;
  const tones = [0x9a7a5a, 0x8e6f52, 0xa58465, 0x927258, 0x9f7d5c];
  for (let x = b.min[0], i = 0; x < b.max[0] - 1e-3; x += plank, i++) {
    const w = Math.min(plank, b.max[0] - x);
    const board = m(new RoundedBoxGeometry(w - 0.05, 0.4, b.max[2] - b.min[2], 2, 0.08), wool('garter', tones[i % tones.length], 0.9), false);
    board.position.set(x + w / 2, -0.2, (b.min[2] + b.max[2]) / 2);
    group.add(board);
  }
}

/** An open doorway on the front wall (the enemies' burrow) and a pendant lamp. */
export function roomDetails(group: THREE.Group, wool: WoolFn): void {
  const frame = wool('felt', 0xefe3c8, 1.2);
  const z = 17.45;
  const doorX = 13;
  for (const dx of [-3.3, 3.3]) {
    const post = m(new THREE.BoxGeometry(0.5, 16, 0.3), frame);
    post.position.set(doorX + dx, 8, z);
    group.add(post);
  }
  const lintel = m(new THREE.BoxGeometry(7.1, 0.5, 0.3), frame);
  lintel.position.set(doorX, 16.2, z);
  group.add(lintel);
  // Open doorway into the dark hallway the toys come from.
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(6, 15.8), new THREE.MeshBasicMaterial({ color: 0x0c0d12 }));
  gap.position.set(doorX, 8, z + 0.14);
  gap.rotation.y = Math.PI;
  group.add(gap);
  // Pendant lamp with a knitted shade.
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 6), new THREE.MeshBasicMaterial({ color: 0xefe3c8 }));
  cord.position.set(-6, 22.5, 4);
  group.add(cord);
  const shade = m(new THREE.CylinderGeometry(1.2, 2.4, 2.2, 32, 1, true), wool('rib', 0xe8742a, 1));
  (shade.material as THREE.Material).side = THREE.DoubleSide;
  shade.position.set(-6, 19.6, 4);
  group.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(2.5) }));
  bulb.position.set(-6, 19.2, 4);
  group.add(bulb);
  const light = new THREE.PointLight(0xffc98a, 6, 34, 1.5);
  light.position.set(-6, 18.8, 4);
  group.add(light);
}
