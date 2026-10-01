import * as THREE from 'three';
import { VehicleKind, type NetVehicle } from '@stitchstrike/shared';
import { metal } from './materials.ts';
import { mesh, rbox, wool } from './woolKit.ts';

/**
 * Knitted drivable toys: a safari jeep (striped canvas, roll bar, chunky
 * tyres, spare wheel, headlamps) and a wind-up tank (felt treads, a turret
 * that follows the driver's aim, and a brass wind-up key that turns as it
 * drives). Both are modelled facing -Z. Parked ones come from the snapshot;
 * driven ones ride with their drivers.
 */

function wheel(r: number, w: number): THREE.Group {
  const g = new THREE.Group();
  const tyre = mesh(new THREE.TorusGeometry(r * 0.72, r * 0.32, 10, 20).rotateY(Math.PI / 2), wool('garter', 0x24242a, 3));
  const hub = mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w, 14).rotateZ(Math.PI / 2), wool('felt', 0xe8b04a, 3));
  g.add(tyre, hub);
  g.name = 'wheel';
  return g;
}

export function createJeep(): THREE.Group {
  const g = new THREE.Group();
  const body = wool('stocking', 0xe8c070, 1.4);
  g.add(Object.assign(rbox(2.2, 0.9, 3.6, 0.3, body), {}).translateY(0.95));
  // Bonnet, grille and headlamps at the front (-Z).
  g.add(rbox(2.1, 0.35, 1.2, 0.15, body).translateY(1.55).translateZ(-1.1));
  g.add(rbox(1.9, 0.6, 0.15, 0.06, wool('rib', 0x3a3a30, 3)).translateY(1.15).translateZ(-1.82));
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(1.8) }));
    lamp.position.set(sx, 1.25, -1.86);
    g.add(lamp);
  }
  // Seats, a striped canvas stripe down the side, a roll bar and a spare tyre on the back.
  g.add(rbox(1.8, 0.4, 1.0, 0.15, wool('rib', 0xb08850, 2)).translateY(1.55).translateZ(0.5));
  for (const sx of [-1.12, 1.12]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.25, 3.4), wool('rib', 0x3a6a3a, 3)).translateX(sx).translateY(1.05));
  const bar = metal(0x2a2a30, 0.5);
  for (const sx of [-0.95, 0.95]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8), bar).translateX(sx).translateY(2.05).translateZ(0.2));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8).rotateZ(Math.PI / 2), bar).translateY(2.7).translateZ(0.2));
  const spare = wheel(0.55, 0.35);
  spare.rotation.y = Math.PI / 2;
  spare.position.set(0, 1.25, 1.95);
  spare.name = 'spare';
  g.add(spare);
  for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) {
    const w = wheel(0.55, 0.4);
    w.position.set(x, 0.55, z);
    g.add(w);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function createTank(): THREE.Group {
  const g = new THREE.Group();
  const hull = wool('garter', 0x3f74b0, 1.2);
  g.add(rbox(2.6, 0.9, 3.6, 0.3, hull).translateY(1.0));
  // Felt treads either side, with bobbly road wheels.
  for (const sx of [-1.45, 1.45]) {
    g.add(rbox(0.55, 0.9, 3.9, 0.4, wool('rib', 0x2a2a24, 2.4)).translateX(sx).translateY(0.5));
    for (let k = 0; k < 4; k++) {
      const w = wheel(0.38, 0.6);
      w.position.set(sx, 0.48, -1.35 + k * 0.9);
      g.add(w);
    }
  }
  // Turret: a knitted dome with a stockinette barrel and a felt star; turns to aim.
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.y = 1.6;
  const dome = mesh(new THREE.SphereGeometry(0.95, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), wool('stocking', 0x5a8ec4, 1.4));
  dome.scale.y = 0.75;
  const barrel = mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.1, 12).rotateX(Math.PI / 2), wool('rib', 0x2f5a8a, 2.5));
  barrel.position.set(0, 0.35, -1.25);
  barrel.name = 'barrel';
  const muzzle = mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 14), wool('rib', 0xe8b04a, 3));
  muzzle.position.set(0, 0.35, -2.3);
  const star = mesh(new THREE.CircleGeometry(0.28, 5), wool('felt', 0xd8262e, 3), false);
  star.position.set(0.93, 0.25, 0);
  star.rotation.y = Math.PI / 2;
  turret.add(dome, barrel, muzzle, star);
  g.add(turret);
  // The brass wind-up key on the back.
  const key = new THREE.Group();
  key.name = 'key';
  key.position.set(0, 1.4, 2.05);
  const brass = metal(0xd9b24a, 0.25);
  key.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8).rotateX(Math.PI / 2), brass).translateZ(0.2));
  for (const sx of [-1, 1]) key.add(mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 16), brass).translateX(sx * 0.3).translateZ(0.45));
  g.add(key);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export interface DrivenVehicle { key: number; kind: number; x: number; y: number; z: number; yaw: number; aimYaw: number; speed: number }

interface Live { root: THREE.Group; kind: number; spin: number }

export class VehicleView {
  private parked: Live[] = [];
  private driven = new Map<number, Live>();

  constructor(private scene: THREE.Scene) {}

  private make(kind: number): Live {
    const root = kind === VehicleKind.Tank ? createTank() : createJeep();
    this.scene.add(root);
    return { root, kind, spin: 0 };
  }

  update(parked: NetVehicle[], driven: DrivenVehicle[], dt: number): void {
    // Parked: pooled by slot, rebuilt if the kind in a slot changes.
    while (this.parked.length > parked.length) this.scene.remove(this.parked.pop()!.root);
    parked.forEach((v, i) => {
      let l = this.parked[i];
      if (!l || l.kind !== v.kind) {
        if (l) this.scene.remove(l.root);
        l = this.make(v.kind);
        this.parked[i] = l;
      }
      l.root.position.set(v.x, v.y, v.z);
      l.root.rotation.y = v.yaw;
    });
    // Driven: one per driver, wheels and wind-up key turn with speed, turret follows the aim.
    const seen = new Set<number>();
    for (const d of driven) {
      seen.add(d.key);
      let l = this.driven.get(d.key);
      if (!l || l.kind !== d.kind) {
        if (l) this.scene.remove(l.root);
        l = this.make(d.kind);
        this.driven.set(d.key, l);
      }
      l.root.position.set(d.x, d.y, d.z);
      l.root.rotation.y = d.yaw;
      l.spin += d.speed * dt;
      l.root.traverse((o) => {
        if (o.name === 'wheel') o.rotation.x = -l!.spin / 0.55;
        if (o.name === 'key') o.rotation.z = l!.spin * 0.6;
      });
      const turret = l.root.getObjectByName('turret');
      if (turret) turret.rotation.y = d.aimYaw - d.yaw;
    }
    for (const [k, l] of this.driven) if (!seen.has(k)) { this.scene.remove(l.root); this.driven.delete(k); }
  }

  /** Nearest parked vehicle within range of (x, z), for the "press E to drive" prompt. */
  static nearest(parked: NetVehicle[], x: number, y: number, z: number, range: number): NetVehicle | null {
    let best: NetVehicle | null = null;
    let bestD = range;
    for (const v of parked) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestD && Math.abs(v.y - y) < 3) { bestD = d; best = v; }
    }
    return best;
  }
}
