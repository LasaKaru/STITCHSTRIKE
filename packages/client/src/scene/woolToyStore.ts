import * as THREE from 'three';
import type { World } from '@stitchstrike/shared';
import { metal } from './materials.ts';
import { mesh, rbox, rng, wool } from './woolKit.ts';

/**
 * The Toy Store Aisle: steel shelving packed with boxed toys in loud 90s
 * packaging (box art drawn on canvases: starbursts, "NEW!", window boxes),
 * knitted SALE banners, hanging aisle signs, a pyramid display, a ball pit,
 * a shopping trolley and the checkout, under bright store lights.
 */

export interface WoolToyStore { update(t: number, camera: THREE.Camera): void }

const BRANDS = ['YARN FORCE', 'MEGA POPPER', 'STITCH RANGERS', 'PURL PATROL', 'KNIT KNIGHTS', 'BOBBIN BLASTERS', 'CROCHET CREW', 'FELT FIGHTERS'];
const PALETTES: [string, string][] = [['#d8262e', '#ffc94a'], ['#2f5a9a', '#6fd6ff'], ['#2e6a3a', '#8bcb3a'], ['#6a2a8a', '#ff7ab8'], ['#e8742a', '#fff2b0'], ['#20242e', '#ffc94a']];

/** 90s toy packaging: a gradient card, a starburst, a big title and a clear window. */
function boxArt(i: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d')!;
  const [a, b] = PALETTES[i % PALETTES.length];
  const grad = g.createLinearGradient(0, 0, 128, 160);
  grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(64, 80); g.arc(64, 80, 140, k * 0.8, k * 0.8 + 0.3); g.fill(); }
  g.fillStyle = 'rgba(210,235,245,.75)'; g.strokeStyle = '#fff'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(22, 44, 84, 88, 14); g.fill(); g.stroke();
  // The figure inside the blister.
  g.fillStyle = b; g.beginPath(); g.arc(64, 70, 10, 0, Math.PI * 2); g.fill();
  g.fillRect(52, 80, 24, 34); g.fillStyle = a; g.fillRect(52, 112, 10, 16); g.fillRect(66, 112, 10, 16);
  g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
  g.strokeStyle = '#20242e'; g.lineWidth = 4;
  const title = BRANDS[i % BRANDS.length];
  g.strokeText(title, 64, 26); g.fillText(title, 64, 26);
  g.fillStyle = '#d8262e'; g.beginPath();
  for (let k = 0; k < 16; k++) { const r = k % 2 ? 11 : 17; const t = (k / 16) * Math.PI * 2; g.lineTo(106 + Math.cos(t) * r, 140 + Math.sin(t) * r); }
  g.fill(); g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.fillText('NEW!', 106, 144);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textPanel(text: string, bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.setLineDash([18, 12]); g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWoolToyStore(scene: THREE.Scene, world: World): WoolToyStore {
  scene.fog = new THREE.Fog(0xd0c8b8, 150, 280);
  const group = new THREE.Group();
  group.name = 'wool-toystore';
  const arts = Array.from({ length: 8 }, (_, i) => new THREE.MeshStandardMaterial({ map: boxArt(i), roughness: 0.55 }));
  const sideMats = PALETTES.map(([a]) => new THREE.MeshStandardMaterial({ color: a, roughness: 0.6 }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  // Instanced toy boxes, one InstancedMesh per box-art design.
  const perArt: THREE.Matrix4[][] = arts.map(() => []);
  const r = rng(7);
  const m4 = new THREE.Matrix4();
  const place = (x: number, y: number, z: number, w: number, h: number, d: number, faceX: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceX > 0 ? Math.PI / 2 : -Math.PI / 2);
    m4.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(d, h, w));
    perArt[Math.floor(r() * arts.length)].push(m4.clone());
  };

  const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); group.add(o); return o; };
  for (const b of world.boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    switch (b.shape) {
      case 'storeFloor': {
        at(mesh(new THREE.BoxGeometry(size[0], 1, size[2]), wool('garter', 0xd8d4c8, 0.4), false), c.x, -0.5, c.z);
        // A blue-and-white knitted walkway down the aisle.
        at(mesh(new THREE.PlaneGeometry(10, 100).rotateX(-Math.PI / 2), wool('rib', 0x3a5da8, 0.7), false), 0, 0.02, 0);
        break;
      }
      case 'storeWall':
        at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('stocking', 0xe8e0d0, 0.45)), c.x, c.y, c.z);
        break;
      case 'slidingDoor': {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], 0.3), new THREE.MeshPhysicalMaterial({ color: 0xcfe8f0, roughness: 0.05, transparent: true, opacity: 0.35 }));
        at(glass, c.x, c.y, c.z);
        const day = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1] + 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.9) }));
        day.rotation.y = Math.PI;
        at(day, c.x, (size[1] + 3) / 2, b.max[2] + 1);
        break;
      }
      case 'storeShelf': {
        at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), metal(0x9aa0aa, 0.45)), c.x, c.y, c.z);
        // Price-tag strip along the front edge.
        const front = b.min[0] < 0 ? b.max[0] + 0.05 : b.min[0] - 0.05;
        const strip = mesh(new THREE.PlaneGeometry(size[2], 0.9), wool('felt', 0xffd24a, 2), false);
        strip.rotation.y = b.min[0] < 0 ? Math.PI / 2 : -Math.PI / 2;
        at(strip, front, b.max[1] - 0.5, c.z);
        // Stock the shelf above this board (the top board stays clear to stand on).
        if (b.max[1] < 40) {
          const faceX = b.min[0] < 0 ? 1 : -1;
          for (let z = b.min[2] + 1.6; z < b.max[2] - 1.6; z += 3.2 + r() * 0.4) {
            if (r() < 0.08) continue; // a gap here and there where toys escaped
            const h = 5 + r() * 3.5;
            const w = 2.6 + r() * 0.5;
            const d = 2 + r() * 2;
            place(front - faceX * (d / 2 + 0.4), b.max[1], z, w, h, d, faceX);
          }
        }
        break;
      }
      case 'shelfBase':
        at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), metal(0x6a707a, 0.5)), c.x, c.y, c.z);
        break;
      case 'shelfBack':
        at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('rib', 0x6a707a, 0.8)), c.x, c.y, c.z);
        break;
      case 'saleBanner': {
        const tex = textPanel('SALE!', '#d8262e', '#fff', 256, 512);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
        banner.castShadow = true;
        at(banner, c.x, c.y, c.z);
        break;
      }
      case 'boxPile': {
        const faces = [sideMats[Math.floor(r() * sideMats.length)], sideMats[0], sideMats[1], sideMats[2], arts[Math.floor(r() * arts.length)], arts[Math.floor(r() * arts.length)]];
        const pile = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), faces);
        pile.castShadow = pile.receiveShadow = true;
        at(pile, c.x, c.y, c.z);
        break;
      }
      case 'binWall':
        at(rbox(size[0], size[1], size[2], 0.3, wool('garter', b.color ?? 0x2f7fe0, 1.2)), c.x, c.y, c.z);
        break;
      case 'trolley': {
        const wire = metal(0xc0c4ca, 0.3);
        const bars: THREE.BufferGeometry[] = [];
        for (let x = b.min[0]; x <= b.max[0] + 0.01; x += size[0] / 6) bars.push(new THREE.BoxGeometry(0.15, size[1], 0.15).translate(x, c.y, b.min[2]), new THREE.BoxGeometry(0.15, size[1], 0.15).translate(x, c.y, b.max[2]));
        for (let z = b.min[2]; z <= b.max[2] + 0.01; z += size[2] / 7) bars.push(new THREE.BoxGeometry(0.15, size[1], 0.15).translate(b.min[0], c.y, z), new THREE.BoxGeometry(0.15, size[1], 0.15).translate(b.max[0], c.y, z));
        for (const g of bars) group.add(mesh(g, wire));
        at(mesh(new THREE.BoxGeometry(size[0], 0.3, size[2]), wire), c.x, b.min[1], c.z);
        at(mesh(new THREE.CylinderGeometry(0.3, 0.3, size[0] + 2, 10).rotateZ(Math.PI / 2), wool('rib', 0xd8262e, 2)), c.x, b.max[1] + 1, b.max[2] + 1.5);
        for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) at(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14).rotateZ(Math.PI / 2), wool('garter', 0x20242e, 2)), c.x + dx * (size[0] / 2 - 0.6), 0.9, c.z + dz * (size[2] / 2 - 0.6));
        // A few toys already in the basket.
        at(new THREE.Mesh(boxGeo, arts[2]), c.x - 1, b.min[1] + 2, c.z).scale.set(2.5, 4, 2);
        break;
      }
      case 'checkout': {
        at(rbox(size[0], size[1], size[2], 0.4, wool('garter', 0x3a3a40, 0.8)), c.x, c.y, c.z);
        const belt = mesh(new THREE.BoxGeometry(size[0] - 8, 0.4, 4), wool('rib', 0x20242e, 1.5));
        at(belt, c.x - 2, b.max[1] + 0.2, c.z);
        at(rbox(5, 5, 4, 0.5, wool('garter', 0xefe3c8, 1.2)), b.max[0] - 3, b.max[1] + 2.5, c.z);
        at(rbox(4, 0.4, 3, 0.1, new THREE.MeshBasicMaterial({ color: 0x6fd6ff })), b.max[0] - 3, b.max[1] + 5.2, c.z + 0.5).rotation.x = -0.5;
        break;
      }
      default:
        at(rbox(size[0], size[1], size[2], 0.2, wool('garter', b.color ?? 0x999999, 1)), c.x, c.y, c.z);
    }
  }
  perArt.forEach((list, i) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(boxGeo, [sideMats[i % sideMats.length], sideMats[i % sideMats.length], sideMats[i % sideMats.length], sideMats[i % sideMats.length], arts[i], arts[i]], list.length);
    list.forEach((mat, k) => inst.setMatrixAt(k, mat));
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  });

  // The ball pit: hundreds of knitted balls in the bin.
  const ballGeo = new THREE.SphereGeometry(0.9, 12, 8);
  const cols = [0xd8262e, 0xffc94a, 0x2f7fe0, 0x8bcb3a, 0xb46fd6, 0xe8742a];
  cols.forEach((col, k) => {
    const n = 40;
    const inst = new THREE.InstancedMesh(ballGeo, wool('crochet', col, 1.8), n);
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(-4.2 + r() * 8.4, 0.8 + r() * 3.2, 23.8 + r() * 6.4);
      inst.setMatrixAt(i, m4);
    }
    inst.castShadow = true;
    group.add(inst);
    void k;
  });

  // Hanging aisle signs and ceiling light panels.
  for (const [z, text, bg] of [[-30, 'ACTION FIGURES', '#2f5a9a'], [0, 'BUILDING BRICKS', '#d8262e'], [30, 'PLUSH & BALLS', '#2e6a3a']] as const) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(24, 5, 0.4), new THREE.MeshStandardMaterial({ map: textPanel(text, bg, '#fff'), roughness: 0.8 }));
    sign.position.set(0, 46, z);
    group.add(sign);
    for (const sx of [-10, 10]) at(mesh(new THREE.CylinderGeometry(0.1, 0.1, 12, 6), metal(0x9aa0aa)), sx, 54, z);
  }
  // Suspended ceiling tiles over the whole store.
  at(mesh(new THREE.BoxGeometry(62, 1, 112), wool('garter', 0xe6e2d8, 0.35), false), 0, 60.5, 0);
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf6fbff).multiplyScalar(1.5) });
  for (let z = -45; z <= 45; z += 15) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 4).rotateX(Math.PI / 2), panelMat);
    p.position.set(0, 59.5, z);
    group.add(p);
  }
  for (const z of [-30, 0, 30]) {
    const l = new THREE.PointLight(0xfff6ea, 260, 110, 1.6);
    l.position.set(0, 54, z);
    group.add(l);
  }
  scene.add(group);

  const key = new THREE.DirectionalLight(0xfff4e4, 1.5);
  key.position.set(20, 90, 30);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(2048);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 70, bottom: -70, near: 20, far: 220 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.05;
  scene.add(key, key.target, new THREE.HemisphereLight(0xffffff, 0x8a8270, 0.4));
  return { update() { /* shoppers not included */ } };
}
