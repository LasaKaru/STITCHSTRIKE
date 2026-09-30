import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box, World } from '@stitchstrike/shared';
import type { StitchPattern } from '../wool/stitches.ts';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { knittedFloor, renderFurniture, roomDetails } from './woolFurniture.ts';
import { scatterMess } from './mess.ts';

/**
 * The whole room is wool: knitted walls and ceiling, a knitted carpet with a
 * crochet rag rug, felt furniture, crocheted clutter and knitted books.
 * Geometry comes from the shared collision world so what you see is what you
 * hit; decoration on top is render-only.
 */

/** Window in the left wall (x = -20); the only way sunlight gets in. */
export const ROOM_WINDOW = { x: -20, z0: 2, z1: 12, y0: 8, y1: 16 };
const CEILING = 25;

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

/** Shared triplanar wool material per pattern + colour (one shader program for all of them). */
function wool(pattern: StitchPattern, color: number, gauge = 1, roughness = 0.92): THREE.MeshPhysicalMaterial {
  const key = `${pattern}-${color}-${gauge}`;
  let m = cache.get(key);
  if (!m) {
    m = createWoolMaterial({ color, pattern, uvSize: [1, 1], triplanar: true, gauge, roughness });
    cache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

function boxMesh(min: readonly number[], max: readonly number[], mat: THREE.Material, cast = true): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]), mat, cast);
  m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return m;
}

/** Soft-cornered box so furniture reads as stuffed fabric, not a crate. */
function pillowBox(w: number, h: number, d: number, puff: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 8, 4, 8);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const nx = v.x / (w / 2), ny = v.y / (h / 2), nz = v.z / (d / 2);
    // Bulge the faces outward in the middle, keep the edges tucked in.
    const bulge = puff * (1 - nx * nx) * (1 - nz * nz);
    if (Math.abs(ny) > 0.99) v.y += Math.sign(ny) * bulge;
    const side = puff * 0.6 * (1 - ny * ny);
    if (Math.abs(nx) > 0.99) v.x += Math.sign(nx) * side * (1 - nz * nz);
    if (Math.abs(nz) > 0.99) v.z += Math.sign(nz) * side * (1 - nx * nx);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const PATTERNS_FOR_PROPS: StitchPattern[] = ['crochet', 'garter', 'stocking', 'rib'];

function renderBox(group: THREE.Group, b: Box, index: number): void {
  const color = b.color ?? 0x999999;
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const centre = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);

  if (b.kind === 'floor') {
    knittedFloor(group, b, wool);
    return;
  }
  if (renderFurniture(group, b, wool)) return;
  if (b.kind === 'wall') {
    if (b.max[0] === ROOM_WINDOW.x) { windowWall(group, b); return; }
    group.add(boxMesh(b.min, b.max, wool('stocking', color, 0.7), true));
    return;
  }
  if (b.shape === 'beanbag') {
    const m = mesh(new THREE.SphereGeometry(1, 48, 32), wool('garter', color, 0.9));
    m.scale.set(size[0] / 2 * 1.05, size[1] * 0.62, size[2] / 2 * 1.05);
    m.position.set(centre.x, b.min[1] + size[1] * 0.42, centre.z);
    group.add(m);
    return;
  }
  if (b.shape === 'books') {
    // Knitted book stacks as climbing stairs, with a cream page edge.
    const book = mesh(pillowBox(size[0], size[1], size[2], 0.06), wool('garter', color, 1.2));
    book.position.copy(centre);
    group.add(book);
    return;
  }
  if (b.kind === 'shelf') {
    group.add(boxMesh(b.min, b.max, wool('felt', color, 1)));
    return;
  }
  if (b.kind === 'furniture') {
    const pattern: StitchPattern = size[1] < 1 ? 'felt' : 'garter';
    const m = mesh(pillowBox(size[0], size[1], size[2], Math.min(0.15, size[1] * 0.1)), wool(pattern, color, 1));
    m.position.copy(centre);
    group.add(m);
    return;
  }
  // Toy clutter: plump crocheted blocks.
  const m = mesh(pillowBox(size[0], size[1], size[2], Math.min(0.3, size[1] * 0.12)), wool(PATTERNS_FOR_PROPS[index % PATTERNS_FOR_PROPS.length], color, 1.1));
  m.position.copy(centre);
  group.add(m);
}

function windowWall(group: THREE.Group, b: Box): void {
  const W = ROOM_WINDOW;
  const mat = wool('stocking', b.color ?? 0x66728c, 0.7);
  const x0 = b.min[0], x1 = b.max[0];
  group.add(boxMesh([x0, b.min[1], b.min[2]], [x1, W.y0, b.max[2]], mat));
  group.add(boxMesh([x0, W.y1, b.min[2]], [x1, b.max[1], b.max[2]], mat));
  group.add(boxMesh([x0, W.y0, b.min[2]], [x1, W.y1, W.z0], mat));
  group.add(boxMesh([x0, W.y0, W.z1], [x1, W.y1, b.max[2]], mat));
  // Felt frame + sill.
  const frame = wool('felt', 0xefe3c8, 1);
  group.add(boxMesh([x1 - 0.2, W.y0 - 0.4, W.z0 - 0.4], [x1 + 0.5, W.y0, W.z1 + 0.4], frame));
  group.add(boxMesh([x1 - 0.2, W.y1, W.z0 - 0.4], [x1 + 0.3, W.y1 + 0.35, W.z1 + 0.4], frame));
  group.add(boxMesh([x1 - 0.2, W.y0, W.z0 - 0.35], [x1 + 0.3, W.y1, W.z0], frame));
  group.add(boxMesh([x1 - 0.2, W.y0, W.z1], [x1 + 0.3, W.y1, W.z1 + 0.35], frame));
  group.add(boxMesh([x1 - 0.2, W.y0, (W.z0 + W.z1) / 2 - 0.12], [x1 + 0.1, W.y1, (W.z0 + W.z1) / 2 + 0.12], frame));
  // Knitted curtains gathered either side.
  for (const side of [-1, 1]) {
    const width = 3.2, height = W.y1 - W.y0 + 3.5;
    const geo = new THREE.PlaneGeometry(width, height, 48, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / width + 0.5;
      p.setZ(i, Math.sin(u * Math.PI * 7) * 0.22 + Math.sin(u * Math.PI * 2.3) * 0.1);
    }
    geo.computeVertexNormals();
    const curtain = mesh(geo, createWoolMaterial({ color: 0xd9a441, pattern: 'rib', uvSize: [width, height], gauge: 0.8 }));
    (curtain.material as THREE.Material).side = THREE.DoubleSide;
    curtain.rotation.y = Math.PI / 2;
    curtain.position.set(x1 + 0.45, (W.y0 + W.y1) / 2 + 0.6, side < 0 ? W.z0 - width / 2 + 0.3 : W.z1 + width / 2 - 0.3);
    group.add(curtain);
  }
  // Curtain rod (the one wooden thing, wrapped in yarn at the ends).
  const rod = mesh(new THREE.CylinderGeometry(0.1, 0.1, W.z1 - W.z0 + 8, 12), wool('wound', 0x8a5a3a, 2));
  rod.rotation.x = Math.PI / 2;
  rod.position.set(x1 + 0.5, W.y1 + 1.2, (W.z0 + W.z1) / 2);
  group.add(rod);
  // Bright sky behind the glass so the window blooms.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcecff).multiplyScalar(1.7) }));
  sky.rotation.y = Math.PI / 2;
  sky.position.set(x0 - 6, 12, (W.z0 + W.z1) / 2);
  group.add(sky);
}

/** Concentric crochet rag rug in the middle of the floor. */
function ragRug(group: THREE.Group): void {
  const rings = [0xd8262e, 0xefe3c8, 0x3a5da8, 0xffc94a, 0x8bcb3a, 0xefe3c8, 0xe8742a, 0x5e6b86];
  const step = 0.9;
  rings.forEach((c, i) => {
    const inner = i * step, outer = (i + 1) * step;
    const geo = i === 0 ? new THREE.CircleGeometry(outer, 48) : new THREE.RingGeometry(inner, outer, 64, 1);
    const m = mesh(geo, wool('crochet', c, 1.4), false);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.02 + i * 0.0005, 2);
    m.scale.set(1.35, 1, 1);
    group.add(m);
  });
}

/** Rows of knitted books on the bookshelf. */
function shelfBooks(group: THREE.Group): void {
  const palette = [0xd8262e, 0x3a5da8, 0xe8742a, 0x8bcb3a, 0xb46fd6, 0xefe3c8];
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  for (const shelfTop of [0.6, 4.5, 8.5, 12.5]) {
    let z = 4.15;
    while (z < 11.8) {
      const t = 0.35 + Math.random() * 0.45;
      if (z + t > 11.9) break;
      const h = 2.2 + Math.random() * 0.9;
      const d = 2.2 + Math.random() * 0.8;
      const g = new THREE.BoxGeometry(d, h, t);
      g.rotateZ((Math.random() - 0.5) * 0.04);
      g.translate(20 - 0.1 - d / 2, shelfTop + h / 2, z + t / 2);
      const c = palette[Math.floor(Math.random() * palette.length)];
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c)!.push(g);
      z += t + 0.03;
      if (Math.random() < 0.08) z += 0.8;
    }
  }
  for (const [c, geos] of byColor) group.add(mesh(mergeGeometries(geos), wool('garter', c, 1.3)));
}

export interface WoolRoom {
  sun: THREE.DirectionalLight;
  update(t: number, camera: THREE.Camera): void;
}

export function buildWoolRoom(scene: THREE.Scene, world: World): WoolRoom {
  const group = new THREE.Group();
  group.name = 'wool-room';
  world.boxes.forEach((b, i) => renderBox(group, b, i));
  // Knitted ceiling so the window is the only way in for the sun.
  group.add(boxMesh([-21, CEILING, -18.5], [21, CEILING + 1, 18.5], wool('stocking', 0x7a8499, 0.6)));
  ragRug(group);
  shelfBooks(group);
  roomDetails(group, wool);
  // A kid's room is never tidy: socks, crayons, open books, blocks and loose yarn.
  scatterMess(group, world, { count: 90, seed: 11, outdoor: false });

  // A felt poster with a crocheted sun on the back wall, and a hanging yarn-ball mobile.
  const poster = boxMesh([-4, 9, -17.5], [4, 15, -17.35], wool('felt', 0x2f7fe0, 1));
  group.add(poster);
  const sunDisc = mesh(new THREE.CircleGeometry(1.8, 40), wool('crochet', 0xffc94a, 1.5), false);
  sunDisc.position.set(0, 12, -17.3);
  group.add(sunDisc);
  const mobileMats = [0xd8262e, 0x8bcb3a, 0xb46fd6].map((c) => createWoolMaterial({ color: c, pattern: 'wound', uvSize: [3, 1.5], gauge: 1.5 }));
  const mobile = new THREE.Group();
  mobile.position.set(4, CEILING, -2);
  mobileMats.forEach((m, i) => {
    const a = (i / 3) * Math.PI * 2;
    const ball = mesh(new THREE.SphereGeometry(0.55, 32, 20), m);
    ball.position.set(Math.cos(a) * 2, -5 - i * 0.8, Math.sin(a) * 2);
    addShellFuzz(ball);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 5 + i * 0.8, 4), new THREE.MeshBasicMaterial({ color: 0xefe3c8 }));
    string.position.set(Math.cos(a) * 2, -(5 + i * 0.8) / 2, Math.sin(a) * 2);
    mobile.add(ball, string);
  });
  group.add(mobile);
  scene.add(group);

  // Sun through the window: the only direct light.
  const dir = new THREE.Vector3(-1, 0.85, 0.3).normalize();
  const sun = new THREE.DirectionalLight(0xffd9a0, 7);
  sun.position.copy(dir).multiplyScalar(45);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 5; c.far = 110;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // Soft interior fill: cool sky bounce from above, warm wool bounce from below.
  scene.add(new THREE.HemisphereLight(0xaebfe0, 0x8a6a4a, 0.22));
  const lamp = new THREE.PointLight(0xffc98a, 3.5, 30, 1.6);
  lamp.position.set(14, 10, -12);
  scene.add(lamp);

  const shafts = lightShaft(dir);
  scene.add(shafts.mesh);
  const dust = dustMotes(dir);
  scene.add(dust.points);

  return {
    sun,
    update(t, camera) {
      mobile.rotation.y = t * 0.15;
      shafts.update(camera);
      dust.update(t);
    },
  };
}

function lightShaft(sunDir: THREE.Vector3): { mesh: THREE.Mesh; update(camera: THREE.Camera): void } {
  const W = ROOM_WINDOW;
  const inward = sunDir.clone().negate();
  const top = [
    new THREE.Vector3(W.x + 0.3, W.y0, W.z0), new THREE.Vector3(W.x + 0.3, W.y0, W.z1),
    new THREE.Vector3(W.x + 0.3, W.y1, W.z1), new THREE.Vector3(W.x + 0.3, W.y1, W.z0),
  ];
  const bottom = top.map((p) => p.clone().addScaledVector(inward, p.y / -inward.y));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...top, ...bottom].flatMap((v) => [v.x, v.y, v.z]), 3));
  geo.setAttribute('along', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1], 1));
  geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uIntensity: { value: 0.009 } },
    vertexShader: /* glsl */ `
      attribute float along;
      varying float vAlong;
      varying vec3 vWorld;
      void main() {
        vAlong = along;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vAlong;
      varying vec3 vWorld;
      void main() {
        float fade = smoothstep( 0.0, 0.1, vAlong ) * ( 1.0 - smoothstep( 0.5, 1.0, vAlong ) );
        fade *= smoothstep( 1.5, 6.0, distance( vWorld, cameraPosition ) );
        gl_FragColor = vec4( uColor * uIntensity * fade, 1.0 );
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 10;
  return { mesh: m, update: () => {} };
}

function dustMotes(sunDir: THREE.Vector3): { points: THREE.Points; update(t: number): void } {
  const W = ROOM_WINDOW;
  const N = 350;
  const pos = new Float32Array(N * 3);
  const base = new Float32Array(N * 3);
  const inward = sunDir.clone().negate();
  for (let i = 0; i < N; i++) {
    // Seed motes inside the beam: a point on the window, carried some way along the light.
    const y = W.y0 + Math.random() * (W.y1 - W.y0);
    const s = Math.random() * (y / -inward.y);
    base[i * 3] = W.x + inward.x * s;
    base[i * 3 + 1] = y + inward.y * s;
    base[i * 3 + 2] = W.z0 + Math.random() * (W.z1 - W.z0) + inward.z * s;
  }
  pos.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,210,1)');
  grad.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 0.035, map: new THREE.CanvasTexture(c), color: new THREE.Color(0xffe2b0).multiplyScalar(0.9), opacity: 0.7,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(t) {
      for (let i = 0; i < N; i++) {
        pos[i * 3] = base[i * 3] + Math.sin(t * 0.2 + i) * 0.3;
        pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.13 + i * 1.7) * 0.25;
        pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.17 + i * 0.7) * 0.3;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
