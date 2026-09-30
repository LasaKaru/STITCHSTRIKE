import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { StitchPattern } from '../wool/stitches.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { meshSDF, type Prim, type V3 } from './sdf.ts';

/**
 * Turns a sculpted SDF figure into a skinned, knitted character:
 *  - skin weights from distances to nearby bone segments (blends across joints)
 *  - knit-flow UVs: stitch rows wrap around each bone like a real knitted
 *    toy, with seams where limbs join (and a spiral at the crown of the head)
 *  - material regions (jacket, trousers, boots, face...) as geometry groups
 */

export interface BoneDef {
  name: string;
  parent: string | null;
  head: V3;
  tail: V3;
  /** Approximate limb radius, sets how many stitches go around it. */
  radius: number;
  /** Direction the stitch seam faces, in bind space (default: back). */
  seam?: V3;
}

export interface RegionDef {
  pattern: StitchPattern;
  color: number;
  /** Stitch density multiplier (finer yarn > 1). */
  gauge?: number;
  fuzz?: number;
  roughness?: number;
}

export interface Accessory {
  bone: string;
  /** Built in bind-pose figure space; attached to the bone keeping that transform. */
  build(): THREE.Object3D;
}

export interface FigureDef {
  name: string;
  bones: BoneDef[];
  prims: Prim[];
  regions: Record<string, RegionDef>;
  /** Meshing resolution in world units. */
  cell: number;
  /** Stitches per world unit before region gauge. */
  density: number;
  accessories?: Accessory[];
  /**
   * Group triangles by stitch pattern instead of by region, carrying region
   * colours in vertex colours: ~4 draw calls per figure instead of ~10.
   */
  mergeRegions?: boolean;
}

export interface FigureTemplate {
  def: FigureDef;
  root: THREE.Group;
  triangles: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function segDist(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}

interface BoneFrame { head: V3; axis: V3; b1: V3; b2: V3; length: number; radius: number }

function frameOf(b: BoneDef): BoneFrame {
  const axis = norm(sub(b.tail, b.head));
  // b1 points away from the seam; the atan2 wrap then lands on the seam side.
  const seam = b.seam ?? (Math.abs(axis[2]) > 0.9 ? [0, -1, 0] as V3 : [0, 0, 1] as V3);
  let ref: V3 = [-seam[0], -seam[1], -seam[2]];
  ref = sub(ref, [axis[0] * dot(ref, axis), axis[1] * dot(ref, axis), axis[2] * dot(ref, axis)]);
  if (Math.hypot(ref[0], ref[1], ref[2]) < 1e-3) ref = [1, 0, 0];
  const b1 = norm(ref);
  const b2 = cross(axis, b1);
  return { head: b.head, axis, b1, b2, length: Math.hypot(...sub(b.tail, b.head)), radius: b.radius };
}

const cache = new Map<string, FigureTemplate>();

/** Figures are ~15 cm toys: their fibres are much shorter than a bean bag's. */
const FIGURE_FUZZ = 0.28;

/** Meshes, skins and dresses a figure once; instances clone it cheaply. */
export function buildFigure(def: FigureDef): FigureTemplate {
  const hit = cache.get(def.name);
  if (hit) return hit;
  const m = meshSDF(def.prims, def.cell);
  const boneIndex = new Map(def.bones.map((b, i) => [b.name, i]));
  const frames = def.bones.map(frameOf);
  const regionNames = Object.keys(def.regions);
  const regionIndex = new Map(regionNames.map((r, i) => [r, i]));
  const vcount = m.positions.length / 3;
  // Draw groups: one per region, or one per stitch pattern when merged.
  const groupKeys = def.mergeRegions ? [...new Set(regionNames.map((r) => def.regions[r].pattern))] : regionNames;
  const groupOfRegion = regionNames.map((r) => groupKeys.indexOf(def.mergeRegions ? def.regions[r].pattern : r));

  // Candidate bones per bone: itself, parent and children (keeps blending local to joints).
  const neighbours = def.bones.map((b, i) => {
    const set = new Set([i]);
    if (b.parent) set.add(boneIndex.get(b.parent)!);
    def.bones.forEach((c, j) => { if (c.parent === b.name) set.add(j); });
    return [...set];
  });

  const vBone = new Int32Array(vcount);
  const vRegion = new Int32Array(vcount);
  const skinIdx = new Uint16Array(vcount * 4);
  const skinW = new Float32Array(vcount * 4);
  for (let v = 0; v < vcount; v++) {
    const prim = def.prims[m.owner[v]];
    const bi = boneIndex.get(prim.bone) ?? 0;
    vBone[v] = bi;
    vRegion[v] = regionIndex.get(prim.region) ?? 0;
    const p: V3 = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
    const dPrimary = segDist(p, def.bones[bi].head, def.bones[bi].tail);
    const ws: [number, number][] = [];
    for (const j of neighbours[bi]) {
      const b = def.bones[j];
      const d = segDist(p, b.head, b.tail);
      const sigma = Math.max(0.012, def.bones[bi].radius * 0.45);
      const w = j === bi ? 1 : Math.exp(-(((Math.max(0, d - dPrimary)) / sigma) ** 2));
      if (w > 0.02) ws.push([j, w]);
    }
    ws.sort((a, b) => b[1] - a[1]);
    const top = ws.slice(0, 4);
    const total = top.reduce((a, x) => a + x[1], 0);
    top.forEach(([j, w], k) => { skinIdx[v * 4 + k] = j; skinW[v * 4 + k] = w / total; });
  }

  // Triangles grouped by region; each triangle takes one bone for its knit UVs.
  const tris = m.indices.length / 3;
  const order: number[][] = groupKeys.map(() => []);
  const triRegion = new Int32Array(tris);
  const triBone = new Int32Array(tris);
  for (let t = 0; t < tris; t++) {
    const a = m.indices[t * 3], b = m.indices[t * 3 + 1], c = m.indices[t * 3 + 2];
    const ra = vRegion[a], rb = vRegion[b], rc = vRegion[c];
    const region = rb === rc ? rb : ra;
    triRegion[t] = region;
    order[groupOfRegion[region]].push(t);
    const ba = vBone[a], bb = vBone[b], bc = vBone[c];
    triBone[t] = bb === bc ? bb : ba;
  }

  const outCount = tris * 3;
  const pos = new Float32Array(outCount * 3);
  const nor = new Float32Array(outCount * 3);
  const uv = new Float32Array(outCount * 2);
  const si = new Uint16Array(outCount * 4);
  const sw = new Float32Array(outCount * 4);
  const col = new Float32Array(outCount * 3);
  const regionColors = regionNames.map((r) => new THREE.Color(def.regions[r].color));
  const geo = new THREE.BufferGeometry();
  let o = 0;
  groupKeys.forEach((_, g) => {
    const start = o;
    for (const t of order[g]) {
      const rName = regionNames[triRegion[t]];
      const gauge = def.regions[rName].gauge ?? 1;
      const density = def.density * gauge;
      const rc = regionColors[triRegion[t]];
      const f = frames[triBone[t]];
      const around = Math.max(4, Math.round((2 * Math.PI * f.radius * density) / 4) * 4);
      const us: number[] = [];
      for (let k = 0; k < 3; k++) {
        const v = m.indices[t * 3 + k];
        const p: V3 = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
        const q = sub(p, f.head);
        const along = dot(q, f.axis);
        const ang = Math.atan2(dot(q, f.b2), dot(q, f.b1));
        us.push((ang / (2 * Math.PI) + 0.5) * around);
        uv[(o + k) * 2 + 1] = along * density * 1.25;
        for (let c = 0; c < 3; c++) {
          pos[(o + k) * 3 + c] = m.positions[v * 3 + c];
          nor[(o + k) * 3 + c] = m.normals[v * 3 + c];
        }
        for (let c = 0; c < 4; c++) { si[(o + k) * 4 + c] = skinIdx[v * 4 + c]; sw[(o + k) * 4 + c] = skinW[v * 4 + c]; }
        col[(o + k) * 3] = rc.r; col[(o + k) * 3 + 1] = rc.g; col[(o + k) * 3 + 2] = rc.b;
      }
      // Stitch rows wrap around the limb; keep triangles on the seam from smearing the whole texture.
      if (Math.max(...us) - Math.min(...us) > around / 2) for (let k = 0; k < 3; k++) if (us[k] < around / 2) us[k] += around;
      for (let k = 0; k < 3; k++) uv[(o + k) * 2] = us[k];
      o += 3;
    }
    if (o > start) geo.addGroup(start, o - start, g);
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  if (def.mergeRegions) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();

  const materials = groupKeys.map((key) => {
    if (def.mergeRegions) {
      const m = createWoolMaterial({ color: 0xffffff, pattern: key as StitchPattern, uvSize: [1, 1], stitchUv: true, fuzz: FIGURE_FUZZ });
      m.vertexColors = true;
      return m;
    }
    const rd = def.regions[key];
    return createWoolMaterial({ color: rd.color, pattern: rd.pattern, uvSize: [1, 1], stitchUv: true, fuzz: (rd.fuzz ?? 1) * FIGURE_FUZZ, roughness: rd.roughness });
  });

  // Skeleton in bind pose: bones carry positions only, rest rotations are identity.
  const bones = def.bones.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  def.bones.forEach((b, i) => {
    const parent = b.parent ? boneIndex.get(b.parent)! : -1;
    const ph: V3 = parent >= 0 ? def.bones[parent].head : [0, 0, 0];
    bones[i].position.set(b.head[0] - ph[0], b.head[1] - ph[1], b.head[2] - ph[2]);
    if (parent >= 0) bones[parent].add(bones[i]);
  });
  const root = new THREE.Group();
  root.name = def.name;
  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.name = `${def.name}-mesh`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(bones[0], mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  for (const acc of def.accessories ?? []) {
    const bone = bones[boneIndex.get(acc.bone) ?? 0];
    const obj = acc.build();
    obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    root.add(obj);
    obj.updateMatrixWorld(true);
    bone.attach(obj);
  }

  const tpl: FigureTemplate = { def, root, triangles: tris };
  cache.set(def.name, tpl);
  return tpl;
}

// ---------------------------------------------------------------- instances + posing

export interface FigureInstance {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: Map<string, THREE.Bone>;
  poser: Poser;
}

export function instantiate(tpl: FigureTemplate): FigureInstance {
  const root = cloneSkinned(tpl.root) as THREE.Group;
  let mesh: THREE.SkinnedMesh | null = null;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
  });
  return { root, mesh: mesh!, bones, poser: new Poser(tpl.def, bones) };
}

const qa = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();

/**
 * Procedural posing in figure space: local rotations, "point this bone along
 * that direction", and analytic two-bone IK for arms and legs.
 */
export class Poser {
  private rest = new Map<string, THREE.Vector3>();
  private headPos = new Map<string, THREE.Vector3>();
  private parent = new Map<string, string | null>();
  private length = new Map<string, number>();
  private restHips = new THREE.Vector3();

  constructor(def: FigureDef, readonly bones: Map<string, THREE.Bone>) {
    for (const b of def.bones) {
      this.rest.set(b.name, new THREE.Vector3(...sub(b.tail, b.head)).normalize());
      this.headPos.set(b.name, new THREE.Vector3(...b.head));
      this.parent.set(b.name, b.parent);
      this.length.set(b.name, Math.hypot(...sub(b.tail, b.head)));
    }
    this.restHips.copy(bones.get(def.bones[0].name)!.position);
  }

  reset(): void {
    for (const b of this.bones.values()) { b.quaternion.identity(); b.scale.set(1, 1, 1); }
    const root = this.bones.values().next().value!;
    root.position.copy(this.restHips);
  }

  /** Figure-space rotation of a bone (product of ancestors' local rotations). */
  worldQuat(name: string, out = new THREE.Quaternion()): THREE.Quaternion {
    const chain: THREE.Bone[] = [];
    let n: string | null = name;
    while (n) { chain.push(this.bones.get(n)!); n = this.parent.get(n) ?? null; }
    out.identity();
    for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
    return out;
  }

  /** Figure-space position of a bone's head in the current pose. */
  worldPos(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    const chain: string[] = [];
    let n: string | null = name;
    while (n) { chain.push(n); n = this.parent.get(n) ?? null; }
    const rootName = chain[chain.length - 1];
    out.copy(this.bones.get(rootName)!.position);
    const q = new THREE.Quaternion().copy(this.bones.get(rootName)!.quaternion);
    for (let i = chain.length - 2; i >= 0; i--) {
      const off = va.copy(this.headPos.get(chain[i])!).sub(this.headPos.get(chain[i + 1])!).applyQuaternion(q);
      out.add(off);
      q.multiply(this.bones.get(chain[i])!.quaternion);
    }
    return out;
  }

  rotate(name: string, x: number, y = 0, z = 0): void {
    const b = this.bones.get(name);
    if (!b) return;
    b.quaternion.multiply(qa.setFromEuler(new THREE.Euler(x, y, z, 'XYZ')));
  }

  rotateAxis(name: string, axis: THREE.Vector3, angle: number): void {
    const b = this.bones.get(name);
    if (!b) return;
    b.quaternion.multiply(qa.setFromAxisAngle(axis, angle));
  }

  /** Rotate so the bone's rest direction points along dir (figure space). */
  point(name: string, dir: THREE.Vector3): void {
    const b = this.bones.get(name);
    const p = this.parent.get(name);
    if (!b) return;
    const parentQ = p ? this.worldQuat(p) : new THREE.Quaternion();
    const local = vb.copy(dir).normalize().applyQuaternion(parentQ.invert());
    b.quaternion.setFromUnitVectors(this.rest.get(name)!, local);
  }

  /** Two-bone IK: place `lower`'s tail at target, bending toward pole (figure space). */
  ik(upper: string, lower: string, target: THREE.Vector3, pole: THREE.Vector3): void {
    const s = this.worldPos(upper);
    const l1 = this.length.get(upper)!, l2 = this.length.get(lower)!;
    const toT = new THREE.Vector3().subVectors(target, s);
    const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const dir = toT.normalize();
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = s.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
    this.point(upper, elbow.clone().sub(s));
    const tgt = s.clone().addScaledVector(dir, d);
    this.point(lower, tgt.sub(elbow));
  }

  setHips(dx: number, dy: number, dz: number): void {
    const root = this.bones.values().next().value!;
    root.position.set(this.restHips.x + dx, this.restHips.y + dy, this.restHips.z + dz);
  }
}

/** Adds N skinned shell-fuzz layers that share the figure's skeleton (hero close-ups only). */
export function addSkinnedShells(inst: FigureInstance, def: FigureDef, layers = 8, skip: string[] = ['skin', 'soles']): THREE.SkinnedMesh[] {
  const regionNames = Object.keys(def.regions);
  const out: THREE.SkinnedMesh[] = [];
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  for (let l = 1; l <= layers; l++) {
    const mats = regionNames.map((r) => {
      // Faces stay crisp: fuzz on the clothes, hair and beard only.
      if (skip.includes(r)) return hidden;
      const rd = def.regions[r];
      return createWoolMaterial({ color: rd.color, pattern: rd.pattern, uvSize: [1, 1], stitchUv: true, fuzz: (rd.fuzz ?? 1) * FIGURE_FUZZ, shellLayer: l }, true);
    });
    const shell = new THREE.SkinnedMesh(inst.mesh.geometry, mats);
    shell.castShadow = false;
    shell.frustumCulled = false;
    shell.bind(inst.mesh.skeleton, inst.mesh.bindMatrix);
    inst.mesh.parent!.add(shell);
    out.push(shell);
  }
  return out;
}
