import * as THREE from 'three';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { wood } from './materials.ts';
import { createFpArms } from '../figures/fpArms.ts';
import { createPopper } from './pip.ts';
import { createGlueGun, createHook, createLance, createLauncher, createStaticSock } from './weaponModels.ts';

/** Button Buster: double knitted barrels on a wooden stock with a big sewing-button drum. */
export function createBuster(): THREE.Group {
  const g = new THREE.Group();
  const knitMat = createWoolMaterial({ color: 0xd8262e, pattern: 'rib', uvSize: [0.5, 0.6], gauge: 1.5 });
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 6, 14), knitMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(side * 0.06, 0.02, 0.2);
    addShellFuzz(barrel);
    g.add(barrel);
  }
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.34), wood(0xc89a68));
  stock.position.set(0, -0.03, -0.12);
  g.add(stock);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 28), new THREE.MeshPhysicalMaterial({ color: 0xffc94a, roughness: 0.3, clearcoat: 1 }));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0.1, 0.03, 0.02);
  for (const [hx, hz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0x3a2a10 }));
    hole.position.set(hx * 0.03, 0, hz * 0.03);
    drum.add(hole);
  }
  g.add(drum);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 24), createWoolMaterial({ color: 0xefe3c8, pattern: 'rib', uvSize: [0.6, 0.12], gauge: 2 }));
  band.position.set(0, 0.02, 0.35);
  g.add(band);
  return g;
}

export class ViewModel {
  readonly group = new THREE.Group();
  private guns: THREE.Group[];
  private weapon = 0;
  private switchT = 1;
  private recoil = 0;
  private bob = 0;
  private arms: THREE.Object3D;
  private jacket = 0xe8742a;

  constructor(camera: THREE.Camera) {
    const popper = createPopper();
    popper.scale.setScalar(0.9);
    const buster = createBuster();
    this.guns = [popper, buster, createLance(), createHook(), createLauncher(), createGlueGun(), createStaticSock()].map((gun) => {
      const holder = new THREE.Group();
      gun.rotation.y = Math.PI; // modelled along +Z; the camera looks down -Z
      holder.add(gun);
      holder.visible = false;
      this.group.add(holder);
      return holder;
    });
    this.guns[0].visible = true;
    // Sculpted knitted sleeves and gloved hands gripping the blaster.
    this.arms = createFpArms(0xe8742a);
    this.group.add(this.arms);
    this.group.position.set(0.26, -0.26, -0.42);
    this.group.traverse((o) => { o.renderOrder = 5; });
    camera.add(this.group);
  }

  /** Re-knit the sleeves in the player's yarn colour. */
  setJacket(color: number): void {
    if (color === this.jacket) return;
    this.jacket = color;
    this.group.remove(this.arms);
    this.arms = createFpArms(color);
    this.arms.traverse((o) => { o.renderOrder = 5; });
    this.group.add(this.arms);
  }

  setWeapon(i: number): void {
    if (i === this.weapon) return;
    this.weapon = i;
    this.switchT = 0;
  }

  fire(): void {
    this.recoil = [0.4, 1, 1.3, 0.25, 1.1, 0.6, 0.35][this.weapon] ?? 0.4;
  }

  /** World position of the current muzzle. */
  muzzle(): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.guns[this.weapon].localToWorld(new THREE.Vector3(0, 0, [-0.3, -0.45, -0.95, -0.4, -0.42, -0.36, -0.42][this.weapon] ?? -0.3));
  }

  update(dt: number, speed: number, grounded: boolean): void {
    this.switchT = Math.min(1, this.switchT + dt * 5);
    // Dip down, swap guns at the bottom, come back up.
    const dip = Math.sin(this.switchT * Math.PI);
    this.guns.forEach((g, i) => { g.visible = i === this.weapon; });
    this.bob += dt * speed * 2.2 * (grounded ? 1 : 0);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.group.position.x = 0.26 + Math.sin(this.bob) * 0.012;
    this.group.position.y = -0.26 + Math.abs(Math.cos(this.bob)) * 0.012 - dip * 0.25;
    this.group.position.z = -0.42 + this.recoil * 0.08;
    this.group.rotation.x = this.recoil * 0.12;
  }
}
