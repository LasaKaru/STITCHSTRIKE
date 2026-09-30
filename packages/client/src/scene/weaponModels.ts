import * as THREE from 'three';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { metal, wood } from './materials.ts';

/**
 * The knitted arsenal's newer toys, modelled along +Z like the Popper and
 * Buster (the view model turns them to face down the camera's -Z).
 */

const knit = (color: number, pattern: 'rib' | 'garter' | 'stocking' | 'crochet' | 'felt' | 'wound', u: number, v: number, gauge = 1.5) =>
  createWoolMaterial({ color, pattern, uvSize: [u, v], gauge });

/** Needle Lance: a long steel knitting needle in a crocheted sniper stock with a bottle-cap scope. */
export function createLance(): THREE.Group {
  const g = new THREE.Group();
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.9, 12), metal(0xdfe4ea, 0.15));
  needle.rotation.x = Math.PI / 2;
  needle.position.z = 0.45;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 12), metal(0xf2f4f8, 0.1));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.93;
  const stock = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 6, 14), knit(0x3a5da8, 'crochet', 0.5, 0.8, 1.4));
  stock.rotation.x = Math.PI / 2;
  stock.position.set(0, -0.02, 0.05);
  addShellFuzz(stock);
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.18), wood(0xa87a4a));
  butt.position.set(0, -0.05, -0.22);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 16), knit(0x2a2a2e, 'rib', 0.3, 0.3, 2));
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.07, 0.12);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshPhysicalMaterial({ color: 0x6fd6ff, roughness: 0.05, clearcoat: 1, emissive: 0x1a4a6a, emissiveIntensity: 0.6 }));
  lens.position.set(0, 0.07, 0.232);
  const cap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 18), metal(0xd8262e, 0.35));
  cap.position.set(0, 0.07, 0.23);
  g.add(needle, tip, stock, butt, scope, lens, cap);
  return g;
}

/** Crochet Hook: a stubby SMG made of a fat crochet hook, a yarn-ball drum magazine and a knitted grip. */
export function createHook(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 14), new THREE.MeshPhysicalMaterial({ color: 0xb46fd6, roughness: 0.25, clearcoat: 1 }));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.14;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.014, 8, 16, Math.PI * 1.3), shaft.material);
  hook.position.set(0, 0.02, 0.35);
  hook.rotation.y = Math.PI / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26), knit(0x8bcb3a, 'garter', 0.5, 0.4, 1.6));
  body.position.z = 0;
  const drum = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), knit(0xffc94a, 'wound', 0.5, 0.3, 2));
  drum.position.set(0, -0.09, 0.05);
  addShellFuzz(drum);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), wood(0xc89a68));
  grip.position.set(0, -0.09, -0.08);
  grip.rotation.x = 0.35;
  g.add(shaft, hook, body, drum, grip);
  return g;
}

/** Yarn-Ball Launcher: a fat knitted tube with a wooden bobbin breech and a ball of yarn loaded up front. */
export function createLauncher(): THREE.Group {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.5, 20, 1, true), knit(0x8bcb3a, 'stocking', 0.55, 0.6, 1.3));
  (tube.material as THREE.Material).side = THREE.DoubleSide;
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.15;
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.025, 10, 24), knit(0xefe3c8, 'rib', 0.6, 0.12, 2));
  cuff.position.z = 0.4;
  const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 24), wood());
  breech.rotation.x = Math.PI / 2;
  breech.position.z = -0.15;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), knit(0xd8262e, 'wound', 0.45, 0.3, 2));
  ball.position.z = 0.36;
  addShellFuzz(ball);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), wood(0xa87a4a));
  grip.position.set(0, -0.12, -0.08);
  grip.rotation.x = 0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), metal(0x333338));
  sight.position.set(0, 0.11, 0.3);
  g.add(tube, cuff, breech, ball, grip, sight);
  g.userData.ball = ball;
  return g;
}

/** A yarn ball in flight (shared by the view and the world). */
export function yarnBall(color = 0x8bcb3a): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), knit(color, 'wound', 1, 0.6, 2));
  m.castShadow = true;
  return m;
}
