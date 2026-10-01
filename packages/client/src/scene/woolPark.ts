import * as THREE from 'three';
import { PALETTE, randomLook, type Box, type World } from '@stitchstrike/shared';
import { spawnFigure } from '../figures/cast.ts';
import { poseHumanoid } from '../figures/humanoid.ts';
import { lookOptions } from '../figures/looks.ts';
import type { FigureInstance } from '../figures/rig.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { AUTUMN, bunting, knitWater, leafGeometry, pomTree, pumpkin, skylineStrip } from './cozyDressing.ts';
import { bead, metal } from './materials.ts';
import { lumpy, mesh, rbox, rng, wool, yarnTube } from './woolKit.ts';

/**
 * The City Park, knitted: an autumn park of pom-pom trees and knitted paths
 * around a glossy knitted pond, a bandstand under leaf bunting, benches and
 * lamp posts, a city of knitted towers all around, amigurumi strollers on
 * the pavement and a giant knitted turkey balloon floating over it all.
 */

export interface WoolPark { sun: THREE.DirectionalLight; update(t: number, camera: THREE.Camera): void }

const POND = { x: 0, z: 8, rx: 18, rz: 9 };

function skyDome(scene: THREE.Scene): void {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(-0.55, 0.42, -0.5).normalize() } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          float h = clamp( vDir.y, 0.0, 1.0 );
          vec3 col = mix( vec3( 0.99, 0.82, 0.6 ), vec3( 0.42, 0.62, 0.88 ), pow( h, 0.55 ) );
          float s = max( dot( vDir, uSun ), 0.0 );
          col += vec3( 1.0, 0.78, 0.5 ) * ( pow( s, 300.0 ) * 5.0 + pow( s, 10.0 ) * 0.4 );
          gl_FragColor = vec4( col, 1.0 );
        }`,
    }),
  );
  dome.renderOrder = -10;
  scene.add(dome);
}

/** Flat ellipse ring (path) geometry in the XZ plane. */
function ellipseRing(rx: number, rz: number, width: number, segs = 96): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    for (const k of [0, 1]) {
      const r = k ? 1 : 0;
      pos.push(Math.cos(a) * (rx + width * r), 0, Math.sin(a) * (rz + width * r));
    }
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The parade balloon: a giant striped knitted turkey with a fanned tail. */
function turkeyBalloon(): THREE.Group {
  const g = new THREE.Group();
  const stripes = [0xb5452a, 0xd9772e, 0xe8b04a, 0x4a8a8a, 0x8a5a3a, 0xc8642a];
  const banded = (geo: THREE.BufferGeometry, axis: 'y' | 'r', step: number, offset = 0) => {
    const p = geo.attributes.position;
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const v = axis === 'y' ? p.getY(i) : Math.hypot(p.getX(i), p.getY(i));
      c.setHex(stripes[Math.abs(Math.floor(v / step + offset)) % stripes.length]);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = createWoolMaterial({ color: 0xffffff, pattern: 'rib', uvSize: [1, 1], triplanar: true, gauge: 0.25 });
    m.vertexColors = true;
    return mesh(geo, m);
  };
  const body = banded(new THREE.SphereGeometry(6, 40, 28).scale(1, 1.05, 1.1), 'y', 1.4);
  g.add(body);
  // Tail fan: striped feathers in an arc behind.
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + (i / 8) * 2.4;
    const f = banded(new THREE.SphereGeometry(3, 20, 14).scale(0.55, 1.6, 0.18), 'r', 1.1, i);
    f.position.set(Math.sin(a) * 5.5, 3 + Math.cos(a) * 5.5, 5.5);
    f.rotation.z = -a;
    g.add(f);
  }
  const headMat = wool('crochet', 0x8a9aa8, 0.8);
  const neck = mesh(new THREE.CylinderGeometry(1.6, 2.4, 5, 16), wool('rib', 0xc8645a, 0.8));
  neck.position.set(0, 6.5, -4.5);
  neck.rotation.x = -0.35;
  const head = mesh(new THREE.SphereGeometry(2.4, 24, 18), headMat);
  head.position.set(0, 9.5, -5.8);
  const beak = mesh(new THREE.ConeGeometry(0.8, 2, 12).rotateX(-Math.PI / 2), wool('felt', 0xe8b04a, 1.2));
  beak.position.set(0, 9.3, -8.4);
  const wattle = mesh(new THREE.SphereGeometry(0.9, 12, 10).scale(0.7, 1.8, 0.7), wool('crochet', 0xc8263a, 1.2));
  wattle.position.set(0.4, 8, -7.8);
  g.add(neck, head, beak, wattle);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bead());
    eye.position.set(1.1 * sx, 10.1, -7.6);
    g.add(eye);
    const wing = banded(new THREE.SphereGeometry(3, 20, 14).scale(0.4, 1, 1.4), 'y', 1.2, 2);
    wing.position.set(5.6 * sx, 0.5, 0.5);
    g.add(wing);
    const leg = mesh(new THREE.CylinderGeometry(0.45, 0.45, 4, 10), wool('rib', 0xe8742a, 1.2));
    leg.position.set(2 * sx, -7.5, 0);
    const foot = mesh(new THREE.SphereGeometry(1.2, 12, 8).scale(1, 0.35, 1.6), wool('rib', 0xe8742a, 1.2));
    foot.position.set(2 * sx, -9.6, -0.8);
    g.add(leg, foot);
  }
  return g;
}

/** A park bench: knitted wooden slats on dark iron sides. */
function bench(group: THREE.Group, b: Box): void {
  const w = b.max[0] - b.min[0], d = b.max[2] - b.min[2];
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const slat = wool('rib', 0x8a5a3a, 1.2);
  for (let k = 0; k < 3; k++) {
    const s = rbox(w, 0.25, d / 3.4, 0.08, slat);
    s.position.set(cx, b.max[1] - 0.15, b.min[2] + (k + 0.5) * (d / 3));
    group.add(s);
  }
  for (let k = 0; k < 2; k++) {
    const s = rbox(w, d / 3.4, 0.25, 0.08, slat);
    s.position.set(cx, b.max[1] + 0.8 + k * 0.9, b.max[2] - 0.1);
    group.add(s);
  }
  const iron = metal(0x2a2a30, 0.5);
  for (const x of [b.min[0] + 0.5, b.max[0] - 0.5]) {
    const side = mesh(new THREE.BoxGeometry(0.25, b.max[1] + 1.8, d), iron);
    side.position.set(x, (b.max[1] + 1.8) / 2, cz);
    group.add(side);
  }
}

export function buildWoolPark(scene: THREE.Scene, world: World, quality: 'low' | 'medium' | 'high' = 'high'): WoolPark {
  scene.fog = new THREE.Fog(0xf0d4ac, 200, 620);
  skyDome(scene);
  const group = new THREE.Group();
  group.name = 'wool-park';
  const r = rng(2024);

  // Ground: a knitted autumn lawn to the horizon, a pavement round the park.
  const lawn = mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), wool('garter', 0x7a8a3a, 0.35), false);
  lawn.position.y = -0.02;
  group.add(lawn);
  const park = mesh(new THREE.PlaneGeometry(124, 104).rotateX(-Math.PI / 2), wool('stocking', 0x86963e, 0.6), false);
  park.position.y = 0.01;
  group.add(park);
  const pavement = mesh(new THREE.PlaneGeometry(170, 150).rotateX(-Math.PI / 2), wool('garter', 0xc8bca8, 0.4), false);
  pavement.position.y = -0.01;
  group.add(pavement);
  // Patches of rust and mustard felt where the leaves have piled up.
  for (let k = 0; k < 40; k++) {
    const patch = mesh(lumpy(2 + r() * 2.5, 0.35, k, 2).scale(1, 0.02, 1), wool('garter', AUTUMN[k % AUTUMN.length], 1.4), false);
    patch.position.set((r() - 0.5) * 110, 0.03, (r() - 0.5) * 90);
    if (Math.hypot((patch.position.x - POND.x) / POND.rx, (patch.position.z - POND.z) / POND.rz) < 1.4) continue;
    group.add(patch);
  }

  // Knitted paths: a loop round the pond and straight walks to the four gates, with cable-braid edges.
  const pathMat = wool('garter', 0xefe3c8, 0.7);
  const loop = mesh(ellipseRing(POND.rx + 4, POND.rz + 4, 3.5), pathMat, false);
  loop.position.set(POND.x, 0.05, POND.z);
  group.add(loop);
  for (const [x, z, w, d] of [[0, 33, 4, 30], [0, -33, 4, 30], [-41, 8, 34, 4], [41, 8, 34, 4]] as const) {
    const walk = mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), pathMat, false);
    walk.position.set(x, 0.05, z);
    group.add(walk);
  }
  const braid = wool('rib', 0x8a5a3a, 2.2);
  for (const k of [0, 1]) {
    const rr = k ? 3.5 : 0;
    const pts = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return new THREE.Vector3(POND.x + Math.cos(a) * (POND.rx + 4 + rr), 0.2, POND.z + Math.sin(a) * (POND.rz + 4 + rr));
    });
    group.add(yarnTube(pts, 0.28, braid, 160));
  }

  // The pond: glossy knitted water, a rim of felt stones, lily pads and ducks.
  const water = knitWater(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2));
  water.scale.set(POND.rx, 1, POND.rz);
  water.position.set(POND.x, 0.08, POND.z);
  group.add(water);
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const stone = mesh(lumpy(1 + r() * 0.5, 0.5, k, 1), wool('felt', [0x9a968e, 0x8a8478, 0xa89c88][k % 3], 1.2));
    stone.scale.y = 0.5;
    stone.position.set(POND.x + Math.cos(a) * (POND.rx + 0.6), 0.35, POND.z + Math.sin(a) * (POND.rz + 0.6));
    group.add(stone);
  }
  for (let k = 0; k < 9; k++) {
    const pad = mesh(new THREE.CircleGeometry(1 + r() * 0.5, 20, 0.3, Math.PI * 1.85).rotateX(-Math.PI / 2), wool('felt', 0x6a8a3a, 2), false);
    pad.position.set(POND.x + (r() - 0.5) * 26, 0.14, POND.z + (r() - 0.5) * 12);
    pad.rotation.y = r() * 6;
    if (Math.abs(pad.position.x) < 6) continue;
    group.add(pad);
  }
  const ducks: THREE.Group[] = [];
  for (let k = 0; k < 4; k++) {
    const d = new THREE.Group();
    d.add(mesh(new THREE.SphereGeometry(0.9, 14, 10).scale(1.3, 0.8, 1), wool('crochet', k === 0 ? 0xefe3c8 : 0x8a6a4a, 2)));
    const head = mesh(new THREE.SphereGeometry(0.5, 12, 10), wool('crochet', k === 0 ? 0xefe3c8 : 0x2e6a4a, 2));
    head.position.set(0.9, 0.7, 0);
    const bill = mesh(new THREE.ConeGeometry(0.2, 0.6, 8).rotateZ(-Math.PI / 2), wool('felt', 0xe8b04a, 3));
    bill.position.set(1.45, 0.65, 0);
    d.add(head, bill);
    ducks.push(d);
    group.add(d);
  }

  const trees: THREE.Group[] = [];
  for (const b of world.boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const at = <T extends THREE.Object3D>(o: T, x = c.x, y = c.y, z = c.z): T => { o.position.set(x, y, z); group.add(o); return o; };
    switch (b.shape) {
      case 'parkWall': {
        at(rbox(size[0], size[1], size[2], 0.5, wool('garter', 0x9a8a78, 0.6)));
        at(rbox(size[0] + 0.6, 0.8, size[2] + 0.6, 0.3, wool('rib', 0x7a6a5a, 0.9)), c.x, b.max[1] + 0.2, c.z);
        break;
      }
      case 'bridgeDeck': case 'bridgeStep':
        at(rbox(size[0], size[1], size[2], 0.3, wool('rib', 0x8a5a3a, 1)));
        break;
      case 'bridgeRail': {
        at(rbox(size[0], 0.4, size[2], 0.15, wool('rib', 0xefe3c8, 1.4)), c.x, b.max[1], c.z);
        for (let z = b.min[2]; z <= b.max[2] + 0.01; z += 2) at(mesh(new THREE.CylinderGeometry(0.15, 0.15, size[1], 6), wool('rib', 0xefe3c8, 2)), c.x, c.y, z);
        break;
      }
      case 'bandstandFloor': {
        at(mesh(new THREE.CylinderGeometry(10.5, 11, size[1], 8), wool('garter', 0xefe3c8, 0.8)), c.x, c.y, c.z);
        break;
      }
      case 'bandstandStep':
        at(rbox(size[0], size[1], size[2], 0.2, wool('garter', 0xefe3c8, 0.8)));
        break;
      case 'bandstandPost':
        at(mesh(new THREE.CylinderGeometry(0.45, 0.5, size[1], 12), wool('rib', 0xefe3c8, 1.4)));
        break;
      case 'bandstandRoof': {
        const roof = at(mesh(new THREE.ConeGeometry(12.5, 5, 8), wool('garter', 0xb5452a, 0.7)), c.x, b.max[1] + 1.8, c.z);
        roof.rotation.y = Math.PI / 8;
        at(mesh(new THREE.CylinderGeometry(11.5, 11.5, 1, 8), wool('rib', 0xefe3c8, 1)), c.x, b.min[1] + 0.5, c.z);
        at(mesh(new THREE.SphereGeometry(0.8, 12, 10), metal(0xd9b24a, 0.25)), c.x, b.max[1] + 4.6, c.z);
        // Bunting all round the eaves.
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
          group.add(bunting(new THREE.Vector3(c.x + Math.cos(a0) * 11.6, b.min[1] - 0.2, c.z + Math.sin(a0) * 11.6), new THREE.Vector3(c.x + Math.cos(a1) * 11.6, b.min[1] - 0.2, c.z + Math.sin(a1) * 11.6), { sag: 0.9, size: 0.9, seed: k + 100 }));
        }
        break;
      }
      case 'hill': {
        const hill = at(mesh(lumpy(1, 0.12, Math.floor(c.x), 3), wool('felt', 0x8a9a42, 0.9)), c.x, b.min[1], c.z);
        hill.scale.set(size[0] * 0.62, size[1] * 1.15, size[2] * 0.62);
        break;
      }
      case 'parkTrunk': {
        const t = pomTree(24, Math.floor(c.x * 7 + c.z));
        t.position.set(c.x, 0, c.z);
        group.add(t);
        trees.push(t);
        break;
      }
      case 'canopy':
        break; // the pom-pom crown is the canopy
      case 'parkBench':
        bench(group, b);
        break;
      case 'lampPost': {
        at(mesh(new THREE.CylinderGeometry(0.2, 0.32, size[1], 10), metal(0x2a3a2e, 0.4)));
        const globe = at(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.8) })), c.x, b.max[1] + 0.6, c.z);
        globe.scale.y = 1.2;
        at(mesh(new THREE.ConeGeometry(1, 0.6, 12), metal(0x2a3a2e, 0.4)), c.x, b.max[1] + 1.6, c.z);
        break;
      }
      case 'hotdogCart': {
        at(rbox(size[0], size[1] - 1, size[2], 0.4, wool('stocking', 0xd8262e, 0.9)), c.x, (size[1] - 1) / 2 + 1, c.z);
        for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) at(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14).rotateX(Math.PI / 2), wool('garter', 0x2a2a30, 2)), c.x + dx * (size[0] / 2 - 1), 0.9, c.z + dz * (size[2] / 2));
        at(mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), metal(0xc9ccd2, 0.3)), c.x, b.max[1] + 3, c.z);
        const umb = at(mesh(new THREE.ConeGeometry(5, 2, 12, 1, true), wool('rib', 0xe8b04a, 1)), c.x, b.max[1] + 6, c.z);
        (umb.material as THREE.Material).side = THREE.DoubleSide;
        break;
      }
      case 'boulder': {
        const rock = at(mesh(lumpy(1, 0.3, 7, 2), wool('felt', 0x9a968e, 1)), c.x, b.min[1] + size[1] * 0.4, c.z);
        rock.scale.set(size[0] * 0.6, size[1] * 0.65, size[2] * 0.6);
        break;
      }
      default:
        break;
    }
  }

  // Gate posts with pumpkins and lanterns at each entrance.
  for (const [x, z, rot] of [[0, -50, 0], [0, 50, 0], [-60, 0, Math.PI / 2], [60, 0, Math.PI / 2]] as const) {
    for (const s of [-1, 1]) {
      const px = x + (rot ? 0 : s * 6.5), pz = z + (rot ? s * 6.5 : 0);
      const post = mesh(new THREE.BoxGeometry(2, 10, 2), wool('garter', 0x8a7a68, 0.8));
      post.position.set(px, 5, pz);
      group.add(post);
      const pk = pumpkin(1, Math.floor(px * 3 + pz), s < 0 ? 0xd9772e : 0xe8b04a);
      pk.position.set(px, 10, pz);
      group.add(pk);
    }
  }

  // Fallen leaves everywhere (instanced, one colour per batch).
  const leafGeo = leafGeometry().clone().rotateX(-Math.PI / 2);
  const leafCount = { low: 500, medium: 1100, high: 1800 }[quality];
  AUTUMN.forEach((col, k) => {
    const n = Math.floor(leafCount / AUTUMN.length);
    const inst = new THREE.InstancedMesh(leafGeo, wool('felt', col, 2.4), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let placed = 0;
    while (placed < n) {
      const x = (r() - 0.5) * 120, z = (r() - 0.5) * 100;
      if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.05) continue;
      e.set((r() - 0.5) * 0.4, r() * 6.3, (r() - 0.5) * 0.4);
      q.setFromEuler(e);
      const s = 0.6 + r() * 0.6;
      m4.compose(new THREE.Vector3(x, 0.06 + r() * 0.05, z), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(placed++, m4);
    }
    inst.receiveShadow = true;
    group.add(inst);
    void k;
  });

  // More pom-pom trees outside the walls, then the city all around.
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2 + r() * 0.1;
    const d = 76 + r() * 18;
    const t = pomTree(18 + r() * 10, 500 + k);
    t.position.set(Math.cos(a) * d * 1.05, 0, Math.sin(a) * d * 0.9);
    group.add(t);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const city = skylineStrip(170, 300 + k, { height: 95, lit: 0.4, spire: k === 2 });
    city.scale.setScalar(1.5);
    city.position.set(Math.sin(a) * 230, 0, Math.cos(a) * 200);
    city.rotation.y = a + Math.PI;
    group.add(city);
  }

  // The parade balloon, tethered to the south gate by three amigurumi handlers.
  const turkey = turkeyBalloon();
  turkey.scale.setScalar(1.35);
  turkey.position.set(0, 40, 34);
  turkey.rotation.y = Math.PI;
  group.add(turkey);
  const handlers: FigureInstance[] = [];
  const anchors = [new THREE.Vector3(-8, 0, 58), new THREE.Vector3(0, 0, 62), new THREE.Vector3(8, 0, 58)];
  anchors.forEach((p, k) => {
    const f = spawnFigure(lookOptions(randomLook(rng(k + 31)), PALETTE[(k * 3) % PALETTE.length]));
    f.root.scale.setScalar(1.6);
    f.root.position.copy(p);
    f.root.rotation.y = Math.PI;
    group.add(f.root);
    handlers.push(f);
    // Each handler holds a yarn tether up to the balloon's belly.
    turkey.updateMatrixWorld(true);
    const top = turkey.localToWorld(new THREE.Vector3((k - 1) * 3, -6, 0));
    const hand = p.clone().add(new THREE.Vector3(0, 2.2, -0.6));
    const mid = hand.clone().lerp(top, 0.5).add(new THREE.Vector3(0, -2, 0));
    group.add(yarnTube([hand, mid, top], 0.12, wool('rib', 0xefe3c8, 3), 16));
  });

  // Strollers on the pavement outside the walls.
  const strollers: { f: FigureInstance; t: number; speed: number; lane: number }[] = [];
  const strollerCount = quality === 'low' ? 3 : 7;
  for (let k = 0; k < strollerCount; k++) {
    const f = spawnFigure(lookOptions(randomLook(rng(k + 7)), PALETTE[k % PALETTE.length]));
    f.root.scale.setScalar(1.5);
    group.add(f.root);
    strollers.push({ f, t: r() * 400, speed: 2.2 + r() * 1.2, lane: k % 2 ? 66 : 69 });
  }
  /** Position along the rectangular pavement loop at distance d. */
  const along = (d: number, lane: number): [number, number, number] => {
    const W = lane, D = lane - 8;
    const per = 4 * (W + D);
    let s = ((d % per) + per) % per;
    if (s < 2 * W) return [-W + s, -D, Math.PI / 2 * -1 + Math.PI];
    s -= 2 * W; if (s < 2 * D) return [W, -D + s, 0 + Math.PI];
    s -= 2 * D; if (s < 2 * W) return [W - s, D, Math.PI / 2 + Math.PI];
    s -= 2 * W; return [-W, D - s, Math.PI + Math.PI];
  };

  scene.add(group);

  // Late-afternoon sun, low and golden, with warm fill.
  const dir = new THREE.Vector3(-0.55, 0.42, -0.5).normalize();
  const sun = new THREE.DirectionalLight(0xffcf90, 3.2);
  sun.position.copy(dir).multiplyScalar(200);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality === 'low' ? 2048 : 4096);
  const cam = sun.shadow.camera;
  cam.left = -85; cam.right = 85; cam.top = 85; cam.bottom = -85; cam.near = 40; cam.far = 420;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffe2b8, 0x6a5a2e, 0.85));

  return {
    sun,
    update(t) {
      // The balloon bobs and turns a little on its tethers.
      turkey.position.y = 40 + Math.sin(t * 0.5) * 0.5;
      turkey.rotation.z = Math.sin(t * 0.37) * 0.03;
      handlers.forEach((f, k) => poseHumanoid(f, { t: t + k, speed: 0, phase: 0, pitch: 0.9, crouch: 0.2, airborne: false, aiming: false }, 1.6));
      for (const s of strollers) {
        s.t += s.speed / 60;
        const [x, z, yaw] = along(s.t, s.lane);
        s.f.root.position.set(x, 0, z);
        s.f.root.rotation.y = yaw;
        poseHumanoid(s.f, { t, speed: 0.4, phase: s.t * 2.6, pitch: 0, crouch: 0, airborne: false, aiming: false }, 1.5);
      }
      ducks.forEach((d, k) => {
        const a = t * 0.12 * (k % 2 ? 1 : -1) + k * 1.6;
        d.position.set(POND.x + Math.cos(a) * POND.rx * 0.6, 0.35 + Math.sin(t * 2 + k) * 0.05, POND.z + Math.sin(a) * POND.rz * 0.55);
        d.rotation.y = -a + (k % 2 ? -Math.PI / 2 : Math.PI / 2);
      });
      for (const [k, tr] of trees.entries()) tr.rotation.y = Math.sin(t * 0.4 + k) * 0.004;
    },
  };
}

