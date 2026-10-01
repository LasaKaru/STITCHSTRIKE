import * as THREE from 'three';
import { ENEMIES, EnemyType } from '@stitchstrike/shared';
import { bruteOptions, gruntOptions, heldBlaster, spawnFigure } from '../figures/cast.ts';
import { createMoth, createScuttler, poseMoth, poseScuttler } from '../figures/creatures.ts';
import { beatDrum, createBoss, createDrone, createDrummer, createJack, createSnip, createTeeth, createTop, poseDrone, poseJack, poseSnip, poseTeeth, poseTop, soldierOptions } from '../figures/invaders.ts';
import { poseHumanoid } from '../figures/humanoid.ts';
import { createPlane, createYoYo, posePlane, poseYoYo } from '../figures/paperToys.ts';
import { createPtero, createRaptor, createRex, createTrike, posePtero, poseTheropod, poseTrike, REX_SCALE } from '../figures/dinos.ts';
import type { FigureInstance } from '../figures/rig.ts';

/**
 * Enemies as sculpted, rigged knitted figures, pooled per type: acrylic
 * soldier Grunts with knitted rifles, hulking felted Brutes, jointed crochet
 * spiders and felt moths, each animated from its own movement.
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
  /** Ground speed relative to the type's top speed. */
  speed: number;
  /** Seconds since last hit, for a wobble. */
  hitAge: number;
}

interface Pooled {
  root: THREE.Group;
  body: THREE.Group;
  figure: FigureInstance;
  gun?: THREE.Object3D;
  type: number;
  /** Jack-in-the-Box: seconds since it last sprang. */
  popAge: number;
  /** Distance LOD: a cheap knitted stand-in used far from the camera. */
  proxy?: THREE.Mesh;
  far: boolean;
}

/** Beyond this distance invaders are drawn as proxies and not posed; they come back a little closer (hysteresis). */
export const LOD_FAR = 38;
const LOD_NEAR = 33;
/** Stand-in colours per type (body yarn). */
const PROXY_COLORS = [0x3a4a34, 0x6a3c9a, 0xb8a58a, 0x7a4a2e, 0xf6f1e4, 0x2f7fe0, 0x2f5a9a, 0x2a2a30, 0xe8742a, 0x8a5a3a, 0xb3262c, 0xffc94a,
  0x5f9e4a, 0x4a8a9a, 0x7a4a8a, 0x8a5a3a, 0xfbf7ec, 0xd8262e];

const MAX_BARS = 128;

export class EnemyRenderer {
  private live = new Map<number, Pooled>();
  private free = new Map<number, Pooled[]>();
  private bars: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private lastT = 0;
  private proxyGeo = new THREE.SphereGeometry(0.5, 10, 8);
  private proxyMats = new Map<number, THREE.Material>();
  /** Camera positions for distance LOD (split-screen has several; empty = always full detail). */
  lodFrom: THREE.Vector3[] = [];
  /** How many invaders were fully posed last frame (for the perf overlay). */
  posed = 0;

  private proxyFor(p: Pooled): THREE.Mesh {
    if (!p.proxy) {
      let mat = this.proxyMats.get(p.type);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: PROXY_COLORS[p.type] ?? 0x888888, roughness: 0.95 });
        this.proxyMats.set(p.type, mat);
      }
      const def = ENEMIES[p.type];
      const m = new THREE.Mesh(this.proxyGeo, mat);
      m.scale.set(def.radius * 2, def.height, def.radius * 2);
      m.position.y = def.height * 0.5;
      m.castShadow = true;
      m.visible = false;
      p.root.add(m);
      p.proxy = m;
    }
    return p.proxy;
  }

  /** `health` = bar colours [empty, full] (swapped for colour-blind palettes). */
  constructor(private scene: THREE.Scene, health: [number, number] = [0xe6261a, 0x8cd940]) {
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
        uniform vec3 lowColor;
        uniform vec3 highColor;
        varying float vHealth;
        varying vec2 vUv;
        void main() {
          vec3 col = vUv.x < vHealth ? mix( lowColor, highColor, vHealth ) : vec3( 0.12 );
          gl_FragColor = vec4( col, 0.9 );
        }`,
      uniforms: { lowColor: { value: new THREE.Color(health[0]) }, highColor: { value: new THREE.Color(health[1]) } },
      transparent: true,
      depthWrite: false,
    });
    const barGeo = new THREE.PlaneGeometry(1, 1);
    barGeo.setAttribute('health', new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS), 1));
    this.bars = new THREE.InstancedMesh(barGeo, barMat, MAX_BARS);
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.renderOrder = 20;
    scene.add(this.bars);
    // Knit the common templates up front so the first waves don't hitch (the boss knits on arrival).
    for (const type of [EnemyType.Grunt, EnemyType.Scuttler, EnemyType.Moth, EnemyType.Brute, EnemyType.Teeth, EnemyType.Top, EnemyType.Soldier, EnemyType.Drone, EnemyType.Snip, EnemyType.Drummer, EnemyType.Jack]) this.release(this.make(type));
  }

  private make(type: number): Pooled {
    let figure: FigureInstance;
    let gun: THREE.Object3D | undefined;
    if (type === EnemyType.Grunt) {
      figure = spawnFigure(gruntOptions());
      gun = heldBlaster(0x3a4a34, true);
      figure.root.add(gun);
    } else if (type === EnemyType.Brute) {
      figure = spawnFigure(bruteOptions());
    } else if (type === EnemyType.Scuttler) {
      figure = createScuttler();
    } else if (type === EnemyType.Moth) {
      figure = createMoth();
    } else if (type === EnemyType.Teeth) {
      figure = createTeeth();
    } else if (type === EnemyType.Top) {
      figure = createTop();
    } else if (type === EnemyType.Soldier) {
      figure = spawnFigure(soldierOptions());
      gun = heldBlaster(0x6a6a74, true, 0.9);
      figure.root.add(gun);
    } else if (type === EnemyType.Drone) {
      figure = createDrone();
    } else if (type === EnemyType.Snip) {
      figure = createSnip();
    } else if (type === EnemyType.Drummer) {
      figure = createDrummer();
    } else if (type === EnemyType.Jack) {
      figure = createJack();
    } else if (type === EnemyType.Raptor) {
      figure = createRaptor();
    } else if (type === EnemyType.Trike) {
      figure = createTrike();
    } else if (type === EnemyType.Ptero) {
      figure = createPtero();
    } else if (type === EnemyType.Rex) {
      figure = createRex();
    } else if (type === EnemyType.Plane) {
      figure = createPlane();
    } else if (type === EnemyType.YoYo) {
      figure = createYoYo();
    } else {
      figure = createBoss();
    }
    const body = new THREE.Group();
    body.add(figure.root);
    if (type === EnemyType.Moth) figure.root.position.y = -0.35;
    if (type === EnemyType.Ptero) figure.root.position.y = -0.4;
    const root = new THREE.Group();
    root.add(body);
    return { root, body, figure, gun, type, popAge: 9, far: false };
  }

  private acquire(type: number): Pooled {
    const list = this.free.get(type);
    const p = list?.pop() ?? this.make(type);
    this.scene.add(p.root);
    return p;
  }

  private release(p: Pooled): void {
    this.scene.remove(p.root);
    if (!this.free.has(p.type)) this.free.set(p.type, []);
    this.free.get(p.type)!.push(p);
  }

  /** A dinosaur set piece near here (raptor leap, trike charge, Rex roar): animate the nearest one. */
  dinoNear(type: number, x: number, z: number): void {
    let best: Pooled | null = null;
    let bestD = type === EnemyType.Rex ? 6 : 3;
    for (const p of this.live.values()) {
      if (p.type !== type) continue;
      const d = Math.hypot(p.root.position.x - x, p.root.position.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) best.popAge = 0;
  }

  /** A Jack-in-the-Box sprang near here: shoot the nearest one's clown out. */
  popNear(x: number, z: number): void {
    let best: Pooled | null = null;
    let bestD = 3;
    for (const p of this.live.values()) {
      if (p.type !== EnemyType.Jack) continue;
      const d = Math.hypot(p.root.position.x - x, p.root.position.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) best.popAge = 0;
  }

  update(list: EnemyView[], t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.posed = 0;
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let p = this.live.get(e.id);
      if (!p || p.type !== e.type) {
        if (p) this.release(p);
        p = this.acquire(e.type);
        this.live.set(e.id, p);
      }
      p.root.position.set(e.x, e.y, e.z);
      p.root.rotation.y = e.yaw;
      if (this.lodFrom.length) {
        let d = Infinity;
        for (const c of this.lodFrom) d = Math.min(d, c.distanceTo(p.root.position));
        // The boss is always drawn in full: it is the whole point of the wave.
        p.far = !ENEMIES[e.type].boss && (p.far ? d > LOD_NEAR : d > LOD_FAR);
      } else {
        p.far = false;
      }
      p.body.visible = !p.far;
      if (p.far) {
        const proxy = this.proxyFor(p);
        proxy.visible = true;
        // A little bob so distant crowds still read as walking.
        proxy.position.y = ENEMIES[e.type].height * 0.5 + Math.abs(Math.sin(e.phase * 2)) * 0.05;
        continue;
      }
      if (p.proxy) p.proxy.visible = false;
      this.posed++;
      // Soft wobble when struck: wool squashes instead of cracking.
      const w = e.hitAge < 0.18 ? Math.sin(e.hitAge * 40) * (0.18 - e.hitAge) * 0.8 : 0;
      p.body.scale.set(1 + w, 1 - w, 1 + w);
      const speed = Math.min(1.3, e.speed);
      switch (e.type) {
        case EnemyType.Grunt:
          poseHumanoid(p.figure, { t: t + e.id, speed, phase: e.phase, pitch: 0, crouch: 0, airborne: false, aiming: true }, 1, p.gun);
          break;
        case EnemyType.Brute:
          poseHumanoid(p.figure, { t: t + e.id, speed: speed * 0.8, phase: e.phase, pitch: 0, crouch: 0, airborne: false, aiming: false, hunch: 0.35 }, 1.62);
          break;
        case EnemyType.Scuttler:
          poseScuttler(p.figure, t, e.phase * 1.6, Math.max(0.15, speed));
          break;
        case EnemyType.Moth:
          poseMoth(p.figure, t, e.id);
          break;
        case EnemyType.Teeth:
          poseTeeth(p.figure, t + e.id, e.phase * 1.5, Math.max(0.2, speed));
          break;
        case EnemyType.Top:
          poseTop(p.figure, t, e.id);
          break;
        case EnemyType.Soldier:
          // Tin soldiers stand and aim when they have a target (stopped), else march.
          poseHumanoid(p.figure, { t: t + e.id, speed, phase: e.phase, pitch: -0.05, crouch: speed < 0.1 ? 0.5 : 0, airborne: false, aiming: true }, 0.9, p.gun);
          break;
        case EnemyType.Drone:
          poseDrone(p.figure, t + e.id, speed, 0);
          break;
        case EnemyType.Snip:
          poseSnip(p.figure, t + e.id, e.phase * 1.4, Math.max(0.2, speed), speed < 0.1);
          break;
        case EnemyType.Drummer:
          poseHumanoid(p.figure, { t: t + e.id, speed: speed * 0.9, phase: e.phase, pitch: 0, crouch: 0, airborne: false, aiming: false }, 0.95);
          beatDrum(p.figure, t + e.id * 0.3);
          break;
        case EnemyType.Jack:
          p.popAge += dt;
          poseJack(p.figure, t + e.id, e.phase * 1.2, Math.max(0.2, speed), Math.max(0, 1 - p.popAge / 1.2));
          break;
        case EnemyType.Raptor:
          p.popAge += dt;
          poseTheropod(p.figure, t + e.id, e.phase * 1.3, Math.max(0.15, speed), Math.max(0, 1 - p.popAge / 0.6));
          break;
        case EnemyType.Rex: {
          p.popAge += dt;
          // A roar: rear up, jaws wide, hold it, then back down.
          const roar = p.popAge < 2.2 ? Math.min(1, p.popAge * 4, (2.2 - p.popAge) * 2) : 0;
          poseTheropod(p.figure, t, e.phase / REX_SCALE * 1.6, Math.max(0.15, speed), roar, REX_SCALE);
          break;
        }
        case EnemyType.Trike:
          p.popAge += dt;
          poseTrike(p.figure, t + e.id, e.phase * 0.9, Math.max(0.15, speed), p.popAge < 1.8 ? 1 : 0);
          break;
        case EnemyType.Plane:
          posePlane(p.figure, t, e.id, Math.max(0, Math.min(1, (3.5 - e.y) / 2.5)));
          break;
        case EnemyType.YoYo:
          p.popAge += dt;
          poseHumanoid(p.figure, { t: t + e.id, speed, phase: e.phase, pitch: 0, crouch: 0, airborne: false, aiming: false }, 0.95);
          poseYoYo(p.figure, t + e.id, Math.max(0, 1 - p.popAge / 0.5));
          break;
        case EnemyType.Ptero:
          posePtero(p.figure, t, e.id, Math.max(0, Math.min(1, (5 - e.y) / 3.5)));
          break;
        default:
          poseHumanoid(p.figure, { t: t + e.id, speed: speed * 0.7, phase: e.phase, pitch: 0, crouch: 0, airborne: false, aiming: false, hunch: 0.25 }, 3.05);
      }
    }
    for (const [id, p] of this.live) {
      if (!seen.has(id)) { this.release(p); this.live.delete(id); }
    }

    // Health bars above damaged enemies.
    const healthAttr = this.bars.geometry.getAttribute('health') as THREE.InstancedBufferAttribute;
    let b = 0;
    for (const e of list) {
      if (e.health >= 0.999 || b >= MAX_BARS) continue;
      this.m.makeTranslation(e.x, e.y + ENEMIES[e.type].height + 0.35, e.z);
      this.bars.setMatrixAt(b, this.m);
      healthAttr.setX(b, e.health);
      b++;
    }
    this.bars.count = b;
    this.bars.instanceMatrix.needsUpdate = true;
    healthAttr.needsUpdate = true;
  }
}
