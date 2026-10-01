import * as THREE from 'three';
import type { Box, World } from '@stitchstrike/shared';
import { bunting, pumpkin, skyCard, skylineStrip } from './cozyDressing.ts';
import { metal } from './materials.ts';
import { scatterMess } from './mess.ts';
import { lumpy, mesh, rbox, rng, wool, yarnTube } from './woolKit.ts';

/**
 * The Bathroom, knitted: aqua garter "tiles", a claw-foot tub with a bubble
 * bath and rubber ducks, a crocheted shower curtain on rings, a knitted
 * porcelain toilet, a vanity with a mirror and a hanging towel, toilet-roll
 * steps, a laundry basket spilling socks, and sunlight through frosted glass.
 */

export interface WoolBathroom { update(t: number, camera: THREE.Camera): void }

const PORCELAIN = 0xf6f4ee;

function renderBox(group: THREE.Group, b: Box): void {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); group.add(o); return o; };
  switch (b.shape) {
    case 'tileFloor': {
      at(mesh(new THREE.BoxGeometry(size[0], 1, size[2]), wool('garter', 0xe8eef0, 0.45), false), c.x, -0.5, c.z);
      const mat = mesh(new THREE.PlaneGeometry(16, 10).rotateX(-Math.PI / 2), wool('crochet', 0xd9772e, 0.9), false);
      at(mat, -16, 0.03, -4);
      return;
    }
    case 'tileWall': {
      // Aqua tiles below, cream knit above, with a crocheted border between.
      const lower = Math.min(size[1], 22);
      at(mesh(new THREE.BoxGeometry(size[0], lower, size[2]), wool('garter', 0xa8b88a, 0.5)), c.x, lower / 2, c.z);
      at(mesh(new THREE.BoxGeometry(size[0], size[1] - lower, size[2]), wool('stocking', 0xf2ece0, 0.5)), c.x, lower + (size[1] - lower) / 2, c.z);
      at(mesh(new THREE.BoxGeometry(size[0] + 0.2, 1.2, size[2] + 0.2), wool('crochet', 0x8a5a3a, 1.2)), c.x, lower, c.z);
      return;
    }
    case 'door': {
      at(rbox(size[0], size[1], size[2], 0.3, wool('rib', 0xf2ece0, 0.8)), c.x, c.y, c.z);
      at(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), metal(0xd9b24a, 0.2)), b.max[0] - 2, 12, b.min[2] - 0.4);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(size[0], 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe8c0).multiplyScalar(1.8) }));
      glow.rotation.y = Math.PI;
      at(glow, c.x, 1.25, b.max[2] + 0.2);
      return;
    }
    case 'tubFloor':
      at(rbox(size[0], size[1] + 0.4, size[2], 0.2, wool('garter', PORCELAIN, 0.8)), c.x, c.y, c.z);
      return;
    case 'tubRim':
      at(rbox(size[0], size[1], size[2], Math.min(size[0], size[2]) / 2 - 0.01, wool('garter', PORCELAIN, 0.8)), c.x, c.y, c.z);
      return;
    case 'showerCurtain': {
      const geo = new THREE.PlaneGeometry(size[0], size[1], 40, 20);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.1) * 0.5);
      geo.computeVertexNormals();
      const cur = mesh(geo, wool('crochet', b.color ?? 0xb46fd6, 1));
      (cur.material as THREE.Material).side = THREE.DoubleSide;
      at(cur, c.x, c.y, c.z);
      const rail = mesh(new THREE.CylinderGeometry(0.25, 0.25, size[0] + 20, 10).rotateZ(Math.PI / 2), metal(0xd9dde2, 0.2));
      at(rail, c.x + 10, b.max[1] + 0.6, c.z);
      for (let x = b.min[0] + 1; x < b.max[0]; x += 2) at(mesh(new THREE.TorusGeometry(0.45, 0.1, 6, 14), metal(0xd9dde2, 0.2)), x, b.max[1] + 0.4, c.z);
      return;
    }
    case 'toiletBowl': {
      at(rbox(size[0] * 0.8, size[1] - 1, size[2], 2.5, wool('garter', PORCELAIN, 0.9)), c.x, (size[1] - 1) / 2, c.z);
      const seat = mesh(new THREE.TorusGeometry(3.2, 0.7, 10, 28).rotateX(Math.PI / 2), wool('garter', 0xefe3c8, 1.2));
      seat.scale.z = 1.2;
      at(seat, c.x, b.max[1] - 0.4, c.z + 0.5);
      return;
    }
    case 'toiletTank': {
      at(rbox(size[0], size[1], size[2], 0.8, wool('garter', PORCELAIN, 0.9)), c.x, c.y, c.z);
      at(rbox(3, 0.6, 1, 0.2, metal(0xd9dde2, 0.2)), b.max[0] - 2, b.max[1] - 3, b.max[2] + 0.3);
      return;
    }
    case 'tpRoll': {
      at(mesh(new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 24), wool('garter', 0xfaf8f2, 1.1)), c.x, c.y, c.z);
      at(mesh(new THREE.CylinderGeometry(0.9, 0.9, size[1] + 0.05, 16), wool('felt', 0xb89060, 1.4)), c.x, c.y, c.z);
      return;
    }
    case 'vanity': {
      at(rbox(size[0], size[1] - 1, size[2], 0.3, wool('rib', 0x8a6a48, 0.8)), c.x, (size[1] - 1) / 2, c.z);
      at(rbox(size[0] + 0.6, 1, size[2] + 0.6, 0.2, wool('felt', 0xefeae0, 0.8)), c.x, b.max[1] - 0.5, c.z);
      for (const z of [b.min[2] + size[2] * 0.25, b.min[2] + size[2] * 0.75]) {
        at(rbox(0.4, size[1] - 5, size[2] * 0.42, 0.15, wool('garter', 0xa8805a, 1)), b.min[0] - 0.1, (size[1] - 1) / 2, z);
        at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), metal(0xd9b24a, 0.2)), b.min[0] - 0.4, size[1] * 0.6, z + 1);
      }
      // Basin, tap, mirror, toothbrush cup and a bar of soap.
      at(mesh(new THREE.CylinderGeometry(3, 2.4, 0.6, 24), wool('garter', PORCELAIN, 1)), c.x, b.max[1] + 0.2, c.z + 3);
      const tap = mesh(new THREE.TorusGeometry(1, 0.25, 8, 16, Math.PI), metal(0xd9dde2, 0.15));
      tap.rotation.y = Math.PI / 2;
      at(tap, b.max[0] - 1.5, b.max[1] + 1, c.z + 3);
      const mirror = mesh(new THREE.PlaneGeometry(size[2] - 4, 16), new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, metalness: 1, roughness: 0.04 }), false);
      mirror.rotation.y = -Math.PI / 2;
      at(mirror, b.max[0] - 0.05, b.max[1] + 12, c.z);
      at(rbox(0.4, 17, size[2] - 3, 0.2, wool('rib', 0x3a5da8, 1)), b.max[0] - 0.02, b.max[1] + 12, c.z).scale.set(1, 1, 1);
      at(mesh(new THREE.CylinderGeometry(0.8, 0.7, 2.2, 16), wool('crochet', 0x6fd6ff, 1.6)), c.x, b.max[1] + 1.1, b.min[2] + 3);
      for (const [dz, col] of [[-0.3, 0xd8262e], [0.3, 0x8bcb3a]] as const) {
        at(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), wool('rib', col, 3)), c.x + 0.2, b.max[1] + 3, b.min[2] + 3 + dz).rotation.z = 0.2;
      }
      at(rbox(1.8, 0.8, 1.2, 0.35, wool('felt', 0xf2a8c8, 1.5)), c.x - 1.5, b.max[1] + 0.4, b.max[2] - 3);
      return;
    }
    case 'towel': {
      const geo = new THREE.PlaneGeometry(size[2], size[1], 12, 16);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.5) * 0.15);
      const towel = mesh(geo, wool('rib', b.color ?? 0xe8742a, 1.3));
      (towel.material as THREE.Material).side = THREE.DoubleSide;
      towel.rotation.y = Math.PI / 2;
      at(towel, b.min[0] + 0.2, c.y, c.z);
      at(mesh(new THREE.CylinderGeometry(0.25, 0.25, size[2] + 2, 10).rotateX(Math.PI / 2), metal(0xd9dde2, 0.2)), b.min[0], b.max[1] - 0.3, c.z);
      for (let z = b.min[2] + 0.3; z < b.max[2]; z += 0.6) at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 4), wool('rib', 0xefe3c8, 3), false), b.min[0] + 0.2, b.min[1] - 0.3, z);
      return;
    }
    case 'laundry': {
      at(rbox(size[0], size[1], size[2], 1.2, wool('rib', b.color ?? 0xc8a070, 0.9)), c.x, c.y, c.z);
      // Clothes spilling over the rim.
      const r = rng(5);
      for (let k = 0; k < 7; k++) {
        const cloth = mesh(lumpy(1.2 + r(), 0.6, k, 2), wool('stocking', [0xd8262e, 0x3a5da8, 0xffc94a, 0x8bcb3a, 0xefe3c8][k % 5], 1.4));
        cloth.scale.y = 0.5;
        at(cloth, c.x + (r() - 0.5) * size[0] * 0.8, b.max[1] + 0.3, c.z + (r() - 0.5) * size[2] * 0.8);
      }
      at(yarnTube([new THREE.Vector3(b.min[0] + 2, b.max[1], c.z), new THREE.Vector3(b.max[0] + 1, b.max[1] - 3, c.z + 2), new THREE.Vector3(b.max[0] + 2, 0.5, c.z + 3)], 0.5, wool('rib', 0xb46fd6, 2), 30), 0, 0, 0);
      return;
    }
    case 'towelPile': {
      const cols = [0x6fd6ff, 0xefe3c8, 0xd8262e];
      for (let k = 0; k < 3; k++) at(rbox(size[0] - k * 0.6, 1, size[2] - k * 0.4, 0.4, wool('rib', cols[k], 1.2)), c.x + k * 0.2, 0.5 + k, c.z);
      return;
    }
    case 'scale':
      at(rbox(size[0], size[1], size[2], 0.5, wool('garter', b.color ?? 0xdfe4ea, 1.2)), c.x, c.y, c.z);
      at(mesh(new THREE.CircleGeometry(1.4, 24).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x20242e, roughness: 0.1, clearcoat: 1 }), false), c.x, b.max[1] + 0.02, c.z - 1.5);
      return;
    case 'duck': {
      const yellow = wool('crochet', 0xffd24a, 1.4);
      at(mesh(new THREE.SphereGeometry(2.8, 20, 14).scale(1.2, 0.8, 1), yellow), c.x, 2, c.z);
      at(mesh(new THREE.SphereGeometry(1.7, 18, 12), yellow), c.x + 1.8, 4.3, c.z);
      const beak = mesh(new THREE.ConeGeometry(0.7, 1.6, 10).rotateZ(-Math.PI / 2), wool('felt', 0xe8742a, 2));
      at(beak, c.x + 3.6, 4.1, c.z);
      for (const dz of [-0.8, 0.8]) at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0x111111, clearcoat: 1 })), c.x + 3, 4.8, c.z + dz);
      return;
    }
  }
  at(rbox(size[0], size[1], size[2], 0.2, wool('garter', b.color ?? 0x999999, 1)), c.x, c.y, c.z);
}

export function buildWoolBathroom(scene: THREE.Scene, world: World): WoolBathroom {
  scene.fog = new THREE.Fog(0xc8d4d6, 140, 260);
  const group = new THREE.Group();
  group.name = 'wool-bathroom';
  for (const b of world.boxes) renderBox(group, b);

  // Bubble bath: shallow water, foam lumps and a flotilla of ducks in the tub.
  const water = mesh(new THREE.PlaneGeometry(36, 14).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x3aa8d0, roughness: 0.05, transparent: true, opacity: 0.72, clearcoat: 1 }), false);
  water.position.set(-18, 2.6, -21);
  group.add(water);
  const r = rng(11);
  const foam = wool('felt', 0xffffff, 1.5);
  for (let k = 0; k < 26; k++) {
    const f = mesh(lumpy(0.8 + r() * 1.4, 0.5, k, 1), foam, false);
    f.scale.y = 0.6;
    f.position.set(-35 + r() * 34, 2.7, -27 + r() * 12);
    if (Math.hypot(f.position.x + 24, f.position.z + 24) < 2.5) continue;
    group.add(f);
  }
  for (let k = 0; k < 3; k++) {
    const d = new THREE.Group();
    d.add(mesh(new THREE.SphereGeometry(0.9, 14, 10).scale(1.2, 0.8, 1), wool('crochet', 0xffd24a, 2)));
    const h = mesh(new THREE.SphereGeometry(0.55, 12, 8), wool('crochet', 0xffd24a, 2));
    h.position.set(0.7, 0.8, 0);
    d.add(h);
    d.position.set(-30 + k * 9, 3.1, -18 - k * 2);
    d.rotation.y = r() * 6;
    group.add(d);
  }
  // A frosted window on the left wall, a ceiling lamp, a toilet-roll holder and a bath mat.
  // The window looks out on the knitted city: a shallow diorama behind the glass.
  const view = new THREE.Group();
  const card = skyCard(14, 12, 0x6a96d0, 0xf8d4a0);
  view.add(card);
  const city = skylineStrip(170, 31, { height: 70, lit: 0.5 });
  city.scale.set(0.085, 0.085, 0.004);
  city.position.set(0, -6, 0.05);
  view.add(city);
  view.rotation.y = Math.PI / 2;
  view.position.set(-39.9, 32, 4);
  group.add(view);
  const sash = wool('felt', 0xefe3c8, 1.4);
  for (const [w, h, y, z] of [[15, 0.7, 38.2, 4], [15, 0.9, 25.8, 4], [0.7, 12.6, 32, -3.2], [0.7, 12.6, 32, 11.2], [0.4, 12, 32, 4], [14, 0.4, 32, 4]] as const) {
    const bar = mesh(new THREE.BoxGeometry(0.6, h, w), sash);
    bar.position.set(-39.5, y, z);
    group.add(bar);
  }
  group.add(bunting(new THREE.Vector3(-39.2, 40.2, -4), new THREE.Vector3(-39.2, 40.2, 12), { sag: 1, size: 0.9, seed: 5 }));
  for (const [x, z, r] of [[-37, 26, 1.2], [37, 14, 0.9]] as const) {
    const pk = pumpkin(r, Math.floor(x + z));
    pk.position.set(x, x < 0 ? 12 : 16, z);
    group.add(pk);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e4).multiplyScalar(1.6) }));
  lamp.position.set(0, 48, 0);
  group.add(lamp);
  const light = new THREE.PointLight(0xffd8a8, 260, 120, 1.7);
  light.position.set(0, 44, 0);
  group.add(light);
  const holder = mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8).rotateX(Math.PI / 2), metal(0xd9dde2, 0.2));
  holder.position.set(18, 14, -29.5);
  group.add(holder);
  scatterMess(group, world, { count: 60, seed: 41, outdoor: false });
  scene.add(group);

  const sun = new THREE.DirectionalLight(0xffd6a0, 1.8);
  sun.position.set(-90, 60, 10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffe6c4, 0x8a6a50, 0.45));
  return { update() { /* the bathroom is calm */ } };
}
