import * as THREE from 'three';
import { ENEMIES, EnemyType } from '@stitchstrike/shared';
import { bruteOptions, gruntOptions, heldBlaster, spawnFigure } from '../figures/cast.ts';
import { createMoth, createScuttler, poseMoth, poseScuttler } from '../figures/creatures.ts';
import { beatDrum, createBoss, createDrone, createDrummer, createJack, createSnip, createTeeth, createTop, poseDrone, poseJack, poseSnip, poseTeeth, poseTop, soldierOptions } from '../figures/invaders.ts';
import { poseHumanoid } from '../figures/humanoid.ts';
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
}

const MAX_BARS = 128;

export class EnemyRenderer {
  private live = new Map<number, Pooled>();
  private free = new Map<number, Pooled[]>();
  private bars: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private lastT = 0;

  constructor(private scene: THREE.Scene) {
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
    } else {
      figure = createBoss();
    }
    const body = new THREE.Group();
    body.add(figure.root);
    if (type === EnemyType.Moth) figure.root.position.y = -0.35;
    const root = new THREE.Group();
    root.add(body);
    return { root, body, figure, gun, type, popAge: 9 };
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
