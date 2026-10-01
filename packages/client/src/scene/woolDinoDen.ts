import * as THREE from 'three';
import type { Box, World } from '@stitchstrike/shared';
import { createPtero, posePtero } from '../figures/dinos.ts';
import type { FigureInstance } from '../figures/rig.ts';
import { knitWater } from './cozyDressing.ts';
import { metal } from './materials.ts';
import { lumpy, mesh, rbox, rng, wool, yarnTube } from './woolKit.ts';

/**
 * The Dino Den, knitted: a prehistoric playset of striped felt cliffs, a
 * stepped volcano with yarn lava and puffs of wool smoke, a jungle of palm
 * trees and ferns, a glossy knitted river, a fossil skeleton, a ranger's
 * lookout and a nest of speckled eggs. Beyond the cliffs a long-neck grazes
 * and pteros wheel over knitted mountains under a warm prehistoric sky.
 */

export interface WoolDinoDen { sun: THREE.DirectionalLight; update(t: number, camera: THREE.Camera): void }

const STRATA = [0xa8784a, 0xc8945a, 0x8a5a3a, 0xd8a868];
const LEAF = [0x4a8a3a, 0x5a9a42, 0x3a7a32, 0x6aa84a];
/** The river runs east-west just south of the middle. */
const RIVER_Z = -32;
const riverZ = (x: number) => RIVER_Z + Math.sin(x * 0.07) * 2.2;

function skyDome(scene: THREE.Scene): void {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0.6, 0.38, -0.45).normalize() } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          float h = clamp( vDir.y, 0.0, 1.0 );
          vec3 col = mix( vec3( 1.0, 0.76, 0.52 ), vec3( 0.36, 0.66, 0.74 ), pow( h, 0.5 ) );
          float s = max( dot( vDir, uSun ), 0.0 );
          col += vec3( 1.0, 0.7, 0.4 ) * ( pow( s, 260.0 ) * 5.0 + pow( s, 8.0 ) * 0.45 );
          gl_FragColor = vec4( col, 1.0 );
        }`,
    }),
  );
  dome.renderOrder = -10;
  scene.add(dome);
}

/** A knitted ribbon of water following the river's wiggle. */
function riverGeometry(x0: number, x1: number, width: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const segs = 120;
  for (let i = 0; i <= segs; i++) {
    const x = x0 + ((x1 - x0) * i) / segs;
    const z = riverZ(x);
    pos.push(x, 0, z - width / 2, x, 0, z + width / 2);
    if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Striped felt rock: knitted strata stacked up, with lumpy boulders along the top. */
function cliff(group: THREE.Group, b: Box, r: () => number): void {
  const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const bands = 3;
  for (let k = 0; k < bands; k++) {
    const bh = h / bands;
    const inset = k * 0.35;
    const band = rbox(w - inset, bh + 0.2, d - inset, 0.6, wool(k % 2 ? 'rib' : 'garter', STRATA[k % STRATA.length], 0.7));
    band.position.set(cx, b.min[1] + bh * (k + 0.5), cz);
    group.add(band);
  }
  const long = w > d;
  const n = Math.floor((long ? w : d) / 5);
  for (let k = 0; k < n; k++) {
    const rock = mesh(lumpy(1.8 + r() * 1.4, 0.35, Math.floor(cx * 13 + cz * 7) + k, 2), wool('felt', STRATA[(k + 1) % STRATA.length], 1));
    const f = (k + 0.5) / n;
    rock.position.set(long ? b.min[0] + f * w : cx + (r() - 0.5) * 2, b.max[1] + 0.4, long ? cz + (r() - 0.5) * 2 : b.min[2] + f * d);
    rock.scale.y = 0.7;
    group.add(rock);
  }
}

/** A knitted palm: a ringed, slightly leaning trunk, drooping fronds and coconuts. */
function palm(height: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const lean = new THREE.Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize();
  const segs = Math.round(height / 1.4);
  for (let k = 0; k < segs; k++) {
    const seg = mesh(new THREE.CylinderGeometry(0.95 - k * 0.025, 1.15 - k * 0.025, 1.45, 12), wool('rib', k % 2 ? 0x8a5a3a : 0x7a4a2e, 1.2));
    seg.position.copy(lean).multiplyScalar(k * 1.4 + 0.7);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    g.add(seg);
  }
  const top = lean.clone().multiplyScalar(height);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.3;
    const len = 6 + r() * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // A frond: a curved yarn spine with a flattened knitted leaf hanging off it.
    const pts = [0, 0.33, 0.66, 1].map((f) => top.clone().add(dir.clone().multiplyScalar(f * len)).add(new THREE.Vector3(0, 1.2 * Math.sin(f * Math.PI * 0.8) - f * f * 2.6, 0)));
    g.add(yarnTube(pts, 0.12, wool('rib', 0x3a6a2a, 2), 16));
    const leaf = mesh(new THREE.SphereGeometry(1, 14, 8).scale(len * 0.5, 0.12, 1.3), wool('garter', LEAF[k % LEAF.length], 1.2));
    leaf.position.copy(pts[1].clone().lerp(pts[2], 0.5)).add(new THREE.Vector3(0, -0.2, 0));
    leaf.rotation.y = -a;
    leaf.rotation.z = -0.35;
    g.add(leaf);
  }
  for (let k = 0; k < 3; k++) {
    const nut = mesh(new THREE.SphereGeometry(0.55, 12, 10), wool('felt', 0x6a4a2e, 2));
    nut.position.copy(top).add(new THREE.Vector3(Math.cos(k * 2.1) * 0.8, -0.8, Math.sin(k * 2.1) * 0.8));
    g.add(nut);
  }
  return g;
}

/** A clump of knitted fern fronds springing from one spot. */
function fern(size: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + r() * 0.4;
    const leaf = mesh(new THREE.SphereGeometry(1, 12, 6).scale(size * 0.5, 0.1, size * 0.14), wool('garter', LEAF[(k + seed) % LEAF.length], 1.6));
    leaf.position.set(Math.cos(a) * size * 0.4, size * 0.45, Math.sin(a) * size * 0.4);
    leaf.rotation.set(0, -a, 0.6 + r() * 0.3);
    g.add(leaf);
  }
  return g;
}

/** A felt bone: a shaft with knobbly ends. */
function bone(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const shaft = mesh(new THREE.CylinderGeometry(radius, radius, len, 10), mat);
  shaft.position.copy(a).lerp(b, 0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.add(shaft);
  for (const p of [a, b]) for (const s of [-1, 1]) {
    const knob = mesh(new THREE.SphereGeometry(radius * 1.35, 10, 8), mat);
    knob.position.copy(p).add(new THREE.Vector3(s * radius * 0.7, 0, 0));
    g.add(knob);
  }
  return g;
}

/** A grazing long-neck, knitted big and simple, for the far side of the cliffs. */
function longNeck(): { root: THREE.Group; neck: THREE.Group } {
  const root = new THREE.Group();
  const skin = wool('stocking', 0x6a8aa8, 0.6);
  const body = mesh(new THREE.SphereGeometry(1, 20, 14).scale(7, 5.5, 11), skin);
  body.position.y = 13;
  root.add(body);
  const belly = mesh(new THREE.SphereGeometry(1, 18, 12).scale(5.8, 3.8, 9.5), wool('rib', 0xe8dcc0, 0.6));
  belly.position.y = 11.2;
  root.add(belly);
  for (const [x, z] of [[-4, -6], [4, -6], [-4, 6], [4, 6]]) {
    const leg = mesh(new THREE.CylinderGeometry(1.8, 2.1, 12, 14), skin);
    leg.position.set(x, 6, z);
    root.add(leg);
  }
  root.add(yarnTube([new THREE.Vector3(0, 13, 9), new THREE.Vector3(0, 11, 17), new THREE.Vector3(0, 7, 25), new THREE.Vector3(0, 4, 31)], 1.4, skin, 32));
  const neck = new THREE.Group();
  neck.position.set(0, 15, -8);
  neck.add(yarnTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 8, -4), new THREE.Vector3(0, 15, -6), new THREE.Vector3(0, 20, -10)], 1.6, skin, 32));
  const head = mesh(new THREE.SphereGeometry(1, 16, 12).scale(1.8, 1.5, 3), skin);
  head.position.set(0, 20.5, -12);
  neck.add(head);
  root.add(neck);
  // Polka-dot spots down its back.
  for (let k = 0; k < 7; k++) {
    const spot = mesh(new THREE.SphereGeometry(1.1, 10, 8).scale(1, 0.3, 1), wool('felt', 0xe8b04a, 1.2));
    spot.position.set((k % 2 ? 2 : -2), 17.8 - Math.abs(k - 3) * 0.5, -6 + k * 2);
    root.add(spot);
  }
  return { root, neck };
}

/** A painted wooden sign with the map's name. */
function sign(text: string): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#7a4a2e'; x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#4a2a1a'; x.lineWidth = 10; x.strokeRect(8, 8, 496, 144);
  x.fillStyle = '#ffd36a'; x.font = 'bold 96px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(9, 2.8, 0.4), [wool('rib', 0x7a4a2e, 1), wool('rib', 0x7a4a2e, 1), wool('rib', 0x7a4a2e, 1), wool('rib', 0x7a4a2e, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })]);
  board.position.y = 7.5;
  board.castShadow = true;
  g.add(board);
  for (const s of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.35, 0.4, 9, 10), wool('rib', 0x6a4a2e, 1.2));
    post.position.set(s * 4, 4.5, 0);
    g.add(post);
  }
  return g;
}

export function buildWoolDinoDen(scene: THREE.Scene, world: World, quality: 'low' | 'medium' | 'high' = 'high'): WoolDinoDen {
  scene.fog = new THREE.Fog(0xf2c89a, 180, 600);
  skyDome(scene);
  const group = new THREE.Group();
  group.name = 'wool-dino-den';
  const r = rng(65);

  // Ground: a felt play-mat of sand and moss to the horizon.
  const far = mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), wool('garter', 0x8a9a4a, 0.3), false);
  far.position.y = -0.02;
  group.add(far);
  const den = mesh(new THREE.PlaneGeometry(124, 104).rotateX(-Math.PI / 2), wool('stocking', 0xd2b276, 0.55), false);
  den.position.y = 0.01;
  group.add(den);
  for (let k = 0; k < 34; k++) {
    const patch = mesh(lumpy(2.5 + r() * 3, 0.35, k + 40, 2).scale(1, 0.02, 1), wool('garter', LEAF[k % LEAF.length], 1.2), false);
    patch.position.set((r() - 0.5) * 110, 0.03, (r() - 0.5) * 90);
    if (Math.abs(patch.position.z - riverZ(patch.position.x)) < 5) continue;
    group.add(patch);
  }
  // A knitted dirt trail from each gap to the middle.
  const trail = wool('garter', 0xb89060, 0.8);
  for (const [x, z, w, d] of [[0, -25, 5, 44], [0, 41, 5, 12], [-38, 0, 38, 5], [38, 0, 38, 5]] as const) {
    const p = mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), trail, false);
    p.position.set(x, 0.04, z);
    group.add(p);
  }

  // The river: glossy knitted water with felt pebbles along both banks.
  const river = knitWater(riverGeometry(-58, 58, 6));
  river.position.y = 0.07;
  group.add(river);
  for (let k = 0; k < 70; k++) {
    const x = -57 + (k / 70) * 114;
    for (const s of [-1, 1]) {
      if (r() < 0.35) continue;
      const pebble = mesh(lumpy(0.6 + r() * 0.5, 0.4, k * 2 + (s > 0 ? 1 : 0), 1), wool('felt', [0x9a968e, 0x8a8478, 0xb8a888][k % 3], 1.4));
      pebble.scale.y = 0.5;
      pebble.position.set(x, 0.2, riverZ(x) + s * (3.2 + r() * 0.6));
      group.add(pebble);
    }
  }
  // Stepping stones across at the south trail.
  for (let k = 0; k < 4; k++) {
    const st = mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 12), wool('felt', 0x9a968e, 1.2));
    st.position.set(-1.5 + (k % 2) * 3, 0.25, riverZ(0) - 2.4 + k * 1.6);
    group.add(st);
  }

  // Volcano state: lava glow and smoke puffs.
  const smoke: { m: THREE.Mesh; t: number; x: number; z: number }[] = [];
  const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(1.6) });
  const lavaBalls: THREE.Mesh[] = [];
  let crater = new THREE.Vector3(0, 12, 22);
  const birds: FigureInstance[] = [];

  for (const b of world.boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const c = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const at = <T extends THREE.Object3D>(o: T, x = c.x, y = c.y, z = c.z): T => { o.position.set(x, y, z); group.add(o); return o; };
    switch (b.shape) {
      case 'cliff':
        cliff(group, b, r);
        break;
      case 'volcano': {
        const tier = Math.round(b.min[1] / 3);
        at(rbox(size[0], size[1] + 0.1, size[2], 1.2, wool(tier % 2 ? 'rib' : 'garter', [0x6a4a3a, 0x7a5040, 0x5a3a2e][tier % 3], 0.7)));
        // A cable of yarn lava dribbling over each ledge.
        for (const [sx, sz] of [[0.2, -1], [-0.6, -1], [1, 0.3], [-1, -0.2]]) {
          const x = c.x + sx * size[0] * 0.45, z = c.z + sz * size[2] * 0.5;
          at(yarnTube([new THREE.Vector3(x, b.max[1] + 0.05, z - sz * 0.6), new THREE.Vector3(x + 0.2, b.max[1] - 0.4, z + sz * 0.15), new THREE.Vector3(x - 0.1, b.min[1] + 0.8, z + sz * 0.3)], 0.32, wool('rib', 0xe8742a, 2), 12), 0, 0, 0);
        }
        break;
      }
      case 'volcanoTop': {
        at(rbox(size[0], size[1], size[2], 1, wool('garter', 0x5a3a2e, 0.8)));
        crater = new THREE.Vector3(c.x, b.max[1], c.z);
        const rim = at(mesh(new THREE.TorusGeometry(2.6, 0.9, 10, 24).rotateX(Math.PI / 2), wool('rib', 0x4a2e24, 1.2)), c.x, b.max[1] + 0.4, c.z);
        void rim;
        at(new THREE.Mesh(new THREE.CircleGeometry(2.3, 24).rotateX(-Math.PI / 2), lavaMat), c.x, b.max[1] + 0.35, c.z);
        for (let k = 0; k < 5; k++) {
          const ball = at(new THREE.Mesh(new THREE.SphereGeometry(0.45 + r() * 0.3, 10, 8), lavaMat), c.x, b.max[1] + 0.6, c.z);
          lavaBalls.push(ball);
        }
        const glow = new THREE.PointLight(0xff8a3a, 30, 22, 1.6);
        at(glow, c.x, b.max[1] + 2, c.z);
        for (let k = 0; k < 10; k++) {
          const puff = at(mesh(lumpy(1.2, 0.3, 300 + k, 2), wool('felt', 0xd8d0c4, 1.2), false), c.x, b.max[1], c.z);
          smoke.push({ m: puff, t: k / 10, x: (r() - 0.5) * 2, z: (r() - 0.5) * 2 });
        }
        break;
      }
      case 'fossilLeg':
        group.add(bone(new THREE.Vector3(c.x, 0.4, c.z), new THREE.Vector3(c.x, b.max[1] - 0.2, c.z), 0.45, wool('felt', 0xefe3c8, 1.4)));
        break;
      case 'fossilSpine': {
        const boneMat = wool('felt', 0xefe3c8, 1.4);
        for (let x = b.min[0] + 0.8; x < b.max[0]; x += 1.6) {
          at(rbox(1.0, size[1] + 0.3, size[2] * 0.55, 0.35, boneMat), x, c.y, c.z);
          // Ribs arching down either side.
          if (x > b.min[0] + 3 && x < b.max[0] - 3) {
            // A half hoop hanging under the spine, across it (in the YZ plane), splayed a little wider at the bottom.
            const ribGeo = new THREE.TorusGeometry(2.6, 0.22, 8, 18, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).scale(1, 1.2, 1.15);
            at(mesh(ribGeo, boneMat), x, b.min[1] + 0.2, c.z);
          }
        }
        // The tail tapering off behind.
        at(yarnTube([new THREE.Vector3(b.min[0], c.y, c.z), new THREE.Vector3(b.min[0] - 4, c.y - 2, c.z + 1), new THREE.Vector3(b.min[0] - 7, 1, c.z + 3)], 0.4, boneMat, 20), 0, 0, 0);
        break;
      }
      case 'fossilSkull': {
        const boneMat = wool('felt', 0xefe3c8, 1.2);
        const skull = at(mesh(lumpy(1, 0.12, 77, 3), boneMat), c.x, b.min[1] + size[1] * 0.55, c.z);
        skull.scale.set(size[0] * 0.55, size[1] * 0.5, size[2] * 0.5);
        for (const s of [-1, 1]) {
          const socket = at(mesh(new THREE.SphereGeometry(0.9, 12, 10), wool('felt', 0x2a2420, 2)), c.x + 0.5, b.min[1] + size[1] * 0.75, c.z + s * size[2] * 0.42);
          socket.scale.set(1, 1, 0.5);
        }
        const jaw = at(rbox(size[0] * 0.85, 1, size[2] * 0.75, 0.4, boneMat), c.x + 0.5, b.min[1] + 0.6, c.z);
        void jaw;
        for (let k = 0; k < 6; k++) {
          const tooth = at(mesh(new THREE.ConeGeometry(0.25, 1, 6).rotateX(Math.PI), wool('felt', 0xfff6e0, 2)), b.max[0] - 0.4, b.min[1] + 1.8, b.min[2] + 1.2 + k * 1.1);
          void tooth;
        }
        break;
      }
      case 'palmTrunk': {
        const p = palm(size[1], Math.floor(c.x * 5 + c.z * 3));
        p.position.set(c.x, 0, c.z);
        group.add(p);
        break;
      }
      case 'frond':
        break; // the palm's crown is the frond platform
      case 'archPillar': {
        const pillar = at(mesh(lumpy(1, 0.15, Math.floor(c.x), 2), wool('garter', 0x9a8a78, 0.9)));
        pillar.scale.set(size[0] * 0.7, size[1] * 0.58, size[2] * 0.7);
        break;
      }
      case 'archTop':
        at(rbox(size[0] + 0.5, size[1] + 0.3, size[2], 0.9, wool('rib', 0x8a7a68, 0.9)));
        break;
      case 'log': {
        const log = at(mesh(new THREE.CylinderGeometry(size[1] / 2 + 0.1, size[1] / 2 + 0.2, size[0], 14).rotateZ(Math.PI / 2), wool('rib', 0x7a5a3a, 1.1)), c.x, b.min[1] + size[1] / 2, c.z);
        void log;
        for (const s of [-1, 1]) at(mesh(new THREE.CircleGeometry(size[1] / 2 + 0.1, 14).rotateY(s * Math.PI / 2), wool('garter', 0xd8b080, 2)), c.x + s * size[0] / 2, b.min[1] + size[1] / 2, c.z);
        break;
      }
      case 'towerLeg':
        at(mesh(new THREE.CylinderGeometry(0.45, 0.5, size[1], 10), wool('rib', 0x8a5a3a, 1.2)));
        break;
      case 'towerDeck': {
        at(rbox(size[0], size[1], size[2], 0.2, wool('rib', 0x9a6a3a, 1)));
        // Railings and a thatched straw roof on corner posts.
        for (const [x0, z0, x1, z1] of [[b.min[0], b.min[2], b.max[0], b.min[2]], [b.min[0], b.max[2], b.max[0] - 3, b.max[2]], [b.min[0], b.min[2], b.min[0], b.max[2]], [b.max[0], b.min[2], b.max[0], b.max[2]]]) {
          group.add(yarnTube([new THREE.Vector3(x0, b.max[1] + 1.2, z0), new THREE.Vector3(x1, b.max[1] + 1.2, z1)], 0.12, wool('rib', 0xefe3c8, 2), 4));
        }
        for (const [x, z] of [[b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.min[0], b.max[2]], [b.max[0], b.max[2]]]) at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 8), wool('rib', 0x8a5a3a, 1.4)), x, b.max[1] + 2.5, z);
        const roof = at(mesh(new THREE.ConeGeometry(8.4, 3.5, 4), wool('garter', 0xd8b860, 0.9)), c.x, b.max[1] + 6.4, c.z);
        roof.rotation.y = Math.PI / 4;
        break;
      }
      case 'ladder': {
        for (const s of [-1, 1]) at(mesh(new THREE.CylinderGeometry(0.1, 0.1, size[1], 6), wool('rib', 0x6a4a2e, 2)), c.x + s * 0.5, c.y, c.z);
        for (let y = 0.6; y < size[1]; y += 0.9) at(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6).rotateZ(Math.PI / 2), wool('rib', 0x6a4a2e, 2)), c.x, y, c.z);
        break;
      }
      case 'boulder': {
        const rock = at(mesh(lumpy(1, 0.3, Math.floor(c.x * 3 + c.z), 2), wool('felt', 0x9a968e, 1)), c.x, b.min[1] + size[1] * 0.42, c.z);
        rock.scale.set(size[0] * 0.6, size[1] * 0.62, size[2] * 0.6);
        break;
      }
      case 'nest': {
        at(mesh(new THREE.TorusGeometry(Math.min(size[0], size[2]) * 0.38, 0.7, 10, 24).rotateX(Math.PI / 2), wool('rib', 0xb08850, 1.6)), c.x, b.min[1] + 0.6, c.z);
        for (let k = 0; k < 4; k++) {
          const egg = at(mesh(new THREE.SphereGeometry(0.75, 14, 12).scale(1, 1.3, 1), wool('felt', [0xefe3c8, 0xd8e8c0, 0xefe3c8, 0xe8d0b0][k], 2)), c.x + Math.cos(k * 1.6) * 1.2, b.min[1] + 0.9, c.z + Math.sin(k * 1.6) * 1.2);
          for (let s = 0; s < 5; s++) {
            const speck = mesh(new THREE.SphereGeometry(0.12, 6, 5), wool('felt', 0x8a5a3a, 3));
            const a = r() * Math.PI * 2, e = (r() - 0.3) * 1.2;
            speck.position.set(Math.cos(a) * 0.72 * Math.cos(e), Math.sin(e) * 0.9, Math.sin(a) * 0.72 * Math.cos(e));
            egg.add(speck);
          }
        }
        break;
      }
      case 'fern': {
        const f = fern(size[1] * 1.6, Math.floor(c.x + c.z * 3));
        f.position.set(c.x, 0, c.z);
        group.add(f);
        break;
      }
      default:
        break;
    }
  }

  // Gate totems with flickering torches either side of each gap.
  const flames: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(1.8) });
  for (const [x, z, rot] of [[0, -49.5, 0], [0, 49.5, 0], [-59.5, 0, 1], [59.5, 0, 1]] as const) {
    for (const s of [-1, 1]) {
      const px = x + (rot ? 0 : s * 7), pz = z + (rot ? s * 7 : 0);
      const totem = mesh(new THREE.CylinderGeometry(0.9, 1.1, 11, 10), wool('rib', s < 0 ? 0x8a5a3a : 0x7a4a2e, 1));
      totem.position.set(px, 5.5, pz);
      group.add(totem);
      for (let k = 0; k < 3; k++) {
        const band = mesh(new THREE.TorusGeometry(1.05, 0.22, 8, 16).rotateX(Math.PI / 2), wool('rib', [0xe8742a, 0x4a8a8a, 0xe8b04a][k], 2));
        band.position.set(px, 2 + k * 3, pz);
        group.add(band);
      }
      const bowl = mesh(new THREE.CylinderGeometry(1.1, 0.6, 0.8, 12), metal(0x3a3430, 0.5));
      bowl.position.set(px, 11.4, pz);
      group.add(bowl);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 10), flameMat);
      flame.position.set(px, 12.6, pz);
      group.add(flame);
      flames.push(flame);
    }
  }
  const welcome = sign('DINO DEN');
  welcome.position.set(-11, 0, -44);
  group.add(welcome);

  // Beyond the cliffs: more palms, knitted mountains and a smoking volcano on the horizon.
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + r() * 0.1;
    const d = 72 + r() * 16;
    const p = palm(14 + r() * 8, 900 + k);
    p.position.set(Math.cos(a) * d * 1.05, 0, Math.sin(a) * d * 0.92);
    group.add(p);
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + r() * 0.2;
    const h = 50 + r() * 60;
    // Soft knitted mountains: lumpy, rounded, a darker band of yarn round the base.
    const mtn = mesh(lumpy(1, 0.22, 800 + k, 2), wool('garter', [0x6a8a5a, 0x7a7a9a, 0x5a7a6a, 0x8a7a6a][k % 4], 0.25), false);
    mtn.scale.set(h * 0.85, h * 0.75, h * 0.85);
    mtn.position.set(Math.cos(a) * 260, -h * 0.12, Math.sin(a) * 230);
    mtn.rotation.y = r() * 3;
    group.add(mtn);
  }
  const bigVolcano = mesh(new THREE.CylinderGeometry(18, 70, 90, 12, 3), wool('garter', 0x5a4a4a, 0.25), false);
  bigVolcano.position.set(-120, 43, 230);
  group.add(bigVolcano);
  const farSmoke: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const puff = mesh(lumpy(10 + k * 2.5, 0.3, 700 + k, 2), wool('felt', 0xcfc6ba, 0.4), false);
    puff.position.set(-120 + k * 4, 95 + k * 12, 230 - k * 3);
    group.add(puff);
    farSmoke.push(puff);
  }

  // A long-neck grazing outside the north cliff, and pteros wheeling overhead.
  const ln = longNeck();
  ln.root.position.set(36, 0, 78);
  ln.root.rotation.y = Math.PI * 0.85;
  group.add(ln.root);
  const pteroCount = quality === 'low' ? 1 : 3;
  for (let k = 0; k < pteroCount; k++) {
    const f = createPtero();
    f.root.scale.setScalar(3);
    group.add(f.root);
    birds.push(f);
  }

  scene.add(group);

  // Warm late sun, a sky-blue fill.
  const dir = new THREE.Vector3(0.6, 0.38, -0.45).normalize();
  const sun = new THREE.DirectionalLight(0xffd29a, 3.1);
  sun.position.copy(dir).multiplyScalar(200);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality === 'low' ? 2048 : 4096);
  const cam = sun.shadow.camera;
  cam.left = -85; cam.right = 85; cam.top = 85; cam.bottom = -85; cam.near = 40; cam.far = 420;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffe6c0, 0x6a6a3a, 0.85));

  return {
    sun,
    update(t) {
      // Wool smoke puffs rise out of the crater, grow and fade, then start again.
      for (const s of smoke) {
        const k = (t * 0.12 + s.t) % 1;
        s.m.position.set(crater.x + s.x * (1 + k * 3), crater.y + 1 + k * 16, crater.z + s.z * (1 + k * 3) + k * 4);
        s.m.scale.setScalar(0.6 + k * 2.4);
        s.m.visible = k < 0.96;
      }
      lavaBalls.forEach((b, k) => {
        const ph = (t * 0.7 + k * 0.37) % 1.6;
        const up = ph < 1 ? Math.sin(ph * Math.PI) * 4 : 0;
        b.position.set(crater.x + Math.cos(k * 1.3) * 1.2, crater.y + 0.6 + up, crater.z + Math.sin(k * 1.3) * 1.2);
      });
      flames.forEach((f, k) => {
        const s = 1 + Math.sin(t * 13 + k * 2.1) * 0.12 + Math.sin(t * 7.3 + k) * 0.08;
        f.scale.set(s, s * (1.1 + Math.sin(t * 9 + k) * 0.15), s);
      });
      farSmoke.forEach((p, k) => { p.position.y = 95 + k * 12 + Math.sin(t * 0.2 + k) * 2; p.rotation.y = t * 0.02 * (k % 2 ? 1 : -1); });
      ln.neck.rotation.x = Math.sin(t * 0.25) * 0.12 + 0.05;
      ln.neck.rotation.y = Math.sin(t * 0.17) * 0.2;
      birds.forEach((f, k) => {
        const a = t * (0.12 + k * 0.03) + k * 2.1;
        const R = 70 + k * 18;
        f.root.position.set(Math.cos(a) * R, 42 + k * 9 + Math.sin(t * 0.5 + k) * 3, Math.sin(a) * R * 0.8);
        f.root.rotation.y = -a + Math.PI;
        f.root.rotation.z = 0.25;
        posePtero(f, t, k * 3, 0);
      });
    },
  };
}
