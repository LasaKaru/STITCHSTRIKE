import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { CHUNKY, lumpy, mesh, rng, wool, yarnTube } from './woolKit.ts';

/**
 * Set dressing for the cosy stop-motion look, shared by every map: a knitted
 * city skyline with lit windows, autumn leaf bunting, knitted pumpkins,
 * pom-pom trees and knitted water.
 */

export const AUTUMN = [0xb5452a, 0xd9772e, 0xe8b04a, 0x8a3a2a, 0x8a9a3a, 0xc8642a];

// ---------------------------------------------------------------- city skyline

const FACADES = [0x6a86a8, 0x8a5a4a, 0xc8b8a0, 0x4a5a7a, 0xa87a5a, 0x7a8a9a, 0xd8c8a8, 0x5a6a8a];

/**
 * A knitted city skyline: brownstones, mid-rises, slim towers and one art-deco
 * spire, with warm and blue lit windows. Built along X from -width/2 to
 * width/2, standing on y = 0, windows facing +Z. Position, rotate and scale it
 * outside a window or around the horizon.
 */
export function skylineStrip(width: number, seed: number, o: { height?: number; lit?: number; spire?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'skyline';
  const r = rng(seed);
  const H = o.height ?? 60;
  const lit = o.lit ?? 0.55;
  const warm: THREE.Matrix4[] = [], cool: THREE.Matrix4[] = [], dark: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  let x = -width / 2;
  let spireAt = o.spire === false ? -1 : Math.floor(r() * 6) + 3;
  let k = 0;
  while (x < width / 2) {
    const kind = k === spireAt ? 3 : r() < 0.35 ? 0 : r() < 0.6 ? 1 : 2;
    const w = kind === 0 ? 8 + r() * 6 : kind === 3 ? 12 : 9 + r() * 8;
    const h = kind === 0 ? H * (0.25 + r() * 0.15) : kind === 1 ? H * (0.45 + r() * 0.25) : kind === 2 ? H * (0.7 + r() * 0.35) : H * 0.95;
    const d = 8 + r() * 4;
    const z = -r() * 6 - (kind === 2 || kind === 3 ? 8 : 0);
    const col = kind === 0 ? [0x8a5a4a, 0xa86a50, 0x7a4a3a][Math.floor(r() * 3)] : FACADES[Math.floor(r() * FACADES.length)];
    const mat = wool(kind === 0 ? 'garter' : 'stocking', col, 0.45);
    const body = mesh(new THREE.BoxGeometry(w, h, d), mat, false);
    body.position.set(x + w / 2, h / 2, z);
    g.add(body);
    // Cornice band and roof bits.
    const trim = wool('rib', new THREE.Color(col).multiplyScalar(0.7).getHex(), 0.6);
    const band = mesh(new THREE.BoxGeometry(w + 0.6, 0.9, d + 0.6), trim, false);
    band.position.set(x + w / 2, h - 0.45, z);
    g.add(band);
    if (kind === 0 && r() < 0.6) {
      // A rooftop water tower, very New York.
      const tower = mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 12), wool('rib', 0x6a4a2e, 1.2), false);
      tower.position.set(x + w * (0.3 + r() * 0.4), h + 2.6, z);
      const cap = mesh(new THREE.ConeGeometry(1.6, 1.4, 12), wool('garter', 0x4a3a2a, 1.2), false);
      cap.position.set(tower.position.x, h + 4.6, z);
      g.add(tower, cap);
    }
    if (kind === 3) {
      // Art-deco setbacks and a needle spire.
      let sw = w, sy = h;
      for (let s = 0; s < 3; s++) {
        sw *= 0.7;
        const step = mesh(new THREE.BoxGeometry(sw, H * 0.08, sw), mat, false);
        step.position.set(x + w / 2, sy + H * 0.04, z);
        g.add(step);
        sy += H * 0.08;
      }
      const spire = mesh(new THREE.ConeGeometry(1, H * 0.22, 8), wool('rib', 0xd8c8a8, 1), false);
      spire.position.set(x + w / 2, sy + H * 0.11, z);
      g.add(spire);
    }
    // Windows: a grid on the front face, some lit warm, some cool, the rest dark.
    const cols = Math.max(2, Math.floor(w / 2.6));
    const rows = Math.max(2, Math.floor((h - 3) / 3.2));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = x + (i + 0.5) * (w / cols);
        const wy = 2 + j * 3.2 + 1.2;
        m4.makeScale(1.1, 1.5, 1).setPosition(wx, wy, z + d / 2 + 0.06);
        const roll = r();
        (roll < lit * 0.75 ? warm : roll < lit ? cool : dark).push(m4.clone());
      }
    }
    x += w + 0.8 + r() * 2;
    k++;
    if (k > spireAt && spireAt >= 0 && x > width / 4) spireAt = -1;
  }
  const pane = new THREE.PlaneGeometry(1, 1);
  const add = (list: THREE.Matrix4[], mat: THREE.Material) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(pane, mat, list.length);
    list.forEach((m, i) => inst.setMatrixAt(i, m));
    g.add(inst);
  };
  add(warm, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd88a).multiplyScalar(1.6) }));
  add(cool, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a9ae8).multiplyScalar(1.2) }));
  add(dark, new THREE.MeshStandardMaterial({ color: 0x2a3448, roughness: 0.3 }));
  return g;
}

/** A soft vertical sky gradient card (golden hour by default) to hang behind a skyline. */
export function skyCard(w: number, h: number, top = 0x7aa6d8, bottom = 0xf6d6a8): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h, 1, 8);
  const colors: number[] = [];
  const a = new THREE.Color(bottom), b = new THREE.Color(top);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h + 0.5;
    const c = a.clone().lerp(b, t).multiplyScalar(1.25);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
}

// ---------------------------------------------------------------- bunting

let leafGeo: THREE.BufferGeometry | null = null;
/** A felt maple-ish leaf, hanging point-down from the cord at its stem. */
function leafGeometry(): THREE.BufferGeometry {
  if (leafGeo) return leafGeo;
  const s = new THREE.Shape();
  const pts: [number, number][] = [[0, 0], [0.18, -0.2], [0.45, -0.15], [0.35, -0.42], [0.55, -0.6], [0.2, -0.62], [0.12, -0.95], [0, -0.8], [-0.12, -0.95], [-0.2, -0.62], [-0.55, -0.6], [-0.35, -0.42], [-0.45, -0.15], [-0.18, -0.2]];
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  leafGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 });
  return leafGeo;
}

/** A sagging yarn cord strung from a to b with felt autumn leaves hanging off it. */
export function bunting(a: THREE.Vector3, b: THREE.Vector3, o: { sag?: number; spacing?: number; size?: number; seed?: number; colors?: number[] } = {}): THREE.Group {
  const g = new THREE.Group();
  const sag = o.sag ?? a.distanceTo(b) * 0.08;
  const size = o.size ?? 1;
  const colors = o.colors ?? AUTUMN;
  const curve = (t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0));
  const pts = Array.from({ length: 13 }, (_, i) => curve(i / 12));
  g.add(yarnTube(pts, 0.05 * size, wool('rib', 0xefe3c8, 3), 48));
  const n = Math.max(2, Math.floor(a.distanceTo(b) / ((o.spacing ?? 1.6) * size)));
  const r = rng(o.seed ?? 9);
  const dir = b.clone().sub(a).setY(0).normalize();
  const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  for (let i = 1; i < n; i++) {
    const at = curve(i / n);
    const leaf = mesh(leafGeometry(), wool('felt', colors[Math.floor(r() * colors.length)], 2.2));
    leaf.scale.setScalar(size * (0.85 + r() * 0.3));
    leaf.position.copy(at);
    leaf.rotation.set(0, yaw, (r() - 0.5) * 0.4);
    g.add(leaf);
  }
  return g;
}

// ---------------------------------------------------------------- pumpkins

/** A ribbed knitted pumpkin with a felt stem and a curly yarn tendril. */
export function pumpkin(radius: number, seed = 1, color = 0xd9772e): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 28, 18);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const az = Math.atan2(v.z, v.x);
    const ribs = 1 - 0.09 * Math.pow(Math.abs(Math.cos(az * 4)), 0.6);
    v.x *= ribs; v.z *= ribs;
    v.y *= 0.72;
    // Pinch the top and bottom in like a real pumpkin.
    const pinch = 1 - 0.25 * Math.pow(Math.abs(v.y) / (radius * 0.72), 6);
    v.x *= pinch; v.z *= pinch;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const body = mesh(geo, wool('rib', color, 1.6 / Math.max(0.5, radius)));
  body.position.y = radius * 0.72;
  const stem = mesh(new THREE.CylinderGeometry(radius * 0.08, radius * 0.12, radius * 0.4, 8), wool('felt', 0x5a4a2a, 3));
  stem.position.y = radius * 1.5;
  stem.rotation.z = 0.2;
  const r = rng(seed);
  const vine = yarnTube([0, 1, 2, 3, 4].map((i) => new THREE.Vector3(Math.cos(i * 1.6) * radius * 0.2 * (1 + i * 0.15), radius * (1.45 - i * 0.02), Math.sin(i * 1.6) * radius * 0.2 * (1 + i * 0.15))), radius * 0.025, wool('rib', 0x6a8a3a, 4), 24);
  g.add(body, stem, vine);
  g.rotation.y = r() * 6;
  return g;
}

// ---------------------------------------------------------------- pom-pom trees

/**
 * A pom-pom tree: a cable-knit trunk with a few branches, crowned with
 * dozens of fuzzy yarn pom-poms in autumn colours (merged per colour).
 */
export function pomTree(height: number, seed: number, palette = [0xb5452a, 0xd9772e, 0xe8b04a, 0x8a2a3a, 0xc8642a]): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const trunkR = height * 0.06;
  const trunk = mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR * 1.2, height * 0.62, 12), wool('rib', 0x6a4a2e, 0.9));
  trunk.position.y = height * 0.31;
  g.add(trunk);
  const crownY = height * 0.68;
  const crownR = height * 0.36;
  const byColor: THREE.BufferGeometry[][] = palette.map(() => []);
  const count = 26 + Math.floor(r() * 10);
  for (let i = 0; i < count; i++) {
    // Pom-poms on and inside a squashed dome.
    const u = r(), w = r();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - w * 1.4);
    const d = crownR * (0.55 + r() * 0.45);
    const px = Math.sin(phi) * Math.cos(theta) * d;
    const pz = Math.sin(phi) * Math.sin(theta) * d;
    const py = Math.cos(phi) * d * 0.75;
    const rad = height * (0.08 + r() * 0.06);
    const ball = lumpy(rad, 0.12, seed * 97 + i, 2);
    ball.translate(px, crownY + py, pz);
    byColor[Math.floor(r() * palette.length)].push(ball);
  }
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + r();
    const branch = mesh(new THREE.CylinderGeometry(trunkR * 0.25, trunkR * 0.45, crownR * 0.9, 8), wool('rib', 0x6a4a2e, 1.2));
    branch.position.set(Math.cos(a) * crownR * 0.25, crownY - crownR * 0.1, Math.sin(a) * crownR * 0.25);
    branch.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    g.add(branch);
  }
  byColor.forEach((geos, k) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos)!;
    merged.computeBoundingSphere();
    const c = merged.boundingSphere!.center.clone();
    merged.translate(-c.x, -c.y, -c.z);
    const m = mesh(merged, wool('felt', palette[k], 1.6));
    m.position.copy(c);
    addShellFuzz(m);
    g.add(m);
  });
  return g;
}

// ---------------------------------------------------------------- knitted water

/** Knitted water: blue stocking stitch with a wet, glossy clearcoat that still mirrors the sky. */
export function knitWater(geo: THREE.BufferGeometry): THREE.Mesh {
  const mat = createWoolMaterial({ color: 0x3f7ab8, pattern: 'stocking', uvSize: [1, 1], triplanar: true, gauge: 0.8 * CHUNKY, roughness: 0.35 });
  mat.normalScale.setScalar(1.6);
  mat.clearcoat = 1;
  mat.clearcoatRoughness = 0.08;
  mat.envMapIntensity = 1.6;
  return mesh(geo, mat, false);
}
