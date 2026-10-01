import * as THREE from 'three';
import { knitWater, skylineStrip } from './cozyDressing.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { circleClear, type Box, type World } from '@stitchstrike/shared';
import { limb, meshSDF, sphere, type Prim, type V3 } from '../figures/sdf.ts';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { scatterMess } from './mess.ts';
import { lumpy, mesh, rbox, rng, wool, yarnTube } from './woolKit.ts';

/**
 * The Back Garden, knitted: sky and felt clouds, a knitted lawn with tens of
 * thousands of yarn grass blades in the wind, sculpted knitted trees with
 * felted foliage, the house with its deck, a shed, a treehouse, flower beds,
 * a pond, the neighbours' houses beyond the fence, and mess everywhere.
 */

export interface WoolGarden {
  sun: THREE.DirectionalLight;
  update(t: number, camera: THREE.Camera): void;
}

const POND = { x: -2, z: -18, r: 4.5 };
const STONES: [number, number][] = [];
for (let i = 0; i <= 10; i++) STONES.push([-18 + (22 * i) / 10, -26 + (22 * i) / 10 + Math.sin(i * 1.3) * 1.2]);

function put<T extends THREE.Object3D>(o: T, p: THREE.Vector3, r?: THREE.Euler): T {
  o.position.copy(p);
  if (r) o.rotation.copy(r);
  return o;
}

// ---------------------------------------------------------------- sky

function sky(scene: THREE.Scene): { update(t: number): void } {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.5, 0.75, 0.42).normalize() } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          float h = clamp( vDir.y, 0.0, 1.0 );
          vec3 col = mix( vec3( 0.98, 0.84, 0.64 ), vec3( 0.44, 0.62, 0.86 ), pow( h, 0.6 ) );
          float s = max( dot( vDir, uSun ), 0.0 );
          col += vec3( 1.0, 0.85, 0.6 ) * ( pow( s, 400.0 ) * 6.0 + pow( s, 12.0 ) * 0.35 );
          gl_FragColor = vec4( col, 1.0 );
        }`,
    }),
  );
  dome.renderOrder = -10;
  scene.add(dome);
  // Felted clouds.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff4e4, roughness: 1, emissive: 0xffe2c0, emissiveIntensity: 0.35, fog: false });
  const clouds = new THREE.Group();
  const r = rng(77);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const puff = new THREE.Mesh(lumpy(10 + r() * 10, 0.4, i * 10 + k, 2), cloudMat);
      puff.position.set((k - 2.5) * 12 + r() * 6, r() * 6, r() * 10);
      puff.scale.y = 0.6;
      c.add(puff);
    }
    const a = r() * Math.PI * 2;
    c.position.set(Math.cos(a) * (220 + r() * 120), 120 + r() * 60, Math.sin(a) * (220 + r() * 120));
    clouds.add(c);
  }
  scene.add(clouds);
  return { update: (t) => { clouds.rotation.y = t * 0.003; } };
}

// ---------------------------------------------------------------- grass

function grass(group: THREE.Group, world: World, N: number): { material: THREE.Material; update(t: number): void } {
  // One tapered, curved yarn blade; instances vary height, lean and colour.
  const seg = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.055 * (1 - t * 0.85);
    const bend = t * t * 0.25;
    pos.push(-w, t, bend, w, t, bend);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  blade.setIndex(idx);
  blade.computeVertexNormals();
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.88, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xf0dca0), side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          vec3 ip = vec3( instanceMatrix[ 3 ] );
          float h = position.y;
          float gust = sin( uTime * 1.3 + ip.x * 0.08 + ip.z * 0.05 );
          float w = sin( uTime * 2.1 + ip.x * 0.7 + ip.z * 0.45 ) * 0.5 + gust * 0.8;
          transformed.z += w * 0.22 * h * h;
          transformed.x += w * 0.08 * h * h;
        }`);
  };
  const r = rng(1234);
  const { min, max } = world.bounds;
  const avoid = [...world.coop.pads.map((p) => [p.pos[0], p.pos[2], 1.5]), ...world.coop.cores.map((c) => [c[0], c[2], 1.4]), ...STONES.map(([x, z]) => [x, z, 0.9]), [POND.x, POND.z, POND.r + 0.6]];
  const inRect = (x: number, z: number, x0: number, z0: number, x1: number, z1: number) => x > x0 && x < x1 && z > z0 && z < z1;
  const inst = new THREE.InstancedMesh(blade, mat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  // Late-autumn lawn: olive and moss with mustard and rust strands knitted through.
  const greens = [0x7a8a3a, 0x8a9a42, 0x6a7a34, 0x9aa04a, 0xb89a42, 0x7a8a3a];
  let n = 0;
  for (let tries = 0; tries < N * 3 && n < N; tries++) {
    const x = min[0] - 1 + r() * (max[0] - min[0] + 2);
    const z = min[1] - 1 + r() * (max[1] - min[1] + 2);
    if (!circleClear(world.boxes, x, z, 0.2, 40)) continue;
    if (inRect(x, z, -25.2, 20.8, -12.8, 31.2) || inRect(x, z, 0.8, 10.8, 15.2, 23.2)) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar)) continue;
    const h = 0.35 + r() * 0.45 + (r() < 0.05 ? 0.5 : 0);
    e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, h, 1));
    inst.setMatrixAt(n, m);
    col.setHex(greens[Math.floor(r() * greens.length)]).multiplyScalar(0.8 + r() * 0.35);
    if (r() < 0.08) col.setHex(r() < 0.5 ? 0xc89a4a : 0xa85a3a); // dry straw and rust strands
    inst.setColorAt(n, col);
    n++;
  }
  inst.count = n;
  inst.receiveShadow = true;
  inst.castShadow = false;
  inst.frustumCulled = false;
  group.add(inst);
  return { material: mat, update: (t) => { uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------- trees

function tree(group: THREE.Group, b: Box, seed: number): THREE.Group {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const R = (b.max[0] - b.min[0]) / 2;
  const H = b.max[1];
  const r = rng(seed);
  const g = new THREE.Group();
  // Sculpted trunk: root flares, a gently leaning trunk and a few thick branches.
  const P: Prim[] = [];
  const o = { bone: 't', region: 'bark' };
  P.push(limb([cx, 0, cz], [cx + 0.4, H * 0.62, cz - 0.3], R * 1.05, R * 0.72, { ...o, k: 1.2 }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    P.push(limb([cx, 1.6, cz], [cx + Math.cos(a) * R * 2.1, 0.1, cz + Math.sin(a) * R * 2.1], R * 0.5, R * 0.18, { ...o, k: 1.4 }));
  }
  const ends: V3[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.8;
    const y0 = H * (0.42 + r() * 0.2);
    const len = H * (0.3 + r() * 0.15);
    const end: V3 = [cx + Math.cos(a) * len * 0.8, y0 + len * 0.65, cz + Math.sin(a) * len * 0.8];
    P.push(limb([cx, y0, cz], end, R * 0.42, R * 0.16, { ...o, k: 0.8 }));
    ends.push(end);
  }
  ends.push([cx + 0.4, H * 0.8, cz - 0.3]);
  P.push(sphere([cx + 0.4, H * 0.62, cz - 0.3], R * 0.75, { ...o, k: 1 }));
  const sdf = meshSDF(P, 0.22);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sdf.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(sdf.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((sdf.positions.length / 3) * 2), 2));
  geo.setIndex(new THREE.BufferAttribute(sdf.indices, 1));
  g.add(mesh(geo, wool('rib', 0x6a4a2e, 0.9)));
  // Felted foliage: dozens of fuzzy clumps around each branch end and the
  // crown, merged per shade so a whole canopy is a few draws.
  // Autumn pom-poms: rust, orange, mustard and burgundy, like a knitted park in October.
  const greens = [0xb5452a, 0xd9772e, 0xe8b04a, 0x8a2a3a, 0xc8642a];
  const byShade: THREE.BufferGeometry[][] = greens.map(() => []);
  for (const [i, end] of ends.entries()) {
    const clumps = 11 + Math.floor(r() * 5);
    for (let k = 0; k < clumps; k++) {
      const rad = 2.0 + r() * 1.8;
      const a = r() * Math.PI * 2, d = r() * 6;
      const geo = lumpy(rad, 0.12, seed * 100 + i * 20 + k, 3);
      geo.scale(1, 0.72 + r() * 0.2, 1).rotateY(r() * 6);
      geo.translate(end[0] + Math.cos(a) * d, end[1] + 1.5 + (r() - 0.3) * 4.5, end[2] + Math.sin(a) * d);
      byShade[(i + k) % greens.length].push(geo);
    }
  }
  byShade.forEach((geos, k) => {
    const merged = mergeGeometries(geos)!;
    // Centre the mesh on its canopy so the shell LOD measures the right distance.
    merged.computeBoundingSphere();
    const centre = merged.boundingSphere!.center.clone();
    merged.translate(-centre.x, -centre.y, -centre.z);
    const canopy = mesh(merged, wool('felt', greens[k], 1.4));
    canopy.position.copy(centre);
    addShellFuzz(canopy);
    g.add(canopy);
  });
  group.add(g);
  return g;
}

// ---------------------------------------------------------------- the house

function house(group: THREE.Group, b: Box): void {
  const z = b.max[2];
  const siding = wool('garter', 0xd6cbb8, 0.5);
  group.add(put(mesh(new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1], b.max[2] - b.min[2]), siding), new THREE.Vector3(0, b.max[1] / 2, (b.min[2] + b.max[2]) / 2)));
  const base = mesh(new THREE.BoxGeometry(b.max[0] - b.min[0], 2.2, 0.6), wool('felt', 0x8a8580, 0.8));
  base.position.set(0, 1.1, z + 0.2);
  group.add(base);
  // Gable roof with knitted shingles and a felt-brick chimney.
  const roofW = b.max[0] - b.min[0] + 4;
  const shape = new THREE.Shape();
  shape.moveTo(-14, 0); shape.lineTo(14, 0); shape.lineTo(0, 14); shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: roofW, bevelEnabled: false });
  roofGeo.rotateY(Math.PI / 2).translate(-roofW / 2, 0, 0);
  const roof = mesh(roofGeo, wool('garter', 0x8a3a2e, 0.7));
  roof.position.set(0, b.max[1], (b.min[2] + b.max[2]) / 2 - 2);
  group.add(roof);
  const chimney = rbox(4, 12, 4, 0.3, wool('garter', 0xa8483a, 1.2));
  chimney.position.set(20, b.max[1] + 10, (b.min[2] + b.max[2]) / 2 - 4);
  group.add(chimney);
  // Gutter and downpipe.
  const gutter = mesh(new THREE.CylinderGeometry(0.5, 0.5, roofW, 10).rotateZ(Math.PI / 2), wool('rib', 0xbab4a8, 1.5));
  gutter.position.set(0, b.max[1] + 0.2, z + 1.2);
  group.add(gutter);
  const pipe = mesh(new THREE.CylinderGeometry(0.35, 0.35, b.max[1], 10), wool('rib', 0xbab4a8, 1.5));
  pipe.position.set(-47, b.max[1] / 2, z + 0.9);
  group.add(pipe);

  const frameMat = wool('felt', 0xf6f2ea, 1.2);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223044, roughness: 0.06, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.4 });
  const window = (x: number, y: number, w: number, h: number, curtain: number) => {
    const f = rbox(w + 1.2, h + 1.2, 0.8, 0.2, frameMat);
    f.position.set(x, y, z + 0.2);
    group.add(f);
    const pane = mesh(new THREE.PlaneGeometry(w, h), glass, false);
    pane.position.set(x, y, z + 0.61);
    group.add(pane);
    for (const [mx, my, mw, mh] of [[x, y, 0.3, h], [x, y, w, 0.3]]) {
      const bar = mesh(new THREE.BoxGeometry(mw, mh, 0.3), frameMat);
      bar.position.set(mx, my, z + 0.7);
      group.add(bar);
    }
    // Knitted curtains just behind the glass, and a flower box under the sill.
    for (const s of [-1, 1]) {
      const c = mesh(new THREE.PlaneGeometry(w * 0.28, h * 0.95), wool('rib', curtain, 1.2), false);
      c.position.set(x + s * w * 0.36, y, z + 0.55);
      group.add(c);
    }
    const sill = rbox(w + 2, 0.5, 1.6, 0.15, frameMat);
    sill.position.set(x, y - h / 2 - 0.8, z + 0.8);
    group.add(sill);
    const box = rbox(w, 1.4, 1.4, 0.3, wool('stocking', 0x3e6a34, 1.3));
    box.position.set(x, y - h / 2 - 1.8, z + 1.2);
    group.add(box);
    flowerRow(group, x - w / 2 + 0.5, x + w / 2 - 0.5, y - h / 2 - 1.1, z + 1.2, 7 + x);
  };
  window(-40, 12, 8, 10, 0xd9a441);
  window(8, 12, 12, 10, 0xb46fd6);
  window(18, 12, 6, 10, 0xb46fd6);
  for (const x of [-32, -8, 14, 36]) window(x, 30, 8, 8, 0xefe3c8);
  // Back door onto the deck, with a knitted wreath and a wall lamp.
  const doorFrame = rbox(8.6, 18, 0.8, 0.2, frameMat);
  doorFrame.position.set(-18, 3 + 9, z + 0.2);
  group.add(doorFrame);
  const door = rbox(7, 16.5, 0.6, 0.15, wool('rib', 0x2f5a44, 1));
  door.position.set(-18, 3 + 8.3, z + 0.45);
  group.add(door);
  const knob = mesh(new THREE.SphereGeometry(0.4, 12, 8), wool('wound', 0xffc94a, 2));
  knob.position.set(-15.4, 11, z + 1);
  group.add(knob);
  const wreath = mesh(new THREE.TorusGeometry(1.3, 0.45, 10, 24), wool('garter', 0x3e6e2e, 2));
  wreath.position.set(-18, 16, z + 1);
  group.add(wreath);
  const lamp = mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.6, 12), wool('rib', 0x2a2a2e, 1.5));
  lamp.position.set(-12.5, 16, z + 1.2);
  group.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(2) }));
  bulb.position.set(-12.5, 15.6, z + 1.2);
  group.add(bulb);
  // Outdoor tap with the garden hose snaking across the lawn.
  const tap = mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8).rotateX(Math.PI / 2), wool('wound', 0xbab4a8, 2));
  tap.position.set(4, 4, z + 0.8);
  group.add(tap);
  const hose: THREE.Vector3[] = [new THREE.Vector3(4, 3.6, z + 1.2), new THREE.Vector3(4.5, 0.3, z + 2.5)];
  const r = rng(99);
  for (let i = 1; i <= 9; i++) hose.push(new THREE.Vector3(4 + Math.sin(i * 1.3) * 6 + i * 1.5, 0.28, z + 3 + i * 3.2 + r() * 2));
  group.add(yarnTube(hose, 0.28, wool('rib', 0x3aa04a, 3), 200));
}

function flowerRow(group: THREE.Group, x0: number, x1: number, y: number, z: number, seed: number): void {
  const r = rng(Math.floor(seed * 100));
  const colors = [0xd8262e, 0xffc94a, 0xb46fd6, 0xf2ecdc, 0xe87aa8];
  for (let x = x0; x <= x1; x += 0.7 + r() * 0.6) {
    const stem = mesh(new THREE.CylinderGeometry(0.05, 0.06, 1 + r() * 0.6, 5), wool('rib', 0x3e7a34, 4), false);
    stem.position.set(x, y + 0.5, z + (r() - 0.5) * 0.6);
    group.add(stem);
    const head = mesh(new THREE.SphereGeometry(0.28 + r() * 0.12, 10, 6), wool('crochet', colors[Math.floor(r() * colors.length)], 4), false);
    head.scale.y = 0.55;
    head.position.set(stem.position.x, y + 1.1 + r() * 0.3, stem.position.z);
    group.add(head);
  }
}

// ---------------------------------------------------------------- everything else

function renderBox(group: THREE.Group, b: Box, i: number, trees: THREE.Group[]): void {
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const at = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x, y, z); group.add(o); return o; };
  const plank = wool('rib', 0x9a7a5a, 1.1);
  switch (b.shape) {
    case 'house': house(group, b); return;
    case 'fence': {
      // Knitted pickets on two rails, posts every few metres.
      const alongX = size[0] > size[2];
      const len = alongX ? size[0] : size[2];
      const pickets: THREE.BufferGeometry[] = [];
      for (let s = 0.6; s < len; s += 1.6) {
        const g = new THREE.BoxGeometry(alongX ? 1.3 : 0.5, 9 + ((s * 7) % 1) * 0.6, alongX ? 0.5 : 1.3);
        g.translate(alongX ? b.min[0] + s : c.x, 4.6, alongX ? c.z : b.min[2] + s);
        pickets.push(g);
      }
      group.add(mesh(mergeGeometries(pickets)!, wool('rib', 0x9a7050, 0.9)));
      for (const y of [2.5, 7]) {
        const rail = mesh(new THREE.BoxGeometry(alongX ? len : 0.6, 0.6, alongX ? 0.6 : len), wool('rib', 0x7a5a40, 1));
        rail.position.set(c.x + (alongX ? 0 : (c.x < 0 ? 0.7 : -0.7)), y, c.z + (alongX ? -0.7 : 0));
        group.add(rail);
      }
      return;
    }
    case 'deck': {
      const boards: THREE.BufferGeometry[] = [];
      for (let x = b.min[0]; x < b.max[0] - 0.01; x += 1.5) boards.push(new THREE.BoxGeometry(1.44, 0.5, size[2]).translate(x + 0.75, b.max[1] - 0.25, c.z));
      group.add(mesh(mergeGeometries(boards)!, plank));
      at(rbox(size[0], size[1] - 0.5, size[2] - 0.2, 0.15, wool('rib', 0x7a5a40, 1)), c.x, (size[1] - 0.5) / 2, c.z);
      // Corner posts, a doormat, a knitted barbecue and potted plants.
      for (const x of [b.min[0] + 0.5, b.max[0] - 0.5]) at(rbox(1, 6, 1, 0.2, wool('rib', 0x7a5a40, 1)), x, b.max[1] + 3, b.max[2] - 0.5);
      at(rbox(6, 0.2, 3.5, 0.1, wool('garter', 0xc89a58, 2)), -18, b.max[1] + 0.1, b.min[2] + 2.4);
      const bbq = new THREE.Group();
      bbq.add(put(mesh(new THREE.SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), wool('garter', 0x2a2a2e, 1.5)), new THREE.Vector3(0, 5, 0)));
      const lid = mesh(new THREE.SphereGeometry(2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), wool('garter', 0x2a2a2e, 1.5));
      lid.position.y = 5.1;
      lid.rotation.x = -0.5;
      bbq.add(lid);
      for (let k = 0; k < 3; k++) {
        const leg = mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), wool('rib', 0x2a2a2e, 2));
        leg.position.set(Math.cos(k * 2.1) * 1.2, 2, Math.sin(k * 2.1) * 1.2);
        bbq.add(leg);
      }
      at(bbq, b.min[0] + 3.5, b.max[1], b.max[2] - 4);
      for (const x of [-8, -6]) {
        at(mesh(new THREE.CylinderGeometry(1.1, 0.8, 2, 16), wool('felt', 0xc8683a, 1.2)), x, b.max[1] + 1, b.min[2] + 3);
        at(mesh(lumpy(1.4, 0.6, x * 7, 2), wool('felt', 0x4e8e3a, 2)), x, b.max[1] + 3, b.min[2] + 3);
      }
      return;
    }
    case 'deckStep': {
      at(rbox(size[0], size[1], size[2], 0.12, plank), c.x, c.y, c.z);
      return;
    }
    case 'bench': {
      at(rbox(size[0], 0.8, size[2], 0.3, wool('garter', 0x3a5da8, 1.2)), c.x, b.min[1] + 1.2, c.z);
      at(rbox(size[0], 0.6, size[2], 0.1, plank), c.x, b.min[1] + 0.5, c.z);
      at(rbox(size[0], 3, 0.5, 0.2, plank), c.x, b.min[1] + 2.6, b.min[2] + 0.1);
      return;
    }
    case 'tableTop': {
      at(mesh(new THREE.CylinderGeometry(size[0] * 0.56, size[0] * 0.56, 0.6, 40), wool('rib', 0xf2ecdc, 1)), c.x, c.y, c.z);
      // Parasol with a scalloped knitted canopy.
      at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 11, 8), wool('rib', 0x3b3f4a, 2)), c.x, b.max[1] + 5.5, c.z);
      const canopy = mesh(new THREE.ConeGeometry(9.5, 3.2, 12, 1, true), wool('garter', 0x2f9a8a, 0.9));
      (canopy.material as THREE.Material).side = THREE.DoubleSide;
      at(canopy, c.x, b.max[1] + 10.5, c.z);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        at(mesh(new THREE.SphereGeometry(0.55, 8, 6), wool('felt', 0xefe3c8, 1)), c.x + Math.cos(a) * 9.4, b.max[1] + 8.8, c.z + Math.sin(a) * 9.4);
      }
      return;
    }
    case 'tablePole': {
      at(mesh(new THREE.CylinderGeometry(0.4, 1.4, size[1], 12), wool('rib', 0x3b3f4a, 2)), c.x, c.y, c.z);
      return;
    }
    case 'gardenChair': {
      at(rbox(size[0], 0.6, size[2], 0.25, wool('garter', b.color ?? 0x2f7fe0, 1.2)), c.x, b.max[1] - 0.3, c.z);
      const back = rbox(size[0], 3.5, 0.5, 0.25, wool('garter', b.color ?? 0x2f7fe0, 1.2));
      const away = c.x < 13 ? -1 : 1;
      back.position.set(c.x + away * size[0] * 0.45, b.max[1] + 1.6, c.z);
      back.rotation.y = Math.PI / 2;
      back.rotation.z = away * 0.15;
      group.add(back);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        at(mesh(new THREE.CylinderGeometry(0.12, 0.12, b.max[1] - 0.3, 6), wool('rib', 0xefe3c8, 2)), c.x + dx * size[0] * 0.4, (b.max[1] - 0.3) / 2, c.z + dz * size[2] * 0.4);
      }
      return;
    }
    case 'shedWall': {
      at(mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), wool('rib', 0x7a4a30, 0.7)), c.x, c.y, c.z);
      if (size[2] > 10 && b.min[0] > 39) {
        // Side window.
        at(rbox(0.8, 5, 6, 0.2, wool('felt', 0xf6f2ea, 1.2)), b.max[0] + 0.1, 11, -30);
        const pane = mesh(new THREE.PlaneGeometry(4.8, 4), new THREE.MeshPhysicalMaterial({ color: 0x223044, roughness: 0.06, clearcoat: 1 }), false);
        pane.rotation.y = Math.PI / 2;
        pane.position.set(b.max[0] + 0.55, 11, -30);
        group.add(pane);
      }
      return;
    }
    case 'shedRoof': {
      at(rbox(size[0] + 1, size[1] + 0.4, size[2] + 1, 0.2, wool('garter', 0x3a3a3e, 0.8)), c.x, c.y, c.z);
      // Open door leaf swung against the front wall.
      const leaf = rbox(6, 12, 0.5, 0.15, wool('rib', 0x2f5a44, 0.9));
      leaf.position.set(37.8, 6, -21.4);
      leaf.rotation.y = 0.12;
      group.add(leaf);
      return;
    }
    case 'workbench': {
      at(rbox(size[0], 0.6, size[2], 0.1, plank), c.x, b.max[1] - 0.3, c.z);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(mesh(new THREE.BoxGeometry(0.5, b.max[1], 0.5), plank), c.x + dx * (size[0] / 2 - 0.4), b.max[1] / 2, c.z + dz * (size[2] / 2 - 0.4));
      // Paint tins, a coil of rope, a felt saw and hammer.
      [0xd8262e, 0x3a5da8, 0xffc94a].forEach((col, k) => at(mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 16), wool('rib', col, 2)), b.min[0] + 1.5 + k * 2, b.max[1] + 0.8, c.z));
      at(mesh(new THREE.TorusGeometry(1, 0.35, 8, 20).rotateX(Math.PI / 2), wool('wound', 0xc8a878, 3)), b.max[0] - 2, b.max[1] + 0.35, c.z);
      const saw = mesh(new THREE.BoxGeometry(4, 1.2, 0.1), wool('felt', 0xbab4a8, 1));
      saw.position.set(c.x + 1, b.max[1] + 0.1, c.z + 0.8);
      saw.rotation.x = -Math.PI / 2;
      group.add(saw);
      return;
    }
    case 'treeTrunk': trees.push(tree(group, b, i)); return;
    case 'treehouse': {
      const boards: THREE.BufferGeometry[] = [];
      for (let x = b.min[0]; x < b.max[0] - 0.01; x += 1.5) boards.push(new THREE.BoxGeometry(1.44, 0.8, size[2]).translate(x + 0.75, c.y, c.z));
      group.add(mesh(mergeGeometries(boards)!, plank));
      const rail = wool('rib', 0x7a5a40, 1);
      for (const [x0, z0, x1, z1] of [[b.min[0], b.min[2], b.max[0], b.min[2]], [b.min[0], b.min[2], b.min[0], b.max[2]], [b.max[0], b.min[2], b.max[0], b.max[2] - 5]]) {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const r = mesh(new THREE.BoxGeometry(x0 === x1 ? 0.4 : len, 0.4, x0 === x1 ? len : 0.4), rail);
        r.position.set((x0 + x1) / 2, b.max[1] + 3.2, (z0 + z1) / 2);
        group.add(r);
        for (let k = 0; k <= Math.floor(len / 3); k++) {
          const t = k / Math.max(1, Math.floor(len / 3));
          at(mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), rail), x0 + (x1 - x0) * t, b.max[1] + 1.6, z0 + (z1 - z0) * t);
        }
      }
      // A little felt tent roof on four poles, and a pennant.
      const roof = mesh(new THREE.ConeGeometry(7, 5, 4, 1, true), wool('garter', 0xd8262e, 1));
      (roof.material as THREE.Material).side = THREE.DoubleSide;
      roof.rotation.y = Math.PI / 4;
      at(roof, b.min[0] + 7, b.max[1] + 10, b.min[2] + 6);
      for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) at(mesh(new THREE.CylinderGeometry(0.2, 0.2, 7.5, 6), rail), b.min[0] + 7 + dx, b.max[1] + 3.75, b.min[2] + 6 + dz);
      const flag = mesh(new THREE.PlaneGeometry(2.4, 1.4), wool('garter', 0xffc94a, 2));
      (flag.material as THREE.Material).side = THREE.DoubleSide;
      at(flag, b.min[0] + 8.2, b.max[1] + 13.6, b.min[2] + 6);
      at(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), rail), b.min[0] + 7, b.max[1] + 13, b.min[2] + 6);
      return;
    }
    case 'crate': {
      at(rbox(size[0], size[1], size[2], 0.15, wool('rib', 0xb88a58, 1.1)), c.x, c.y, c.z);
      for (const y of [b.max[1] - 0.3, b.min[1] + 0.3]) at(mesh(new THREE.BoxGeometry(size[0] + 0.1, 0.35, size[2] + 0.1), wool('felt', 0x8a5a3a, 1)), c.x, y, c.z);
      return;
    }
    case 'sandbox': {
      at(rbox(size[0], size[1], size[2], 0.2, wool('rib', 0xc89a58, 1.1)), c.x, c.y, c.z);
      if (b.min[0] === 0 && size[0] > 10) {
        // Sand, a crocheted sandcastle, bucket and spade (added once, with the first wall).
        const sand = mesh(lumpy(1, 0.05, 5, 4).scale(7.2, 0.3, 6.2), wool('felt', 0xe8d4a0, 1.5));
        sand.position.set(8, 0.15, 17);
        group.add(sand);
        const castle = new THREE.Group();
        castle.add(mesh(new THREE.CylinderGeometry(1.8, 2, 2, 16), wool('crochet', 0xe0c890, 1.6)));
        for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
          const tower = mesh(new THREE.CylinderGeometry(0.7, 0.8, 3, 12), wool('crochet', 0xe0c890, 1.6));
          tower.position.set(dx, 0.5, dz);
          const cone = mesh(new THREE.ConeGeometry(0.9, 1.4, 12), wool('crochet', 0xd8262e, 2));
          cone.position.set(dx, 2.6, dz);
          castle.add(tower, cone);
        }
        castle.position.set(5, 1.2, 15);
        group.add(castle);
        const bucket = mesh(new THREE.CylinderGeometry(1, 0.8, 1.8, 16, 1, true), wool('rib', 0xffc94a, 2));
        (bucket.material as THREE.Material).side = THREE.DoubleSide;
        bucket.position.set(11, 0.8, 20);
        bucket.rotation.z = 1.2;
        group.add(bucket);
      }
      return;
    }
    case 'pool': {
      at(rbox(size[0], size[1], size[2], Math.min(size[0], size[2]) / 2 - 0.01, wool('garter', b.color ?? 0x2f7fe0, 1.4)), c.x, c.y, c.z);
      if (b.min[0] === -26 && size[0] > 10) {
        const water = mesh(new THREE.PlaneGeometry(12.4, 10.4).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x5ab8e8, roughness: 0.05, transparent: true, opacity: 0.75, clearcoat: 1 }), false);
        water.position.set(-19, 1.4, 26);
        group.add(water);
        const duck = new THREE.Group();
        duck.add(mesh(new THREE.SphereGeometry(0.9, 16, 12).scale(1.3, 0.8, 1), wool('crochet', 0xffc94a, 2)));
        const head = mesh(new THREE.SphereGeometry(0.55, 14, 10), wool('crochet', 0xffc94a, 2));
        head.position.set(0.7, 0.9, 0);
        const beak = mesh(new THREE.ConeGeometry(0.25, 0.6, 8).rotateZ(-Math.PI / 2), wool('felt', 0xe8742a, 2));
        beak.position.set(1.35, 0.85, 0);
        duck.add(head, beak);
        duck.position.set(-17, 1.8, 24);
        group.add(duck);
      }
      return;
    }
    case 'hedge': {
      const r = rng(i * 31);
      for (let x = b.min[0] + 2; x < b.max[0] - 1; x += 3.2) {
        const blob = mesh(lumpy(3.2, 0.5, i * 100 + Math.floor(x), 2), wool('felt', [0x5a6a2e, 0x6a7a34, 0x8a7a34, 0xa8582e][Math.floor(r() * 4)], 1.4));
        blob.position.set(x, 3.4 + r() * 0.6, c.z + (r() - 0.5));
        blob.scale.set(1, 1.1, 0.95);
        group.add(blob);
      }
      return;
    }
    case 'wheelbarrow': {
      const tray = rbox(size[0] * 0.8, 2.2, size[2], 0.6, wool('stocking', 0xd8262e, 1.2));
      at(tray, c.x, 2.6, c.z);
      at(mesh(lumpy(1, 0.2, 3, 2).scale(3, 0.8, 1.8), wool('felt', 0x5a3a26, 1.2)), c.x, 3.6, c.z);
      at(mesh(new THREE.TorusGeometry(1.1, 0.4, 10, 20), wool('garter', 0x1e1e22, 2)), b.max[0] - 0.3, 1.4, c.z);
      for (const dz of [-1.4, 1.4]) at(mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 6).rotateZ(Math.PI / 2 - 0.25), wool('rib', 0x3b3f4a, 2)), c.x - 2, 2.4, c.z + dz);
      return;
    }
    case 'pots': {
      const r = rng(i);
      for (let k = 0; k < 4; k++) {
        const pot = mesh(new THREE.CylinderGeometry(1.1, 0.8, 1.8, 16), wool('felt', 0xc8683a, 1.2));
        const x = b.min[0] + 1 + (k % 2) * 2, z = b.min[2] + 1.5 + Math.floor(k / 2) * 3;
        at(pot, x, 0.9 + (k === 3 ? 1.8 : 0), z);
        if (k % 2 === 0) at(mesh(lumpy(1.2, 0.6, k + i, 2), wool('felt', 0x5e9444, 2)), x, 2.6, z);
        else if (r() < 0.8) flowerRow(group, x - 0.4, x + 0.4, 1.8, z, k + i);
      }
      return;
    }
    case 'rock': {
      const rock = mesh(lumpy(1, 0.8, i * 13, 2), wool('felt', b.color ?? 0x7a7a74, 1));
      rock.scale.set(size[0] * 0.6, size[1] * 0.75, size[2] * 0.6);
      at(rock, c.x, size[1] * 0.45, c.z);
      return;
    }
    case 'log': {
      const logM = mesh(new THREE.CylinderGeometry(size[1] / 2, size[1] / 2, size[0], 20).rotateZ(Math.PI / 2), wool('rib', 0x6a4a2a, 1.2));
      at(logM, c.x, size[1] / 2, c.z);
      for (const s of [-1, 1]) {
        const end = mesh(new THREE.CircleGeometry(size[1] / 2, 20), wool('wound', 0xc8a878, 3));
        end.rotation.y = s * Math.PI / 2;
        at(end, c.x + s * (size[0] / 2 + 0.01), size[1] / 2, c.z);
      }
      return;
    }
    case 'gnome': {
      const g = new THREE.Group();
      g.add(put(mesh(new THREE.ConeGeometry(0.8, 1.8, 14), wool('stocking', 0x3a5da8, 3)), new THREE.Vector3(0, 0.9, 0)));
      g.add(put(mesh(new THREE.SphereGeometry(0.45, 14, 10), wool('crochet', 0xe8c8a8, 3)), new THREE.Vector3(0, 2, 0)));
      g.add(put(mesh(new THREE.ConeGeometry(0.4, 1, 12), wool('felt', 0xf2f2f2, 2)), new THREE.Vector3(0, 1.55, -0.3), new THREE.Euler(Math.PI - 0.3, 0, 0)));
      g.add(put(mesh(new THREE.ConeGeometry(0.5, 1.5, 14), wool('rib', 0xd8262e, 3)), new THREE.Vector3(0, 2.9, 0.05), new THREE.Euler(0.2, 0, 0)));
      at(g, c.x, 0, c.z);
      return;
    }
    case 'birdbath': {
      at(mesh(new THREE.CylinderGeometry(0.5, 0.9, size[1], 12), wool('felt', 0xbab4a8, 1.2)), c.x, size[1] / 2, c.z);
      at(mesh(new THREE.CylinderGeometry(2.2, 1, 0.8, 20), wool('felt', 0xbab4a8, 1.2)), c.x, size[1] + 0.3, c.z);
      const water = mesh(new THREE.CircleGeometry(1.9, 20).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x6ab8e0, roughness: 0.05, clearcoat: 1 }), false);
      at(water, c.x, size[1] + 0.72, c.z);
      return;
    }
    case 'bucket': {
      const bucket = mesh(new THREE.CylinderGeometry(size[0] / 2, size[0] / 2.6, size[1], 16, 1, true), wool('rib', b.color ?? 0x2f7fe0, 2));
      (bucket.material as THREE.Material).side = THREE.DoubleSide;
      at(bucket, c.x, size[1] / 2, c.z);
      at(mesh(new THREE.TorusGeometry(size[0] / 2, 0.08, 6, 20, Math.PI), wool('rib', 0x3b3f4a, 3)), c.x, size[1], c.z);
      return;
    }
    case 'clothesPost': {
      at(mesh(new THREE.CylinderGeometry(0.35, 0.4, size[1], 8), wool('felt', 0xefe3c8, 1.2)), c.x, size[1] / 2, c.z);
      if (b.min[0] < -30) {
        // The line with knitted washing drying on it.
        const pts = [new THREE.Vector3(-40.7, 13.5, 36.3), new THREE.Vector3(-27.7, 12.4, 36.3), new THREE.Vector3(-14.7, 13.5, 36.3)];
        group.add(yarnTube(pts, 0.06, wool('rib', 0xefe3c8, 4), 40));
        const r = rng(8);
        const items: [number, number, number][] = [[-37, 0xd8262e, 0], [-34, 0x3a5da8, 1], [-30, 0xffc94a, 0], [-26, 0x8bcb3a, 2], [-22, 0xb46fd6, 1], [-18.5, 0xe8742a, 0]];
        for (const [x, col, kind] of items) {
          const sag = 12.4 + Math.abs(x + 27.7) * 0.085;
          const g = kind === 2
            ? new THREE.PlaneGeometry(3, 3.4)
            : new THREE.PlaneGeometry(1.2, kind === 1 ? 2.6 : 3.2);
          const cloth = mesh(g, wool(kind === 0 ? 'rib' : 'stocking', col, 2));
          (cloth.material as THREE.Material).side = THREE.DoubleSide;
          cloth.position.set(x, sag - (kind === 2 ? 1.7 : 1.4), 36.3);
          cloth.rotation.z = (r() - 0.5) * 0.15;
          group.add(cloth);
          at(mesh(new THREE.BoxGeometry(0.2, 0.6, 0.3), wool('felt', 0xbab4a8, 1)), x, sag + 0.1, 36.3);
        }
      }
      return;
    }
  }
  // Fallback for anything unshaped: a plump knitted block.
  at(rbox(size[0], size[1], size[2], 0.2, wool('garter', b.color ?? 0x999999, 1)), c.x, c.y, c.z);
}

function pondAndFlamingos(group: THREE.Group): void {
  const water = knitWater(new THREE.CircleGeometry(POND.r, 40).rotateX(-Math.PI / 2));
  water.position.set(POND.x, 0.06, POND.z);
  group.add(water);
  const r = rng(55);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const stone = mesh(lumpy(0.8 + r() * 0.4, 0.6, k, 1), wool('felt', [0x8a8a84, 0x7a7a74, 0x9a968e][k % 3], 1.2));
    stone.scale.y = 0.55;
    stone.position.set(POND.x + Math.cos(a) * (POND.r + 0.4), 0.3, POND.z + Math.sin(a) * (POND.r + 0.4));
    group.add(stone);
  }
  for (let k = 0; k < 6; k++) {
    const pad = mesh(new THREE.CircleGeometry(0.9 + r() * 0.4, 20, 0.3, Math.PI * 1.85).rotateX(-Math.PI / 2), wool('felt', 0x4e8e3a, 2), false);
    pad.position.set(POND.x + (r() - 0.5) * 6, 0.1, POND.z + (r() - 0.5) * 6);
    pad.rotation.y = r() * 6;
    group.add(pad);
    if (k % 2 === 0) {
      const lily = mesh(new THREE.SphereGeometry(0.4, 10, 6).scale(1, 0.6, 1), wool('crochet', 0xf2a8c8, 3));
      lily.position.set(pad.position.x, 0.3, pad.position.z);
      group.add(lily);
    }
  }
  // Knitted flamingos by the water.
  for (const [x, z, rot] of [[POND.x + 6, POND.z - 2, 0.6], [POND.x + 5, POND.z + 3, -0.8]] as const) {
    const f = new THREE.Group();
    const pink = wool('crochet', 0xf07aa8, 2.5);
    f.add(put(mesh(new THREE.SphereGeometry(1.2, 16, 12).scale(1.5, 0.9, 0.9), pink), new THREE.Vector3(0, 6.2, 0)));
    f.add(yarnTube([new THREE.Vector3(1.4, 6.6, 0), new THREE.Vector3(2, 8, 0), new THREE.Vector3(1.2, 9.4, 0), new THREE.Vector3(1.9, 10.4, 0)], 0.3, pink, 30));
    f.add(put(mesh(new THREE.SphereGeometry(0.5, 12, 10), pink), new THREE.Vector3(2.1, 10.5, 0)));
    f.add(put(mesh(new THREE.ConeGeometry(0.22, 0.9, 8).rotateZ(-Math.PI / 2 - 0.6), wool('felt', 0x1e1e22, 2)), new THREE.Vector3(2.7, 10.2, 0)));
    for (const dz of [-0.3, 0.3]) f.add(put(mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.5, 6), wool('rib', 0xf07aa8, 4)), new THREE.Vector3(0, 2.75, dz)));
    f.position.set(x, 0, z);
    f.rotation.y = rot;
    group.add(f);
  }
}

function stepStones(group: THREE.Group): void {
  const r = rng(3);
  for (const [x, z] of STONES) {
    const s = mesh(lumpy(0.9, 0.3, Math.floor(x * 10), 1).scale(1.1, 0.18, 1), wool('felt', 0xa8a49a, 1.2));
    s.position.set(x, 0.08, z);
    s.rotation.y = r() * 3;
    group.add(s);
  }
}

function fallenLeaves(group: THREE.Group, world: World): void {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.35, 0.3, 0, 0.8);
  shape.quadraticCurveTo(-0.35, 0.3, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2);
  const mat = createWoolMaterial({ color: 0xffffff, pattern: 'felt', uvSize: [0.4, 0.8] });
  mat.side = THREE.DoubleSide;
  const N = 1800;
  const inst = new THREE.InstancedMesh(geo, mat, N);
  const r = rng(21);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const autumn = [0xd8862a, 0xc84a2a, 0xe8b83a, 0x8a6a2a, 0x6a8a3a];
  const trees = world.boxes.filter((b) => b.shape === 'treeTrunk').map((b) => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2]);
  let n = 0;
  for (let tries = 0; tries < N * 4 && n < N; tries++) {
    // Most leaves pile under the trees, some blow across the lawn.
    let x: number, z: number;
    if (r() < 0.7) {
      const t = trees[Math.floor(r() * trees.length)];
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 16;
      x = t[0] + Math.cos(a) * d; z = t[1] + Math.sin(a) * d;
    } else {
      x = world.bounds.min[0] + r() * (world.bounds.max[0] - world.bounds.min[0]);
      z = world.bounds.min[1] + r() * (world.bounds.max[1] - world.bounds.min[1]);
    }
    if (!circleClear(world.boxes, x, z, 0.3, 40)) continue;
    q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4));
    const s = 0.8 + r() * 0.8;
    m.compose(new THREE.Vector3(x, 0.08 + r() * 0.15, z), q, new THREE.Vector3(s, s, s));
    inst.setMatrixAt(n, m);
    inst.setColorAt(n, col.setHex(autumn[Math.floor(r() * autumn.length)]).multiplyScalar(0.8 + r() * 0.3));
    n++;
  }
  inst.count = n;
  inst.receiveShadow = true;
  group.add(inst);
}

/** The neighbours' knitted houses and distant felt trees beyond the fence. */
function neighbourhood(group: THREE.Group): void {
  const r = rng(404);
  const sides: [number, number, number, number][] = [[-95, -30, 0, 3], [95, -30, Math.PI, 3], [-60, 95, Math.PI / 2, 4]];
  for (const [x0, z0, rot, count] of sides) {
    for (let k = 0; k < count; k++) {
      const g = new THREE.Group();
      const w = 40 + r() * 20, h = 30 + r() * 15;
      const col = [0xd9cdb5, 0xa86a50, 0xe8d4a0, 0xc8a8a0, 0x8a5a4a][Math.floor(r() * 5)];
      g.add(put(mesh(new THREE.BoxGeometry(w, h, 30), wool('garter', col, 0.4)), new THREE.Vector3(0, h / 2, 0)));
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 - 2, 0); shape.lineTo(w / 2 + 2, 0); shape.lineTo(0, 14); shape.closePath();
      const roof = mesh(new THREE.ExtrudeGeometry(shape, { depth: 32, bevelEnabled: false }).translate(0, 0, -16), wool('garter', [0x8a3a2e, 0x4a4a52, 0x6a4a3a][k % 3], 0.4));
      roof.position.y = h;
      g.add(roof);
      for (let wx = -w / 2 + 6; wx < w / 2 - 4; wx += 10) {
        g.add(put(mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshPhysicalMaterial({ color: 0x2a3848, roughness: 0.1 }), false), new THREE.Vector3(wx, h * 0.6, 15.05)));
      }
      g.rotation.y = rot;
      const along = (k - (count - 1) / 2) * 70;
      g.position.set(x0 + (rot === Math.PI / 2 ? along : 0), 0, z0 + (rot === Math.PI / 2 ? 0 : along));
      group.add(g);
    }
  }
  // Distant trees: felt blobs on knitted trunks.
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2;
    const d = 130 + r() * 110;
    const t = new THREE.Group();
    t.add(put(mesh(new THREE.CylinderGeometry(1.5, 2.5, 18, 8), wool('rib', 0x5a3e28, 0.5), false), new THREE.Vector3(0, 9, 0)));
    t.add(put(mesh(lumpy(12 + r() * 6, 0.5, k, 2), wool('felt', [0xb5452a, 0xd9772e, 0xe8b04a, 0x8a2a3a][k % 4], 0.5), false), new THREE.Vector3(0, 26, 0)));
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    group.add(t);
  }
}

export function buildWoolGarden(scene: THREE.Scene, world: World, quality: 'low' | 'medium' | 'high' = 'high'): WoolGarden {
  scene.fog = new THREE.Fog(0xf0d8b4, 170, 560);
  const skyFx = sky(scene);
  const group = new THREE.Group();
  group.name = 'wool-garden';

  // Knitted lawn reaching to the horizon.
  const lawn = mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), wool('garter', 0x7a8a3a, 0.35), false);
  group.add(lawn);
  const yard = mesh(new THREE.PlaneGeometry(92, 88).rotateX(-Math.PI / 2), wool('stocking', 0x86963e, 0.7), false);
  yard.position.set(0, 0.02, 2);
  group.add(yard);

  const trees: THREE.Group[] = [];
  world.boxes.forEach((b, i) => { if (b.kind !== 'floor') renderBox(group, b, i, trees); });
  pondAndFlamingos(group);
  stepStones(group);
  const grassFx = grass(group, world, { low: 12000, medium: 26000, high: 42000 }[quality]);
  fallenLeaves(group, world);
  neighbourhood(group);
  // A knitted city on the horizon, all the way round: the garden sits on the edge of town.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const city = skylineStrip(150, 40 + k, { height: 70, lit: 0.35, spire: k === 1 });
    city.scale.setScalar(1.6);
    city.position.set(Math.sin(a) * 330, 0, Math.cos(a) * 330);
    city.rotation.y = a + Math.PI;
    group.add(city);
  }
  // Flower beds along the house and the fences.
  flowerRow(group, -44, -33, 0, -38.5, 1);
  flowerRow(group, -2, 22, 0, -38.5, 2);
  flowerRow(group, 44, 44, 0, 20, 3);
  for (let z = -30; z < 30; z += 1.2) flowerRow(group, 43.5, 43.5, 0, z, z + 50);
  scatterMess(group, world, { count: 140, seed: 7, outdoor: true });
  scene.add(group);

  // Bright midday sun with a big shadow frustum over the whole yard.
  const dir = new THREE.Vector3(0.5, 0.75, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xffd8a0, 3.2);
  sun.position.copy(dir).multiplyScalar(160);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality === 'low' ? 2048 : 4096);
  const cam = sun.shadow.camera;
  cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80; cam.near = 20; cam.far = 360;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x6a5a2e, 0.85));

  return {
    sun,
    update(t) {
      grassFx.update(t);
      skyFx.update(t);
      for (const [k, tr] of trees.entries()) tr.rotation.y = Math.sin(t * 0.4 + k) * 0.004;
    },
  };
}
