import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILDABLES, Buttons, createWorld, DIFFICULTIES, ENEMIES, eyePosition, lookDirection, MAPS, MAX_PITCH, pelletDirections, Phase, PLAYER,
  randomLook, rayWorld, ShotKind, TURRET, TURRET_SHOT_BASE, WEAPONS, ENEMY_SHOT_ID, RoomHost, DECK,
  KOTH, type GameMode, type MapId, type PlayerState,
} from '@stitchstrike/shared';
import { CombatMusic, type Intensity } from './audio/combatMusic.ts';
import { Sfx } from './audio/sfx.ts';
import { jacketColor } from './figures/looks.ts';
import { cycleCard, cycleWeapon, PadReader } from './input/gamepad.ts';
import { NetClient } from './net/netClient.ts';
import { loopbackTransport } from './net/transport.ts';
import { loadProfile } from './profile.ts';
import { createAvatar, type Avatar } from './scene/avatar.ts';
import { YarnRopes, type RopeSpec } from './scene/yarnRopes.ts';
import { SpoolHill } from './scene/spoolHill.ts';
import { CoopProps } from './scene/coopProps.ts';
import { EnemyRenderer, type EnemyView } from './scene/enemyRenderer.ts';
import { Fx } from './scene/fx.ts';
import { PickupsView } from './scene/pickupsView.ts';
import { ViewModel } from './scene/viewModel.ts';
import { buildWoolGarage } from './scene/woolGarage.ts';
import { buildWoolBathroom } from './scene/woolBathroom.ts';
import { buildWoolToyStore } from './scene/woolToyStore.ts';
import { buildWoolGarden } from './scene/woolGarden.ts';
import { buildWoolPark } from './scene/woolPark.ts';
import { buildWoolRoom } from './scene/woolRoom.ts';
import { loadSettings, palette } from './settings.ts';
import { QUALITY_LAYERS, setWoolLayers, updateShellLod } from './wool/woolMaterial.ts';

/**
 * Local split-screen (plan: couch co-op): two toys on one screen, top and
 * bottom. The authoritative room runs on this page; each local player has
 * its own predicting NetClient, camera, view model and HUD, exactly like a
 * networked player, so every mode works the same on the couch.
 */

const params = new URLSearchParams(location.search);
const map: MapId = MAPS.some((m) => m.id === params.get('map')) ? (params.get('map') as MapId) : 'garden';
const modeParam = params.get('mode');
const mode: GameMode = modeParam === 'pvp' || modeParam === 'tdm' || modeParam === 'koth' ? modeParam : 'coop';
const waves = [0, 5, 10].includes(Number(params.get('waves'))) ? Number(params.get('waves')) : 10;
const difficulty = Math.max(0, Math.min(3, Number(params.get('difficulty') ?? 1) || 0));
const settings = loadSettings();
const profile = loadProfile();
/** Couch size: 2 players (top/bottom) or 3–4 (quadrants). */
const PLAYERS = Math.max(2, Math.min(4, Number(params.get('players') ?? 2) || 2));
document.body.classList.add(`players-${PLAYERS}`);

const host = new RoomHost({ code: 'COUCH', fillTo: 4, mode, map, waves, difficulty });
host.start();

// ---------------------------------------------------------------- scene

setWoolLayers(QUALITY_LAYERS.medium);
const world = createWorld(map);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = world.outdoor ? 1.0 : 1.15;
document.getElementById('app')!.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(world.outdoor ? 0xcfdfea : 0x2a2f3a);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = world.outdoor ? 0.5 : 0.22;
const env = world.id === 'park' ? buildWoolPark(scene, world, 'medium') : world.outdoor ? buildWoolGarden(scene, world, 'medium') : world.id === 'garage' ? buildWoolGarage(scene, world) : world.id === 'bathroom' ? buildWoolBathroom(scene, world) : world.id === 'toystore' ? buildWoolToyStore(scene, world) : buildWoolRoom(scene, world);
const coopProps = mode === 'coop' ? new CoopProps(scene, world) : null;
const enemyRenderer = mode === 'coop' ? new EnemyRenderer(scene, [palette(settings.colorblind).healthLow, palette(settings.colorblind).healthHigh]) : null;
const fx = new Fx(scene);
const pickups = new PickupsView(scene, world);
const sfx = new Sfx();
sfx.volume = settings.sfxVolume;
const music = new CombatMusic();

// ---------------------------------------------------------------- local players

interface Local {
  index: number;
  net: NetClient;
  camera: THREE.PerspectiveCamera;
  viewModel: ViewModel;
  yaw: number;
  pitch: number;
  weapon: number;
  action: number;
  lastBuild: number;
  deck: boolean;
  pad: PadReader | null;
  acc: number;
  hud: HTMLElement;
  down: HTMLElement;
  lastWeapon: number;
}

function makeLocal(index: number): Local {
  const look = index === 0 ? profile.look : randomLook();
  const name = index === 0 ? settings.name : `Player ${index + 1}`;
  const net = new NetClient(loopbackTransport(host), world, name, look);
  net.mode = mode;
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / (innerHeight / 2), 0.03, world.outdoor ? 900 : 200);
  camera.rotation.order = 'YXZ';
  // Layers: 1-4 view models, 5-8 own avatars (a camera never sees its own body or anyone else's gun).
  camera.layers.enable(1 + index);
  for (let j = 0; j < PLAYERS; j++) if (j !== index) camera.layers.enable(5 + j);
  scene.add(camera);
  const viewModel = new ViewModel(camera);
  viewModel.group.traverse((o) => o.layers.set(1 + index));
  const el = document.createElement('div');
  el.className = 'pview';
  el.id = `p${index}`;
  el.innerHTML = '<div class="xh"></div><div class="phud"></div><div class="pdown hidden"></div>';
  const r = viewRect(index);
  Object.assign(el.style, { left: `${r[0] * 100}%`, top: `${(1 - r[1] - r[3]) * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%` });
  document.body.appendChild(el);
  const l: Local = {
    index, net, camera, viewModel, yaw: 0, pitch: 0, weapon: 0, action: 0, lastBuild: DECK[0], deck: false, pad: null, acc: 0,
    hud: el.querySelector('.phud')!, down: el.querySelector('.pdown')!, lastWeapon: 0,
  };
  net.onSpawn = (s: PlayerState) => { l.yaw = s.yaw; l.pitch = 0; };
  return l;
}

/** Viewport of local player i as fractions [x, y, w, h] from the bottom-left (slot 3 is the spectator when three play). */
function viewRect(i: number): [number, number, number, number] {
  if (PLAYERS === 2) return i === 0 ? [0, 0.5, 1, 0.5] : [0, 0, 1, 0.5];
  return [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]][i].concat([0.5, 0.5]) as [number, number, number, number];
}

const locals = Array.from({ length: PLAYERS }, (_, i) => makeLocal(i));
// Invaders far from every player's camera drop to cheap proxies.
if (enemyRenderer && params.get('lod') !== '0') enemyRenderer.lodFrom = locals.map((l) => l.camera.position);
/** Three players: the spare quadrant slowly orbits the battle. */
const spectator = PLAYERS === 3 ? new THREE.PerspectiveCamera(50, 1, 0.1, world.outdoor ? 900 : 200) : null;
const main = locals[0].net;

// ---------------------------------------------------------------- avatars (from player 1's view of the room)

const avatars = new Map<number, Avatar>();
const yarnRopes = new YarnRopes(scene);
const spoolHill = mode === 'koth' ? new SpoolHill(scene, world, palette(settings.colorblind).team) : null;
const ropeSpecs: RopeSpec[] = [];
function syncAvatars(): void {
  for (const [id, a] of avatars) if (!main.roster.has(id)) { scene.remove(a.root); avatars.delete(id); }
  for (const [id, r] of main.roster) {
    if (avatars.has(id)) continue;
    const a = createAvatar(r.color, id, r.look);
    const localIndex = locals.findIndex((l) => l.net.id === id);
    if (localIndex >= 0) {
      a.root.traverse((o) => o.layers.set(5 + localIndex));
      locals[localIndex].viewModel.setJacket(jacketColor(r.look, r.color));
      locals[localIndex].viewModel.setLook(r.look);
    }
    scene.add(a.root);
    avatars.set(id, a);
  }
}
for (const l of locals) l.net.onRoster = syncAvatars;

// ---------------------------------------------------------------- shots and events (shared)

const bannerEl = document.getElementById('banner')!;
let bannerTimer = 0;
function banner(text: string, kind = ''): void {
  bannerEl.textContent = text;
  bannerEl.className = `hud show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { bannerEl.className = 'hud'; }, 2600);
}

function eyeOf(id: number): THREE.Vector3 | null {
  const l = locals.find((x) => x.net.id === id);
  if (l?.net.predicted) { const e = eyePosition(l.net.predicted, false); return new THREE.Vector3(e[0], e[1] - 0.2, e[2]); }
  const r = main.remotes().find((x) => x.id === id);
  return r ? new THREE.Vector3(r.x, r.y + PLAYER.eyeHeight - 0.25, r.z) : null;
}

main.onShot = (s) => {
  const to = new THREE.Vector3(...s.to);
  if (s.kind === ShotKind.Blast) {
    const w = WEAPONS[s.hit]?.projectile ? WEAPONS[s.hit] : WEAPONS[4];
    fx.blast(to, w.color, w.projectile!.radius);
    sfx.play(w.id === 4 ? 'blast' : 'splat', 0.7);
    return;
  }
  if (s.kind === ShotKind.Zap && s.from) { fx.zap(new THREE.Vector3(...s.from), to, s.id < 128 ? WEAPONS[6].color : undefined); return; }
  if (s.kind === ShotKind.Enemy && s.from) { fx.projectile(new THREE.Vector3(...s.from), to, 0xff5040, true); return; }
  if (s.id === ENEMY_SHOT_ID) return;
  let from: THREE.Vector3 | null;
  let color = 0xe8742a;
  if (s.id >= TURRET_SHOT_BASE) {
    const pad = world.coop.pads[s.id - TURRET_SHOT_BASE];
    from = pad ? new THREE.Vector3(pad.pos[0], TURRET.height, pad.pos[2]) : null;
  } else {
    from = eyeOf(s.id);
    const w = main.latest?.players.find((p) => p.id === s.id)?.weapon ?? 0;
    color = WEAPONS[w]?.color ?? color;
  }
  if (from) fx.projectile(from, to, color, false);
  fx.puff(to, s.enemy || s.hit ? 0xfff2cc : 0xcfd6e6, 0.7);
};

main.onEvent = (e) => {
  if (e.type === 'phase') {
    if (e.phase === Phase.Wave) { banner(`WAVE ${e.wave} INCOMING!`); sfx.play('wave'); }
    else if (e.phase === Phase.Build && e.wave > 0) banner(`WAVE ${e.wave} CLEARED!`, 'good');
    else if (e.phase === Phase.Won) { banner('THE HEARTSPOOLS ARE SAFE!', 'good'); sfx.play('win'); }
    else if (e.phase === Phase.Lost) { banner('THE HEARTSPOOLS UNRAVELLED', 'bad'); sfx.play('lose'); }
  } else if (e.type === 'boss') banner(e.state === 'arrive' ? 'THE UNRAVELLER APPROACHES!' : 'THE UNRAVELLER IS UNPICKED!', e.state === 'arrive' ? 'bad' : 'good');
  else if (e.type === 'drum') sfx.play('drum', 0.4);
  else if (e.type === 'pop') { enemyRenderer?.popNear(e.x, e.z); sfx.play('pop', 0.6); }
  else if (e.type === 'stomp') { fx.stomp(new THREE.Vector3(e.x, 0, e.z)); fx.shake = 1; sfx.play('stomp'); }
  else if (e.type === 'snap') coopProps?.snap(e.pad);
  else if (e.type === 'kill' && locals.some((l) => l.net.id === e.by)) sfx.play('kill', 0.7);
  else if (e.type === 'downed' && locals.some((l) => l.net.id === e.id)) sfx.play('downed');
  else if (e.type === 'revived') sfx.play('revived');
  else if (e.type === 'pickup' && locals.some((l) => l.net.id === e.id)) sfx.play('pickup');
};

// ---------------------------------------------------------------- input

const keys = new Set<string>();
let mouseDown = false;
const join = document.getElementById('join')!;
join.addEventListener('click', () => {
  join.classList.add('hidden');
  sfx.unlock();
  music.start(settings.musicVolume);
  renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const l = locals[0];
  l.yaw -= e.movementX * settings.sensitivity;
  l.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, l.pitch - e.movementY * settings.sensitivity * (settings.invertY ? -1 : 1)));
});
let grappleDown = false;
document.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) grappleDown = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) grappleDown = false; });
document.addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  const l = locals[0];
  const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
  if (e.repeat) return;
  if (digit && l.deck && digit <= DECK.length) { l.lastBuild = DECK[digit - 1]; l.action = l.lastBuild; }
  else if (digit && digit <= WEAPONS.length) l.weapon = digit - 1;
  else if (e.code === settings.keys.deck) l.deck = !l.deck;
  else if (e.code === settings.keys.rebuild) l.action = l.lastBuild;
  else if (e.code === settings.keys.recycle) l.action = 20;
  else if (e.code === settings.keys.ready) l.action = 21;
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

const K = settings.keys;
const KEYMAP: [string[], number][] = [
  [[K.forward], Buttons.Forward], [[K.back], Buttons.Back], [[K.left], Buttons.Left], [[K.right], Buttons.Right],
  [[K.jump], Buttons.Jump], [[K.sprint], Buttons.Sprint], [[K.crouch], Buttons.Crouch], [[K.reload], Buttons.Reload], [[K.use], Buttons.Use],
  [[K.grapple], Buttons.Grapple],
];

/**
 * Pads: with one per player, everyone gets a pad; otherwise player 1 has the
 * keyboard and mouse and the pads go to players 2, 3, 4 in the order connected.
 */
function assignPads(): void {
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
  const first = pads.length >= PLAYERS ? 0 : 1;
  pads.slice(0, PLAYERS - first).forEach((p, k) => { locals[first + k].pad ??= new PadReader(p.index); });
}
addEventListener('gamepadconnected', assignPads);

function sample(l: Local, dt: number): number {
  let b = 0;
  if (l.index === 0 && document.pointerLockElement === renderer.domElement) {
    for (const [codes, bit] of KEYMAP) if (codes.some((c) => keys.has(c))) b |= bit;
    if (mouseDown) b |= Buttons.Fire;
    if (grappleDown) b |= Buttons.Grapple;
  }
  if (l.pad) {
    const f = l.pad.poll(dt, settings.sensitivity / 0.0022, settings.invertY);
    if (f.active && !join.classList.contains('hidden')) { join.classList.add('hidden'); sfx.unlock(); music.start(settings.musicVolume); }
    b |= f.buttons;
    l.yaw += f.dYaw;
    l.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, l.pitch + f.dPitch));
    if (f.weaponDelta) l.weapon = cycleWeapon(l.weapon, f.weaponDelta);
    if (f.toggleDeck) l.deck = !l.deck;
    if (f.cardDelta) l.lastBuild = cycleCard(l.lastBuild, f.cardDelta);
    if (l.pad.ltEdge) l.action = l.lastBuild;
    if (f.action) l.action = f.action;
  }
  return b;
}

// ---------------------------------------------------------------- HUD

const $ = (id: string) => document.getElementById(id)!;
function updateHud(): void {
  for (const l of locals) {
    const me = l.net.me();
    const s = l.net.predicted;
    const w = WEAPONS[s?.weapon ?? 0];
    const hp = me?.health ?? 0;
    const name = l.net.roster.get(l.net.id)?.name ?? `Player ${l.index + 1}`;
    l.hud.innerHTML = `<div><div class="name">${name}${l.pad ? ' 🎮' : ''}</div><div class="bar"><i style="width:${(hp / PLAYER.maxHealth) * 100}%"></i></div>
      ${Math.ceil(hp)} stitches${me?.armor ? ` · +${Math.ceil(me.armor)} thimble` : ''}${l.deck ? ` · deck: ${BUILDABLES[l.lastBuild].short}` : ''}</div>
      <div><div class="wpn">${w.name}</div><div class="ammo">${s ? (s.reload > 0 ? '…' : `${s.mags[s.weapon]} / ${w.magazine}`) : ''}</div></div>`;
    l.down.classList.toggle('hidden', !me?.downed && !!s);
    l.down.textContent = me?.downed ? `UNRAVELLING… ${Math.round((me.revive ?? 0) * 100)}% re-stitched` : !s ? `Re-stitching in ${l.net.respawn.toFixed(0)} s` : '';
  }
  const c = main.coop;
  if (c) {
    $('wave').textContent = c.phase === Phase.Won ? 'VICTORY' : c.phase === Phase.Lost ? 'DEFEAT' : c.wave === 0 ? 'GET READY' : c.totalWaves ? `WAVE ${c.wave} / ${c.totalWaves}` : `WAVE ${c.wave} · ENDLESS`;
    $('phase').innerHTML = c.phase === Phase.Build ? `Build · <b>${Math.ceil(c.timer)}s</b> · ${c.buttons} buttons · ${DIFFICULTIES[c.difficulty].name}` : `${c.buttons} buttons${c.boss >= 0 ? ` · BOSS ${Math.round(c.boss * 100)}%` : ''}`;
    $('cores-line').textContent = c.cores.map((k, i) => `${'ABC'[i]} ${Math.round(k.health * 100)}%`).join(' · ');
  } else {
    $('wave').textContent = mode === 'tdm' ? 'TEAM DEATHMATCH' : mode === 'koth' ? 'KING OF THE SPOOL' : 'FREE-FOR-ALL';
    $('phase').textContent = locals.map((l) => `${l.net.roster.get(l.net.id)?.name ?? '?'} ${l.net.me()?.kos ?? 0} KO`).join(' · ');
    const k = main.koth;
    $('cores-line').textContent = k ? `Cotton ${Math.floor(k.scores[0])} · Wool ${Math.floor(k.scores[1])} / ${KOTH.target}${k.holder === 2 ? ' · CONTESTED' : ''}` : '';
  }
}

// ---------------------------------------------------------------- loop

let last = performance.now();
let hudTimer = 0;
const enemyLast = new Map<number, { x: number; z: number; phase: number; yaw: number }>();

function frame(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  assignPads();

  for (const l of locals) {
    const buttons = sample(l, dt);
    l.acc += dt;
    while (l.acc >= 1 / 60) {
      l.acc -= 1 / 60;
      const action = l.action;
      l.action = 0;
      const r = l.net.input(buttons, l.yaw, l.pitch, now, l.weapon, action);
      if (r.fired && l.net.predicted) {
        const s = l.net.predicted;
        const o = eyePosition(s, (buttons & Buttons.Crouch) !== 0);
        const weapon = WEAPONS[r.weapon];
        if (!weapon.projectile) {
          for (const d of pelletDirections(weapon, lookDirection(s.yaw, s.pitch), r.seq)) {
            const tt = rayWorld(o, d, world.boxes, weapon.range);
            const end = new THREE.Vector3(o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt);
            if (weapon.chain) fx.zap(l.viewModel.muzzle(), end, weapon.color);
            else fx.projectile(l.viewModel.muzzle(), end, weapon.color, r.weapon === 1);
          }
        }
        sfx.play((['popper', 'buster', 'lance', 'hook', 'launch', 'glue', 'sock'] as const)[r.weapon], 0.8);
        l.viewModel.fire();
      }
      if (r.hook === 1) sfx.play('yarnShot', 0.8);
      else if (r.hook === -1) sfx.play('yarnMiss', 0.6);
      if (r.mantled) sfx.play('mantle', 0.6);
    }
    l.net.decayCorrection(dt);
    const p = l.net.predicted;
    if (p) {
      const e = eyePosition(p, (buttons & Buttons.Crouch) !== 0);
      l.camera.position.set(e[0] + l.net.correction.x, e[1] + l.net.correction.y, e[2] + l.net.correction.z);
      if (fx.shake > 0.01) l.camera.position.x += (Math.random() - 0.5) * fx.shake * (settings.reduceShake ? 0.03 : 0.2);
      l.camera.rotation.set(l.pitch, l.yaw, 0);
      if (p.weapon !== l.lastWeapon) { l.viewModel.setWeapon(p.weapon); l.lastWeapon = p.weapon; }
      l.viewModel.update(dt, Math.hypot(p.vx, p.vz), p.onGround);
      l.viewModel.group.visible = !p.downed;
    } else if (main.latest) {
      l.camera.position.set(Math.sin(t * 0.2 + l.index * 3) * 20, 18, Math.cos(t * 0.2 + l.index * 3) * 20);
      l.camera.lookAt(0, 1, 0);
      l.viewModel.group.visible = false;
    }
  }

  // Everyone's avatars, from player 1's view (local toys use their exact predicted state).
  ropeSpecs.length = 0;
  for (const [id, a] of avatars) {
    const l = locals.find((x) => x.net.id === id);
    if (l) {
      const p = l.net.predicted;
      a.root.visible = !!p;
      if (p) {
        a.root.position.set(p.x, p.y, p.z);
        a.root.rotation.y = l.yaw;
        a.update(dt, t, Math.hypot(p.vx, p.vz) / PLAYER.runSpeed, l.pitch, false, !p.onGround, p.downed);
        if (p.hooked) ropeSpecs.push({ key: id, from: new THREE.Vector3(p.x, p.y + 0.9, p.z), to: new THREE.Vector3(p.hx, p.hy, p.hz) });
      }
      continue;
    }
    const r = main.remotes(now).find((x) => x.id === id);
    a.root.visible = !!r;
    if (r) {
      a.root.position.set(r.x, r.y, r.z);
      a.root.rotation.y = r.yaw;
      a.update(dt, t, 0.6, r.pitch, r.crouch, false, !r.alive || r.downed);
      if (r.hook && r.alive) ropeSpecs.push({ key: id, from: new THREE.Vector3(r.x, r.y + 0.9, r.z), to: new THREE.Vector3(...r.hook) });
    }
  }
  yarnRopes.update(ropeSpecs, dt);
  spoolHill?.update(main.koth, t, dt);

  if (enemyRenderer) {
    const views: EnemyView[] = main.enemySamples(now).map((e) => {
      const v = enemyLast.get(e.id) ?? { x: e.x, z: e.z, phase: 0, yaw: 0 };
      const moved = Math.hypot(e.x - v.x, e.z - v.z);
      v.phase += moved * 5;
      if (Math.hypot(e.vx, e.vz) > 1e-3) v.yaw = Math.atan2(-e.vx, -e.vz);
      v.x = e.x; v.z = e.z;
      enemyLast.set(e.id, v);
      return { id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, yaw: v.yaw, health: e.health, phase: v.phase, speed: moved / Math.max(dt, 1e-3) / ENEMIES[e.type].speed, hitAge: 1 };
    });
    enemyRenderer.update(views, t);
  }
  coopProps?.update(main.coop, t, -1, () => null);
  if (main.latest) pickups.update(dt, t, main.latest.pickups, main.latest.drops, main.latest.projectiles, -1);
  fx.update(dt);
  env.update(t, locals[0].camera);
  updateShellLod(locals[0].camera);
  const c = main.coop;
  music.setIntensity((!c ? 2 : c.phase === Phase.Wave ? (c.boss >= 0 ? 3 : 2) : c.phase === Phase.Build ? 1 : 0) as Intensity);

  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.1; updateHud(); }

  // One viewport per player: halves for two, quadrants for three or four.
  const w = innerWidth, h = innerHeight;
  renderer.setScissorTest(true);
  const draw = (cam: THREE.PerspectiveCamera, i: number) => {
    const r = viewRect(i);
    const x = Math.floor(r[0] * w), y = Math.floor(r[1] * h), vw = Math.ceil(r[2] * w), vh = Math.ceil(r[3] * h);
    renderer.setViewport(x, y, vw, vh);
    renderer.setScissor(x, y, vw, vh);
    cam.aspect = vw / vh;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
  };
  locals.forEach((l, i) => draw(l.camera, i));
  if (spectator) {
    // Orbit inside the map's walls, looking at the middle of the room.
    const { min, max } = world.bounds;
    const cx = (min[0] + max[0]) / 2, cz = (min[1] + max[1]) / 2;
    const rx = (max[0] - min[0]) * 0.4, rz = (max[1] - min[1]) * 0.4;
    spectator.position.set(cx + Math.sin(t * 0.08) * rx, Math.min(22, Math.max(rx, rz) * 0.6), cz + Math.cos(t * 0.08) * rz);
    spectator.lookAt(cx, 0, cz);
    draw(spectator, 3);
  }
  renderer.setScissorTest(false);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
if (params.get('autopilot') === '1') join.classList.add('hidden');
(window as unknown as { __split: unknown }).__split = { locals, host };
frame();
