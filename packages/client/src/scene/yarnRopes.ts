import * as THREE from 'three';
import { lumpy, wool } from './woolKit.ts';

/**
 * Yarn-swing strands: a taut knitted cord from a toy's hand to the anchor,
 * with a little crocheted knot where it bit into the surface. Pooled, one
 * per swinging toy; a fresh strand shoots out over a few frames.
 */

export interface RopeSpec {
  key: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Cord radius (world units); thinner for your own first-person strand. */
  width?: number;
}

interface Rope {
  group: THREE.Group;
  cord: THREE.Mesh;
  knot: THREE.Mesh;
  age: number;
  used: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const SHOOT_SECONDS = 0.09;

export class YarnRopes {
  private ropes = new Map<number, Rope>();
  private cordGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  private knotGeo = lumpy(0.16, 0.35, 5, 1);
  private mat = wool('rib', 0xe8742a, 6);
  private dir = new THREE.Vector3();
  private tip = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  update(specs: RopeSpec[], dt: number): void {
    for (const r of this.ropes.values()) r.used = false;
    for (const s of specs) {
      let r = this.ropes.get(s.key);
      if (!r) {
        const group = new THREE.Group();
        const cord = new THREE.Mesh(this.cordGeo, this.mat);
        const knot = new THREE.Mesh(this.knotGeo, this.mat);
        group.add(cord, knot);
        this.scene.add(group);
        r = { group, cord, knot, age: 0, used: true };
        this.ropes.set(s.key, r);
      }
      r.used = true;
      r.age += dt;
      const f = Math.min(1, r.age / SHOOT_SECONDS);
      this.dir.subVectors(s.to, s.from);
      const len = this.dir.length();
      if (len < 1e-3) continue;
      this.dir.divideScalar(len);
      this.tip.copy(s.from).addScaledVector(this.dir, len * f);
      r.cord.position.copy(s.from);
      r.cord.quaternion.setFromUnitVectors(UP, this.dir);
      const w = s.width ?? 0.06;
      r.cord.scale.set(w, len * f, w);
      r.knot.position.copy(this.tip);
      r.knot.visible = f >= 1;
    }
    for (const [key, r] of this.ropes) {
      if (r.used) continue;
      this.scene.remove(r.group);
      this.ropes.delete(key);
    }
  }
}
