import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { bruteOptions, figureTemplate, grumbleOptions, gruntOptions, heldBlaster, heroOptions, spawnFigure } from './figures/cast.ts';
import { createScuttler, createMoth, poseMoth, poseScuttler, type CreatureInstance } from './figures/creatures.ts';
import { beatDrum, createBoss, createDrone, createDrummer, createJack, createSnip, createTeeth, createTop, poseDrone, poseJack, poseSnip, poseTeeth, poseTop, soldierOptions } from './figures/invaders.ts';
import { createPtero, createRaptor, createRex, createTrike, posePtero, poseTheropod, poseTrike, REX_SCALE } from './figures/dinos.ts';
import { poseEmote } from './figures/emotes.ts';
import { createPlane, createYoYo, posePlane, poseYoYo } from './figures/paperToys.ts';
import { poseHumanoid } from './figures/humanoid.ts';
import { addSkinnedShells, type FigureInstance } from './figures/rig.ts';
import { createPost } from './scene/post.ts';
import { createWoolMaterial, QUALITY_LAYERS, setWoolLayers } from './wool/woolMaterial.ts';

/**
 * Toy Box: every sculpted, rigged, knitted character on a turntable.
 * URL params: ?pose=idle|walk|run|aim  ?focus=all|grumble|grunt|brute|creatures  ?still=1  ?gui=0  ?shells=0
 */

const params = new URLSearchParams(location.search);
const still = params.get('still') === '1';
const focus = params.get('focus') ?? 'all';
setWoolLayers(QUALITY_LAYERS.high);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: still });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b3140);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

// A knitted display table under a warm key light.
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), createWoolMaterial({ color: 0x6a5a4c, pattern: 'garter', uvSize: [1, 1], triplanar: true, gauge: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const key = new THREE.DirectionalLight(0xffe0b8, 3.2);
key.position.set(-3, 6, -4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(0xbcd4ff, 2.2);
rim.position.set(4, 3, 5);
scene.add(key, rim, new THREE.HemisphereLight(0xbfd0ff, 0x6a5040, 0.35));

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

interface Entry { emote?: number; kind: 'human' | 'drummer' | 'jack' | 'scuttler' | 'moth' | 'teeth' | 'top' | 'drone' | 'snip' | 'raptor' | 'rex' | 'trike' | 'ptero' | 'plane' | 'yoyo'; inst: FigureInstance | CreatureInstance; gun?: THREE.Object3D; scale: number; x: number; hunch?: number }
const cast: Entry[] = [];

function addHuman(o: Parameters<typeof spawnFigure>[0], x: number, gunColor?: number, rifle = false, hunch = 0): FigureInstance {
  const f = spawnFigure(o);
  f.root.position.x = x;
  scene.add(f.root);
  let gun: THREE.Object3D | undefined;
  if (gunColor !== undefined) {
    gun = heldBlaster(gunColor, rifle, o.scale ?? 1);
    f.root.add(gun);
  }
  cast.push({ kind: 'human', inst: f, gun, scale: o.scale ?? 1, x, hunch });
  return f;
}

const t0 = performance.now();
if (focus === 'grumble') {
  const f = addHuman(grumbleOptions('hero'), 0, 0x8bcb3a);
  if (params.get('shells') !== '0') addSkinnedShells(f, figureTemplate(grumbleOptions('hero')).def, 8);
} else if (focus === 'grunt') {
  addHuman(gruntOptions(), 0, 0x3a4a34, true);
} else if (focus === 'brute') {
  addHuman(bruteOptions(), 0, undefined, false, 0.35);
} else if (focus === 'creatures') {
  const s = createScuttler(); s.root.position.x = -0.8; scene.add(s.root); cast.push({ kind: 'scuttler', inst: s, scale: 1, x: -0.8 });
  const m = createMoth(); m.root.position.set(0.8, 0.6, 0); scene.add(m.root); cast.push({ kind: 'moth', inst: m, scale: 1, x: 0.8 });
} else if (focus === 'recruits') {
  const d = createDrummer(); d.root.position.x = 0.5; scene.add(d.root); cast.push({ kind: 'drummer', inst: d, scale: 0.95, x: 0.5 });
  const j = createJack(); j.root.position.x = -0.6; scene.add(j.root); cast.push({ kind: 'jack', inst: j, scale: 1, x: -0.6 });
} else if (focus === 'army') {
  // The Mass-Knit Army lined up in front of their boss.
  const boss = createBoss();
  boss.root.position.set(0, 0, 3.2);
  scene.add(boss.root);
  cast.push({ kind: 'human', inst: boss, scale: 3.05, x: 0, hunch: 0.2 });
  addHuman(soldierOptions(), -1.6, 0x6a6a74, true);
  const put = (kind: Entry['kind'], inst: FigureInstance, x: number, y = 0, z = 0) => { inst.root.position.set(x, y, z); scene.add(inst.root); cast.push({ kind, inst, scale: 1, x }); };
  put('teeth', createTeeth(), -0.6, 0, -0.6);
  put('teeth', createTeeth(), -0.25, 0, -0.9);
  put('top', createTop(), 0.55, 0, -0.4);
  put('snip', createSnip(), 1.6, 0, -0.2);
  put('drone', createDrone(), 2.4, 2.6, 0.8);
  cast[cast.length - 1].inst.root.scale.setScalar(1.3);
  put('drummer', createDrummer(), -2.7, 0, 0.3);
  put('jack', createJack(), 0.9, 0, -1.3);
} else if (focus === 'paper') {
  const put = (kind: Entry['kind'], inst: FigureInstance, x: number, y = 0, z = 0) => { inst.root.position.set(x, y, z); scene.add(inst.root); cast.push({ kind, inst, scale: 1, x }); };
  put('yoyo', createYoYo(), -0.5);
  put('plane', createPlane(), 0.9, 1.0, -0.2);
  put('plane', createPlane(), 1.5, 1.4, 0.6);
} else if (focus === 'emotes') {
  // Wave, cheer, dance and bow.
  [-2.1, -0.7, 0.7, 2.1].forEach((x, k) => {
    addHuman(heroOptions([0x3a5da8, 0x8bcb3a, 0xd8262e, 0xe8742a][k], k), x);
    cast[cast.length - 1].emote = k;
  });
} else if (focus === 'dinos') {
  // The Dino Stampede herd, Rex at the back.
  const put = (kind: Entry['kind'], inst: FigureInstance, x: number, y = 0, z = 0, scale = 1) => { inst.root.position.set(x, y, z); scene.add(inst.root); cast.push({ kind, inst, scale, x }); };
  put('rex', createRex(), 0.5, 0, 4.5, REX_SCALE);
  put('trike', createTrike(), 3.2, 0, 0.8);
  put('raptor', createRaptor(), -1.2, 0, -0.6);
  put('raptor', createRaptor(), -2.8, 0, 0.6);
  put('ptero', createPtero(), 1.0, 3.2, 0);
} else {
  addHuman(grumbleOptions('game'), -2.1, 0x8bcb3a);
  addHuman(heroOptions(0x3a5da8, 1), -1.05, 0xe8742a);
  addHuman(heroOptions(0x8bcb3a, 2), 0, 0xd8262e);
  addHuman(gruntOptions(), 1.05, 0x3a4a34, true);
  addHuman(bruteOptions(), 2.6, undefined, false, 0.35);
  const s = createScuttler(); s.root.position.set(-3.3, 0, 0.3); scene.add(s.root); cast.push({ kind: 'scuttler', inst: s, scale: 1, x: -3.3 });
  const m = createMoth(); m.root.position.set(4.2, 1.2, 0); scene.add(m.root); cast.push({ kind: 'moth', inst: m, scale: 1, x: 4.2 });
}
const buildMs = performance.now() - t0;

const CAM: Record<string, [number, number, number, number, number, number]> = {
  all: [0.4, 1.6, -9.2, 0.4, 0.9, 0],
  grumble: [-0.6, 1.25, -1.6, 0, 1.0, 0],
  grunt: [-1.1, 1.3, -2.8, 0, 0.9, 0],
  brute: [-1.8, 2.2, -4.8, 0, 1.4, 0],
  creatures: [-0.4, 1.0, -3.2, 0, 0.4, 0],
  army: [0.4, 3.4, -11.5, 0.2, 2.5, 1],
  dinos: [-1.5, 3.6, -11, 0.3, 2.2, 1.5],
  emotes: [0, 1.3, -5.2, 0, 0.8, 0],
  paper: [-1.2, 1.4, -3.4, 0.3, 0.8, 0],
  recruits: [-0.9, 1.3, -3.2, 0, 0.7, 0],
};
const camParam = params.get('cam')?.split(',').map(Number);
const c = camParam?.length === 6 ? camParam as [number, number, number, number, number, number] : CAM[focus] ?? CAM.all;
camera.position.set(c[0], c[1], c[2]);
controls.target.set(c[3], c[4], c[5]);
controls.update();

const post = createPost(renderer, scene, camera, { dof: focus === 'grumble', bloomStrength: 0.25, focus: 1.35, aperture: 0.0012, maxBlur: 0.004 });
const state = { pose: params.get('pose') ?? 'aim', turntable: !still, pitch: 0 };
if (params.get('gui') !== '0') {
  const gui = new GUI({ title: 'Toy Box' });
  gui.add(state, 'pose', ['idle', 'walk', 'run', 'aim', 'crouch', 'jump', 'downed']);
  gui.add(state, 'turntable');
  gui.add(state, 'pitch', -0.8, 0.8, 0.01).name('aim pitch');
}
const stats = document.getElementById('stats');
let tris = 0;
scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.index === null) tris += (m.geometry.attributes.position?.count ?? 0) / 3; });

const timer = new THREE.Timer();
function frame(): void {
  timer.update();
  const t = timer.getElapsed();
  for (const e of cast) {
    const speed = state.pose === 'run' ? 1 : state.pose === 'walk' ? 0.45 : 0;
    const phase = t * (state.pose === 'run' ? 11 : 6.5);
    if (e.kind === 'human') {
      poseHumanoid(e.inst as FigureInstance, {
        t, speed, phase, pitch: state.pitch, crouch: state.pose === 'crouch' ? 1 : 0, airborne: state.pose === 'jump',
        aiming: !!e.gun && (state.pose === 'aim' || state.pose === 'walk' || state.pose === 'run' || state.pose === 'crouch'),
        hunch: e.hunch, downed: state.pose === 'downed' ? 1 : 0,
      }, e.scale, e.gun);
      if (e.gun) e.gun.visible = state.pose !== 'idle' && state.pose !== 'downed';
      if (e.emote !== undefined) poseEmote(e.inst as FigureInstance, e.emote, 0.6 + (t % 1.2));
    } else if (e.kind === 'drummer') {
      poseHumanoid(e.inst as FigureInstance, { t, speed: 0.45, phase: t * 6.5, pitch: 0, crouch: 0, airborne: false, aiming: false }, 0.95);
      beatDrum(e.inst as FigureInstance, t);
    } else if (e.kind === 'jack') {
      poseJack(e.inst as FigureInstance, t, t * 4, 0.5, 0.75);
    } else if (e.kind === 'teeth') {
      poseTeeth(e.inst as FigureInstance, t, t * 6, 1);
    } else if (e.kind === 'top') {
      poseTop(e.inst as FigureInstance, t, 1);
    } else if (e.kind === 'drone') {
      poseDrone(e.inst as FigureInstance, t, 1, 0);
    } else if (e.kind === 'snip') {
      poseSnip(e.inst as FigureInstance, t, t * 4, 0.6, true);
    } else if (e.kind === 'raptor' || e.kind === 'rex') {
      poseTheropod(e.inst as FigureInstance, t + e.x, phase * (e.kind === 'rex' ? 0.5 : 1.3), speed > 0 ? speed : 0.15, e.kind === 'rex' ? Math.max(0, Math.sin(t * 0.8)) : 0, e.scale);
    } else if (e.kind === 'trike') {
      poseTrike(e.inst as FigureInstance, t, phase * 0.9, speed > 0 ? speed : 0.15, 0);
    } else if (e.kind === 'plane') {
      posePlane(e.inst as FigureInstance, t, e.x, 0);
    } else if (e.kind === 'yoyo') {
      poseHumanoid(e.inst as FigureInstance, { t, speed: 0, phase: 0, pitch: 0, crouch: 0, airborne: false, aiming: false }, 0.95);
      poseYoYo(e.inst as FigureInstance, t, 0);
    } else if (e.kind === 'ptero') {
      posePtero(e.inst as FigureInstance, t, 0, 0);
    } else if (e.kind === 'scuttler') {
      poseScuttler(e.inst as CreatureInstance, t, speed > 0 ? phase * 1.4 : t * 2, speed > 0 ? 1 : 0.2);
    } else {
      poseMoth(e.inst as CreatureInstance, t);
    }
    if (state.turntable && focus !== 'army' && focus !== 'dinos' && focus !== 'emotes' && focus !== 'paper') e.inst.root.rotation.y = Math.sin(t * 0.4) * 0.9;
  }
  controls.update();
  post.render(t);
  if (stats) stats.textContent = `${cast.length} figures · ${(tris / 1000).toFixed(0)}k tris · built in ${buildMs.toFixed(0)} ms`;
  if (!still) requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
});
if (still) {
  let n = 0;
  const tick = () => { frame(); if (++n < 5) requestAnimationFrame(tick); else document.body.dataset.ready = '1'; };
  tick();
} else frame();
