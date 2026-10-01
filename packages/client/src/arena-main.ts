import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BUILD_RANGE, Buildable, BUILDABLES, Buttons, createWorld, ENEMIES, ENEMY_INTERP_DELAY_MS, eyePosition, lookDirection, MAX_PITCH,
  pelletDirections, Phase, PLAYER, rayBox, rayPlayer, rayWorld, TURRET, TURRET_SHOT_BASE, WEAPONS,
  GRAPPLE, KOTH, MAPS, TEAM_COLORS, TEAM_NAMES, type GameMode, type MapId, type PlayerState, type Vec3,
  Action, DECK, DIFFICULTIES, ENEMY_SHOT_ID, EnemyType, launchProjectile, LAUNCHER, MAX_TIER, PICKUPS, PickupKind, ShotKind, upgradeCost, WEAPON_COUNT,
} from '@stitchstrike/shared';
import { CombatMusic, type Intensity } from './audio/combatMusic.ts';
import { PickupsView } from './scene/pickupsView.ts';
import { Sfx } from './audio/sfx.ts';
import { keyLabel, loadSettings, palette } from './settings.ts';
import { setPresence, syncAchievements, unlockAchievement } from './platform.ts';
import { NetClient, type EnemySample } from './net/netClient.ts';
import { withFakeLag, workerTransport, wsTransport, type Transport } from './net/transport.ts';
import { createAvatar, type Avatar } from './scene/avatar.ts';
import { CORE_COLORS, CORE_LETTERS, CoopProps } from './scene/coopProps.ts';
import { EnemyRenderer, type EnemyView } from './scene/enemyRenderer.ts';
import { Fx } from './scene/fx.ts';
import { YarnRopes, type RopeSpec } from './scene/yarnRopes.ts';
import { SpoolHill } from './scene/spoolHill.ts';
import { createPost, type Post } from './scene/post.ts';
import { ViewModel } from './scene/viewModel.ts';
import { buildWoolGarden } from './scene/woolGarden.ts';
import { buildWoolPark } from './scene/woolPark.ts';
import { buildWoolRoom } from './scene/woolRoom.ts';
import { buildWoolGarage } from './scene/woolGarage.ts';
import { buildWoolBathroom } from './scene/woolBathroom.ts';
import { buildWoolToyStore } from './scene/woolToyStore.ts';
import { TraversalView } from './scene/traversalView.ts';
import { levelOf, loadProfile } from './profile.ts';
import { award, wearable, XP, type Award } from './progression.ts';
import { jacketColor } from './figures/looks.ts';
import { cycleCard, cycleWeapon, PadReader } from './input/gamepad.ts';
import { Briefing, BOSS_LINE, BRIEFINGS, LOSE_LINE, nextTaunt, nextTip, WIN_LINE } from './briefing.ts';
import { QUALITY_LAYERS, setWoolLayers, updateShellLod } from './wool/woolMaterial.ts';

/**
 * STITCHSTRIKE: wool toys defending the Heartspools (co-op) or fighting each
 * other (PvP) in a fully knitted bedroom. Server-authoritative multiplayer.
 *
 * URL params: ?mode=coop|pvp  ?solo=1 (server in a Web Worker)  ?room=CODE  ?bots=N  ?lag=RTT_MS
 *             ?name=Pip  ?server=ws://host:port  ?quality=low|medium|high  ?autopilot=1 (headless tests)
 */

const params = new URLSearchParams(location.search);
const map: MapId = MAPS.some((m) => m.id === params.get('map')) ? (params.get('map') as MapId) : 'bedroom';
const world = createWorld(map);
const modeParam = params.get('mode');
const mode: GameMode = modeParam === 'pvp' || modeParam === 'tdm' || modeParam === 'koth' ? modeParam : 'coop';
const wavesParam = Number(params.get('waves') ?? 10);
const waves = [0, 5, 10].includes(wavesParam) ? wavesParam : 10;
const difficulty = Math.max(0, Math.min(3, Math.floor(Number(params.get('difficulty') ?? 1)) || 0));
const solo = params.get('solo') === '1';
const lag = Math.max(0, Number(params.get('lag') ?? 0) || 0);
const bots = params.get('bots');
const settings = loadSettings();
const PAL = palette(settings.colorblind);
// Colour-blind palette for the HUD's good/bad accents.
document.documentElement.style.setProperty('--lime', `#${PAL.good.toString(16).padStart(6, '0')}`);
document.documentElement.style.setProperty('--red', `#${PAL.bad.toString(16).padStart(6, '0')}`);
const profile = loadProfile();
profile.look = wearable(profile, profile.look);
const quality = (params.get('quality') ?? settings.quality) as 'low' | 'medium' | 'high';
const autopilot = params.get('autopilot') === '1';
/** Fixed cinematic camera for screenshots and spectating: ?cam=overview|core|window. */
const fixedCam = params.get('cam');
const name = (params.get('name') ?? settings.name).slice(0, 16);
document.body.classList.add(mode);
document.getElementById('modeline')!.textContent = mode === 'coop'
  ? `Co-op defence · ${waves === 0 ? 'Endless' : `${waves} waves`} · ${DIFFICULTIES[difficulty].name}`
  : mode === 'tdm' ? 'Team Deathmatch · Team Cotton vs Team Wool'
  : mode === 'koth' ? `King of the Spool · hold the Golden Spool · first to ${KOTH.target}` : 'PvP free-for-all · first to unravel the most toys';
if (mode === 'tdm' || mode === 'koth') document.body.classList.add('pvp');

// ---------------------------------------------------------------- transport

function connect(): Transport {
  if (solo) return withFakeLag(workerTransport(bots === null ? 4 : Number(bots), mode, map, waves, difficulty, Number(params.get('wave') ?? 1) || 1), lag);
  const q = new URLSearchParams();
  q.set('room', params.get('room') ?? 'LOBBY');
  q.set('mode', mode);
  q.set('map', map);
  q.set('waves', String(waves));
  q.set('difficulty', String(difficulty));
  if (bots !== null) q.set('bots', bots);
  const base = params.get('server') ?? (settings.server || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  return withFakeLag(wsTransport(`${base}/?${q}`), lag);
}

const net = new NetClient(connect(), world, name, profile.look);
net.mode = mode;

// ---------------------------------------------------------------- renderer + scene

setWoolLayers(QUALITY_LAYERS[quality === 'low' ? 'low' : 'medium']);
const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = world.outdoor ? 1.0 : 1.15;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(world.outdoor ? 0xf2d9b0 : 0x3a2a22);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = world.outdoor ? 0.5 : 0.22;
const room = world.id === 'park' ? buildWoolPark(scene, world, quality) : world.outdoor ? buildWoolGarden(scene, world, quality) : world.id === 'garage' ? buildWoolGarage(scene, world) : world.id === 'bathroom' ? buildWoolBathroom(scene, world) : world.id === 'toystore' ? buildWoolToyStore(scene, world) : buildWoolRoom(scene, world);
(window as unknown as { __stitchstrike: unknown }).__stitchstrike = { net, scene, renderer, get enemyRenderer() { return enemyRenderer; } };

const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.03, world.outdoor ? 900 : 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

let post: Post | null = null;
if (quality !== 'low') {
  // The cozy stop-motion look: warm grade, soft bloom, tilt-shift miniature edges.
  post = createPost(renderer, scene, camera, { dof: false, ao: quality === 'high', bloomStrength: world.outdoor ? 0.22 : 0.4, vignette: 0.3, grain: 0.012, grade: 1, tilt: settings.miniature ? 0.7 : 0 });
}

const viewModel = new ViewModel(camera);
const muzzleFlash = new THREE.PointLight(0xffb060, 0, 3, 2);
muzzleFlash.position.set(0.26, -0.18, -0.9);
camera.add(muzzleFlash);

const fx = new Fx(scene);
const sfx = new Sfx();
sfx.volume = settings.sfxVolume;
const coopProps = mode === 'coop' ? new CoopProps(scene, world) : null;
const enemyRenderer = mode === 'coop' ? new EnemyRenderer(scene, [PAL.healthLow, PAL.healthHigh]) : null;
// Distance LOD for invaders (?lod=0 turns it off, for comparisons).
if (enemyRenderer && params.get('lod') !== '0') enemyRenderer.lodFrom = [camera.position];

// ---------------------------------------------------------------- players

const avatars = new Map<number, Avatar>();
let ownAvatar: Avatar | null = null;
const lastPos = new Map<number, THREE.Vector3>();
const remoteNow = new Map<number, THREE.Vector3>();
const yarnRopes = new YarnRopes(scene);
const ropeSpecs: RopeSpec[] = [];
let grappleDown = false;
const crosshairEl = document.getElementById('crosshair')!;
let lastMantle = 0;

/** Team yarn as this player sees it (remapped for colour-blind settings). */
function shownColor(c: number): number {
  const t = TEAM_COLORS.indexOf(c);
  return t >= 0 ? PAL.team[t] : c;
}
const hexOf = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function syncAvatars(): void {
  for (const [id, a] of avatars) {
    if (!net.roster.has(id) || id === net.id) { scene.remove(a.root); avatars.delete(id); }
  }
  for (const [id, r] of net.roster) {
    if (id === net.id) {
      if (!ownAvatar) {
        ownAvatar = createAvatar(shownColor(r.color), id, r.look);
        ownAvatar.root.visible = false;
        scene.add(ownAvatar.root);
        viewModel.setJacket(jacketColor(r.look, shownColor(r.color)));
        viewModel.setLook(r.look);
      }
      continue;
    }
    if (!avatars.has(id)) {
      const a = createAvatar(shownColor(r.color), id, r.look);
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

interface EnemyVisual { yaw: number; phase: number; speed: number; hitAge: number; last: THREE.Vector3 }
const enemyVisuals = new Map<number, EnemyVisual>();
let enemies: EnemySample[] = [];
const ENEMY_COLORS = [0xb3262c, 0x6a3c9a, 0xb8a58a, 0x3e5a3a, 0xf6f1e4, 0x2f7fe0, 0x2f5a9a, 0x2a2a30, 0xe8742a, 0x8a5a3a, 0xb3262c, 0xffc94a];

net.onEnemyGone = (e) => {
  // Show the unravel when the interpolated view reaches that moment, not when the packet lands.
  setTimeout(() => {
    const at = new THREE.Vector3(e.x, e.y + ENEMIES[e.type].height * 0.5, e.z);
    const big = e.type === EnemyType.Brute || e.type === EnemyType.Boss;
    fx.fluffBurst(at, ENEMY_COLORS[e.type], e.type === EnemyType.Boss ? 600 : big ? 140 : 45, big ? 6 : 3);
    fx.fluffBurst(at, 0xfff8ee, big ? 60 : 12, 2.5); // stuffing
    fx.burstPieces(at, ENEMY_COLORS[e.type], e.type === EnemyType.Boss ? 24 : big ? 12 : e.type === EnemyType.Teeth ? 3 : 6, e.type === EnemyType.Boss ? 3 : big ? 1.8 : 1);
    fx.puff(at, 0xfff2e0, e.type === EnemyType.Boss ? 8 : big ? 3 : 1.5);
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
  if (s.kind === ShotKind.Blast) {
    // Blasts carry the weapon that burst in `hit`: a yarn ball, or a glob of hot glue.
    const w = WEAPONS[s.hit]?.projectile ? WEAPONS[s.hit] : WEAPONS[LAUNCHER];
    fx.blast(to, w.color, w.projectile!.radius);
    sfx.play(w.id === LAUNCHER ? 'blast' : 'splat', attenuation(to));
    fx.shake = Math.max(fx.shake, (w.id === LAUNCHER ? 0.4 : 0.12) * attenuation(to));
    if (s.id === net.id) { pickupsView.clearLocal(); if (s.enemy) hitMarker(false); }
    return;
  }
  if (s.kind === ShotKind.Zap && s.from) {
    const sock = s.id < TURRET_SHOT_BASE;
    fx.zap(new THREE.Vector3(...s.from), to, sock ? WEAPONS[6].color : undefined);
    sfx.play(sock ? 'sock' : 'zap', attenuation(to) * 0.7);
    // Static Sock arcs: our chain hits mark, arcs that land on us hurt.
    if (sock && s.id === net.id && (s.enemy || s.hit)) hitMarker(false);
    if (sock && s.hit === net.id) { damageFlash(); sfx.play('hurt'); }
    return;
  }
  if (s.kind === ShotKind.Enemy && s.from) {
    const from = new THREE.Vector3(...s.from);
    fx.projectile(from, to, 0xff5040, true);
    sfx.play('enemyShot', attenuation(from) * 0.6);
    if (s.hit === net.id) { damageFlash(); sfx.play('hurt'); hurtFrom(from); }
    return;
  }
  if (s.id === ENEMY_SHOT_ID) return;
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
  let weapon = 0;
  if (s.id >= TURRET_SHOT_BASE) {
    const pad = world.coop.pads[s.id - TURRET_SHOT_BASE];
    if (!pad) return;
    from = new THREE.Vector3(pad.pos[0], TURRET.height, pad.pos[2]);
    color = 0xe8742a;
    sfx.play('turret', attenuation(from));
  } else {
    const p = remoteNow.get(s.id);
    from = p ? p.clone().add(new THREE.Vector3(0, PLAYER.eyeHeight - 0.25, 0)) : to.clone().add(new THREE.Vector3(0, 0.5, 0));
    weapon = net.latest?.players.find((q) => q.id === s.id)?.weapon ?? 0;
    color = weapon === 0 ? colorOf(s.id) : WEAPONS[weapon]?.color ?? colorOf(s.id);
    sfx.play(WEAPON_SOUNDS[weapon] ?? 'popper', attenuation(from) * 0.6);
  }
  if (WEAPONS[weapon]?.chain) fx.zap(from, to, color);
  else fx.projectile(from, to, color, weapon === 1);
  if (s.hit === net.id) { damageFlash(); sfx.play('hurt'); hurtFrom(from); }
  fx.puff(to, s.hit || s.enemy ? 0xfff2cc : 0xcfd6e6, 0.8);
};

const WEAPON_SOUNDS = ['popper', 'buster', 'lance', 'hook', 'launch', 'glue', 'sock'] as const;

function attenuation(p: THREE.Vector3): number {
  return Math.max(0.05, 1 - camera.position.distanceTo(p) / 30);
}

// ---------------------------------------------------------------- events

const briefing = new Briefing(() => settings.sfxVolume, settings.subtitles);
let briefed = false;

/** This match, for the results card. */
const session = { kills: 0, revives: 0, waves: 0, xp: 0, credits: 0 };

function progress(xp: number, credits: number, stats: Parameters<typeof award>[3] = {}, ctx: Parameters<typeof award>[4] = {}): void {
  if (autopilot) return;
  const a: Award = award(profile, xp, credits, stats, ctx);
  session.xp += a.xp;
  session.credits += a.credits;
  if (xp >= 40) popup(`+${xp} XP${credits ? ` · +${credits} credits` : ''}`);
  if (a.levelUp) setTimeout(() => { banner(`LEVEL UP! LEVEL ${a.levelUp}`, 'good', 3000); sfx.play('win', 0.6); }, 600);
  for (const m of a.medals) unlockAchievement(m.id);
  a.medals.forEach((m, i) => setTimeout(() => { banner(`MEDAL: ${m.name.toUpperCase()}`, 'good', 3000); sfx.play('collect'); }, 1400 + i * 1600));
  if (a.unlocks.length) setTimeout(() => feed(`<span>Unlocked:</span> ${a.unlocks.map(escapeHtml).join(', ')}`, true), 900);
}

/** Subtitles: a short caption for sounds that carry information (throttled per cue). */
const captionsEl = Object.assign(document.createElement('div'), { id: 'captions' });
document.body.appendChild(captionsEl);
const captionAt = new Map<string, number>();
function caption(text: string, where?: THREE.Vector3): void {
  if (!settings.subtitles) return;
  const now = performance.now();
  if (now - (captionAt.get(text) ?? -1e9) < 3000) return;
  captionAt.set(text, now);
  let dir = '';
  if (where) {
    // Which side the sound came from, relative to where we're looking.
    const rel = Math.atan2(-(where.x - camera.position.x), -(where.z - camera.position.z)) - yaw;
    const a = Math.atan2(Math.sin(rel), Math.cos(rel));
    dir = Math.abs(a) < 0.6 ? ' (ahead)' : Math.abs(a) > 2.5 ? ' (behind)' : a > 0 ? ' (left)' : ' (right)';
  }
  const el = document.createElement('div');
  el.textContent = `[${text}${dir}]`;
  captionsEl.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

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
      if (e.attacker === net.id && mode !== 'coop') { session.kills++; progress(XP.pvpKo, 5, { kills: 1 }, { medals: session.kills >= 25 ? ['duelist'] : [] }); }
      renderScoreboard();
      break;
    }
    case 'kill':
      if (e.by === net.id) { sfx.play('kill'); popup(`+${e.reward} buttons`); session.kills++; progress(XP.kill, e.enemyType === EnemyType.Boss ? 100 : 1, { kills: 1 }); }
      break;
    case 'phase':
      if (e.phase === Phase.Wave) { banner(`WAVE ${e.wave} INCOMING!`); sfx.play('wave'); resultsCard(null); if (e.wave % 2 === 1 || e.wave === 1) briefing.say('baron', nextTaunt()); }
      else if (e.phase === Phase.Build && e.wave > 0) {
        banner(`WAVE ${e.wave} CLEARED!`, 'good');
        if (e.wave % 2 === 0) briefing.say('sarge', nextTip());
        session.waves++;
        progress(XP.wave, 25, { waves: 1, ...(net.waves === 0 ? { bestEndless: e.wave } : {}) });
      } else if (e.phase === Phase.Build) { banner('NEW MATCH · BUILD YOUR DEFENCE'); resultsCard(null); briefing.clear(); for (const l of BRIEFINGS[world.id]) briefing.say('sarge', l); Object.assign(session, { kills: 0, revives: 0, waves: 0, xp: 0, credits: 0 }); }
      else if (e.phase === Phase.Won) {
        banner('THE HEARTSPOOLS ARE SAFE!', 'good', 6000); sfx.play('win'); briefing.say('sarge', WIN_LINE);
        progress(Math.round(XP.win * (1 + 0.25 * net.difficulty)), 300, { wins: 1, matches: 1 }, { medals: net.difficulty >= 2 ? ['survivor'] : [] });
        setTimeout(() => resultsCard(true), 2500);
      } else if (e.phase === Phase.Lost) {
        banner('THE HEARTSPOOLS UNRAVELLED', 'bad', 6000); sfx.play('lose'); briefing.say('sarge', LOSE_LINE);
        progress(XP.match, 50, { matches: 1 });
        setTimeout(() => resultsCard(false), 2500);
      }
      break;
    case 'hillMove':
      banner('THE GOLDEN SPOOL HAS MOVED!', '', 2200);
      sfx.play('spring');
      break;
    case 'kothWin': {
      const mine = net.roster.get(net.id)?.team === e.team;
      banner(`${TEAM_NAMES[e.team].toUpperCase()} WINS THE ROUND!`, mine ? 'good' : 'bad', 4000);
      sfx.play(mine ? 'win' : 'lose');
      break;
    }
    case 'coreDown':
      banner(`HEARTSPOOL ${CORE_LETTERS[e.core]} UNRAVELLED!`, 'bad');
      sfx.play('alarm');
      break;
    case 'built':
      if (e.by === net.id) sfx.play(e.kind === Buildable.None ? 'sell' : e.tier > 1 ? 'upgrade' : 'build');
      if (e.by === net.id && e.tier > 1) popup(`${BUILDABLES[e.kind].short} tier ${e.tier}!`);
      if (e.by === 0 && e.kind === Buildable.None) sfx.play('alarm', 0.5);
      break;
    case 'downed': {
      const who = net.roster.get(e.id)?.name ?? '?';
      if (e.id === net.id) { banner('YOU ARE UNRAVELLING! HOLD ON…', 'bad'); sfx.play('downed'); }
      else feed(`${escapeHtml(who)} <span>is down · hold ${KL.use} to re-stitch</span>`, false);
      break;
    }
    case 'revived': {
      if (e.id === net.id) { banner('RE-STITCHED!', 'good'); sfx.play('revived'); }
      else if (e.by === net.id) { popup('Teammate re-stitched!'); sfx.play('revived'); session.revives++; progress(XP.revive, 10, { revives: 1 }); }
      if (e.by) feed(`${escapeHtml(net.roster.get(e.by)?.name ?? '?')} <span>re-stitched</span> ${escapeHtml(net.roster.get(e.id)?.name ?? '?')}`, e.by === net.id || e.id === net.id);
      break;
    }
    case 'pickup':
      if (e.id === net.id) {
        sfx.play('pickup');
        popup(e.kind === PickupKind.Stuffing ? `+${PICKUPS[0].amount} stitches` : e.kind === PickupKind.Thimble ? `+${PICKUPS[1].amount} thimble armour` : e.kind === PickupKind.YarnBasket ? 'YARN BASKET! Every magazine full' : 'POWER POM! ×1.5 damage');
      }
      break;
    case 'boss':
      if (e.state === 'arrive') { banner('THE UNRAVELLER APPROACHES!', 'bad', 4000); sfx.play('boss'); briefing.say('baron', BOSS_LINE); }
      else { banner('THE UNRAVELLER IS UNPICKED!', 'good', 4000); sfx.play('win'); progress(XP.boss, 200, { bossKills: 1 }); }
      break;
    case 'stomp': {
      const at = new THREE.Vector3(e.x, 0, e.z);
      fx.stomp(at);
      sfx.play('stomp', attenuation(at));
      caption('Ground-shaking stomp', at);
      fx.shake = Math.max(fx.shake, 1.2 * attenuation(at));
      break;
    }
    case 'drum': {
      const at = new THREE.Vector3(e.x, 1, e.z);
      sfx.play('drum', attenuation(at) * 0.8);
      if (attenuation(at) > 0.1) caption('Drums beating: invaders speed up', at);
      break;
    }
    case 'pop': {
      const at = new THREE.Vector3(e.x, 0.8, e.z);
      enemyRenderer?.popNear(e.x, e.z);
      fx.puff(at, 0xffc94a, 1.5);
      sfx.play('pop', attenuation(at));
      if (attenuation(at) > 0.1) caption('Jack-in-the-Box springs', at);
      break;
    }
    case 'snap': {
      coopProps?.snap(e.pad);
      const pad = world.coop.pads[e.pad];
      if (pad) sfx.play('snap', attenuation(new THREE.Vector3(pad.pos[0], 0, pad.pos[2])));
      break;
    }
  }
};

let yaw = 0;
let pitch = 0;
net.onSpawn = (s: PlayerState) => { yaw = s.yaw; pitch = 0; };

// ---------------------------------------------------------------- input

const keys = new Set<string>();
let mouseDown = false;
let thirdPerson = false;
const sensitivity = settings.sensitivity;
const invertY = settings.invertY ? -1 : 1;

const overlay = document.getElementById('overlay')!;
const lock = () => {
  sfx.unlock();
  music.start(settings.musicVolume);
  briefing.unlock();
  // The opening briefing plays once the player is in (audio is unlocked by the click).
  if (!briefed && mode === 'coop') { briefed = true; for (const l of BRIEFINGS[world.id]) briefing.say('sarge', l); }
  renderer.domElement.requestPointerLock();
};
renderer.domElement.addEventListener('click', lock);
overlay.addEventListener('click', lock);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
  if (locked) overlay.classList.add('paused'); // from now on the overlay is the pause screen
  if (!locked) { keys.clear(); mouseDown = false; }
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * sensitivity;
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - e.movementY * sensitivity * invertY));
});
document.addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) grappleDown = true;
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) grappleDown = false; });
document.addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); scoreboard.classList.remove('hidden'); }
  if (e.code === settings.keys.camera && !e.repeat) thirdPerson = !thirdPerson;
  if (e.code === 'F3') { e.preventDefault(); netPanel.classList.toggle('hidden'); }
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') scoreboard.classList.add('hidden');
  keys.delete(e.code);
});
window.addEventListener('blur', () => { keys.clear(); mouseDown = false; grappleDown = false; });

// Bound keys (Settings → Key bindings), plus the arrow keys as fixed alternatives for moving.
const K = settings.keys;
const KEYMAP: [string[], number][] = [
  [[K.forward, 'ArrowUp'], Buttons.Forward], [[K.back, 'ArrowDown'], Buttons.Back],
  [[K.left, 'ArrowLeft'], Buttons.Left], [[K.right, 'ArrowRight'], Buttons.Right],
  [[K.jump], Buttons.Jump], [[K.sprint], Buttons.Sprint],
  [[K.crouch], Buttons.Crouch], [[K.reload], Buttons.Reload], [[K.use], Buttons.Use],
  [[K.grapple], Buttons.Grapple],
];
/** Key names for HUD hints. */
const KL = Object.fromEntries(Object.entries(K).map(([a, c]) => [a, keyLabel(c)])) as Record<keyof typeof K, string>;

/** Weapon we want equipped (sent with every input), and the next one-shot action. */
let wantWeapon = 0;
let pendingAction = 0;
let lastBuild: number = Buildable.Turret;
let deckToggled = false;

/** The build deck is open when toggled with B, or automatically on a pad during the build phase. */
function deckOpen(): boolean {
  if (mode !== 'coop') return false;
  const s = net.predicted;
  const onPad = !!s && (coopProps?.nearestPad(s.x, s.z, BUILD_RANGE) ?? -1) >= 0;
  return deckToggled || (onPad && net.coop?.phase === Phase.Build);
}

document.addEventListener('keydown', (e) => {
  if (document.pointerLockElement !== renderer.domElement || e.repeat) return;
  const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : 0;
  if (digit >= 1 && deckOpen() && digit <= DECK.length) {
    lastBuild = DECK[digit - 1];
    pendingAction = lastBuild;
  } else if (digit >= 1 && digit <= WEAPON_COUNT) {
    wantWeapon = digit - 1;
  } else if (e.code === K.deck && mode === 'coop') {
    deckToggled = !deckToggled;
  } else if (e.code === K.rebuild && mode === 'coop') {
    pendingAction = lastBuild;
  } else if (e.code === K.recycle && mode === 'coop') {
    pendingAction = Action.Sell;
  } else if (e.code === K.ready && mode === 'coop') {
    pendingAction = Action.Ready;
  }
});
document.addEventListener('wheel', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  wantWeapon = (wantWeapon + (e.deltaY > 0 ? 1 : WEAPON_COUNT - 1)) % WEAPON_COUNT;
}, { passive: true });

/** Gamepad: works without pointer lock; the first pad that moves takes over. */
const pad = new PadReader(0);
let padActive = false;

function pollPad(dt: number): number {
  const f = pad.poll(dt, sensitivity / 0.0022, settings.invertY);
  if (!f.connected) return 0;
  if (f.active && !padActive) { padActive = true; overlay.classList.add('hidden'); sfx.unlock(); music.start(settings.musicVolume); briefing.unlock(); }
  if (!padActive) return 0;
  yaw += f.dYaw;
  pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + f.dPitch));
  if (f.weaponDelta) wantWeapon = cycleWeapon(wantWeapon, f.weaponDelta);
  if (f.toggleDeck) deckToggled = !deckToggled;
  if (f.cardDelta) lastBuild = cycleCard(lastBuild, f.cardDelta);
  if (pad.ltEdge && mode === 'coop') pendingAction = lastBuild;
  if (f.action && mode === 'coop') pendingAction = f.action;
  if (f.thirdPerson) thirdPerson = !thirdPerson;
  scoreboard.classList.toggle('hidden', !f.scoreboard && !keys.has('Tab'));
  return f.buttons;
}

function sampleButtons(): number {
  let b = 0;
  for (const [codes, bit] of KEYMAP) if (codes.some((c) => keys.has(c))) b |= bit;
  if (mouseDown) b |= Buttons.Fire;
  if (grappleDown) b |= Buttons.Grapple;
  return b;
}

/** Headless test driver: aims at the nearest enemy (co-op) or spins (PvP), readies up and fires. */
function autopilotButtons(now: number, p: PlayerState | null): number {
  let b = Buttons.Fire;
  if (Math.sin(now / 900) > 0.9) pendingAction = Action.Ready;
  // Cycle the arsenal so every weapon gets exercised.
  wantWeapon = Math.floor(now / 6000) % WEAPON_COUNT;
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
  // Every so often, show off the yarn-swing: look up, throw a strand and ride it.
  if (now % 10000 < 2600) {
    pitch = 0.85;
    b = Buttons.Grapple | Buttons.Forward;
  }
  return b;
}

// ---------------------------------------------------------------- HUD

const $ = (id: string) => document.getElementById(id)!;
const hud = {
  health: $('health-fill'), healthText: $('health-text'), ammo: $('ammo'), slots: $('slots'), score: $('score'),
  net: $('net'), status: $('status'), hit: $('hitmarker'), damage: $('damage'), feed: $('feed'),
  cores: $('cores'), wave: $('wave'), phase: $('phase'), deck: $('deck'), padhint: $('padhint'), buttons: $('buttons'), popups: $('popups'),
  armor: $('armor-fill'), boss: $('bossbar'), downed: $('downed'), downedText: $('downed-text'), downedFill: $('downed-fill'), revive: $('revive'),
  deckhint: $('deckhint'),
};
const scoreboard = $('scoreboard');
const netPanel = $('netpanel');
if (!settings.showNet) hud.net.style.display = 'none';

if (mode === 'coop') {
  hud.cores.innerHTML = CORE_LETTERS.map((l, i) => `<div class="core" id="core${i}">
    <div class="letter" style="background:#${CORE_COLORS[i].toString(16).padStart(6, '0')}">${l}</div>
    <div class="bars"><div class="hp"><i></i></div><div class="sh"><i></i></div></div></div>`).join('');
  hud.deck.innerHTML = DECK.map((k, i) => `<div class="card" id="card${k}" title="${BUILDABLES[k].blurb}">
    <div class="key">[${i + 1}] <span class="tier"></span></div><div>${BUILDABLES[k].short}</div><div class="cost">${BUILDABLES[k].cost}</div></div>`).join('');
}

let hitTimer = 0;
function hitMarker(head: boolean): void {
  hud.hit.classList.toggle('head', head);
  hud.hit.style.opacity = '1';
  hitTimer = 0.18;
  sfx.play('hit', 0.6);
}
let damageTimer = 0;
/** A red arc on the screen edge pointing at whoever just hit you. */
function hurtFrom(from: THREE.Vector3): void {
  const p = net.predicted;
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'hurt-arc';
  const angle = Math.atan2(from.x - p.x, from.z - p.z);
  // Screen angle relative to where we look (yaw 0 looks down -Z).
  const rel = -(angle - (yaw + Math.PI));
  el.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
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
  hud.armor.style.width = `${((me?.armor ?? 0) / PLAYER.maxArmor) * 100}%`;
  hud.healthText.innerHTML = `${Math.ceil(health)} stitches${me?.armor ? `<span class="armor">+${Math.ceil(me.armor)} thimble</span>` : ''}${me?.powered ? '<span class="power">POWER POM!</span>' : ''}`;
  const s = net.predicted;
  const w = WEAPONS[s?.weapon ?? 0];
  const mag = s ? s.mags[s.weapon] ?? 0 : 0;
  hud.ammo.textContent = s ? (s.reload > 0 ? 'Rewinding yarn…' : `${mag} / ${w.magazine}`) : '';
  hud.slots.innerHTML = WEAPONS.map((x, i) => `<span class="${i === (s?.weapon ?? 0) ? 'on' : ''}">${i + 1}<span class="n"> ${x.name}</span></span>`).join('');

  // Down and re-stitch.
  const downed = !!me?.downed;
  document.body.classList.toggle('is-downed', downed);
  hud.downed.classList.toggle('hidden', !downed);
  if (downed) {
    hud.downedText.textContent = `Bleeding out in ${net.respawn.toFixed(0)} s · a teammate can hold ${KL.use} to re-stitch you`;
    hud.downedFill.style.width = `${(me?.revive ?? 0) * 100}%`;
  }
  let reviveHtml = '';
  if (s && !downed) {
    for (const p of net.latest?.players ?? []) {
      if (p.id === net.id || !p.downed) continue;
      if (Math.hypot(p.x - s.x, p.z - s.z) < PLAYER.reviveRange + 2) {
        reviveHtml = `Hold <b>${KL.use}</b> to re-stitch ${escapeHtml(net.roster.get(p.id)?.name ?? 'teammate')} · ${Math.round(p.revive * 100)}%`;
      }
    }
  }
  hud.revive.innerHTML = reviveHtml;
  hud.score.textContent = me ? (mode === 'coop' ? `${me.kos} toys unravelled` : `${me.kos} KO · ${me.deaths} unravelled`) : '';
  const st = net.netStats();
  hud.net.textContent = `${st.transport} · ping ${Math.round(st.rtt)} ms · ${st.snapshotHz.toFixed(0)} Hz · ${st.kbpsIn.toFixed(0)} kbps`;
  netPanel.innerHTML = `tick ${net.latest?.tick ?? 0} · render tick ${net.renderTick().toFixed(1)}<br>
    pending inputs ${st.pending} · last correction ${st.lastCorrection.toFixed(4)} u<br>
    enemies drawn ${enemies.length} · fully posed ${enemyRenderer?.posed ?? 0} (the rest are distance proxies)`;

  const c = net.coop;
  if (c) {
    hud.wave.textContent = c.phase === Phase.Won ? 'VICTORY' : c.phase === Phase.Lost ? 'DEFEAT' : c.wave === 0 ? 'GET READY'
      : c.totalWaves === 0 ? `WAVE ${c.wave} · ENDLESS` : `WAVE ${c.wave} / ${c.totalWaves}`;
    hud.boss.classList.toggle('hidden', c.boss < 0);
    if (c.boss >= 0) (hud.boss.querySelector('i') as HTMLElement).style.width = `${c.boss * 100}%`;
    const humans = [...net.roster.values()].filter((r) => !r.bot).length;
    if (c.phase === Phase.Build) {
      hud.phase.innerHTML = `Build phase · <b>${Math.ceil(c.timer)}s</b> · press <b>${KL.ready}</b> to ready up (${c.ready}/${humans})`;
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
    const pad = s ? coopProps?.nearestPad(s.x, s.z, BUILD_RANGE) ?? -1 : -1;
    const here = pad >= 0 ? c.pads[pad] : null;
    const open = deckOpen();
    hud.deck.classList.toggle('open', open);
    for (const k of DECK) {
      const el = document.getElementById(`card${k}`);
      if (!el) continue;
      const upgrade = !!here && here.kind === k && here.tier < MAX_TIER;
      const cost = upgrade ? upgradeCost(k, here!.tier) : BUILDABLES[k].cost;
      el.classList.toggle('upgrade', upgrade);
      el.classList.toggle('selected', k === lastBuild);
      el.classList.toggle('poor', c.buttons < cost || (!!here && here.kind !== Buildable.None && !upgrade));
      (el.querySelector('.cost') as HTMLElement).textContent = upgrade ? `▲ ${cost}` : here && here.kind === k ? 'MAX' : String(cost);
      (el.querySelector('.tier') as HTMLElement).textContent = here && here.kind === k ? '★'.repeat(here.tier) : '';
    }
    if (pad >= 0) {
      const kind = here?.kind ?? 0;
      hud.padhint.innerHTML = kind === Buildable.None
        ? `Build pad ${CORE_LETTERS[world.coop.pads[pad].core]} · ${open ? 'press <b>1–7</b> to build' : `press <b>${KL.deck}</b> for the build deck`}`
        : `${BUILDABLES[kind].name} ${'★'.repeat(here!.tier)} · ${Math.round((here?.health ?? 0) * 100)}% · <b>${DECK.indexOf(kind as never) + 1}</b> upgrade · <b>${KL.recycle}</b> recycle`;
    } else {
      hud.padhint.textContent = c.phase === Phase.Build ? 'Stand on a stitched pad to build' : '';
    }
    hud.deckhint.innerHTML = open ? `<b>1–7</b> build or upgrade · <b>${KL.rebuild}</b> build again · <b>${KL.deck}</b> close` : `<b>${KL.deck}</b> build deck · <b>${KL.rebuild}</b> build again`;
  } else {
    hud.wave.textContent = mode === 'tdm' ? 'TEAM DEATHMATCH' : mode === 'koth' ? 'KING OF THE SPOOL' : 'FREE-FOR-ALL';
    hud.phase.innerHTML = mode === 'tdm' ? teamScoreText() : mode === 'koth' ? kothText() : '';
  }

  if (net.status === 'connecting') hud.status.textContent = `Connecting to ${solo ? 'solo worker' : 'server'}…`;
  else if (net.status === 'full') hud.status.textContent = 'Room is full (8 toys).';
  else if (net.status === 'closed') {
    hud.status.innerHTML = `Disconnected: ${escapeHtml(net.closeReason)}. <a href="?solo=1&mode=${mode}">Play solo with bots instead</a>`;
  } else if (!net.predicted && net.latest) hud.status.textContent = `Unravelled! ${mode === 'coop' ? 'Back at the end of the wave, or' : 'Re-stitching'} in ${net.respawn.toFixed(1)} s`;
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

/** End-of-match "action figure on a blister card" with this match's haul. */
function resultsCard(won: boolean | null): void {
  const el = $('results');
  if (won === null) { el.classList.add('hidden'); return; }
  const lv = levelOf(profile.xp);
  el.className = `pk-${profile.look.packaging}`;
  el.innerHTML = `<div class="hang"></div>
    <div class="brand">STITCHSTRIKE · ${escapeHtml(world.name.toUpperCase())} · ${net.waves === 0 ? 'ENDLESS' : `${net.waves} WAVES`}</div>
    <h2>${won ? 'VICTORY!' : 'UNRAVELLED'}</h2>
    <div class="bubble">
      <div class="sticker">NEW!<br>Collect<br>them all!</div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="tag">Hand-knitted amigurumi with ${WEAPONS.length} blasters and real re-stitch action!</div>
      <div class="stats"><div><b>${session.kills}</b><span>unravelled</span></div><div><b>${session.revives}</b><span>re-stitched</span></div><div><b>${session.waves}</b><span>waves held</span></div></div>
    </div>
    <div class="reward"><span>+${session.xp} XP</span><span>+${session.credits} credits</span><span>Level ${lv.level}</span></div>
    <div class="lvl"><i style="width:${(lv.into / lv.need) * 100}%"></i></div>
    <div class="fine">Rewards are cosmetic. Unlock heads, yarns and packaging in the Customise menu. Ages 5 and up.</div>`;
}

function kothText(): string {
  const k = net.koth;
  if (!k) return '';
  const held = k.holder === 2 ? '<b>CONTESTED!</b>' : k.holder >= 0 ? `${TEAM_NAMES[k.holder]} holds the spool` : 'The spool is free';
  return `<b style="color:${hexOf(PAL.team[0])}">Cotton ${Math.floor(k.scores[0])}</b> · <b style="color:${hexOf(PAL.team[1])}">Wool ${Math.floor(k.scores[1])}</b> / ${KOTH.target} · ${held} · moves in ${Math.ceil(k.timer)} s`;
}

const MODE_NAMES: Record<GameMode, string> = { coop: 'Co-op', pvp: 'Free-for-all', tdm: 'Team Deathmatch', koth: 'King of the Spool' };
/** Rich presence (Steam): what this toy is up to. */
function presenceText(): string {
  const c = net.coop;
  if (mode === 'coop' && c) {
    if (c.phase === Phase.Won) return `Saved the Heartspools in ${world.name}!`;
    return `Defending ${world.name} · ${c.wave === 0 ? 'building' : `wave ${c.wave}${c.totalWaves ? ` of ${c.totalWaves}` : ' (endless)'}`}`;
  }
  return `${MODE_NAMES[mode]} in ${world.name}`;
}

function teamScoreText(): string {
  const score = [0, 0];
  for (const p of net.latest?.players ?? []) score[net.roster.get(p.id)?.team ?? 0] += p.kos;
  return `<b style="color:${hexOf(PAL.team[0])}">Team Cotton ${score[0]}</b> · <b style="color:${hexOf(PAL.team[1])}">Team Wool ${score[1]}</b>`;
}

const pickupsView = new PickupsView(scene, world);
const spoolHill = mode === 'koth' ? new SpoolHill(scene, world, PAL.team) : null;
const traversal = new TraversalView(scene, world, new Set(profile.collected));
const music = new CombatMusic();

let acc = 0;
let springSounded = false;
let last = performance.now();
let flash = 0;
let hudTimer = 0;
syncAchievements(profile.medals);
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
  ropeSpecs.length = 0;
  for (const r of net.remotes(now)) {
    const a = avatars.get(r.id);
    if (!a) continue;
    if (r.hook && r.alive) ropeSpecs.push({ key: r.id, from: new THREE.Vector3(r.x, r.y + 0.9, r.z), to: new THREE.Vector3(...r.hook) });
    const prev = lastPos.get(r.id) ?? new THREE.Vector3(r.x, r.y, r.z);
    const speed = Math.hypot(r.x - prev.x, r.z - prev.z) / Math.max(dt, 1e-3);
    const airborne = Math.abs(r.y - prev.y) / Math.max(dt, 1e-3) > 1.5;
    lastPos.set(r.id, new THREE.Vector3(r.x, r.y, r.z));
    a.root.position.set(r.x, r.y, r.z);
    a.root.rotation.y = r.yaw;
    a.update(dt, t, r.downed ? 0 : Math.min(1.3, speed / PLAYER.runSpeed), r.pitch, r.crouch, airborne, !r.alive || r.downed);
    if (r.alive) remoteNow.set(r.id, new THREE.Vector3(r.x, r.y, r.z));
  }

  // Enemies, interpolated further back (they arrive at 10 Hz).
  if (enemyRenderer) {
    enemies = net.enemySamples(now);
    const views: EnemyView[] = [];
    for (const e of enemies) {
      let v = enemyVisuals.get(e.id);
      if (!v) { v = { yaw: 0, phase: Math.random() * 6, speed: 0, hitAge: 1, last: new THREE.Vector3(e.x, e.y, e.z) }; enemyVisuals.set(e.id, v); }
      const moved = Math.hypot(e.x - v.last.x, e.z - v.last.z);
      v.phase += moved * (e.type === 3 ? 2.6 : e.type === 1 ? 6 : 5.5);
      if (Math.hypot(e.vx, e.vz) > 1e-3) {
        const target = Math.atan2(-e.vx, -e.vz);
        let d = target - v.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        v.yaw += d * Math.min(1, dt * 8);
      }
      v.hitAge += dt;
      v.last.set(e.x, e.y, e.z);
      const speed = moved / Math.max(dt, 1e-3) / ENEMIES[e.type].speed;
      v.speed += (speed - v.speed) * Math.min(1, dt * 8);
      views.push({ id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, yaw: v.yaw, health: e.health, phase: v.phase, speed: v.speed, hitAge: v.hitAge });
    }
    enemyRenderer.update(views, t);
  }

  // Fixed 60 Hz input + prediction.
  acc += dt;
  const padButtons = pollPad(dt);
  const locked = document.pointerLockElement === renderer.domElement || padActive;
  while (acc >= 1 / 60) {
    acc -= 1 / 60;
    const buttons = autopilot ? autopilotButtons(now, net.predicted) : locked ? sampleButtons() | padButtons : 0;
    const action = pendingAction;
    pendingAction = 0;
    const r = net.input(buttons, yaw, pitch, now, wantWeapon, action);
    if (r.mantled && now - lastMantle > 400) { sfx.play('mantle', 0.8); lastMantle = now; }
    if (r.hook === 1) sfx.play('yarnShot');
    else if (r.hook === -1) sfx.play('yarnMiss', 0.7);
    if (r.fired && net.predicted) {
      const s = net.predicted;
      const weapon = WEAPONS[r.weapon];
      const crouch = (buttons & Buttons.Crouch) !== 0;
      const o = eyePosition(s, crouch);
      const muzzle = viewModel.muzzle();
      const aim = lookDirection(s.yaw, s.pitch);
      if (weapon.projectile) {
        // Lob a predicted yarn ball from the same spot the server launches it.
        pickupsView.launchLocal(launchProjectile(0, net.id, r.weapon, [o[0] + aim[0] * 0.5, o[1] - 0.15 + aim[1] * 0.5, o[2] + aim[2] * 0.5], aim));
      } else {
        for (const d of pelletDirections(weapon, aim, r.seq)) {
          const { to, enemy } = predictedHit(o, d, weapon.range);
          if (weapon.chain) fx.zap(muzzle, to, weapon.color);
          else fx.projectile(muzzle, to, r.weapon === 0 ? 0xe8742a : weapon.color, r.weapon === 1);
          // Enemy hits shed fibres (from the server's verdict); misses puff dust off the wool.
          if (!enemy) fx.puff(to, 0xcfd6e6, r.weapon === 1 ? 0.4 : 0.55);
        }
      }
      sfx.play(WEAPON_SOUNDS[r.weapon] ?? 'popper');
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
    eye.set(Math.sin(t * 0.2) * (world.outdoor ? 30 : 14), world.outdoor ? 24 : 13, Math.cos(t * 0.2) * (world.outdoor ? 30 : 14));
  }
  if (p) camera.rotation.set(pitch, yaw, 0);
  else camera.lookAt(0, 1, 0);
  if (fixedCam) {
    const shots: Record<string, [number, number, number, number, number, number]> = world.id === 'bathroom' ? {
      overview: [30, 26, 26, -6, 0, -8],
      core: [-8, 4, 10, -16, 1, 2],
      tub: [-6, 16, -2, -24, 2, -22],
      toilet: [8, 12, 0, 25, 10, -26],
    } : world.id === 'park' ? {
      overview: [46, 40, 52, 0, 4, 2],
      core: [8, 5, -4, 0, 1, -12],
      pond: [-26, 10, 30, 2, 2, 6],
      bandstand: [18, 9, -6, 0, 9, -28],
      balloon: [0, 6, 20, 0, 40, 60],
    } : world.id === 'toystore' ? {
      overview: [0, 26, 48, 0, 4, -20],
      core: [6, 4, -4, 0, 1, -12],
      aisle: [0, 12, 44, 0, 14, -10],
      shelf: [-12, 32, -2, -25, 22, -30],
      pit: [8, 10, 18, 0, 2, 27],
    } : world.id === 'garage' ? {
      overview: [-4, 30, 31, 2, 0, -12],
      core: [4, 3, -2, 12, 1, -12],
      car: [10, 6, 30, -8, 6, 0],
      shelf: [10, 20, 8, 36, 12, -15],
    } : world.outdoor ? {
      overview: [48, 40, 50, -4, 0, -4],
      core: [12, 3.2, 12, 4, 1.2, 2],
      window: [-6, 20, 40, -20, 6, -20],
      coreA: [-10, 5, -12, -20, 1, -24],
      tree: [-12, 3, 16, -30, 10, 0],
    } : {
      overview: [15, 14, 16, -2, 1, -2],
      core: [6.5, 2.2, 9, 1, 1, 1.5],
      window: [8, 5, -6, -12, 4, 6],
      coreA: [-1, 3.5, -4, -6, 0.8, -7],
    };
    const c = shots[fixedCam] ?? shots.overview;
    camera.position.set(c[0], c[1], c[2]);
    camera.lookAt(c[3], c[4], c[5]);
  }
  if (fx.shake > 0.01 && !fixedCam) {
    const k = fx.shake * fx.shake * 0.25 * (settings.reduceShake ? 0.15 : 1);
    eye.x += (Math.random() - 0.5) * k; eye.y += (Math.random() - 0.5) * k; eye.z += (Math.random() - 0.5) * k;
  }
  if (p && thirdPerson) {
    const back: Vec3 = lookDirection(yaw, pitch);
    tmp.set(eye.x - back[0] * 3, eye.y - back[1] * 3 + 0.4, eye.z - back[2] * 3);
    camera.position.copy(tmp);
  } else if (!fixedCam) {
    camera.position.copy(eye);
  }
  viewModel.group.visible = !!p && !p.downed && !thirdPerson && !fixedCam;
  if (ownAvatar) {
    ownAvatar.root.visible = !!p && (thirdPerson || !!fixedCam);
    if (p) {
      ownAvatar.root.position.set(eye.x, eye.y - (crouching ? PLAYER.eyeHeight * 0.7 : PLAYER.eyeHeight), eye.z);
      ownAvatar.root.rotation.y = yaw;
      ownAvatar.update(dt, t, Math.min(1.3, Math.hypot(p.vx, p.vz) / PLAYER.runSpeed), pitch, crouching, !p.onGround, p.downed);
    }
  }
  // Yarn-swing strands: ours from the hand (or chest in third person), everyone else's from the chest.
  if (p?.hooked) {
    const from = eye.clone();
    if (thirdPerson || fixedCam) from.y -= PLAYER.eyeHeight - 0.9;
    else from.add(tmp.set(0.3, -0.32, -1.4).applyQuaternion(camera.quaternion));
    ropeSpecs.push({ key: -1, from, to: new THREE.Vector3(p.hx, p.hy, p.hz), width: thirdPerson || fixedCam ? 0.06 : 0.018 });
  }
  yarnRopes.update(ropeSpecs, dt);
  // The crosshair rings when a yarn strand would catch.
  let canSwing = false;
  if (p && !p.hooked && !p.downed && p.hookCd <= 0) {
    const o: Vec3 = [eye.x, eye.y, eye.z];
    const d = lookDirection(yaw, pitch);
    const t = rayWorld(o, d, world.boxes, GRAPPLE.range);
    canSwing = t < GRAPPLE.range && o[1] + d[1] * t >= p.y + PLAYER.eyeHeight + GRAPPLE.minRise;
  }
  crosshairEl.classList.toggle('can-swing', canSwing);
  flash = Math.max(0, flash - dt);
  muzzleFlash.intensity = flash > 0 ? 3 : 0;

  // Co-op set pieces: Heartspools spin, turrets track the nearest enemy, pad under you glows.
  spoolHill?.update(net.koth, t, dt);
  if (coopProps) {
    const highlight = p ? coopProps.nearestPad(p.x, p.z, BUILD_RANGE) : -1;
    coopProps.update(net.coop, t, highlight, (x, z) => {
      const e = nearestEnemy(new THREE.Vector3(x, TURRET.height, z), TURRET.range);
      return e ? [e.x, e.z] : null;
    });
  }

  fx.update(dt);
  if (net.latest) pickupsView.update(dt, t, net.latest.pickups, net.latest.drops, net.latest.projectiles, net.id);
  for (const c of traversal.update(t, p && !autopilot ? p : null)) {
    // Secrets: golden thimbles, weapon parts and credit buttons, kept in your profile.
    profile.collected.push(c.id);
    const found = world.collectibles.filter((k) => profile.collected.includes(k.id)).length;
    const reward = c.kind === 2 ? 150 : 60;
    progress(50, reward, {}, { mapComplete: found === world.collectibles.length });
    sfx.play('collect');
    banner(`${['GOLDEN THIMBLE', 'WEAPON PART', 'CREDIT STASH'][c.kind]} FOUND! ${found}/${world.collectibles.length}`, 'good', 2200);
    popup(`+${reward} credits`);
  }
  if (p && p.onGround === false && p.vy > 15 && !springSounded) { sfx.play('spring'); springSounded = true; }
  if (p?.onGround) springSounded = false;
  const cp = net.coop;
  music.setIntensity((!cp ? (net.latest ? 2 : 0) : cp.phase === Phase.Wave ? (cp.boss >= 0 ? 3 : 2) : cp.phase === Phase.Build ? 1 : 0) as Intensity);
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
    if (!autopilot) setPresence(presenceText());
  }
  if (post) post.render(t);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (autopilot || fixedCam) overlay.classList.add('hidden');
renderScoreboard();
frame();
