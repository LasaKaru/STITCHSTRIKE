import * as THREE from 'three';
import type { Box, World } from '@stitchstrike/shared';
import { bunting, skyCard } from './cozyDressing.ts';
import { metal } from './materials.ts';
import { scatterMess } from './mess.ts';
import { lumpy, mesh, rbox, rng, wool } from './woolKit.ts';

/**
 * The Frosty Living Room, knitted: striped wallpaper, a brick fireplace with
 * a crackling felt fire and stockings on the mantel, a tiered Christmas tree
 * hung with baubles and twinkling lights under a glowing star, presents with
 * ribbons, a squashy sofa and armchair, a coffee table with a gingerbread
 * house, a toy train chuffing round the tree, and snow falling past the
 * window over a wintry knitted village.
 */

export interface WoolLivingRoom { update(t: number, camera: THREE.Camera): void }

const WINDOW = { x: -40, z0: -14, z1: 2, y0: 10, y1: 24 };
const TRAIN = { x: 25, z: -19, rx: 11, rz: 10 };
const BAUBLES = [0xd8262e, 0xe8b04a, 0x6fb4ff, 0xefe3c8, 0x8a3a8a, 0xff8a3a];

function wallpaper(group: THREE.Group, b: Box): void {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const along = size[0] > size[2];
  const len = along ? size[0] : size[2];
  // Cream and red striped knit, a green dado rail of garland, wood skirting.
  const stripes = Math.max(2, Math.round(len / 3));
  for (let k = 0; k < stripes; k++) {
    const w = len / stripes;
    const off = -len / 2 + w * (k + 0.5);
    const strip = mesh(new THREE.BoxGeometry(along ? w : size[0], size[1], along ? size[2] : w), wool(k % 2 ? 'rib' : 'stocking', k % 2 ? 0xb5452a : 0xefe3c8, 0.5), false);
    strip.position.set(c.x + (along ? off : 0), c.y, c.z + (along ? 0 : off));
    group.add(strip);
  }
  const skirt = mesh(new THREE.BoxGeometry(along ? size[0] : size[0] + 0.4, 2, along ? size[2] + 0.4 : size[2]), wool('garter', 0x6a4a2e, 0.8), false);
  skirt.position.set(c.x, 1, c.z);
  group.add(skirt);
  const rail = mesh(new THREE.BoxGeometry(along ? size[0] : size[0] + 0.6, 1.2, along ? size[2] + 0.6 : size[2]), wool('garter', 0x2f6a3a, 0.9), false);
  rail.position.set(c.x, 14, c.z);
  group.add(rail);
}

function present(group: THREE.Group, b: Box, seed: number): void {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const g = new THREE.Group();
  g.position.set((b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2);
  const box = rbox(w, h, d, 0.12, wool(seed % 2 ? 'stocking' : 'garter', b.color ?? 0xd8262e, 1.2));
  box.position.y = h / 2;
  g.add(box);
  const ribbon = wool('rib', [0xefe3c8, 0xe8b04a, 0x2f6a3a][seed % 3], 2.5);
  const r1 = mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.35), ribbon);
  r1.position.y = h / 2;
  const r2 = mesh(new THREE.BoxGeometry(0.35, h + 0.06, d + 0.06), ribbon);
  r2.position.y = h / 2;
  g.add(r1, r2);
  for (const s of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 16), ribbon);
    loop.position.set(s * 0.35, h + 0.3, 0);
    loop.rotation.set(0, Math.PI / 2, s * 0.6);
    g.add(loop);
  }
  group.add(g);
}

/** One tier of the knitted tree: a ring of drooping branches, baubles and a strand of lights. */
function treeTier(group: THREE.Group, b: Box, tier: number, lights: THREE.Mesh[], r: () => number): void {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const R = (b.max[0] - b.min[0]) / 2 + 0.6, h = b.max[1] - b.min[1];
  const cone = mesh(new THREE.ConeGeometry(R, h + 3, 14, 3), wool('garter', tier % 2 ? 0x2f6a3a : 0x3a7a42, 0.8));
  cone.position.set(cx, b.min[1] + (h + 3) / 2, cz);
  group.add(cone);
  // Lumpy branch tufts round the hem.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + tier;
    const tuft = mesh(lumpy(1 + r() * 0.4, 0.4, tier * 20 + k, 1), wool('garter', 0x2f6a3a, 1), false);
    tuft.scale.set(1.2, 0.5, 1.2);
    tuft.position.set(cx + Math.cos(a) * R * 0.92, b.min[1] + 0.4, cz + Math.sin(a) * R * 0.92);
    group.add(tuft);
  }
  for (let k = 0; k < 8 + tier * 2; k++) {
    const a = r() * Math.PI * 2, f = 0.25 + r() * 0.6;
    const y = b.min[1] + f * (h + 2);
    const rr = R * (1 - f * (h + 2) / (h + 3)) + 0.25;
    const bauble = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshPhysicalMaterial({ color: BAUBLES[(k + tier) % BAUBLES.length], roughness: 0.15, metalness: 0.3, clearcoat: 1 }));
    bauble.position.set(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
    bauble.castShadow = true;
    group.add(bauble);
  }
  // A spiral of fairy lights.
  for (let k = 0; k < 16; k++) {
    const f = k / 16;
    const a = f * Math.PI * 4 + tier;
    const y = b.min[1] + 0.6 + f * (h + 1.5);
    const rr = R * (1 - (y - b.min[1]) / (h + 3)) + 0.2;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color([0xffd36a, 0xff6a5a, 0x7ad0ff, 0x9aff7a][k % 4]).multiplyScalar(1.8) }));
    bulb.position.set(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
    group.add(bulb);
    lights.push(bulb);
  }
}

/** A knitted steam engine, its coal tender and a carriage. */
function trainCar(kind: number): THREE.Group {
  const g = new THREE.Group();
  const color = [0xd8262e, 0x2f5a8a, 0x2f6a3a][kind];
  const body = rbox(1.6, 1.1, 2.6, 0.2, wool('stocking', color, 1.6));
  body.position.y = 0.9;
  g.add(body);
  if (kind === 0) {
    const boiler = mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 16).rotateX(Math.PI / 2), wool('rib', 0x2a2a30, 1.6));
    boiler.position.set(0, 1.5, -0.4);
    const stack = mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 12), metal(0x2a2a30, 0.4));
    stack.position.set(0, 2.3, -1.0);
    stack.name = 'stack';
    const cab = rbox(1.5, 1.2, 0.9, 0.15, wool('garter', color, 1.6));
    cab.position.set(0, 2.0, 0.8);
    g.add(boiler, stack, cab);
  }
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
    const wheel = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 14).rotateZ(Math.PI / 2), wool('felt', 0xe8b04a, 2));
    wheel.position.set(x, 0.35, z);
    g.add(wheel);
  }
  return g;
}

export function buildWoolLivingRoom(scene: THREE.Scene, world: World): WoolLivingRoom {
  scene.fog = new THREE.Fog(0x2a2440, 140, 260);
  scene.background = new THREE.Color(0x1e1a2e);
  const group = new THREE.Group();
  group.name = 'wool-living-room';
  const r = rng(1225);
  const lights: THREE.Mesh[] = [];
  let star: THREE.Mesh | null = null;
  let fire: THREE.Group | null = null;

  for (const b of world.boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const at = <T extends THREE.Object3D>(o: T, x = c.x, y = c.y, z = c.z): T => { o.position.set(x, y, z); group.add(o); return o; };
    switch (b.shape) {
      case 'woodFloor': {
        // Knitted floorboards and a big round rag rug.
        for (let k = 0; k < 16; k++) {
          const z = b.min[2] + (k + 0.5) * (size[2] / 16);
          at(mesh(new THREE.BoxGeometry(size[0], 1, size[2] / 16 - 0.1), wool('rib', k % 2 ? 0x9a6a44 : 0x8a5a3a, 0.5), false), c.x, -0.5, z);
        }
        for (let k = 0; k < 5; k++) {
          const ring = mesh(new THREE.TorusGeometry(4 + k * 2.2, 1.1, 6, 48).rotateX(Math.PI / 2), wool('rib', [0xd8262e, 0xefe3c8, 0x2f6a3a, 0xe8b04a, 0xd8262e][k], 1.2), false);
          ring.scale.y = 0.08;
          at(ring, -8, 0.06, 2);
        }
        break;
      }
      case 'wallpaper':
        wallpaper(group, b);
        break;
      case 'frontDoor':
        at(rbox(size[0], size[1], size[2], 0.2, wool('garter', 0x6a4a2e, 1)));
        // A wreath on the door.
        at(mesh(new THREE.TorusGeometry(2.4, 0.8, 10, 24), wool('garter', 0x2f6a3a, 1.2)), 0, 22, b.min[2] - 0.4);
        break;
      case 'brick': {
        at(rbox(size[0], size[1], size[2], 0.2, wool('garter', 0xa8584a, 0.9)));
        break;
      }
      case 'mantel': {
        at(rbox(size[0], size[1], size[2], 0.2, wool('rib', 0x7a4a2e, 1)));
        // Stockings hanging from the mantel, a garland along it, and candles.
        [0xd8262e, 0x2f6a3a, 0xefe3c8, 0x2f5a8a].forEach((col, k) => {
          const x = -9 + k * 6;
          const sock = new THREE.Group();
          const leg = rbox(1.6, 3.2, 0.8, 0.4, wool('stocking', col, 1.6));
          leg.position.y = -1.6;
          const foot = rbox(2.2, 1.2, 0.8, 0.4, wool('stocking', col, 1.6));
          foot.position.set(0.5, -3.4, 0);
          const cuff = rbox(1.9, 0.8, 1, 0.3, wool('garter', 0xefe3c8, 2));
          cuff.position.y = -0.2;
          sock.add(leg, foot, cuff);
          at(sock, x, b.min[1] - 0.1, b.max[2] + 0.5);
        });
        group.add(bunting(new THREE.Vector3(-13, b.max[1] + 0.2, b.max[2] + 0.3), new THREE.Vector3(13, b.max[1] + 0.2, b.max[2] + 0.3), { sag: 1.2, size: 1.1, seed: 12, colors: [0x2f6a3a, 0xd8262e, 0x3a7a42, 0xe8b04a] }));
        for (const x of [-11, 11]) {
          at(mesh(new THREE.CylinderGeometry(0.35, 0.35, 2, 12), wool('felt', 0xefe3c8, 2)), x, b.max[1] + 1, -27);
          at(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2) })), x, b.max[1] + 2.3, -27);
        }
        // The hearth and a felt fire in the opening.
        at(rbox(12, 0.6, 5, 0.2, wool('garter', 0x5a3a2e, 1)), 0, 0.3, -27.5);
        fire = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const log = mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 10).rotateZ(Math.PI / 2), wool('rib', 0x6a4a2e, 1.4));
          log.position.set(0, 0.9 + (k === 2 ? 0.8 : 0), -28 + (k - 1) * 0.9 * (k === 2 ? 0 : 1));
          log.rotation.y = (k - 1) * 0.3;
          fire.add(log);
        }
        for (let k = 0; k < 7; k++) {
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6 + (k % 3) * 0.2, 2.6 + (k % 2), 10), new THREE.MeshBasicMaterial({ color: new THREE.Color([0xff7a2a, 0xffb040, 0xffd36a][k % 3]).multiplyScalar(1.7), transparent: true, opacity: 0.9 }));
          flame.position.set(-2.4 + k * 0.8, 2.6, -28 + Math.sin(k) * 0.5);
          flame.name = 'flame';
          fire.add(flame);
        }
        const glow = new THREE.PointLight(0xff9a4a, 140, 45, 1.6);
        glow.position.set(0, 4, -24);
        glow.name = 'glow';
        fire.add(glow);
        group.add(fire);
        break;
      }
      case 'treeTier':
        treeTier(group, b, Math.round(b.min[1]), lights, r);
        break;
      case 'treeTop': {
        treeTier(group, b, 4, lights, r);
        star = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd36a).multiplyScalar(2.2) }));
        star.scale.set(1, 1.3, 0.4);
        at(star, c.x, b.max[1] + 4.2, c.z);
        const starLight = new THREE.PointLight(0xffd36a, 40, 30, 1.8);
        at(starLight, c.x, b.max[1] + 4, c.z);
        // The pot and trunk.
        at(mesh(new THREE.CylinderGeometry(4, 3.4, 2.4, 18), wool('garter', 0xd8262e, 1)), c.x, 1.2, c.z);
        break;
      }
      case 'present':
        present(group, b, Math.floor(c.x * 3 + c.z));
        break;
      case 'sofaSeat': {
        at(rbox(size[0], size[1], size[2], 0.9, wool('stocking', 0x2f5a8a, 0.8)));
        for (let k = 0; k < 3; k++) {
          const cushion = rbox(size[0] / 3 - 0.4, 1.4, size[2] - 1.5, 0.6, wool('garter', 0x3a6a9a, 1));
          at(cushion, b.min[0] + (k + 0.5) * (size[0] / 3), b.max[1] + 0.5, c.z - 0.6);
        }
        // Throw cushions, one with a knitted reindeer.
        for (const [x, col] of [[-27, 0xd8262e], [-13, 0xe8b04a]] as const) {
          const pillow = rbox(3, 3, 1.2, 0.6, wool('crochet', col, 1.6));
          pillow.rotation.z = x < -20 ? 0.2 : -0.2;
          at(pillow, x, b.max[1] + 2.2, b.max[2] - 1.6);
        }
        break;
      }
      case 'sofaBack': case 'sofaArm':
        at(rbox(size[0], size[1], size[2], 0.8, wool('stocking', 0x2f5a8a, 0.8)));
        break;
      case 'tableTop':
        at(rbox(size[0], size[1], size[2], 0.15, wool('rib', 0x8a5a3a, 1.2)));
        // A cocoa mug with a marshmallow.
        at(mesh(new THREE.CylinderGeometry(0.7, 0.6, 1.4, 16), wool('crochet', 0xefe3c8, 2)), -15.5, b.max[1] + 0.7, -1.5);
        at(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), wool('felt', 0x5a3a22, 2)), -15.5, b.max[1] + 1.35, -1.5);
        break;
      case 'tableLeg':
        at(mesh(new THREE.CylinderGeometry(0.35, 0.3, size[1], 10), wool('rib', 0x6a4a2e, 1.6)));
        break;
      case 'gingerbread': {
        at(rbox(size[0], size[1] * 0.6, size[2], 0.15, wool('felt', 0xc8864a, 1.4)), c.x, b.min[1] + size[1] * 0.3, c.z);
        const roof = mesh(new THREE.ConeGeometry(size[0] * 0.75, size[1] * 0.5, 4), wool('felt', 0xefe3c8, 1.6));
        roof.rotation.y = Math.PI / 4;
        at(roof, c.x, b.min[1] + size[1] * 0.85, c.z);
        for (const [dx, col] of [[-0.8, 0xd8262e], [0.8, 0x6fb4ff]] as const) {
          at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, clearcoat: 1 })), c.x + dx, b.min[1] + size[1] * 0.4, b.max[2] + 0.05);
        }
        break;
      }
      case 'armchair': case 'armchairBack':
        at(rbox(size[0], size[1], size[2], 0.8, wool('stocking', 0xb5452a, 0.9)));
        break;
      case 'footstool':
        at(rbox(size[0], size[1], size[2], 0.6, wool('crochet', 0xe8b04a, 1.4)));
        break;
      case 'snowman': {
        for (const [y, rr] of [[1.6, 1.9], [4, 1.4], [5.9, 1]] as const) at(mesh(new THREE.SphereGeometry(rr, 18, 14), wool('crochet', 0xf6f4ee, 1.6)), c.x, y, c.z);
        at(mesh(new THREE.ConeGeometry(0.2, 1, 10).rotateX(-Math.PI / 2), wool('felt', 0xff8a2a, 2)), c.x + 0.9, 5.9, c.z, ).rotation.y = Math.PI / 2;
        at(mesh(new THREE.TorusGeometry(1.15, 0.35, 8, 18).rotateX(Math.PI / 2), wool('rib', 0xd8262e, 2)), c.x, 5.05, c.z);
        at(mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 14), wool('felt', 0x2a2a30, 2)), c.x, 7.3, c.z);
        break;
      }
      case 'logBasket': {
        at(mesh(new THREE.CylinderGeometry(1.6, 1.4, 2.4, 14), wool('rib', 0xc89a58, 1.4)), c.x, 1.2, c.z);
        for (let k = 0; k < 3; k++) at(mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8).rotateZ(Math.PI / 2 - 0.2 * k), wool('rib', 0x6a4a2e, 1.6)), c.x, 2.6 + k * 0.3, c.z + (k - 1) * 0.6);
        break;
      }
      case 'rockingHorse': {
        at(rbox(size[0] * 0.75, 2.4, 1.6, 0.6, wool('stocking', 0xd8262e, 1.4)), c.x, 3.4, c.z);
        at(rbox(1.3, 2.6, 1.3, 0.4, wool('stocking', 0xd8262e, 1.4)), b.min[0] + 0.9, 5, c.z);
        at(mesh(new THREE.TorusGeometry(3.2, 0.25, 8, 24, Math.PI).rotateX(Math.PI), wool('rib', 0xe8b04a, 1.6)), c.x, 3.4, c.z - 0.8);
        at(mesh(new THREE.TorusGeometry(3.2, 0.25, 8, 24, Math.PI).rotateX(Math.PI), wool('rib', 0xe8b04a, 1.6)), c.x, 3.4, c.z + 0.8);
        break;
      }
      default:
        break;
    }
  }

  // The window over the sofa end: a snowy village under a night sky, and snow falling past.
  const view = new THREE.Group();
  view.add(skyCard(16, 14, 0x1e2a5a, 0x6a6a9a));
  for (let k = 0; k < 9; k++) {
    const house = new THREE.Group();
    const hh = 1.4 + r() * 1.4;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(1.6, hh, 0.1), new THREE.MeshBasicMaterial({ color: [0x5a3a5a, 0x3a4a6a, 0x6a4a3a][k % 3], fog: false }));
    walls.position.y = hh / 2;
    house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xf6f4ee, fog: false }));
    roof.position.y = hh + 0.4;
    roof.scale.z = 0.08;
    house.add(roof);
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd36a).multiplyScalar(1.4), fog: false }));
    lit.position.set(0, hh * 0.5, 0.06);
    house.add(lit);
    house.position.set(-7 + k * 1.75, -6, 0.05);
    view.add(house);
  }
  const snowfield = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.5), new THREE.MeshBasicMaterial({ color: 0xe8eef6, fog: false }));
  snowfield.position.set(0, -6.6, 0.08);
  view.add(snowfield);
  view.rotation.y = Math.PI / 2;
  view.position.set(WINDOW.x + 0.1, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2);
  group.add(view);
  const sash = wool('felt', 0xefe3c8, 1.4);
  const wz = (WINDOW.z0 + WINDOW.z1) / 2, wy = (WINDOW.y0 + WINDOW.y1) / 2;
  for (const [w, h, y, z] of [[17, 0.8, WINDOW.y1, wz], [17, 1.2, WINDOW.y0, wz], [0.8, 14, wy, WINDOW.z0], [0.8, 14, wy, WINDOW.z1], [0.5, 14, wy, wz], [16, 0.5, wy, wz]] as const) {
    const bar = mesh(new THREE.BoxGeometry(0.6, h, w), sash);
    bar.position.set(WINDOW.x + 0.5, y, z);
    group.add(bar);
  }
  // Snow on the sill, and flakes drifting down outside the glass.
  const sill = mesh(lumpy(1, 0.3, 9, 2), wool('crochet', 0xf6f4ee, 1.2), false);
  sill.scale.set(0.8, 0.5, 8);
  sill.position.set(WINDOW.x + 0.7, WINDOW.y0 + 0.7, wz);
  group.add(sill);
  const flakeCount = 260;
  const flakePos = new Float32Array(flakeCount * 3);
  for (let i = 0; i < flakeCount; i++) {
    flakePos[i * 3] = WINDOW.x - 0.3 - r() * 0.2;
    flakePos[i * 3 + 1] = WINDOW.y0 + r() * (WINDOW.y1 - WINDOW.y0);
    flakePos[i * 3 + 2] = WINDOW.z0 + r() * (WINDOW.z1 - WINDOW.z0);
  }
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const flakes = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, fog: false }));
  group.add(flakes);
  // Curtains either side, tied back with ribbon.
  for (const s of [-1, 1]) {
    const curtain = rbox(1, 20, 4, 0.5, wool('rib', 0x2f6a3a, 1.2));
    curtain.position.set(WINDOW.x + 1, wy + 2, s < 0 ? WINDOW.z0 - 2.4 : WINDOW.z1 + 2.4);
    group.add(curtain);
  }

  // The toy train: an oval of knitted track round the tree, an engine and two cars.
  const track = mesh(new THREE.TorusGeometry(1, 0.035, 4, 64).rotateX(Math.PI / 2), wool('rib', 0x6a6a74, 2), false);
  track.scale.set(TRAIN.rx, 1, TRAIN.rz);
  track.position.set(TRAIN.x, 0.08, TRAIN.z);
  group.add(track);
  const outer = track.clone();
  outer.scale.set(TRAIN.rx + 1.2, 1, TRAIN.rz + 1.2);
  group.add(outer);
  const cars = [trainCar(0), trainCar(1), trainCar(2)];
  for (const car of cars) group.add(car);
  const puffs: THREE.Mesh[] = [];
  for (let k = 0; k < 5; k++) {
    const puff = mesh(lumpy(0.4, 0.3, 70 + k, 1), wool('felt', 0xefe3c8, 2), false);
    group.add(puff);
    puffs.push(puff);
  }

  // The ceiling: cream knit with wooden beams, and a sprig of mistletoe.
  const ceiling = mesh(new THREE.BoxGeometry(84, 1, 64), wool('garter', 0xefe3c8, 0.5), false);
  ceiling.position.set(0, 45.5, 0);
  group.add(ceiling);
  for (let k = -3; k <= 3; k++) {
    const beam = mesh(new THREE.BoxGeometry(2, 1.6, 62), wool('rib', 0x7a4a2e, 0.8), false);
    beam.position.set(k * 11, 44.4, 0);
    group.add(beam);
  }
  const sprig = new THREE.Group();
  sprig.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), wool('rib', 0xd8262e, 3), false));
  for (let k = 0; k < 6; k++) {
    const leaf = mesh(new THREE.SphereGeometry(0.6, 10, 6).scale(1, 0.2, 0.45), wool('felt', 0x3a7a42, 2), false);
    leaf.position.set(Math.cos(k) * 0.5, -3.2 - (k % 2) * 0.3, Math.sin(k) * 0.5);
    leaf.rotation.y = k;
    sprig.add(leaf);
  }
  for (let k = 0; k < 3; k++) sprig.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), wool('felt', 0xf6f4ee, 2)), {}).translateY(-3.6).translateX((k - 1) * 0.3));
  sprig.position.set(-6, 44, 4);
  group.add(sprig);

  // A big knitted garland swagged along the back wall.
  group.add(bunting(new THREE.Vector3(-38, 38, -29.3), new THREE.Vector3(38, 38, -29.3), { sag: 4, size: 1.6, seed: 31, colors: [0x2f6a3a, 0xd8262e, 0xe8b04a, 0x3a7a42] }));
  scatterMess(group, world, { count: 50, seed: 77, outdoor: false });
  scene.add(group);

  // Moonlight through the window, the firelight and the tree do the rest.
  const moon = new THREE.DirectionalLight(0xa8b8ff, 1.0);
  moon.position.set(-90, 55, -6);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.setScalar(2048);
  Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 220 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.05;
  const lamp = new THREE.PointLight(0xffc890, 160, 110, 1.6);
  lamp.position.set(0, 40, 6);
  scene.add(moon, moon.target, lamp, new THREE.HemisphereLight(0xffd8b0, 0x4a3040, 0.55));

  const tmp = new THREE.Vector3();
  return {
    update(t) {
      // Firelight flickers; flames dance.
      if (fire) {
        fire.traverse((o) => {
          if (o.name === 'flame') { o.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + o.position.x * 3)) * 0.5; o.scale.x = 0.9 + Math.sin(t * 7 + o.position.x) * 0.1; }
          if (o.name === 'glow') (o as THREE.PointLight).intensity = 120 + Math.sin(t * 11) * 20 + Math.sin(t * 17) * 15;
        });
      }
      // Fairy lights twinkle in turns; the star pulses.
      lights.forEach((l, k) => { l.visible = Math.sin(t * 2.2 + k * 1.7) > -0.4; });
      if (star) { star.rotation.y = t * 0.8; star.scale.setScalar(1 + Math.sin(t * 3) * 0.06); star.scale.y *= 1.3; star.scale.z = 0.4; }
      // Snow drifts down and round again.
      const pos = flakeGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < flakeCount; i++) {
        let y = pos.getY(i) - (0.6 + (i % 5) * 0.15) * 0.016;
        if (y < WINDOW.y0) y = WINDOW.y1;
        pos.setY(i, y);
        pos.setZ(i, pos.getZ(i) + Math.sin(t + i) * 0.004);
      }
      pos.needsUpdate = true;
      // The train chuffs round the tree, the cars following the engine.
      cars.forEach((car, k) => {
        const a = t * 0.35 - k * 0.32;
        const x = TRAIN.x + Math.cos(a) * (TRAIN.rx + 0.6), z = TRAIN.z + Math.sin(a) * (TRAIN.rz + 0.6);
        car.position.set(x, 0.1, z);
        // Face along the track (tangent).
        car.rotation.y = Math.atan2(Math.sin(a) * (TRAIN.rx + 0.6), -Math.cos(a) * (TRAIN.rz + 0.6));
      });
      const engine = cars[0].getObjectByName('stack');
      if (engine) {
        engine.getWorldPosition(tmp);
        puffs.forEach((p, k) => {
          const ph = (t * 0.9 + k / 5) % 1;
          p.position.set(tmp.x, tmp.y + 0.6 + ph * 3, tmp.z);
          p.scale.setScalar(0.6 + ph * 1.8);
          p.visible = ph < 0.92;
        });
      }
    },
  };
}
