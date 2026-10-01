import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld } from '@stitchstrike/shared';
import { bruteOptions, figureTemplate, grumbleOptions, gruntOptions, heldBlaster, heroOptions, spawnFigure } from '../figures/cast.ts';
import { createMoth, createScuttler, poseMoth, poseScuttler, type CreatureInstance } from '../figures/creatures.ts';
import { poseHumanoid, type HumanoidOptions } from '../figures/humanoid.ts';
import { addSkinnedShells, type FigureInstance } from '../figures/rig.ts';
import { QUALITY_LAYERS, setWoolLayers, updateShellLod } from '../wool/woolMaterial.ts';
import { CoopProps } from './coopProps.ts';
import { createPost, type Post } from './post.ts';
import { buildWoolGarden } from './woolGarden.ts';

/**
 * The main menu's living background: a knitted squad holds Heartspool B in
 * the Back Garden while Grunts, a Felted Brute, Scuttlers and Moths push in
 * through the hedge. A virtual camera cuts between six shots with dollies,
 * cranes and an orbit, shallow depth of field, letterboxing and dips to black.
 */

export interface Cinematic {
  /** Advance and render one frame. */
  frame(t: number, dt: number): void;
  setSize(w: number, h: number): void;
  /** Horizontal framing offset in [-0.5, 0.5] of the width (shifts subjects right for the menu). */
  setOffset(x: number): void;
  /** 0..1 black dip between shots. */
  fade: number;
  shotName: string;
}

type V = [number, number, number];
interface Shot {
  name: string;
  dur: number;
  fov: number;
  from: V; to: V;
  lookFrom: V; lookTo: V;
  /** Point to keep in focus (defaults to the look target). */
  focus?: V;
  /** Orbit around lookFrom instead of dollying: [radius, height, angle0, angle1]. */
  orbit?: [number, number, number, number];
  /** Track the Brute: camera offset from it (start, end) and look height. */
  follow?: { from: V; to: V; lookY: number };
  aperture?: number;
}

const HERO_SPOTS: { opts: () => HumanoidOptions; pos: V; aim: V; crouch?: number; gun: number; shells?: boolean }[] = [
  { opts: () => grumbleOptions('hero'), pos: [0.5, 0, 5.2], aim: [-4, 1, 30], gun: 0x8bcb3a, shells: true },
  { opts: () => heroOptions(0x3a5da8, 1), pos: [2.9, 0, 4.4], aim: [-1, 1, 30], gun: 0xe8742a },
  { opts: () => heroOptions(0x8bcb3a, 2), pos: [-2.1, 0, 4.3], aim: [-8, 0.8, 28], crouch: 1, gun: 0xd8262e },
  { opts: () => heroOptions(0xb46fd6, 3), pos: [5.8, 0, 3], aim: [22, 0.6, 20], gun: 0x6fd6ff },
];

const SHOTS: Shot[] = [
  { name: 'Establishing', dur: 8, fov: 42, from: [-18, 3.5, 22], to: [-8, 12, 25], lookFrom: [4, 1, 6], lookTo: [3, 0.6, 12] },
  { name: 'The squad', dur: 7, fov: 32, from: [-1.4, 0.5, 11.5], to: [0.1, 0.75, 9.2], lookFrom: [0.8, 1.15, 5.2], lookTo: [0.6, 1.2, 5.2], focus: [0.5, 1.2, 5.2], aperture: 0.0016 },
  { name: 'Over the shoulder', dur: 7, fov: 38, from: [0.9, 1.75, 2.9], to: [0.6, 1.6, 3.6], lookFrom: [-6.5, 1, 24], lookTo: [-6, 1, 21], focus: [-5, 1, 19], aperture: 0.0008 },
  { name: 'The Felted Brute', dur: 7, fov: 40, from: [0, 0, 0], to: [0, 0, 0], lookFrom: [0, 0, 0], lookTo: [0, 0, 0], follow: { from: [-3.2, 0.6, -4.2], to: [-1.6, 1.1, -3.4], lookY: 2 }, aperture: 0.0014 },
  { name: 'Grumble', dur: 8, fov: 28, from: [0, 0, 0], to: [0, 0, 0], lookFrom: [0.5, 1.22, 5.2], lookTo: [0.5, 1.22, 5.2], orbit: [2.4, 1.35, 2.5, 3.5], aperture: 0.0022 },
  { name: 'From the treehouse', dur: 8, fov: 40, from: [-24, 15.5, 7], to: [-19, 14, 13], lookFrom: [3, 1, 10], lookTo: [4, 1, 14] },
];
const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);
const FADE = 0.55;

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp3 = (a: V, b: V, k: number, out: THREE.Vector3) => out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
/** Figures face -z; this yaw turns one to face (dx, dz). */
const faceYaw = (dx: number, dz: number) => Math.atan2(-dx, -dz);

interface Walker {
  f: FigureInstance;
  gun?: THREE.Group;
  from: V; to: V;
  speed: number;
  s: number;
  phase: number;
  hp: number;
  maxHp: number;
  down: number;
  scale: number;
  hunch: number;
  /** Position locked to the cinematic clock (s = t * speed + s0), so shots can rely on it. */
  sync?: number;
}

interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; target: Walker | null; live: boolean }
interface Puff { mesh: THREE.InstancedMesh; t: number; live: boolean; dirs: THREE.Vector3[]; at: THREE.Vector3 }

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function buildCinematic(
  renderer: THREE.WebGLRenderer,
  quality: 'low' | 'medium' | 'high',
  progress: (k: number, label: string) => void,
): Promise<Cinematic> {
  setWoolLayers(QUALITY_LAYERS[quality === 'low' ? 'low' : 'medium']);
  const world = createWorld('garden');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2d9b0);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  progress(0.05, 'Knitting the garden');
  await nextFrame();
  const garden = buildWoolGarden(scene, world, quality);
  const props = new CoopProps(scene, world);
  progress(0.35, 'Sculpting the squad');
  await nextFrame();

  // ---------------------------------------------------------------- the squad
  const heroes: { f: FigureInstance; gun: THREE.Group; aim: THREE.Vector3; crouch: number; pos: V }[] = [];
  for (const [i, h] of HERO_SPOTS.entries()) {
    const o = h.opts();
    const f = spawnFigure(o);
    if (h.shells && quality !== 'low') addSkinnedShells(f, figureTemplate(o).def, 6);
    f.root.position.set(...h.pos);
    f.root.rotation.y = faceYaw(h.aim[0] - h.pos[0], h.aim[2] - h.pos[2]);
    const gun = heldBlaster(h.gun, false, o.scale ?? 1);
    f.root.add(gun);
    scene.add(f.root);
    heroes.push({ f, gun, aim: new THREE.Vector3(...h.aim), crouch: h.crouch ?? 0, pos: h.pos });
    progress(0.35 + 0.1 * (i + 1), 'Sculpting the squad');
    await nextFrame();
  }

  // ---------------------------------------------------------------- the invaders
  progress(0.8, 'Mass-knitting the invaders');
  await nextFrame();
  const walkers: Walker[] = [];
  for (let i = 0; i < 6; i++) {
    const f = spawnFigure(gruntOptions());
    const gun = heldBlaster(0x3a4a34, true);
    f.root.add(gun);
    scene.add(f.root);
    const lane = -4 + (i % 3 - 1) * 2.1;
    walkers.push({ f, gun, from: [lane, 0, 42], to: [lane + 1.5, 0, 10], speed: 1.35, s: (i / 6) * 31, phase: i, hp: 3, maxHp: 3, down: 0, scale: 1, hunch: 0 });
  }
  const bo = bruteOptions();
  const brute = spawnFigure(bo);
  scene.add(brute.root);
  const brutePath = SHOTS.reduce((s, x) => s + x.dur, 0) * 0.8;
  walkers.push({ f: brute, from: [-4.5, 0, 44], to: [-4.5 + 1.3, 0, 44 - brutePath], speed: 0.8, s: 0, phase: 0, hp: 1e9, maxHp: 1e9, down: 0, scale: bo.scale ?? 1, hunch: 0.35, sync: 9 });
  const moths: CreatureInstance[] = [];
  for (let i = 0; i < 3; i++) { const m = createMoth(); scene.add(m.root); moths.push(m); }
  const scuttlers: { c: CreatureInstance; s: number }[] = [];
  for (let i = 0; i < 3; i++) { const c = createScuttler(); scene.add(c.root); scuttlers.push({ c, s: i * 9 }); }
  progress(0.95, 'Threading the needle');
  await nextFrame();

  // ---------------------------------------------------------------- pom-pom fire
  const tracerGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const tracers: Tracer[] = heroes.map((_h, i) => ({
    mesh: new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(HERO_SPOTS[i].gun).multiplyScalar(2.2) })),
    from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, target: null, live: false,
  })).flatMap((t) => [t, { ...t, mesh: t.mesh.clone(), from: new THREE.Vector3(), to: new THREE.Vector3() }]);
  for (const tr of tracers) { tr.mesh.visible = false; scene.add(tr.mesh); }
  const puffGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const puffs: Puff[] = Array.from({ length: 6 }, () => {
    const mesh = new THREE.InstancedMesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true }), 10);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, t: 0, live: false, dirs: Array.from({ length: 10 }, () => new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize()), at: new THREE.Vector3() };
  });
  const flash = new THREE.PointLight(0xffc070, 0, 4, 2);
  scene.add(flash);
  let nextShot = 0.8;

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 900);
  let post: Post | null = null;
  if (quality !== 'low') post = createPost(renderer, scene, camera, { ao: false, dof: true, bloomStrength: 0.18, vignette: 0.35, grain: 0.03, focus: 6, aperture: 0.0008, maxBlur: 0.006 });
  let offset = 0;
  let offsetTarget = 0;
  let size = new THREE.Vector2(innerWidth, innerHeight);
  const applyOffset = () => {
    if (Math.abs(offset) < 1e-3) camera.clearViewOffset();
    else camera.setViewOffset(size.x, size.y, -offset * size.x, 0, size.x, size.y);
  };

  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const cin: Cinematic = {
    fade: 0,
    shotName: SHOTS[0].name,
    setSize(w, h) {
      size = new THREE.Vector2(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      post?.setSize(w, h);
      applyOffset();
    },
    setOffset(x) { offsetTarget = x; },
    frame(t, dt) {
      // ---- camera: which shot, how far through it
      let local = t % TOTAL;
      let shot = SHOTS[0];
      for (const s of SHOTS) { if (local < s.dur) { shot = s; break; } local -= s.dur; }
      const k = ease(local / shot.dur);
      cin.shotName = shot.name;
      cin.fade = Math.max(0, 1 - local / FADE, 1 - (shot.dur - local) / FADE);
      const brute = walkers[walkers.length - 1].f.root;
      if (shot.follow) {
        const fo = shot.follow;
        lerp3(fo.from, fo.to, k, camera.position).add(brute.position);
        look.copy(brute.position).setY(fo.lookY);
      } else if (shot.orbit) {
        const [r, hgt, a0, a1] = shot.orbit;
        const a = a0 + (a1 - a0) * k;
        camera.position.set(shot.lookFrom[0] + Math.sin(a) * r, hgt, shot.lookFrom[2] - Math.cos(a) * r);
        look.set(...shot.lookFrom);
      } else {
        lerp3(shot.from, shot.to, k, camera.position);
        lerp3(shot.lookFrom, shot.lookTo, k, look);
      }
      // A little handheld breathing.
      camera.position.y += Math.sin(t * 1.3) * 0.02;
      camera.position.x += Math.sin(t * 0.9) * 0.015;
      camera.lookAt(look);
      if (camera.fov !== shot.fov) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
      offset += (offsetTarget - offset) * Math.min(1, dt * 3);
      applyOffset();
      if (post) {
        post.settings.focus = shot.follow ? camera.position.distanceTo(look) : camera.position.distanceTo(tmp.set(...(shot.focus ?? (shot.orbit ? shot.lookFrom : [look.x, look.y, look.z] as V))));
        post.settings.aperture = shot.aperture ?? 0.0004;
        post.apply();
      }

      // ---- invaders advance; downed ones get back up at the hedge
      for (const w of walkers) {
        const len = Math.hypot(w.to[0] - w.from[0], w.to[2] - w.from[2]);
        if (w.down > 0) {
          w.down += dt;
          if (w.down > 2.6) { w.down = 0; w.hp = w.maxHp; w.s = 0; }
        } else if (w.sync !== undefined) {
          w.s = (t * w.speed + w.sync) % len;
          w.phase = w.s * 4.2;
        } else {
          w.s += w.speed * dt;
          w.phase += w.speed * dt * 4.2;
          if (w.s > len) w.s = 0;
        }
        const u = w.s / len;
        w.f.root.position.set(w.from[0] + (w.to[0] - w.from[0]) * u, 0, w.from[2] + (w.to[2] - w.from[2]) * u);
        w.f.root.rotation.y = faceYaw(w.to[0] - w.from[0], w.to[2] - w.from[2]);
        w.f.root.visible = w.down < 2.3 && w.s > 0.2;
        poseHumanoid(w.f, {
          t, speed: w.down > 0 ? 0 : 0.42 * (w.speed / 1.35), phase: w.phase, pitch: -0.05, crouch: 0, airborne: false,
          aiming: !!w.gun && w.down === 0, hunch: w.hunch, downed: Math.min(1, w.down * 2.5),
        }, w.scale, w.gun);
        if (w.gun) w.gun.visible = w.down === 0;
      }
      moths.forEach((m, i) => {
        const a = t * 0.55 + (i * Math.PI * 2) / 3;
        m.root.position.set(-3 + Math.cos(a) * 5, 3.2 + Math.sin(t * 1.7 + i) * 0.6, 20 + Math.sin(a) * 4);
        m.root.rotation.y = -a;
        poseMoth(m, t, i);
      });
      for (const sc of scuttlers) {
        sc.s = (sc.s + dt * 3.2) % 30;
        const u = sc.s / 30;
        sc.c.root.position.set(28 - 11 * u + Math.sin(sc.s) * 0.6, 0, 34 - 29 * u);
        sc.c.root.rotation.y = faceYaw(-11, -29);
        poseScuttler(sc.c, t, sc.s * 5, 1);
      }

      // ---- the squad tracks the nearest Grunt and fires pom-poms
      for (const h of heroes) {
        let best: Walker | null = null;
        let bestD = 26;
        for (const w of walkers) {
          if (w.down > 0 || !w.f.root.visible) continue;
          const d = h.f.root.position.distanceTo(w.f.root.position);
          if (d < bestD) { bestD = d; best = w; }
        }
        const target = best ? tmp.copy(best.f.root.position).setY(1) : h.aim;
        const dx = target.x - h.pos[0], dz = target.z - h.pos[2];
        const want = faceYaw(dx, dz);
        let dy = want - h.f.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        h.f.root.rotation.y += dy * Math.min(1, dt * 4);
        const pitch = Math.atan2(target.y - 1.2, Math.hypot(dx, dz));
        poseHumanoid(h.f, { t, speed: 0, phase: 0, pitch, crouch: h.crouch, airborne: false, aiming: true }, 1, h.gun);
      }
      nextShot -= dt;
      if (nextShot <= 0) {
        nextShot = 0.25 + Math.random() * 0.45;
        const hi = Math.floor(Math.random() * heroes.length);
        const h = heroes[hi];
        const tr = tracers.find((x, i) => !x.live && Math.floor(i / 2) === hi);
        const targets = walkers.filter((w) => w.down === 0 && w.f.root.visible && w.f.root.position.distanceTo(h.f.root.position) < 26);
        if (tr && targets.length) {
          const w = targets[Math.floor(Math.random() * targets.length)];
          h.gun.updateMatrixWorld();
          h.gun.localToWorld(muzzle.set(0, 0, -0.22));
          tr.from.copy(muzzle);
          tr.to.copy(w.f.root.position).setY(0.8 + Math.random() * 0.5 * w.scale);
          tr.t = 0;
          tr.target = w;
          tr.live = true;
          tr.mesh.visible = true;
          flash.position.copy(muzzle);
          flash.intensity = 6;
        }
      }
      flash.intensity *= Math.exp(-dt * 25);
      for (const tr of tracers) {
        if (!tr.live) continue;
        tr.t += dt / Math.max(0.12, tr.from.distanceTo(tr.to) / 38);
        tr.mesh.position.lerpVectors(tr.from, tr.to, Math.min(1, tr.t));
        tr.mesh.position.y += Math.sin(Math.min(1, tr.t) * Math.PI) * 0.25;
        if (tr.t >= 1) {
          tr.live = false;
          tr.mesh.visible = false;
          const p = puffs.find((x) => !x.live);
          if (p) { p.live = true; p.t = 0; p.at.copy(tr.to); p.mesh.visible = true; }
          if (tr.target && tr.target.down === 0 && --tr.target.hp <= 0) tr.target.down = 0.0001;
        }
      }
      for (const p of puffs) {
        if (!p.live) continue;
        p.t += dt;
        const k2 = p.t / 0.45;
        p.dirs.forEach((d, i) => {
          tmp.copy(d).multiplyScalar(k2 * 0.6).add(p.at);
          m4.makeScale(1 - k2 * 0.7, 1 - k2 * 0.7, 1 - k2 * 0.7).setPosition(tmp);
          p.mesh.setMatrixAt(i, m4);
        });
        p.mesh.instanceMatrix.needsUpdate = true;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k2;
        if (k2 >= 1) { p.live = false; p.mesh.visible = false; }
      }

      props.update(null, t, -1, () => null);
      garden.update(t, camera);
      updateShellLod(camera);
      if (post) post.render(t);
      else renderer.render(scene, camera);
    },
  };
  progress(1, 'Ready');
  return cin;
}
