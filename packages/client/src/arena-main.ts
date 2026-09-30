import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILD_RANGE, Buildable, BUILDABLES, Buttons, createBedroom, ENEMIES, ENEMY_INTERP_DELAY_MS, eyePosition, lookDirection, MAX_PITCH,
  pelletDirections, Phase, PLAYER, rayBox, rayPlayer, rayWorld, TURRET, TURRET_SHOT_BASE, WEAPONS,
  type GameMode, type PlayerState, type Vec3,
} from '@stitchstrike/shared';
import { Sfx } from './audio/sfx.ts';
import { NetClient, type EnemySample } from './net/netClient.ts';
import { withFakeLag, workerTransport, wsTransport, type Transport } from './net/transport.ts';
import { createAvatar, type Avatar } from './scene/avatar.ts';
import { CORE_COLORS, CORE_LETTERS, CoopProps } from './scene/coopProps.ts';
import { EnemyRenderer, type EnemyView } from './scene/enemyRenderer.ts';
import { Fx } from './scene/fx.ts';
import { createPost, type Post } from './scene/post.ts';
import { ViewModel } from './scene/viewModel.ts';
import { buildWoolRoom } from './scene/woolRoom.ts';
import { QUALITY_LAYERS, setWoolLayers, updateShellLod } from './wool/woolMaterial.ts';

/**
 * STITCHSTRIKE: wool toys defending the Heartspools (co-op) or fighting each
 * other (PvP) in a fully knitted bedroom. Server-authoritative multiplayer.
 *
 * URL params: ?mode=coop|pvp  ?solo=1 (server in a Web Worker)  ?room=CODE  ?bots=N  ?lag=RTT_MS
 *             ?name=Pip  ?server=ws://host:port  ?quality=low|medium|high  ?autopilot=1 (headless tests)
 */

const params = new URLSearchParams(location.search);
const world = createBedroom();
const mode: GameMode = params.get('mode') === 'pvp' ? 'pvp' : 'coop';
const solo = params.get('solo') === '1';
const lag = Math.max(0, Number(params.get('lag') ?? 0) || 0);
const bots = params.get('bots');
const quality = (params.get('quality') ?? 'high') as 'low' | 'medium' | 'high';
const autopilot = params.get('autopilot') === '1';
/** Fixed cinematic camera for screenshots and spectating: ?cam=overview|core|window. */
const fixedCam = params.get('cam');
const name = (params.get('name') ?? localStorageGet('ss-name') ?? `Toy${Math.floor(Math.random() * 900 + 100)}`).slice(0, 16);
document.body.classList.add(mode);
document.getElementById('modeline')!.textContent = mode === 'coop'
  ? 'Co-op defence · protect the Heartspools'
  : 'PvP free-for-all · first to unravel the most toys';

function localStorageGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

// ---------------------------------------------------------------- transport

function connect(): Transport {
  if (solo) return withFakeLag(workerTransport(bots === null ? 4 : Number(bots), mode), lag);
  const q = new URLSearchParams();
  q.set('room', params.get('room') ?? 'LOBBY');
  q.set('mode', mode);
  if (bots !== null) q.set('bots', bots);
  const base = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return withFakeLag(wsTransport(`${base}/?${q}`), lag);
}

const net = new NetClient(connect(), world, name);
net.mode = mode;
(window as unknown as { __stitchstrike: unknown }).__stitchstrike = { net };

// ---------------------------------------------------------------- renderer + scene

setWoolLayers(QUALITY_LAYERS[quality === 'low' ? 'low' : 'medium']);
const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2f3a);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;
const room = buildWoolRoom(scene, world);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.03, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

let post: Post | null = null;
if (quality !== 'low') {
  post = createPost(renderer, scene, camera, { dof: false, ao: quality === 'high', bloomStrength: 0.35, vignette: 0.22, grain: 0.015 });
}

const viewModel = new ViewModel(camera);
const muzzleFlash = new THREE.PointLight(0xffb060, 0, 3, 2);
muzzleFlash.position.set(0.26, -0.18, -0.9);
camera.add(muzzleFlash);

const fx = new Fx(scene);
const sfx = new Sfx();
const coopProps = mode === 'coop' ? new CoopProps(scene, world) : null;
const enemyRenderer = mode === 'coop' ? new EnemyRenderer(scene) : null;

// ---------------------------------------------------------------- players

const avatars = new Map<number, Avatar>();
let ownAvatar: Avatar | null = null;
const lastPos = new Map<number, THREE.Vector3>();
const remoteNow = new Map<number, THREE.Vector3>();

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

function colorOf(id: number): number {
  return net.roster.get(id)?.color ?? 0xffffff;
}

// ---------------------------------------------------------------- enemies (client view)

interface EnemyVisual { yaw: number; phase: number; hitAge: number; last: THREE.Vector3 }
const enemyVisuals = new Map<number, EnemyVisual>();
let enemies: EnemySample[] = [];
const ENEMY_COLORS = [0xb3262c, 0x6a3c9a, 0xb8a58a, 0x3e5a3a];

net.onEnemyGone = (e) => {
  // Show the unravel when the interpolated view reaches that moment, not when the packet lands.
  setTimeout(() => {
    const at = new THREE.Vector3(e.x, e.y + ENEMIES[e.type].height * 0.5, e.z);
    fx.fluffBurst(at, ENEMY_COLORS[e.type], e.type === 3 ? 140 : 45, e.type === 3 ? 5 : 3);
    fx.puff(at, 0xfff2e0, e.type === 3 ? 3 : 1.5);
    enemyVisuals.delete(e.id);
  }, ENEMY_INTERP_DELAY_MS);
};

function nearestEnemy(p: THREE.Vector3, within: number): EnemySample | null {
  let best: EnemySample | null = null;
  let bestD = within;
  for (const e of enemies) {
    const d = Math.hypot(e.x - p.x, e.y + ENEMIES[e.type].height * 0.5 - p.y, e.z - p.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ---------------------------------------------------------------- shots

net.onShot = (s) => {
  const to = new THREE.Vector3(...s.to);
  if (s.enemy) {
    const e = nearestEnemy(to, 1.6);
    if (e) {
      const v = enemyVisuals.get(e.id);
      if (v) v.hitAge = 0;
      fx.fluffBurst(to, ENEMY_COLORS[e.type], 5, 1.5);
    }
  }
  if (s.id === net.id) {
    // Our own shots were drawn at fire time by prediction; the server's verdict drives hit markers.
    if (s.hit || s.enemy) hitMarker(s.head);
    return;
  }
  let from: THREE.Vector3;
  let color: number;
  if (s.id >= TURRET_SHOT_BASE) {
    const pad = world.coop.pads[s.id - TURRET_SHOT_BASE];
    if (!pad) return;
    from = new THREE.Vector3(pad.pos[0], TURRET.height, pad.pos[2]);
    color = 0xe8742a;
    sfx.play('turret', attenuation(from));
  } else {
    const p = remoteNow.get(s.id);
    from = p ? p.clone().add(new THREE.Vector3(0, PLAYER.eyeHeight - 0.25, 0)) : to.clone().add(new THREE.Vector3(0, 0.5, 0));
    color = colorOf(s.id);
    sfx.play('popper', attenuation(from) * 0.6);
  }
  fx.projectile(from, to, color);
  if (s.hit === net.id) { damageFlash(); sfx.play('hurt'); }
  fx.puff(to, s.hit || s.enemy ? 0xfff2cc : 0xcfd6e6, 0.8);
};

function attenuation(p: THREE.Vector3): number {
  return Math.max(0.05, 1 - camera.position.distanceTo(p) / 30);
}

// ---------------------------------------------------------------- events

let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function banner(text: string, kind: '' | 'good' | 'bad' = '', ms = 2600): void {
  const el = document.getElementById('banner')!;
  el.textContent = text;
  el.className = `hud show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.className = `hud ${kind}`; }, ms);
}

net.onEvent = (e) => {
  switch (e.type) {
    case 'ko': {
      const v = net.roster.get(e.victim)?.name ?? '?';
      const a = e.attacker ? net.roster.get(e.attacker)?.name ?? '?' : `a ${ENEMIES[e.enemyType ?? 0]?.name ?? 'toy'}`;
      feed(`${escapeHtml(a)} <span>unravelled</span> ${escapeHtml(v)}`, e.attacker === net.id || e.victim === net.id);
      if (e.victim === net.id) sfx.play('hurt');
      renderScoreboard();
      break;
    }
    case 'kill':
      if (e.by === net.id) { sfx.play('kill'); popup(`+${e.reward} buttons`); }
      break;
    case 'phase':
      if (e.phase === Phase.Wave) { banner(`WAVE ${e.wave} INCOMING!`); sfx.play('wave'); }
      else if (e.phase === Phase.Build && e.wave > 0) { banner(`WAVE ${e.wave} CLEARED!`, 'good'); }
      else if (e.phase === Phase.Build) { banner('NEW MATCH · BUILD YOUR DEFENCE'); }
      else if (e.phase === Phase.Won) { banner('THE HEARTSPOOLS ARE SAFE!', 'good', 6000); sfx.play('win'); }
      else if (e.phase === Phase.Lost) { banner('THE HEARTSPOOLS UNRAVELLED', 'bad', 6000); sfx.play('lose'); }
      break;
    case 'coreDown':
      banner(`HEARTSPOOL ${CORE_LETTERS[e.core]} UNRAVELLED!`, 'bad');
      sfx.play('alarm');
      break;
    case 'built':
      if (e.by === net.id) sfx.play(e.kind === Buildable.None ? 'sell' : 'build');
      if (e.by === 0 && e.kind === Buildable.None) sfx.play('alarm', 0.5);
      break;
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
const lock = () => { sfx.unlock(); renderer.domElement.requestPointerLock(); };
renderer.domElement.addEventListener('click', lock);
overlay.addEventListener('click', lock);
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

const KEYMAP: [string[], number][] = [
  [['KeyW', 'ArrowUp'], Buttons.Forward], [['KeyS', 'ArrowDown'], Buttons.Back],
  [['KeyA', 'ArrowLeft'], Buttons.Left], [['KeyD', 'ArrowRight'], Buttons.Right],
  [['Space'], Buttons.Jump], [['ShiftLeft', 'ShiftRight'], Buttons.Sprint],
  [['KeyC', 'ControlLeft'], Buttons.Crouch], [['KeyR'], Buttons.Reload],
  [['Digit1'], Buttons.Weapon1], [['Digit2'], Buttons.Weapon2],
  [['Digit3'], Buttons.Build1], [['Digit4'], Buttons.Build2], [['Digit5'], Buttons.Build3],
  [['KeyG'], Buttons.Sell], [['Enter', 'KeyF'], Buttons.Ready],
];

function sampleButtons(): number {
  let b = 0;
  for (const [codes, bit] of KEYMAP) if (codes.some((c) => keys.has(c))) b |= bit;
  if (mouseDown) b |= Buttons.Fire;
  return b;
}

/** Headless test driver: aims at the nearest enemy (co-op) or spins (PvP), readies up and fires. */
function autopilotButtons(now: number, p: PlayerState | null): number {
  let b = Buttons.Fire | (Math.sin(now / 900) > 0.9 ? Buttons.Ready : 0);
  const target = p && enemies.length ? enemies.reduce((a, e) => (Math.hypot(e.x - p.x, e.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? e : a)) : null;
  if (target && p) {
    const dx = target.x - p.x, dz = target.z - p.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(target.y + 0.7 - (p.y + PLAYER.eyeHeight), Math.hypot(dx, dz));
    if (Math.hypot(dx, dz) > 8) b |= Buttons.Forward;
  } else {
    yaw += 0.01;
    pitch = -0.05;
    b |= Buttons.Forward | (Math.sin(now / 700) > 0.95 ? Buttons.Jump : 0);
  }
  return b;
}

// ---------------------------------------------------------------- HUD

const $ = (id: string) => document.getElementById(id)!;
const hud = {
  health: $('health-fill'), healthText: $('health-text'), ammo: $('ammo'), slots: $('slots'), score: $('score'),
  net: $('net'), status: $('status'), hit: $('hitmarker'), damage: $('damage'), feed: $('feed'),
  cores: $('cores'), wave: $('wave'), phase: $('phase'), deck: $('deck'), padhint: $('padhint'), buttons: $('buttons'), popups: $('popups'),
};
const scoreboard = $('scoreboard');
const netPanel = $('netpanel');

if (mode === 'coop') {
  hud.cores.innerHTML = CORE_LETTERS.map((l, i) => `<div class="core" id="core${i}">
    <div class="letter" style="background:#${CORE_COLORS[i].toString(16).padStart(6, '0')}">${l}</div>
    <div class="bars"><div class="hp"><i></i></div><div class="sh"><i></i></div></div></div>`).join('');
  hud.deck.innerHTML = [Buildable.Turret, Buildable.Wall, Buildable.Mat].map((k, i) => `<div class="card" id="card${k}">
    <div class="key">[${i + 3}]</div><div>${BUILDABLES[k].name}</div><div class="cost">${BUILDABLES[k].cost} buttons</div></div>`).join('');
}

let hitTimer = 0;
function hitMarker(head: boolean): void {
  hud.hit.classList.toggle('head', head);
  hud.hit.style.opacity = '1';
  hitTimer = 0.18;
  sfx.play('hit', 0.6);
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

function popup(text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.left = `${50 + (Math.random() - 0.5) * 6}%`;
  el.style.top = '44%';
  hud.popups.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function renderScoreboard(): void {
  const players = net.latest?.players ?? [];
  const rows = [...net.roster.values()]
    .map((r) => ({ r, p: players.find((p) => p.id === r.id) }))
    .sort((a, b) => (b.p?.kos ?? 0) - (a.p?.kos ?? 0));
  const title = mode === 'coop' ? 'Co-op defence' : 'Free-for-All';
  const koLabel = mode === 'coop' ? 'Unravelled toys' : 'KOs';
  scoreboard.innerHTML = `<h3>Room ${escapeHtml(net.room || '…')} · ${title}</h3><table>
    <tr><th></th><th>Toy</th><th>${koLabel}</th><th>Downed</th></tr>
    ${rows.map(({ r, p }) => `<tr class="${r.id === net.id ? 'me' : ''}">
      <td><i style="background:#${r.color.toString(16).padStart(6, '0')}"></i></td>
      <td>${escapeHtml(r.name)}</td><td>${p?.kos ?? 0}</td><td>${p?.deaths ?? 0}</td></tr>`).join('')}
    </table>`;
}

const lastCoreHealth = [1, 1, 1];

function updateHud(): void {
  const me = net.me();
  const health = me?.health ?? 0;
  hud.health.style.width = `${(health / PLAYER.maxHealth) * 100}%`;
  hud.healthText.textContent = `${Math.ceil(health)} stitches`;
  const s = net.predicted;
  const w = WEAPONS[s?.weapon ?? 0];
  const mag = s ? (s.weapon === 0 ? s.ammo : s.ammoB) : 0;
  hud.ammo.textContent = s ? (s.reload > 0 ? 'Rewinding yarn…' : `${mag} / ${w.magazine}`) : '';
  hud.slots.innerHTML = WEAPONS.map((x, i) => `<span class="${i === (s?.weapon ?? 0) ? 'on' : ''}">${i + 1} ${x.name}</span>`).join('');
  hud.score.textContent = me ? (mode === 'coop' ? `${me.kos} toys unravelled` : `${me.kos} KO · ${me.deaths} unravelled`) : '';
  const st = net.netStats();
  hud.net.textContent = `${st.transport} · ping ${Math.round(st.rtt)} ms · ${st.snapshotHz.toFixed(0)} Hz · ${st.kbpsIn.toFixed(0)} kbps`;
  netPanel.innerHTML = `tick ${net.latest?.tick ?? 0} · render tick ${net.renderTick().toFixed(1)}<br>
    pending inputs ${st.pending} · last correction ${st.lastCorrection.toFixed(4)} u<br>
    enemies drawn ${enemies.length}`;

  const c = net.coop;
  if (c) {
    hud.wave.textContent = c.phase === Phase.Won ? 'VICTORY' : c.phase === Phase.Lost ? 'DEFEAT' : c.wave === 0 ? 'GET READY' : `WAVE ${c.wave} / ${c.totalWaves}`;
    const humans = [...net.roster.values()].filter((r) => !r.bot).length;
    if (c.phase === Phase.Build) {
      hud.phase.innerHTML = `Build phase · <b>${Math.ceil(c.timer)}s</b> · press <b>Enter</b> to ready up (${c.ready}/${humans})`;
    } else if (c.phase === Phase.Wave) {
      hud.phase.innerHTML = `Defend the Heartspools! · ${enemies.length} toys incoming`;
    } else {
      hud.phase.innerHTML = `New match in <b>${Math.ceil(c.timer)}s</b>`;
    }
    c.cores.forEach((k, i) => {
      const el = document.getElementById(`core${i}`);
      if (!el) return;
      (el.querySelector('.hp i') as HTMLElement).style.width = `${k.health * 100}%`;
      (el.querySelector('.sh i') as HTMLElement).style.width = `${k.shield * 100}%`;
      el.classList.toggle('down', k.health <= 0);
      if (k.health < lastCoreHealth[i] - 0.001) {
        el.classList.remove('hurt');
        void el.offsetWidth;
        el.classList.add('hurt');
      }
      lastCoreHealth[i] = k.health;
    });
    hud.buttons.innerHTML = `${c.buttons} <small>BUTTONS</small>`;
    for (const k of [Buildable.Turret, Buildable.Wall, Buildable.Mat]) {
      document.getElementById(`card${k}`)?.classList.toggle('poor', c.buttons < BUILDABLES[k].cost);
    }
    const pad = s ? coopProps?.nearestPad(s.x, s.z, BUILD_RANGE) ?? -1 : -1;
    if (pad >= 0) {
      const kind = c.pads[pad]?.kind ?? 0;
      hud.padhint.innerHTML = kind === Buildable.None
        ? `Build pad ${CORE_LETTERS[world.coop.pads[pad].core]} · press <b>3</b> <b>4</b> <b>5</b> to build`
        : `${BUILDABLES[kind].name} · ${Math.round((c.pads[pad]?.health ?? 0) * 100)}% · <b>G</b> to recycle`;
    } else {
      hud.padhint.textContent = c.phase === Phase.Build ? 'Stand on a stitched pad to build' : '';
    }
  } else {
    hud.wave.textContent = 'FREE-FOR-ALL';
    hud.phase.textContent = '';
  }

  if (net.status === 'connecting') hud.status.textContent = `Connecting to ${solo ? 'solo worker' : 'server'}…`;
  else if (net.status === 'full') hud.status.textContent = 'Room is full (8 toys).';
  else if (net.status === 'closed') {
    hud.status.innerHTML = `Disconnected: ${escapeHtml(net.closeReason)}. <a href="?solo=1&mode=${mode}">Play solo with bots instead</a>`;
  } else if (!net.predicted && net.latest) hud.status.textContent = `Unravelled! Re-stitching in ${net.respawn.toFixed(1)} s`;
  else hud.status.textContent = '';
}

// ---------------------------------------------------------------- loop

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post?.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

let acc = 0;
let last = performance.now();
let flash = 0;
let hudTimer = 0;
let lastHealth: number = PLAYER.maxHealth;
let lastWeapon = 0;
const eye = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Visual end point of one of our own predicted pellets. */
function predictedHit(o: Vec3, d: Vec3, range: number): { to: THREE.Vector3; enemy: EnemySample | null } {
  let best = rayWorld(o, d, world.boxes, range);
  let enemy: EnemySample | null = null;
  if (mode === 'coop') {
    for (const e of enemies) {
      const def = ENEMIES[e.type];
      const t = rayBox(o, d, [e.x - def.radius, e.y, e.z - def.radius], [e.x + def.radius, e.y + def.height, e.z + def.radius], best);
      if (t < best) { best = t; enemy = e; }
    }
  } else {
    for (const [, p] of remoteNow) {
      const t = rayPlayer(o, d, { x: p.x, y: p.y, z: p.z }, best);
      if (t < best) best = t;
    }
  }
  return { to: new THREE.Vector3(o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best), enemy };
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

  // Enemies, interpolated further back (they arrive at 10 Hz).
  if (enemyRenderer) {
    enemies = net.enemySamples(now);
    const views: EnemyView[] = [];
    for (const e of enemies) {
      let v = enemyVisuals.get(e.id);
      if (!v) { v = { yaw: 0, phase: Math.random() * 6, hitAge: 1, last: new THREE.Vector3(e.x, e.y, e.z) }; enemyVisuals.set(e.id, v); }
      const moved = Math.hypot(e.x - v.last.x, e.z - v.last.z);
      v.phase += moved * (e.type === 3 ? 2.2 : 4.5);
      if (Math.hypot(e.vx, e.vz) > 1e-3) {
        const target = Math.atan2(-e.vx, -e.vz);
        let d = target - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 8);
      }
      v.hitAge += dt;
      v.last.set(e.x, e.y, e.z);
      views.push({ id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, yaw: v.yaw, health: e.health, phase: v.phase, hitAge: v.hitAge });
    }
    enemyRenderer.update(views, t);
  }

  // Fixed 60 Hz input + prediction.
  acc += dt;
  const locked = document.pointerLockElement === renderer.domElement;
  while (acc >= 1 / 60) {
    acc -= 1 / 60;
    const buttons = autopilot ? autopilotButtons(now, net.predicted) : locked ? sampleButtons() : 0;
    const r = net.input(buttons, yaw, pitch, now);
    if (r.fired && net.predicted) {
      const s = net.predicted;
      const weapon = WEAPONS[r.weapon];
      const crouch = (buttons & Buttons.Crouch) !== 0;
      const o = eyePosition(s, crouch);
      const muzzle = viewModel.muzzle();
      for (const d of pelletDirections(weapon, lookDirection(s.yaw, s.pitch), r.seq)) {
        const { to, enemy } = predictedHit(o, d, weapon.range);
        fx.projectile(muzzle, to, r.weapon === 1 ? 0xffc94a : 0xe8742a, r.weapon === 1);
        // Enemy hits shed fibres (from the server's verdict); misses puff dust off the wool.
        if (!enemy) fx.puff(to, 0xcfd6e6, r.weapon === 1 ? 0.4 : 0.55);
      }
      sfx.play(r.weapon === 1 ? 'buster' : 'popper');
      viewModel.fire();
      flash = 0.05;
    }
  }
  net.decayCorrection(dt);

  // Camera from the predicted state, interpolated between the last two input steps.
  const p = net.predicted;
  const prev = net.previous ?? p;
  const alpha = acc * 60;
  const crouching = keys.has('KeyC') || keys.has('ControlLeft');
  if (p && prev) {
    const ex = eyePosition(p, crouching);
    const ep = eyePosition(prev, crouching);
    eye.set(ep[0] + (ex[0] - ep[0]) * alpha, ep[1] + (ex[1] - ep[1]) * alpha, ep[2] + (ex[2] - ep[2]) * alpha);
    eye.x += net.correction.x; eye.y += net.correction.y; eye.z += net.correction.z;
    if (p.weapon !== lastWeapon) { viewModel.setWeapon(p.weapon); sfx.play('switch'); lastWeapon = p.weapon; }
    viewModel.update(dt, Math.hypot(p.vx, p.vz), p.onGround);
  } else if (net.latest) {
    // Unravelled: a slow orbit over the Heartspools.
    eye.set(Math.sin(t * 0.2) * 14, 13, Math.cos(t * 0.2) * 14);
  }
  if (p) camera.rotation.set(pitch, yaw, 0);
  else camera.lookAt(0, 1, 0);
  if (fixedCam) {
    const shots: Record<string, [number, number, number, number, number, number]> = {
      overview: [15, 14, 16, -2, 1, -2],
      core: [6.5, 2.2, 9, 1, 1, 1.5],
      window: [8, 5, -6, -12, 4, 6],
      coreA: [-1, 3.5, -4, -6, 0.8, -7],
    };
    const c = shots[fixedCam] ?? shots.overview;
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(c[3], c[4], c[5]);
  }
  if (p && thirdPerson) {
    const back: Vec3 = lookDirection(yaw, pitch);
    tmp.set(eye.x - back[0] * 3, eye.y - back[1] * 3 + 0.4, eye.z - back[2] * 3);
    camera.position.copy(tmp);
  } else if (!fixedCam) {
    camera.position.copy(eye);
  }
  viewModel.group.visible = !!p && !thirdPerson && !fixedCam;
  if (ownAvatar) {
    ownAvatar.root.visible = !!p && (thirdPerson || !!fixedCam);
    if (p) {
      ownAvatar.root.position.set(eye.x, eye.y - (crouching ? PLAYER.eyeHeight * 0.7 : PLAYER.eyeHeight), eye.z);
      ownAvatar.root.rotation.y = yaw;
      ownAvatar.setPose(pitch, Math.min(1, Math.hypot(p.vx, p.vz) / PLAYER.runSpeed), t, crouching);
    }
  }
  flash = Math.max(0, flash - dt);
  muzzleFlash.intensity = flash > 0 ? 3 : 0;

  // Co-op set pieces: Heartspools spin, turrets track the nearest enemy, pad under you glows.
  if (coopProps) {
    const highlight = p ? coopProps.nearestPad(p.x, p.z, BUILD_RANGE) : -1;
    coopProps.update(net.coop, t, highlight, (x, z) => {
      const e = nearestEnemy(new THREE.Vector3(x, TURRET.height, z), TURRET.range);
      return e ? [e.x, e.z] : null;
    });
  }

  fx.update(dt);
  room.update(t, camera);
  updateShellLod(camera);

  const myHealth = net.me()?.health ?? PLAYER.maxHealth;
  if (myHealth < lastHealth - 0.5) { damageFlash(); sfx.play('hurt', 0.7); }
  lastHealth = myHealth;

  hitTimer = Math.max(0, hitTimer - dt);
  if (hitTimer === 0) hud.hit.style.opacity = '0';
  damageTimer = Math.max(0, damageTimer - dt);
  hud.damage.style.opacity = String(damageTimer * 2);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.1;
    updateHud();
  }
  if (post) post.render(t);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (autopilot || fixedCam) overlay.classList.add('hidden');
renderScoreboard();
frame();
