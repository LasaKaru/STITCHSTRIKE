import * as THREE from 'three';
import { ENEMIES, EnemyType } from '@stitchstrike/shared';
import type { StitchPattern } from '../wool/stitches.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { bead } from './materials.ts';

/**
 * Knitted enemies, drawn with one InstancedMesh per body part per type so a
 * full wave costs a few dozen draw calls. Each part has a local transform
 * that is animated (walk swing, wing flap) per enemy.
 */

export interface EnemyView {
  id: number;
  type: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0..1 */
  health: number;
  /** Walk cycle phase, advanced by distance travelled. */
  phase: number;
  /** Seconds since last hit, for a squash flash. */
  hitAge: number;
}

type Anim = (m: THREE.Matrix4, phase: number, t: number, e: EnemyView) => void;

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  anim: Anim;
}

const MAX_PER_TYPE = 80;
const TAU = Math.PI * 2;
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);

function knit(color: number, pattern: StitchPattern, uv: [number, number], gauge = 1): THREE.Material {
  return createWoolMaterial({ color, pattern, uvSize: uv, gauge });
}

/** Static offset + optional rotation built each frame. */
function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Anim {
  return (m) => {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    m.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  };
}

function glowEyes(color: number): THREE.Material {
  const m = bead(0x111111);
  m.emissive = new THREE.Color(color);
  m.emissiveIntensity = 2.2;
  return m;
}

function partsFor(type: number): Part[] {
  const s = (r: number) => new THREE.SphereGeometry(r, 20, 14);
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14);
  switch (type) {
    case EnemyType.Grunt: {
      // Mass-knit soldier: scratchy red acrylic, grey helmet, glowing button eyes.
      const body = knit(0xb3262c, 'stocking', [TAU * 0.3, 1.2], 1.2);
      const dark = knit(0x3b3f4a, 'rib', [TAU * 0.3, 1], 1.2);
      const cream = knit(0xd8ccb2, 'crochet', [TAU * 0.28, Math.PI * 0.28], 1.2);
      const legSwing = (side: number): Anim => (m, phase) => {
        tmpE.set(Math.sin(phase) * 0.6 * side, 0, 0);
        tmpQ.setFromEuler(tmpE);
        m.compose(tmpV.set(side * 0.14, 0.42, 0), tmpQ, tmpS.set(1, 1, 1));
        m.multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
      };
      const armSwing = (side: number): Anim => (m, phase) => {
        tmpE.set(-Math.sin(phase) * 0.5 * side - 0.3, 0, side * 0.25);
        tmpQ.setFromEuler(tmpE);
        m.compose(tmpV.set(side * 0.34, 0.95, 0), tmpQ, tmpS.set(1, 1, 1));
        m.multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
      };
      return [
        { geometry: cap(0.28, 0.35), material: body, anim: (m, phase) => at(0, 0.82 + Math.abs(Math.sin(phase)) * 0.04, 0)(m, phase, 0, null!) },
        { geometry: s(0.26), material: cream, anim: (m, phase) => at(0, 1.3 + Math.abs(Math.sin(phase)) * 0.04, 0)(m, phase, 0, null!) },
        { geometry: new THREE.SphereGeometry(0.29, 20, 10, 0, TAU, 0, Math.PI / 2), material: dark, anim: (m, phase) => at(0, 1.36 + Math.abs(Math.sin(phase)) * 0.04, 0.02)(m, phase, 0, null!) },
        { geometry: s(0.05), material: glowEyes(0xff4030), anim: (m, phase) => at(-0.09, 1.33 + Math.abs(Math.sin(phase)) * 0.04, -0.23)(m, phase, 0, null!) },
        { geometry: s(0.05), material: glowEyes(0xff4030), anim: (m, phase) => at(0.09, 1.33 + Math.abs(Math.sin(phase)) * 0.04, -0.23)(m, phase, 0, null!) },
        { geometry: cap(0.1, 0.25), material: dark, anim: legSwing(-1) },
        { geometry: cap(0.1, 0.25), material: dark, anim: legSwing(1) },
        { geometry: cap(0.08, 0.28), material: body, anim: armSwing(-1) },
        { geometry: cap(0.08, 0.28), material: body, anim: armSwing(1) },
      ];
    }
    case EnemyType.Scuttler: {
      // Crocheted spider-crab in violet acrylic with six yarn legs.
      const body = knit(0x6a3c9a, 'crochet', [TAU * 0.35, Math.PI * 0.35], 1.3);
      const legMat = knit(0x2a1f3a, 'rib', [0.3, 0.6], 2);
      const legs: Part[] = [];
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const k = (i % 3) - 1;
        legs.push({
          geometry: cap(0.045, 0.45),
          material: legMat,
          anim: (m, phase) => {
            const lift = Math.sin(phase * 1.5 + i * 2.1) * 0.35;
            tmpE.set(k * 0.5, 0, side * (1.0 + lift * 0.5));
            tmpQ.setFromEuler(tmpE);
            m.compose(tmpV.set(side * 0.3, 0.3, k * 0.2), tmpQ, tmpS.set(1, 1, 1));
            m.multiply(new THREE.Matrix4().makeTranslation(0, -0.25, 0));
          },
        });
      }
      return [
        { geometry: s(0.35), material: body, anim: (m, phase) => at(0, 0.38 + Math.sin(phase * 3) * 0.02, 0, 0, 0, 0, 1, 0.65, 1.1)(m, phase, 0, null!) },
        { geometry: s(0.06), material: glowEyes(0x9aff5a), anim: at(-0.1, 0.46, -0.33) },
        { geometry: s(0.06), material: glowEyes(0x9aff5a), anim: at(0.1, 0.46, -0.33) },
        ...legs,
      ];
    }
    case EnemyType.Moth: {
      // Felted moth: fuzzy body, big soft wings with eye spots. It eats wool.
      const body = knit(0x8a7a66, 'felt', [TAU * 0.2, 0.9], 1);
      const wingMat = createWoolMaterial({ color: 0xb8a58a, pattern: 'felt', uvSize: [1, 1], gauge: 1 });
      wingMat.side = THREE.DoubleSide;
      const wing = new THREE.CircleGeometry(0.55, 24);
      wing.scale(1, 0.7, 1);
      wing.translate(0.5, 0, 0);
      const flap = (side: number): Anim => (m, _phase, t, e) => {
        const a = Math.sin(t * 18 + e.id) * 0.9;
        tmpE.set(-Math.PI / 2 + 0.2, 0, side * a);
        tmpQ.setFromEuler(tmpE);
        m.compose(tmpV.set(0, 0.35, 0), tmpQ, tmpS.set(side, 1, 1));
      };
      return [
        { geometry: cap(0.14, 0.4), material: body, anim: at(0, 0.35, 0, Math.PI / 2) },
        { geometry: wing, material: wingMat, anim: flap(-1) },
        { geometry: wing, material: wingMat, anim: flap(1) },
        { geometry: s(0.045), material: glowEyes(0xffd24a), anim: at(-0.07, 0.4, -0.32) },
        { geometry: s(0.045), material: glowEyes(0xffd24a), anim: at(0.07, 0.4, -0.32) },
      ];
    }
    default: {
      // Felted Brute: a huge boiled-wool bear-thing with patched seams.
      const fur = knit(0x3e5a3a, 'felt', [TAU * 0.9, 3], 0.7);
      const patch = knit(0xa87a4a, 'garter', [TAU * 0.3, 1], 1);
      const armSwing = (side: number): Anim => (m, phase) => {
        tmpE.set(-Math.sin(phase) * 0.35 * side - 0.2, 0, side * 0.35);
        tmpQ.setFromEuler(tmpE);
        m.compose(tmpV.set(side * 0.95, 1.95, 0), tmpQ, tmpS.set(1, 1, 1));
        m.multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0));
      };
      const legSwing = (side: number): Anim => (m, phase) => {
        tmpE.set(Math.sin(phase) * 0.4 * side, 0, 0);
        tmpQ.setFromEuler(tmpE);
        m.compose(tmpV.set(side * 0.42, 0.75, 0), tmpQ, tmpS.set(1, 1, 1));
        m.multiply(new THREE.Matrix4().makeTranslation(0, -0.38, 0));
      };
      return [
        { geometry: s(0.9), material: fur, anim: (m, phase) => at(0, 1.55 + Math.abs(Math.sin(phase)) * 0.06, 0, 0, 0, 0, 1, 1.05, 0.85)(m, phase, 0, null!) },
        { geometry: s(0.45), material: fur, anim: (m, phase) => at(0, 2.45 + Math.abs(Math.sin(phase)) * 0.06, -0.2)(m, phase, 0, null!) },
        { geometry: s(0.32), material: patch, anim: at(0.35, 1.7, -0.62, 0, 0.5, 0, 1, 1, 0.4) },
        { geometry: s(0.07), material: glowEyes(0xff8a2a), anim: (m, phase) => at(-0.16, 2.52 + Math.abs(Math.sin(phase)) * 0.06, -0.6)(m, phase, 0, null!) },
        { geometry: s(0.07), material: glowEyes(0xff8a2a), anim: (m, phase) => at(0.16, 2.52 + Math.abs(Math.sin(phase)) * 0.06, -0.6)(m, phase, 0, null!) },
        { geometry: cap(0.22, 0.7), material: fur, anim: armSwing(-1) },
        { geometry: cap(0.22, 0.7), material: fur, anim: armSwing(1) },
        { geometry: cap(0.26, 0.4), material: fur, anim: legSwing(-1) },
        { geometry: cap(0.26, 0.4), material: fur, anim: legSwing(1) },
      ];
    }
  }
}

export class EnemyRenderer {
  private meshes: { type: number; mesh: THREE.InstancedMesh; part: Part }[] = [];
  private bars: THREE.InstancedMesh;
  private readonly root = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly out = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    for (const type of [EnemyType.Grunt, EnemyType.Scuttler, EnemyType.Moth, EnemyType.Brute]) {
      for (const part of partsFor(type)) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, MAX_PER_TYPE);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        this.meshes.push({ type, mesh, part });
      }
    }
    // Billboarded health bars (only drawn for damaged enemies).
    const barMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float health;
        varying float vHealth;
        varying vec2 vUv;
        void main() {
          vHealth = health;
          vUv = uv;
          vec4 centre = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
          centre.xy += position.xy * vec2( 0.9, 0.09 );
          gl_Position = projectionMatrix * centre;
        }`,
      fragmentShader: /* glsl */ `
        varying float vHealth;
        varying vec2 vUv;
        void main() {
          vec3 col = vUv.x < vHealth ? mix( vec3( 0.9, 0.15, 0.1 ), vec3( 0.55, 0.85, 0.25 ), vHealth ) : vec3( 0.12 );
          gl_FragColor = vec4( col, 0.9 );
        }`,
      transparent: true,
      depthWrite: false,
    });
    const barGeo = new THREE.PlaneGeometry(1, 1);
    barGeo.setAttribute('health', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_TYPE * 4), 1));
    this.bars = new THREE.InstancedMesh(barGeo, barMat, MAX_PER_TYPE * 4);
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.renderOrder = 20;
    scene.add(this.bars);
  }

  update(list: EnemyView[], t: number): void {
    const counts = new Map<number, number>();
    const byType = new Map<number, EnemyView[]>();
    for (const e of list) {
      if (!byType.has(e.type)) byType.set(e.type, []);
      byType.get(e.type)!.push(e);
    }
    for (const { type, mesh, part } of this.meshes) {
      const es = byType.get(type) ?? [];
      const n = Math.min(es.length, MAX_PER_TYPE);
      for (let i = 0; i < n; i++) {
        const e = es[i];
        // Hit squash: a quick soft wobble when struck.
        const squash = e.hitAge < 0.15 ? 1 - (0.15 - e.hitAge) * 1.2 : 1;
        tmpE.set(0, e.yaw, 0);
        tmpQ.setFromEuler(tmpE);
        this.root.compose(tmpV.set(e.x, e.y, e.z), tmpQ, tmpS.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash)));
        part.anim(this.local, e.phase, t, e);
        this.out.multiplyMatrices(this.root, this.local);
        mesh.setMatrixAt(i, this.out);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      counts.set(type, n);
    }
    // Health bars above damaged enemies.
    const healthAttr = this.bars.geometry.getAttribute('health') as THREE.InstancedBufferAttribute;
    let b = 0;
    for (const e of list) {
      if (e.health >= 0.999 || b >= MAX_PER_TYPE * 4) continue;
      this.out.makeTranslation(e.x, e.y + ENEMIES[e.type].height + 0.35, e.z);
      this.bars.setMatrixAt(b, this.out);
      healthAttr.setX(b, e.health);
      b++;
    }
    this.bars.count = b;
    this.bars.instanceMatrix.needsUpdate = true;
    healthAttr.needsUpdate = true;
  }
}
