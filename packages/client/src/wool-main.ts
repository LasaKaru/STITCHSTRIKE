import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBedroomCorner } from './scene/bedroomCorner.ts';
import { createPip } from './scene/pip.ts';
import { createPost } from './scene/post.ts';
import { createBookStack, createButtonCoin, createHeartspool, createPencil, createSkein, createSpinningTop, createWindUpWalker } from './scene/props.ts';
import {
  QUALITY_LAYERS, getWoolLayers, setWoolLayers, setWoolNormalScale, setWoolSheenRoughness,
  updateShellLod, woolParams, woolUniforms, type Quality,
} from './wool/woolMaterial.ts';

/**
 * Phase 0(a): wool shader test. One knitted figure (Pip) in a grey-box bedroom
 * corner under a sunbeam. Goal: a still that reads as a photo of a crochet toy.
 *
 * URL params: ?quality=low|medium|high|ultra  &cam=hero|backlit|closeup|wide  &gui=0  &still=1
 */

const params = new URLSearchParams(location.search);
const quality = (params.get('quality') as Quality) || 'high';
const still = params.get('still') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: still });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a4150);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.6;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

const room = createBedroomCorner(scene);

const pip = createPip();
pip.root.rotation.y = 0.35;
scene.add(pip.root);

const heart = createHeartspool(0.55);
const books = createBookStack();
books.position.set(-3.6, 0, -2.4);
books.rotation.y = 0.3;
heart.group.position.set(-3.6, 1.64 + 0.7, -2.4);
scene.add(books, heart.group);

const walker = createWindUpWalker();
walker.group.position.set(2.3, 0, -1.6);
walker.group.rotation.y = -0.9;
scene.add(walker.group);

const top = createSpinningTop();
top.position.set(-2.1, 0, 1.3);
top.rotation.z = 0.25;
scene.add(top);

const pencil = createPencil();
pencil.position.set(1.6, 0.1, 1.9);
pencil.rotation.y = 0.6;
scene.add(pencil);

const skein = createSkein(0xb46fd6);
skein.position.set(0.9, 0.12, -1.2);
skein.rotation.x = -Math.PI / 2;
scene.add(skein);

[[-0.9, 1.4, 0xe8742a], [1.1, 0.9, 0x2f7fe0], [-1.4, -0.6, 0xffc94a], [0.3, 2.3, 0xd8262e]].forEach(([x, zz, c]) => {
  const b = createButtonCoin(c);
  b.position.set(x, 0.025, zz);
  b.rotation.y = x * 3;
  scene.add(b);
});

// ---------------------------------------------------------------- camera presets

const CAMS: Record<string, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  hero: { pos: [2.1, 1.25, 2.9], target: [0, 0.85, 0], fov: 32 },
  backlit: { pos: [0.5, 0.95, 3.1], target: [0, 1.0, 0], fov: 30 },
  closeup: { pos: [0.55, 1.22, 1.35], target: [0, 1.1, 0.1], fov: 28 },
  wide: { pos: [6.5, 3.4, 9.5], target: [-0.8, 3.6, -2.5], fov: 50 },
};

function setCam(name: string): void {
  const c = CAMS[name] ?? CAMS.hero;
  camera.position.set(...c.pos);
  controls.target.set(...c.target);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  controls.update();
}
setCam(params.get('cam') ?? 'hero');

// ---------------------------------------------------------------- post

const post = createPost(renderer, scene, camera, { dof: params.get('dof') !== '0' });
const view = { autoFocus: true, turntable: false, exposure: renderer.toneMappingExposure, sunIntensity: room.sun.light.intensity, sunAngle: 0 };

function applyQuality(q: Quality): void {
  setWoolLayers(QUALITY_LAYERS[q]);
  woolUniforms.uWoolShellCount.value = q === 'ultra' ? 16 : 12;
  post.settings.ao = q === 'high' || q === 'ultra';
  post.settings.dof = q !== 'low' && params.get('dof') !== '0';
  room.sun.light.shadow.radius = q === 'low' ? 1 : 3;
  renderer.setPixelRatio(q === 'low' ? Math.min(window.devicePixelRatio, 1) * 0.75 : Math.min(window.devicePixelRatio, 2));
  resize();
  post.apply();
}

// ---------------------------------------------------------------- debug panel (plan §21: tune wool live)

const layerState = getWoolLayers();
const state = { quality };
if (params.get('gui') !== '0') {
  const gui = new GUI({ title: 'Wool lookdev' });
  gui.add(state, 'quality', ['low', 'medium', 'high', 'ultra']).name('Quality preset').onChange((q: Quality) => {
    applyQuality(q);
    Object.assign(layerState, QUALITY_LAYERS[q]);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  });
  gui.add({ cam: 'hero' }, 'cam', Object.keys(CAMS)).name('Camera').onChange(setCam);
  gui.add(view, 'turntable').name('Turntable');

  const layers = gui.addFolder('Wool layers (§13.3)');
  const onLayer = () => setWoolLayers(layerState);
  layers.add(layerState, 'stitch').name('1 Stitch normals').onChange(onLayer);
  layers.add(layerState, 'tint').name('2 Hand-dyed tint').onChange(onLayer);
  layers.add(layerState, 'sheen').name('3 Sheen').onChange(onLayer);
  layers.add(layerState, 'rim').name('4 Fuzz rim').onChange(onLayer);
  layers.add(layerState, 'shells').name('5 Shell fuzz').onChange(onLayer);
  layers.add(layerState, 'fibres').name('6 Stray fibres').onChange(onLayer);
  layers.add(layerState, 'wrap').name('7 Wrap lighting').onChange(onLayer);

  const tune = gui.addFolder('Wool tuning');
  tune.add(woolParams, 'normalScale', 0, 3, 0.01).name('Stitch depth').onChange(setWoolNormalScale);
  tune.add(woolParams, 'sheenRoughness', 0.1, 1, 0.01).name('Sheen roughness').onChange(setWoolSheenRoughness);
  tune.add(woolUniforms.uWoolTint, 'value', 0, 0.3, 0.005).name('Tint variation');
  tune.add(woolUniforms.uWoolAO, 'value', 0, 1, 0.01).name('Stitch cavity AO');
  tune.add(woolUniforms.uWoolRim, 'value', 0, 3, 0.01).name('Fuzz rim');
  tune.add(woolUniforms.uWoolWrap, 'value', 0, 1, 0.01).name('Wrap (w)');
  tune.add(woolUniforms.uWoolShellCount, 'value', 4, woolParams.maxShells, 1).name('Shell count');
  tune.add(woolUniforms.uWoolShellLength, 'value', 0.005, 0.08, 0.001).name('Fuzz length');
  tune.add(woolUniforms.uWoolFibreScale, 'value', 2, 20, 0.1).name('Fibre scale');
  tune.add(woolParams, 'shellMaxDistance', 1, 20, 0.5).name('Shell LOD dist');

  const light = gui.addFolder('Light & post (§14)');
  light.add(view, 'sunIntensity', 0, 12, 0.1).name('Sun').onChange((v: number) => { room.sun.light.intensity = v; });
  light.add(view, 'exposure', 0.3, 2.5, 0.01).name('Exposure').onChange((v: number) => { renderer.toneMappingExposure = v; });
  light.add(post.settings, 'ao').name('GTAO').onChange(post.apply);
  light.add(post.settings, 'bloom').name('Bloom').onChange(post.apply);
  light.add(post.settings, 'bloomStrength', 0, 2, 0.01).name('Bloom strength').onChange(post.apply);
  light.add(post.settings, 'dof').name('Depth of field').onChange(post.apply);
  light.add(view, 'autoFocus').name('Autofocus on Pip');
  light.add(post.settings, 'aperture', 0, 0.05, 0.0005).name('Aperture').onChange(post.apply);
  light.add(post.settings, 'maxBlur', 0, 0.03, 0.0005).name('Max blur').onChange(post.apply);
  light.add(post.settings, 'vignette', 0, 1, 0.01).name('Vignette').onChange(post.apply);
  light.add(post.settings, 'grain', 0, 0.1, 0.001).name('Grain').onChange(post.apply);
  if (window.innerWidth < 700) gui.close();
}

// ---------------------------------------------------------------- loop

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
}
window.addEventListener('resize', resize);
applyQuality(quality);

const stats = document.getElementById('stats');
const timer = new THREE.Timer();
let frames = 0, fpsTime = 0;
const focusPoint = new THREE.Vector3();

function frame(): void {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();
  if (view.turntable) pip.root.rotation.y += dt * 0.4;
  pip.update(t);
  heart.update(t);
  walker.update(t);
  room.update(t);
  controls.update();
  updateShellLod(camera);

  if (view.autoFocus) {
    pip.head.getWorldPosition(focusPoint);
    post.settings.focus = camera.position.distanceTo(focusPoint);
    post.apply();
  }
  post.render(t);

  frames++;
  fpsTime += dt;
  if (stats && fpsTime > 0.5) {
    const info = renderer.info.render;
    stats.textContent = `${Math.round(frames / fpsTime)} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · ${state.quality}`;
    frames = 0;
    fpsTime = 0;
  }
  if (!still) requestAnimationFrame(frame);
}

if (still) {
  // Deterministic stills for screenshots: render a few frames then mark ready.
  let n = 0;
  const tick = () => { frame(); if (++n < 6) requestAnimationFrame(tick); else document.body.dataset.ready = '1'; };
  tick();
} else {
  frame();
}
