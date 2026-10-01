import * as THREE from 'three';
import type { Box, World } from '@stitchstrike/shared';
import { bunting, pumpkin } from './cozyDressing.ts';
import { metal } from './materials.ts';
import { scatterMess } from './mess.ts';
import { lumpy, mesh, rbox, rng, wool, yarnTube } from './woolKit.ts';

/**
 * The Garage, knitted: brick-garter walls, a felt concrete floor with oil
 * stains, the family car (you can crawl under it), steel shelving loaded with
 * paint tins, a workbench under a pegboard of knitted tools, a roll-up door
 * stuck half open with daylight pouring under it, and fluorescent tubes.
 */

export interface WoolGarage {
  update(t: number, camera: THREE.Camera): void;
}

function renderBox(group: THREE.Group, b: Box): void {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); group.add(o); return o; };
  switch (b.shape) {
    case 'garageFloor': {
      at(mesh(new THREE.BoxGeometry(size[0], 1, size[2]), wool('felt', 0x8e8c86, 0.6), false), c.x, -0.5, c.z);
      // Oil stains under the car and a painted parking line.
      const stain = wool('felt', 0x3a3a3c, 1.2);
      for (const [x, z, r] of [[-8, 2, 6], [-4, 10, 3], [-12, -8, 2.5]] as const) {
        const s = mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), stain, false);
        s.scale.set(1, 1, 0.7);
        at(s, x, 0.02, z);
      }
      const line = mesh(new THREE.PlaneGeometry(0.8, 60).rotateX(-Math.PI / 2), wool('rib', 0xffd24a, 1.5), false);
      at(line, 6, 0.03, 2);
      return;
    }
    case 'garageWall': {
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('garter', 0x9a5a44, 0.55)), c.x, c.y, c.z);
      return;
    }
    case 'garageDoor': {
      // Horizontal knitted panels, a handle, and bright daylight under the gap.
      const panelMat = wool('rib', 0xe0dccf, 0.8);
      for (let y = b.min[1]; y < b.max[1]; y += 4) {
        at(rbox(size[0], 3.8, 0.8, 0.3, panelMat), c.x, y + 1.9, b.min[2] + 0.2);
      }
      at(rbox(4, 0.6, 1, 0.2, metal(0x9aa0aa)), c.x, b.min[1] + 1.2, b.min[2] - 0.4);
      const day = new THREE.Mesh(new THREE.PlaneGeometry(size[0], 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(2.2) }));
      day.rotation.y = Math.PI;
      at(day, c.x, 1.5, b.max[2] + 0.5);
      return;
    }
    case 'carBody': {
      const paint = wool('stocking', b.color ?? 0x2f5a9a, 0.9, 0.55);
      at(rbox(size[0], size[1], size[2], 2.4, paint), c.x, c.y, c.z);
      // Bumpers, grille, headlights, tail lights, a knitted number plate.
      const chrome = metal(0xd9dde2, 0.2);
      for (const z of [b.min[2] - 0.2, b.max[2] + 0.2]) at(rbox(size[0] - 1, 1.2, 1.2, 0.5, chrome), c.x, b.min[1] + 1, z);
      at(rbox(8, 2.4, 0.4, 0.3, wool('rib', 0x2a2a2e, 1.5)), c.x, b.min[1] + 3.4, b.max[2] + 0.1);
      const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6d0).multiplyScalar(2) });
      const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(1.6) });
      for (const sx of [-1, 1]) {
        at(new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), head), c.x + sx * 6, b.min[1] + 3.6, b.max[2] + 0.05);
        const tl = at(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), tail), c.x + sx * 6.5, b.min[1] + 3.8, b.min[2] - 0.05);
        tl.rotation.y = Math.PI;
      }
      const plate = at(rbox(5, 1.6, 0.2, 0.1, wool('felt', 0xf6f1e4, 1.4)), c.x, b.min[1] + 1.2, b.max[2] + 0.9);
      plate.rotation.y = 0;
      const lights = [new THREE.SpotLight(0xfff0c8, 40, 40, 0.5, 0.6, 1.5), new THREE.SpotLight(0xfff0c8, 40, 40, 0.5, 0.6, 1.5)];
      lights.forEach((l, i) => {
        l.position.set(c.x + (i ? 6 : -6), b.min[1] + 3.6, b.max[2] + 0.5);
        l.target.position.set(c.x + (i ? 8 : -8), 0, b.max[2] + 20);
        group.add(l, l.target);
      });
      return;
    }
    case 'carCabin': {
      at(rbox(size[0], size[1], size[2], 1.8, wool('stocking', b.color ?? 0x2f5a9a, 0.9, 0.55)), c.x, c.y, c.z);
      // Windows: dark felt panels with a glossy sheen.
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2432, roughness: 0.08, clearcoat: 1 });
      const w1 = at(new THREE.Mesh(new THREE.PlaneGeometry(size[0] - 3, size[1] - 2.2), glass), c.x, c.y + 0.4, b.max[2] + 0.02);
      w1.rotation.y = 0;
      const w2 = at(new THREE.Mesh(new THREE.PlaneGeometry(size[0] - 3, size[1] - 2.2), glass), c.x, c.y + 0.4, b.min[2] - 0.02);
      w2.rotation.y = Math.PI;
      for (const sx of [-1, 1]) {
        const side = at(new THREE.Mesh(new THREE.PlaneGeometry(size[2] - 3, size[1] - 2.4), glass), sx > 0 ? b.max[0] + 0.02 : b.min[0] - 0.02, c.y + 0.4, c.z);
        side.rotation.y = sx * Math.PI / 2;
        at(rbox(0.6, 1, 1.6, 0.2, wool('stocking', b.color ?? 0x2f5a9a, 0.9)), sx > 0 ? b.max[0] + 0.6 : b.min[0] - 0.6, b.min[1] + 0.8, b.max[2] - 0.5);
      }
      return;
    }
    case 'wheel': {
      const tyre = mesh(new THREE.TorusGeometry(1.55, 0.75, 14, 28), wool('garter', 0x1e1e22, 1.5));
      tyre.rotation.y = Math.PI / 2;
      at(tyre, c.x, 2.1, c.z);
      const hub = mesh(new THREE.CylinderGeometry(1.1, 1.1, size[0] * 0.9, 20).rotateZ(Math.PI / 2), metal(0xcfd4da, 0.25));
      at(hub, c.x, 2.1, c.z);
      return;
    }
    case 'shelf': {
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('rib', 0x9aa0aa, 1.2)), c.x, c.y, c.z);
      if (b.max[1] > 1 && b.max[1] < 24) {
        // Clutter on each shelf: paint tins, boxes, a jar of buttons.
        const r = rng(Math.floor(b.max[1] * 10));
        for (let z = b.min[2] + 2; z < b.max[2] - 2; z += 3 + r() * 3) {
          const kind = r();
          if (kind < 0.45) {
            const tin = mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 18), wool('rib', [0xd8262e, 0x3a5da8, 0xffc94a, 0xefe3c8][Math.floor(r() * 4)], 1.4));
            at(tin, b.min[0] + 3 + r() * 3, b.max[1] + 1.3, z);
          } else if (kind < 0.8) {
            const bx = rbox(3 + r() * 2, 2 + r() * 3, 2.5, 0.2, wool('felt', 0xc8a070, 1.1));
            const bb = new THREE.Box3().setFromObject(bx);
            at(bx, b.min[0] + 4.5, b.max[1] + (bb.max.y - bb.min.y) / 2, z);
          } else {
            const jar = mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 16), new THREE.MeshPhysicalMaterial({ color: 0xcfe8f0, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.6 }));
            at(jar, b.min[0] + 3, b.max[1] + 1.1, z);
            at(mesh(lumpy(0.8, 0.4, Math.floor(z), 1), wool('crochet', 0xe8742a, 2)), b.min[0] + 3, b.max[1] + 0.9, z);
          }
        }
      }
      return;
    }
    case 'shelfPost':
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), metal(0x6a707a, 0.4)), c.x, c.y, c.z);
      return;
    case 'benchTop':
      at(rbox(size[0], size[1], size[2], 0.2, wool('rib', 0xb88a58, 1.1)), c.x, c.y, c.z);
      // A vice and a coffee mug full of pencils.
      at(rbox(2.4, 2, 2, 0.2, wool('garter', 0x3a5da8, 1.4)), b.max[0] - 3, b.max[1] + 1, b.max[2] - 1.5);
      at(mesh(new THREE.CylinderGeometry(0.9, 0.8, 2, 16), wool('crochet', 0xefe3c8, 1.6)), b.min[0] + 4, b.max[1] + 1, b.max[2] - 2);
      return;
    case 'benchLeg':
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('rib', 0x8a6a48, 1)), c.x, c.y, c.z);
      return;
    case 'pegboard': {
      const c2 = document.createElement('canvas');
      c2.width = c2.height = 128;
      const g = c2.getContext('2d')!;
      g.fillStyle = '#c8a878';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#5a4630';
      for (let y = 8; y < 128; y += 16) for (let x = 8; x < 128; x += 16) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
      const tex = new THREE.CanvasTexture(c2);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(size[0] / 3, size[1] / 3);
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })), c.x, c.y, c.z);
      // Knitted tools hanging on hooks.
      const z = b.max[2] + 0.4;
      const tools: [number, number, () => THREE.Object3D][] = [
        [7, 22, () => { const h = new THREE.Group(); h.add(rbox(0.5, 5, 0.4, 0.15, wool('rib', 0xb88a58, 2))); const head = rbox(2.4, 0.9, 0.9, 0.2, metal(0x9aa0aa)); head.position.y = 2.6; h.add(head); return h; }],
        [11, 20, () => { const w = new THREE.Group(); w.add(rbox(0.6, 6, 0.3, 0.1, metal(0xcfd4da))); const jaw = mesh(new THREE.TorusGeometry(0.7, 0.28, 8, 16, Math.PI * 1.5), metal(0xcfd4da)); jaw.position.y = 3.3; w.add(jaw); return w; }],
        [17, 21, () => { const s = new THREE.Group(); s.add(rbox(7, 2.2, 0.1, 0.05, metal(0xdfe4ea))); const grip = rbox(2, 2.4, 0.5, 0.3, wool('garter', 0xd8262e, 2)); grip.position.x = 4.2; s.add(grip); return s; }],
        [23, 22, () => { const d = new THREE.Group(); d.add(rbox(0.8, 3, 0.8, 0.3, wool('crochet', 0xffc94a, 2))); const shaft = mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), metal(0xcfd4da)); shaft.position.y = -3; d.add(shaft); return d; }],
        [27, 17, () => yarnTube([new THREE.Vector3(-1.5, 1, 0), new THREE.Vector3(1.5, 0, 0), new THREE.Vector3(-1.4, -1, 0), new THREE.Vector3(1.4, -2, 0), new THREE.Vector3(-1.3, -3, 0)], 0.35, wool('rib', 0xe8742a, 2), 60)],
      ];
      for (const [x, y, make] of tools) at(make(), x, y, z);
      return;
    }
    case 'cardboard': {
      at(rbox(size[0], size[1], size[2], 0.15, wool('felt', b.color ?? 0xc8a070, 1)), c.x, c.y, c.z);
      at(mesh(new THREE.BoxGeometry(size[0] + 0.05, 0.1, 1), wool('rib', 0xd8c8a0, 2), false), c.x, b.max[1] + 0.03, c.z);
      return;
    }
    case 'ladder': {
      const rail = metal(0xc0c4ca, 0.35);
      for (const z of [b.min[2] + 0.3, b.max[2] - 0.3]) at(mesh(new THREE.BoxGeometry(0.5, size[1], 0.4), rail), c.x, c.y, z);
      for (let y = 2; y < size[1]; y += 2.5) at(mesh(new THREE.CylinderGeometry(0.15, 0.15, size[2], 8).rotateX(Math.PI / 2), wool('rib', 0xe8742a, 2)), c.x, y, c.z);
      return;
    }
    case 'toolbox':
      at(rbox(size[0], size[1], size[2], 0.3, wool('garter', b.color ?? 0xd8262e, 1.2)), c.x, c.y, c.z);
      at(mesh(new THREE.TorusGeometry(1.4, 0.18, 8, 20, Math.PI), metal(0x2a2a2e)), c.x, b.max[1], c.z);
      return;
    case 'paint': {
      at(mesh(new THREE.CylinderGeometry(size[0] / 2, size[0] / 2, size[1], 20), wool('rib', b.color ?? 0x3a5da8, 1.4)), c.x, c.y, c.z);
      at(mesh(new THREE.CylinderGeometry(size[0] / 2 + 0.05, size[0] / 2 + 0.05, 0.2, 20), metal(0xbcc0c6)), c.x, b.max[1] + 0.1, c.z);
      return;
    }
    case 'mower': {
      at(rbox(size[0] * 0.7, 3, size[2], 1, wool('stocking', b.color ?? 0x3e7a34, 1)), c.x + 1, 2.5, c.z);
      for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const w = mesh(new THREE.TorusGeometry(0.9, 0.35, 8, 18), wool('garter', 0x1e1e22, 1.6));
        w.rotation.y = Math.PI / 2;
        at(w, c.x + dx * size[0] * 0.32 + 1, 1.1, c.z + dz * (size[2] / 2 + 0.2));
      }
      for (const dz of [-2.4, 2.4]) at(mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 8).rotateZ(-0.9), metal(0x2a2a2e)), b.min[0] - 2, 6, c.z + dz);
      return;
    }
  }
  at(rbox(size[0], size[1], size[2], 0.2, wool('garter', b.color ?? 0x999999, 1)), c.x, c.y, c.z);
}

export function buildWoolGarage(scene: THREE.Scene, world: World): WoolGarage {
  scene.fog = new THREE.Fog(0x2a2622, 70, 160);
  const group = new THREE.Group();
  group.name = 'wool-garage';
  for (const b of world.boxes) renderBox(group, b);

  // Ceiling with rafters, fluorescent tubes, a hanging bike and a coil of hose on the wall.
  const ceiling = mesh(new THREE.BoxGeometry(84, 1, 72), wool('felt', 0x6a625a, 0.5), false);
  ceiling.position.set(0, 40.5, 0);
  group.add(ceiling);
  for (let x = -36; x <= 36; x += 12) {
    const beam = mesh(new THREE.BoxGeometry(1.2, 2, 70), wool('rib', 0x8a6a48, 0.8));
    beam.position.set(x, 39, 0);
    group.add(beam);
  }
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2f8ff).multiplyScalar(2.2) });
  for (const [x, z] of [[-18, -8], [18, -8], [-18, 18], [18, 18]]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 12).rotateX(Math.PI / 2), tubeMat);
    tube.position.set(x, 37.5, z);
    group.add(tube);
    const hood = mesh(new THREE.BoxGeometry(2.2, 0.6, 15), metal(0xcfd4da, 0.4), false);
    hood.position.set(x, 38.1, z);
    group.add(hood);
    const l = new THREE.PointLight(0xffe2c0, 260, 70, 1.6);
    l.position.set(x, 35.5, z);
    group.add(l);
  }
  const bike = new THREE.Group();
  for (const dz of [-4, 4]) {
    const w = mesh(new THREE.TorusGeometry(3, 0.3, 8, 28), wool('garter', 0x1e1e22, 1.5));
    w.position.z = dz;
    w.rotation.y = Math.PI / 2;
    bike.add(w);
  }
  bike.add(yarnTube([new THREE.Vector3(0, 0, -4), new THREE.Vector3(0, 3, -1), new THREE.Vector3(0, 3, 2), new THREE.Vector3(0, 0, 4)], 0.3, wool('rib', 0xd8262e, 1.5), 40));
  bike.position.set(38, 30, 14);
  group.add(bike);
  const hose: THREE.Vector3[] = [];
  for (let i = 0; i < 80; i++) { const a = i * 0.5; hose.push(new THREE.Vector3(-39.2, 18 + Math.sin(a) * 3, -22 + Math.cos(a) * 3 + i * 0.02)); }
  group.add(yarnTube(hose, 0.35, wool('rib', 0x3aa04a, 2), 320));
  // An extension cord snaking across the floor.
  const cord: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) cord.push(new THREE.Vector3(-30 + i * 6, 0.25, 4 + Math.sin(i * 1.3) * 6));
  group.add(yarnTube(cord, 0.25, wool('rib', 0xffc94a, 3), 160));

  scatterMess(group, world, { count: 90, seed: 23, outdoor: false });
  // Autumn in the garage: leaf bunting over the pegboard, pumpkins on the shelves and bench.
  group.add(bunting(new THREE.Vector3(-36, 33, -33.2), new THREE.Vector3(36, 33, -33.2), { sag: 2.5, size: 1.4, seed: 81 }));
  for (const [x, y, z, rad, col] of [[34, 8, -24, 1.4, 0xd9772e], [36.5, 8, -20, 1, 0xe8b04a], [34.5, 16, -8, 1.2, 0xc8642a], [26, 9, -31.5, 1, 0xd9772e], [-34, 0, -28, 2.2, 0xd9772e], [-30.5, 0, -30, 1.4, 0xe8b04a]] as const) {
    const pk = pumpkin(rad, Math.floor(x * 5 + z), col);
    pk.position.set(x, y, z);
    group.add(pk);
  }
  scene.add(group);

  // Daylight through the door gap and the side door.
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(-30, 18, 80);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  const cam = sun.shadow.camera;
  cam.left = -60; cam.right = 60; cam.top = 50; cam.bottom = -50; cam.near = 10; cam.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x5a3a2a, 0.55));

  return {
    update(t) {
      // A tired fluorescent tube flickers now and then.
      tubeMat.color.setScalar(Math.sin(t * 37) > 0.97 ? 0.6 : 2.2);
    },
  };
}
