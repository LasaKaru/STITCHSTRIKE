import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Buttons, createBedroom, eyePosition, INPUT_DT, lookDirection, MAX_PITCH, PLAYER, POPPER, rayPlayer, rayWorld,
  type PlayerState, type Vec3,
} from '@stitchstrike/shared';
import { NetClient } from './net/netClient.ts';
import { withFakeLag, workerTransport, wsTransport, type Transport } from './net/transport.ts';
import { buildArena } from './scene/arenaWorld.ts';
import { createAvatar, type Avatar } from './scene/avatar.ts';
import { createPopper } from './scene/pip.ts';
import { addShellFuzz, createWoolMaterial, QUALITY_LAYERS, setWoolLayers } from './wool/woolMaterial.ts';

/**
 * Phase 0(b): networked movement + shooting. Grey-box Sunbeam Bedroom, up to
 * 8 players, bots fill empty slots.
 *
 * URL params: ?solo=1 (server in a Web Worker) ?room=CODE ?bots=N ?lag=RTT_MS ?name=Pip ?server=ws://host:port
 *             ?autopilot=1 (walks, turns and fires without pointer lock; for headless smoke tests)
 */

const params = new URLSearchParams(location.search);
const world = createBedroom();
const solo = params.get('solo') === '1';
const lag = Math.max(0, Number(params.get('lag') ?? 0) || 0);
const bots = params.get('bots');
const name = (params.get('name') ?? localStorageGet('ss-name') ?? `Toy${Math.floor(Math.random() * 900 + 100)}`).slice(0, 16);

function localStorageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

// ---------------------------------------------------------------- transport

function connect(): Transport {
  if (solo) return withFakeLag(workerTransport(bots === null ? 5 : Number(bots)), lag);
  const q = new URLSearchParams();
  q.set('room', params.get('room') ?? 'LOBBY');
  if (bots !== null) q.set('bots', bots);
  const base = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return withFakeLag(wsTransport(`${base}/?${q}`), lag);
}

const net = new NetClient(connect(), world, name);
const autopilot = params.get('autopilot') === '1';
(window as unknown as { __stitchstrike: unknown }).__stitchstrike = { net };

// ---------------------------------------------------------------- renderer + scene

setWoolLayers(QUALITY_LAYERS.medium);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a4150);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
buildArena(scene, world);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.03, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

// First-person view model: knitted sleeve + Pom-Pom Popper, always full wool quality.
const viewModel = new THREE.Group();
const popper = createPopper();
popper.scale.setScalar(0.9);
popper.rotation.y = Math.PI; // modelled along +Z; the camera looks down -Z
popper.position.set(0, 0, -0.08);
viewModel.add(popper);
const sleeve = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.075, 0.3, 8, 18),
  createWoolMaterial({ color: 0xe8742a, pattern: 'rib', uvSize: [0.47, 0.54], gauge: 1.2 }),
);
sleeve.rotation.x = Math.PI / 2 - 0.25;
sleeve.position.set(0.02, -0.1, 0.18);
addShellFuzz(sleeve);
viewModel.add(sleeve);
viewModel.position.set(0.26, -0.26, -0.42);
viewModel.traverse((o) => { o.renderOrder = 5; });
camera.add(viewModel);
const muzzleFlash = new THREE.PointLight(0xffb060, 0, 3, 2);
muzzleFlash.position.set(0.26, -0.18, -0.9);
camera.add(muzzleFlash);

// ---------------------------------------------------------------- avatars

const avatars = new Map<number, Avatar>();
let ownAvatar: Avatar | null = null;
const lastPos = new Map<number, THREE.Vector3>();

function syncAvatars(): void {
  for (const [id, a] of avatars) {
    if (!net.roster.has(id) || id === net.id) { scene.remove(a.root); avatars.delete(id); }
  }
  for (const [id, r] of net.roster) {
    if (id === net.id) {
      if (!ownAvatar) { ownAvatar = createAvatar(r.color); ownAvatar.root.visible = false; scene.add(ownAvatar.root); }
      continue;
    }
    if (!avatars.has(id)) {
      const a = createAvatar(r.color);
      scene.add(a.root);
      avatars.set(id, a);
    }
  }
}
net.onRoster = () => { syncAvatars(); renderScoreboard(); };

// ---------------------------------------------------------------- pom-pom tracers

interface Tracer { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number }
const tracers: Tracer[] = [];
const pompomGeo = new THREE.SphereGeometry(0.07, 10, 8);
const pompomMats = new Map<number, THREE.MeshStandardMaterial>();
const puffs: { mesh: THREE.Mesh; t: number }[] = [];
const puffGeo = new THREE.SphereGeometry(0.12, 8, 6);

function tracer(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
  let mat = pompomMats.get(color);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: color, emissiveIntensity: 0.25 }); pompomMats.set(color, mat); }
  const mesh = new THREE.Mesh(pompomGeo, mat);
  mesh.position.copy(from);
  scene.add(mesh);
  tracers.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.03, from.distanceTo(to) / 70) });
}

function puff(at: THREE.Vector3, color: number): void {
  const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  mesh.position.copy(at);
  scene.add(mesh);
  puffs.push({ mesh, t: 0 });
}

function colorOf(id: number): number {
  return net.roster.get(id)?.color ?? 0xffffff;
}

const remoteNow = new Map<number, THREE.Vector3>();

net.onShot = (s) => {
  const to = new THREE.Vector3(...s.to);
  if (s.id === net.id) {
    // Our own shots were already drawn at fire time by prediction; the server's
    // verdict only drives hit markers.
    if (s.hit) hitMarker(s.head);
    return;
  }
  const p = remoteNow.get(s.id);
  const from = p ? p.clone().add(new THREE.Vector3(0, PLAYER.eyeHeight - 0.25, 0)) : to.clone().add(new THREE.Vector3(0, 0.5, 0));
  tracer(from, to, colorOf(s.id));
  if (s.hit === net.id) damageFlash();
  puff(to, s.hit ? 0xfff2cc : 0xcfd6e6);
};

net.onEvent = (e) => {
  if (e.type === 'ko') {
    const a = net.roster.get(e.attacker)?.name ?? '?';
    const v = net.roster.get(e.victim)?.name ?? '?';
    feed(`${a} <span>unravelled</span> ${v}`, e.attacker === net.id || e.victim === net.id);
    renderScoreboard();
  }
};

let yaw = 0;
let pitch = 0;
net.onSpawn = (s: PlayerState) => { yaw = s.yaw; pitch = 0; };

// ---------------------------------------------------------------- input

const keys = new Set<string>();
let mouseDown = false;
let thirdPerson = false;
const sensitivity = Number(localStorageGet('ss-sens') ?? 0.0022);

const overlay = document.getElementById('overlay')!;
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
overlay.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
  if (!locked) { keys.clear(); mouseDown = false; }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * sensitivity;
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - e.movementY * sensitivity));
});
document.addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement) mouseDown = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); scoreboard.classList.remove('hidden'); }
  if (e.code === 'KeyV' && !e.repeat) thirdPerson = !thirdPerson;
  if (e.code === 'F3') { e.preventDefault(); netPanel.classList.toggle('hidden'); }
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') scoreboard.classList.add('hidden');
  keys.delete(e.code);
});
window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });

function sampleButtons(): number {
  let b = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) b |= Buttons.Forward;
  if (keys.has('KeyS') || keys.has('ArrowDown')) b |= Buttons.Back;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) b |= Buttons.Left;
  if (keys.has('KeyD') || keys.has('ArrowRight')) b |= Buttons.Right;
  if (keys.has('Space')) b |= Buttons.Jump;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) b |= Buttons.Sprint;
  if (keys.has('KeyC') || keys.has('ControlLeft')) b |= Buttons.Crouch;
  if (keys.has('KeyR')) b |= Buttons.Reload;
  if (mouseDown) b |= Buttons.Fire;
  return b;
}

// ---------------------------------------------------------------- HUD

const hud = {
  health: document.getElementById('health-fill')!,
  healthText: document.getElementById('health-text')!,
  ammo: document.getElementById('ammo')!,
  score: document.getElementById('score')!,
  net: document.getElementById('net')!,
  status: document.getElementById('status')!,
  hit: document.getElementById('hitmarker')!,
  damage: document.getElementById('damage')!,
  feed: document.getElementById('feed')!,
};
const scoreboard = document.getElementById('scoreboard')!;
const netPanel = document.getElementById('netpanel')!;

let hitTimer = 0;
function hitMarker(head: boolean): void {
  hud.hit.classList.toggle('head', head);
  hud.hit.style.opacity = '1';
  hitTimer = 0.18;
}
let damageTimer = 0;
function damageFlash(): void {
  damageTimer = 0.35;
}

function feed(html: string, mine: boolean): void {
  const el = document.createElement('div');
  el.className = mine ? 'mine' : '';
  el.innerHTML = html;
  hud.feed.prepend(el);
  setTimeout(() => el.remove(), 5000);
  while (hud.feed.children.length > 5) hud.feed.lastElementChild?.remove();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function renderScoreboard(): void {
  const players = net.latest?.players ?? [];
  const rows = [...net.roster.values()]
    .map((r) => ({ r, p: players.find((p) => p.id === r.id) }))
    .sort((a, b) => (b.p?.kos ?? 0) - (a.p?.kos ?? 0));
  scoreboard.innerHTML = `<h3>Room ${escapeHtml(net.room || '…')} · Free-for-All</h3><table>
    <tr><th></th><th>Toy</th><th>KOs</th><th>Unravels</th></tr>
    ${rows.map(({ r, p }) => `<tr class="${r.id === net.id ? 'me' : ''}">
      <td><i style="background:#${r.color.toString(16).padStart(6, '0')}"></i></td>
      <td>${escapeHtml(r.name)}</td><td>${p?.kos ?? 0}</td><td>${p?.deaths ?? 0}</td></tr>`).join('')}
    </table>`;
}

// ---------------------------------------------------------------- loop

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

let acc = 0;
let last = performance.now();
let flash = 0;
let bob = 0;
let hudTimer = 0;
const eye = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Visual end point of our own predicted shot: world and interpolated players. */
function predictedHitPoint(s: PlayerState, crouch: boolean): { to: THREE.Vector3; hitPlayer: boolean } {
  const o = eyePosition(s, crouch);
  const d = lookDirection(s.yaw, s.pitch);
  let best = rayWorld(o, d, world.boxes, POPPER.range);
  let hitPlayer = false;
  for (const [, p] of remoteNow) {
    const t = rayPlayer(o, d, { x: p.x, y: p.y, z: p.z }, best);
    if (t < best) { best = t; hitPlayer = true; }
  }
  return { to: new THREE.Vector3(o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best), hitPlayer };
}

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  // Remote players, interpolated in the past.
  remoteNow.clear();
  for (const r of net.remotes(now)) {
    const a = avatars.get(r.id);
    if (!a) continue;
    const prev = lastPos.get(r.id) ?? new THREE.Vector3(r.x, r.y, r.z);
    const speed = Math.hypot(r.x - prev.x, r.z - prev.z) / Math.max(dt, 1e-3);
    lastPos.set(r.id, new THREE.Vector3(r.x, r.y, r.z));
    a.root.position.set(r.x, r.y, r.z);
    a.root.rotation.y = r.yaw;
    a.setPose(r.pitch, Math.min(1, speed / PLAYER.runSpeed), t, r.crouch);
    a.setDowned(!r.alive);
    if (r.alive) remoteNow.set(r.id, new THREE.Vector3(r.x, r.y, r.z));
  }

  // Fixed 60 Hz input + prediction.
  acc += dt;
  const locked = document.pointerLockElement === renderer.domElement;
  while (acc >= INPUT_DT) {
    acc -= INPUT_DT;
    let buttons = locked ? sampleButtons() : 0;
    if (autopilot) {
      yaw += INPUT_DT * 0.6;
      pitch = -0.05;
      buttons = Buttons.Forward | Buttons.Fire | (Math.sin(now / 700) > 0.95 ? Buttons.Jump : 0);
    }
    const fired = net.input(buttons, yaw, pitch, now);
    if (fired && net.predicted) {
      const crouch = (buttons & Buttons.Crouch) !== 0;
      const { to } = predictedHitPoint(net.predicted, crouch);
      camera.updateMatrixWorld();
      const muzzle = popper.localToWorld(new THREE.Vector3(0, 0, 0.3));
      tracer(muzzle, to, 0xe8742a);
      puff(to, 0xfff2cc);
      flash = 0.05;
      viewModel.position.z = -0.36;
    }
  }
  net.decayCorrection(dt);

  // Camera from the predicted state, interpolated between the last two input steps.
  const p = net.predicted;
  const prev = net.previous ?? p;
  const alpha = acc / INPUT_DT;
  const crouching = keys.has('KeyC') || keys.has('ControlLeft');
  if (p && prev) {
    const ex = eyePosition(p, crouching);
    const ep = eyePosition(prev, crouching);
    eye.set(ep[0] + (ex[0] - ep[0]) * alpha, ep[1] + (ex[1] - ep[1]) * alpha, ep[2] + (ex[2] - ep[2]) * alpha);
    eye.x += net.correction.x; eye.y += net.correction.y; eye.z += net.correction.z;
    const horiz = Math.hypot(p.vx, p.vz);
    bob += dt * horiz * 2.2 * (p.onGround ? 1 : 0);
  } else if (net.latest) {
    // Unravelled: slow orbit above the room.
    eye.set(Math.sin(t * 0.2) * 12, 14, Math.cos(t * 0.2) * 12);
  }
  camera.rotation.set(p ? pitch : -0.8, p ? yaw : t * 0.2, 0);
  if (p && thirdPerson) {
    const back: Vec3 = lookDirection(yaw, pitch);
    tmp.set(eye.x - back[0] * 3, eye.y - back[1] * 3 + 0.4, eye.z - back[2] * 3);
    camera.position.copy(tmp);
  } else {
    camera.position.copy(eye);
  }
  viewModel.visible = !!p && !thirdPerson;
  if (ownAvatar) {
    ownAvatar.root.visible = !!p && thirdPerson;
    if (p) {
      ownAvatar.root.position.set(eye.x, eye.y - (crouching ? PLAYER.eyeHeight * 0.7 : PLAYER.eyeHeight), eye.z);
      ownAvatar.root.rotation.y = yaw;
      ownAvatar.setPose(pitch, Math.min(1, Math.hypot(p.vx, p.vz) / PLAYER.runSpeed), t, crouching);
    }
  }

  // Soft, bouncy weapon bob and recoil recovery.
  viewModel.position.x = 0.26 + Math.sin(bob) * 0.012;
  viewModel.position.y = -0.26 + Math.abs(Math.cos(bob)) * 0.012;
  viewModel.position.z += (-0.42 - viewModel.position.z) * Math.min(1, dt * 14);
  flash = Math.max(0, flash - dt);
  muzzleFlash.intensity = flash > 0 ? 3 : 0;

  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.dur);
    tr.mesh.position.lerpVectors(tr.from, tr.to, k);
    if (k >= 1) { scene.remove(tr.mesh); tracers.splice(i, 1); }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const pf = puffs[i];
    pf.t += dt;
    pf.mesh.scale.setScalar(1 + pf.t * 4);
    (pf.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - pf.t * 3);
    if (pf.t > 0.3) { scene.remove(pf.mesh); (pf.mesh.material as THREE.Material).dispose(); puffs.splice(i, 1); }
  }

  hitTimer = Math.max(0, hitTimer - dt);
  if (hitTimer === 0) hud.hit.style.opacity = '0';
  damageTimer = Math.max(0, damageTimer - dt);
  hud.damage.style.opacity = String(damageTimer * 2);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    updateHud();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function updateHud(): void {
  const me = net.me();
  const health = me?.health ?? 0;
  hud.health.style.width = `${(health / PLAYER.maxHealth) * 100}%`;
  hud.healthText.textContent = `${Math.ceil(health)} stitches`;
  const s = net.predicted;
  hud.ammo.textContent = s ? (s.reload > 0 ? 'Rewinding yarn…' : `${s.ammo} / ${POPPER.magazine}`) : '';
  hud.score.textContent = me ? `${me.kos} KO · ${me.deaths} unravelled` : '';
  const st = net.netStats();
  hud.net.textContent = `${st.transport} · ping ${Math.round(st.rtt)} ms · ${st.snapshotHz.toFixed(0)} Hz · ${st.kbpsIn.toFixed(0)} kbps`;
  netPanel.innerHTML = `tick ${net.latest?.tick ?? 0} · render tick ${net.renderTick().toFixed(1)}<br>
    pending inputs ${st.pending} · last correction ${st.lastCorrection.toFixed(4)} u<br>
    smoothing offset ${Math.hypot(net.correction.x, net.correction.y, net.correction.z).toFixed(3)} u`;

  if (net.status === 'connecting') hud.status.textContent = `Connecting to ${solo ? 'solo worker' : 'server'}…`;
  else if (net.status === 'full') hud.status.textContent = 'Room is full (8 toys).';
  else if (net.status === 'closed') {
    hud.status.innerHTML = `Disconnected: ${escapeHtml(net.closeReason)}. <a href="?solo=1">Play solo vs bots instead</a>`;
  } else if (!net.predicted && net.latest) hud.status.textContent = `Unravelled! Re-stitching in ${net.respawn.toFixed(1)} s`;
  else hud.status.textContent = '';
}

if (autopilot) overlay.classList.add('hidden');
renderScoreboard();
frame();
