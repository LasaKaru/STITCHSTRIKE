import { WORLD_BOUNDS } from './constants.ts';
import type { InputCmd, PlayerState } from './movement.ts';
import type { KothState } from './koth.ts';
import type { NetVehicle } from './vehicles.ts';
import type { MapId, Vec3 } from './world.ts';

/**
 * Wire format. Hot-path traffic (inputs, snapshots) is binary; rare control
 * messages (hello, roster, events, ping) are JSON text frames.
 */

export type GameMode = 'coop' | 'pvp' | 'tdm' | 'koth';

/** Modes played in two teams (no friendly fire, team colours). */
export function isTeamMode(mode: GameMode): boolean {
  return mode === 'tdm' || mode === 'koth';
}

/**
 * A toy's cosmetic look: small indices into the client's cosmetics catalogue
 * (heads, hats, knit patterns, yarn colours, packaging). Purely visual, so
 * the server only clamps it and passes it along.
 */
export interface Look {
  head: number;
  hat: number;
  beard: number;
  glasses: number;
  pattern: number;
  skin: number;
  jacket: number;
  pants: number;
  packaging: number;
  /** Weapon parts: a knitted charm dangling from every weapon, and the yarn wrapped round the grips. */
  charm: number;
  wrap: number;
}
export const LOOK_KEYS: (keyof Look)[] = ['head', 'hat', 'beard', 'glasses', 'pattern', 'skin', 'jacket', 'pants', 'packaging', 'charm', 'wrap'];

export function sanitizeLook(raw: unknown): Look | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const look = {} as Look;
  for (const k of LOOK_KEYS) {
    const v = Number(o[k]);
    look[k] = Number.isFinite(v) ? Math.max(0, Math.min(63, Math.floor(v))) : 0;
  }
  return look;
}

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export interface RosterEntry {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  /** Team Deathmatch side (0 or 1); 0 elsewhere. */
  team: number;
  look?: Look;
}

/** Rare, reliable events go as JSON. Shots/hits are frequent, so they ride in the binary snapshot. */
export type GameEvent =
  /** attacker 0 with enemyType set: unravelled by an enemy. */
  | { type: 'ko'; attacker: number; victim: number; enemyType?: number }
  | { type: 'spawn'; id: number }
  | { type: 'phase'; phase: number; wave: number }
  | { type: 'built'; pad: number; kind: number; by: number; tier: number }
  | { type: 'coreDown'; core: number }
  | { type: 'kill'; by: number; enemyType: number; reward: number }
  /** Co-op: a toy is knocked down / re-stitched by a teammate. */
  | { type: 'downed'; id: number }
  | { type: 'revived'; id: number; by: number }
  | { type: 'pickup'; id: number; kind: number }
  | { type: 'boss'; state: 'arrive' | 'down' }
  | { type: 'stomp'; x: number; z: number }
  /** A Tin Drummer beats the march (nearby invaders speed up). */
  | { type: 'drum'; x: number; z: number }
  /** A Jack-in-the-Box springs out at a toy. */
  | { type: 'pop'; x: number; z: number }
  /** Dino Stampede set pieces: a raptor leaps, a trike charges, Rex roars. */
  | { type: 'dino'; act: 'leap' | 'charge' | 'roar'; x: number; z: number }
  /** King of the Spool: the spool hopped to another spot / a team won the round. */
  | { type: 'hillMove'; hill: number }
  | { type: 'kothWin'; team: number }
  /** A toy climbed into (enter) or out of a vehicle. */
  | { type: 'vehicle'; id: number; kind: number; enter: boolean }
  | { type: 'snap'; pad: number };

export type ClientText =
  | { t: 'hello'; name: string; look?: Look }
  | { t: 'ping'; c: number };

export type ServerText =
  | { t: 'welcome'; id: number; tick: number; room: string; mode: GameMode; map: MapId; waves: number; difficulty: number }
  | { t: 'roster'; players: RosterEntry[] }
  | { t: 'events'; tick: number; list: GameEvent[] }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'full' };

// ---------------------------------------------------------------- quantisation

const SPAN = [0, 1, 2].map((a) => WORLD_BOUNDS.max[a] - WORLD_BOUNDS.min[a]);
const TWO_PI = Math.PI * 2;

export function quantPos(v: number, axis: 0 | 1 | 2): number {
  const t = (v - WORLD_BOUNDS.min[axis]) / SPAN[axis];
  return Math.max(0, Math.min(65535, Math.round(t * 65535)));
}

export function dequantPos(q: number, axis: 0 | 1 | 2): number {
  return WORLD_BOUNDS.min[axis] + (q / 65535) * SPAN[axis];
}

function quantAngle(a: number): number {
  const t = ((a % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.round((t / TWO_PI) * 65535) & 0xffff;
}

function dequantAngle(q: number): number {
  return (q / 65535) * TWO_PI;
}

// ---------------------------------------------------------------- inputs

const INPUT_BYTES = 20;

export function encodeInputs(cmds: InputCmd[]): Uint8Array {
  const buf = new Uint8Array(2 + cmds.length * INPUT_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG_INPUT);
  v.setUint8(1, cmds.length);
  let o = 2;
  for (const c of cmds) {
    v.setUint32(o, c.seq >>> 0, true);
    v.setUint16(o + 4, c.buttons, true);
    v.setFloat32(o + 6, c.yaw, true);
    v.setFloat32(o + 10, c.pitch, true);
    v.setFloat32(o + 14, c.renderTick, true);
    v.setUint8(o + 18, c.weapon);
    v.setUint8(o + 19, c.action);
    o += INPUT_BYTES;
  }
  return buf;
}

export function decodeInputs(buf: Uint8Array): InputCmd[] | null {
  if (buf.byteLength < 2) return null;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint8(0) !== MSG_INPUT) return null;
  const n = v.getUint8(1);
  if (n > 16 || buf.byteLength !== 2 + n * INPUT_BYTES) return null;
  const out: InputCmd[] = [];
  let o = 2;
  for (let i = 0; i < n; i++) {
    const cmd: InputCmd = {
      seq: v.getUint32(o, true),
      buttons: v.getUint16(o + 4, true),
      yaw: v.getFloat32(o + 6, true),
      pitch: v.getFloat32(o + 10, true),
      renderTick: v.getFloat32(o + 14, true),
      weapon: v.getUint8(o + 18),
      action: v.getUint8(o + 19),
    };
    if (!Number.isFinite(cmd.yaw) || !Number.isFinite(cmd.pitch) || !Number.isFinite(cmd.renderTick)) return null;
    out.push(cmd);
    o += INPUT_BYTES;
  }
  return out;
}

// ---------------------------------------------------------------- snapshots

export interface NetPlayer {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  alive: boolean;
  crouch: boolean;
  /** Co-op: knocked down, waiting to be re-stitched. */
  downed: boolean;
  /** Power Pom active. */
  powered: boolean;
  /** 0..1 re-stitch progress while downed. */
  revive: number;
  /** Yarn-swing anchor while swinging. */
  hook: Vec3 | null;
  /** Driving: vehicle kind (0 on foot) and its heading. */
  car: number;
  carYaw: number;
  weapon: number;
  kos: number;
  deaths: number;
}

/** One hitscan shot/pellet. The shooter's muzzle is known client-side, so only the end point is sent. */
export interface Shot {
  /** Player id, or TURRET_SHOT_BASE + pad index for turrets. */
  id: number;
  /** Player hit (PvP), or 0. */
  hit: number;
  head: boolean;
  /** True when the shot hit an enemy toy. */
  enemy: boolean;
  /** ShotKind: 0 hitscan, 1 blast (hit = the weapon that burst), 2 zap arc, 3 invader fire. */
  kind: number;
  /** Start point for zaps and invader fire (others start at the shooter). */
  from?: Vec3;
  to: Vec3;
}

/** A lobbed yarn ball in flight. */
export interface NetProjectile {
  owner: number;
  weapon: number;
  x: number;
  y: number;
  z: number;
}

/** A stuffing tuft dropped by an invader. */
export interface NetDrop {
  kind: number;
  x: number;
  y: number;
  z: number;
}

export interface NetEnemy {
  id: number;
  type: number;
  x: number;
  y: number;
  z: number;
  /** 0..1 */
  health: number;
}

export interface CoopState {
  phase: number;
  wave: number;
  totalWaves: number;
  /** Seconds left in the build phase or end screen. */
  timer: number;
  buttons: number;
  ready: number;
  cores: { health: number; shield: number }[];
  pads: { kind: number; tier: number; health: number }[];
  difficulty: number;
  /** 0..1 boss health, or -1 when no boss is on the field. */
  boss: number;
  /** Enemies ride on every other snapshot (10 Hz) to fit the co-op bandwidth budget; null when omitted. */
  enemies: NetEnemy[] | null;
}

export interface Snapshot {
  tick: number;
  /** Last input sequence the server applied for the recipient. */
  ack: number;
  /** Full-precision own state, so reconciliation replays from exactly the server's numbers. */
  self: PlayerState | null;
  /** Seconds until the recipient respawns (0 when alive). */
  respawn: number;
  players: NetPlayer[];
  shots: Shot[];
  projectiles: NetProjectile[];
  /** Bit i set = static pickup spot i is available. */
  pickups: number;
  drops: NetDrop[];
  coop: CoopState | null;
  /** King of the Spool round state. */
  koth?: KothState | null;
  /** Vehicles parked on the map (driven ones travel with their drivers). */
  vehicles?: NetVehicle[];
}

/** Bytes per record, for bandwidth maths: player 21, shot 9 (15 with a start point), enemy 8, projectile 7. */
const ENEMY_BYTES = 8;
const MAX_SHOTS = 255;
const MAX_ENEMIES = 255;

/** Growable little-endian writer. */
class Writer {
  buf = new Uint8Array(512);
  v = new DataView(this.buf.buffer);
  o = 0;
  private need(n: number): void {
    if (this.o + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.o + n));
    next.set(this.buf);
    this.buf = next;
    this.v = new DataView(next.buffer);
  }
  u8(x: number): void { this.need(1); this.v.setUint8(this.o, x); this.o += 1; }
  u16(x: number): void { this.need(2); this.v.setUint16(this.o, x, true); this.o += 2; }
  i16(x: number): void { this.need(2); this.v.setInt16(this.o, x, true); this.o += 2; }
  u32(x: number): void { this.need(4); this.v.setUint32(this.o, x >>> 0, true); this.o += 4; }
  f32(x: number): void { this.need(4); this.v.setFloat32(this.o, x, true); this.o += 4; }
  f64(x: number): void { this.need(8); this.v.setFloat64(this.o, x, true); this.o += 8; }
  done(): Uint8Array { return this.buf.slice(0, this.o); }
}

class Reader {
  v: DataView;
  o = 0;
  constructor(buf: Uint8Array) { this.v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  get left(): number { return this.v.byteLength - this.o; }
  u8(): number { const x = this.v.getUint8(this.o); this.o += 1; return x; }
  u16(): number { const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
  i16(): number { const x = this.v.getInt16(this.o, true); this.o += 2; return x; }
  u32(): number { const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  f32(): number { const x = this.v.getFloat32(this.o, true); this.o += 4; return x; }
  f64(): number { const x = this.v.getFloat64(this.o, true); this.o += 8; return x; }
}

const pct = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));

export function encodeSnapshot(s: Snapshot): Uint8Array {
  const w = new Writer();
  w.u8(MSG_SNAPSHOT);
  w.u32(s.tick);
  w.u32(s.ack);
  w.u8(Math.min(255, Math.round(s.respawn * 10)));
  w.u8(s.self ? 1 : 0);
  if (s.self) {
    const p = s.self;
    for (const n of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) w.f64(n);
    w.u8((p.onGround ? 1 : 0) | (p.downed ? 2 : 0) | (p.hooked ? 4 : 0) | (p.car ? 8 : 0));
    w.u8(p.airJumps);
    w.u16(p.buttons);
    w.f64(p.cooldown);
    w.u8(p.weapon);
    w.u8(p.mags.length);
    for (const m of p.mags) w.u8(m);
    w.f64(p.reload);
    w.f32(p.yaw);
    w.f32(p.pitch);
    w.f64(p.hookCd);
    if (p.hooked) for (const n of [p.hx, p.hy, p.hz, p.rope]) w.f64(n);
    if (p.car) { w.u8(p.car); w.f64(p.carYaw); w.f64(p.carSpeed); }
  }
  w.u8(s.players.length);
  for (const p of s.players) {
    w.u8(p.id);
    w.u16(quantPos(p.x, 0)); w.u16(quantPos(p.y, 1)); w.u16(quantPos(p.z, 2));
    w.u16(quantAngle(p.yaw));
    w.i16(Math.round((p.pitch / (Math.PI / 2)) * 32767));
    w.u8(Math.max(0, Math.min(255, Math.ceil(p.health))));
    w.u8(Math.max(0, Math.min(255, Math.ceil(p.armor))));
    w.u8((p.alive ? 1 : 0) | (p.crouch ? 2 : 0) | (p.downed ? 4 : 0) | (p.powered ? 8 : 0) | (p.hook ? 16 : 0) | (p.car ? 32 : 0));
    if (p.hook) { w.u16(quantPos(p.hook[0], 0)); w.u16(quantPos(p.hook[1], 1)); w.u16(quantPos(p.hook[2], 2)); }
    if (p.car) { w.u8(p.car); w.u16(quantAngle(p.carYaw)); }
    w.u8(pct(p.revive));
    w.u8(p.weapon);
    w.u16(p.kos);
    w.u16(p.deaths);
  }
  const shots = s.shots.length > MAX_SHOTS ? s.shots.slice(-MAX_SHOTS) : s.shots;
  w.u8(shots.length);
  for (const sh of shots) {
    w.u8(sh.id);
    w.u8(sh.hit);
    const from = sh.from !== undefined;
    w.u8((sh.head ? 1 : 0) | (sh.enemy ? 2 : 0) | (from ? 4 : 0) | ((sh.kind & 7) << 3));
    w.u16(quantPos(sh.to[0], 0)); w.u16(quantPos(sh.to[1], 1)); w.u16(quantPos(sh.to[2], 2));
    if (sh.from) { w.u16(quantPos(sh.from[0], 0)); w.u16(quantPos(sh.from[1], 1)); w.u16(quantPos(sh.from[2], 2)); }
  }
  const projectiles = s.projectiles.slice(0, 32);
  w.u8(projectiles.length);
  for (const pr of projectiles) {
    w.u8(pr.owner);
    w.u8(pr.weapon);
    w.u16(quantPos(pr.x, 0)); w.u16(quantPos(pr.y, 1)); w.u16(quantPos(pr.z, 2));
  }
  w.u32(s.pickups);
  const drops = s.drops.slice(0, 16);
  w.u8(drops.length);
  for (const d of drops) {
    w.u8(d.kind);
    w.u16(quantPos(d.x, 0)); w.u16(quantPos(d.y, 1)); w.u16(quantPos(d.z, 2));
  }
  w.u8(s.coop ? 1 : 0);
  if (s.coop) {
    const c = s.coop;
    w.u8(c.phase);
    w.u8(c.wave);
    w.u8(c.totalWaves);
    w.u16(Math.max(0, Math.round(c.timer * 10)));
    w.u16(Math.min(65535, c.buttons));
    w.u8(c.ready);
    w.u8(c.cores.length);
    for (const k of c.cores) { w.u8(pct(k.health)); w.u8(pct(k.shield)); }
    w.u8(c.pads.length);
    for (const p of c.pads) w.u16(((p.kind & 15) << 12) | ((p.tier & 3) << 10) | Math.round(Math.max(0, Math.min(1, p.health)) * 1023));
    w.u8(c.difficulty);
    w.u8(c.boss < 0 ? 255 : Math.min(254, Math.round(c.boss * 254)));
    w.u8(c.enemies ? 1 : 0);
    const enemies = !c.enemies ? [] : c.enemies.length > MAX_ENEMIES ? c.enemies.slice(0, MAX_ENEMIES) : c.enemies;
    if (c.enemies) w.u8(enemies.length);
    for (const e of enemies) {
      w.u16(e.id);
      w.u8(((e.type & 15) << 4) | Math.max(0, Math.min(15, Math.ceil(e.health * 15))));
      w.u16(quantPos(e.x, 0));
      w.u16(quantPos(e.z, 2));
      w.u8(Math.max(0, Math.min(255, Math.round(e.y * 20))));
    }
  }
  // Parked vehicles ride before the King of the Spool block (both optional).
  const vehicles = s.vehicles ?? [];
  w.u8(vehicles.length);
  for (const v of vehicles) {
    w.u8(v.kind);
    w.u16(quantPos(v.x, 0)); w.u16(quantPos(v.y, 1)); w.u16(quantPos(v.z, 2));
    w.u16(quantAngle(v.yaw));
  }
  w.u8(s.koth ? 1 : 0);
  if (s.koth) {
    const k = s.koth;
    w.u8(k.hill);
    w.u8(k.holder + 1);
    w.u16(Math.round(k.scores[0] * 10));
    w.u16(Math.round(k.scores[1] * 10));
    w.u8(Math.min(255, Math.ceil(k.timer)));
  }
  return w.done();
}

export function decodeSnapshot(buf: Uint8Array): Snapshot | null {
  if (buf.byteLength < 12 || buf[0] !== MSG_SNAPSHOT) return null;
  try {
    const r = new Reader(buf);
    r.u8();
    const tick = r.u32();
    const ack = r.u32();
    const respawn = r.u8() / 10;
    let self: PlayerState | null = null;
    if (r.u8() === 1) {
      const f = [r.f64(), r.f64(), r.f64(), r.f64(), r.f64(), r.f64()];
      const flags = r.u8();
      const airJumps = r.u8();
      const buttons = r.u16();
      const cooldown = r.f64();
      const weapon = r.u8();
      const mags: number[] = [];
      for (let i = 0, n = r.u8(); i < n; i++) mags.push(r.u8());
      const reload = r.f64();
      const yaw = r.f32();
      const pitch = r.f32();
      const hookCd = r.f64();
      const hooked = (flags & 4) !== 0;
      const h = hooked ? [r.f64(), r.f64(), r.f64(), r.f64()] : [0, 0, 0, 0];
      const car = flags & 8 ? r.u8() : 0;
      const carYaw = car ? r.f64() : 0;
      const carSpeed = car ? r.f64() : 0;
      self = {
        x: f[0], y: f[1], z: f[2], vx: f[3], vy: f[4], vz: f[5], onGround: (flags & 1) !== 0, downed: (flags & 2) !== 0,
        airJumps, buttons, cooldown, weapon, mags, reload, yaw, pitch,
        hooked, hx: h[0], hy: h[1], hz: h[2], rope: h[3], hookCd, car, carYaw, carSpeed,
      };
    }
    const players: NetPlayer[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      const id = r.u8();
      const x = dequantPos(r.u16(), 0), y = dequantPos(r.u16(), 1), z = dequantPos(r.u16(), 2);
      const yaw = dequantAngle(r.u16());
      const pitch = (r.i16() / 32767) * (Math.PI / 2);
      const health = r.u8();
      const armor = r.u8();
      const flags = r.u8();
      const hook: Vec3 | null = flags & 16 ? [dequantPos(r.u16(), 0), dequantPos(r.u16(), 1), dequantPos(r.u16(), 2)] : null;
      const car = flags & 32 ? r.u8() : 0;
      const carYaw = car ? dequantAngle(r.u16()) : 0;
      const revive = r.u8() / 255;
      const weapon = r.u8();
      players.push({
        id, x, y, z, yaw, pitch, health, armor, alive: (flags & 1) !== 0, crouch: (flags & 2) !== 0, downed: (flags & 4) !== 0,
        powered: (flags & 8) !== 0, hook, car, carYaw, revive, weapon, kos: r.u16(), deaths: r.u16(),
      });
    }
    const shots: Shot[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      const id = r.u8(), hit = r.u8(), flags = r.u8();
      const to: Vec3 = [dequantPos(r.u16(), 0), dequantPos(r.u16(), 1), dequantPos(r.u16(), 2)];
      const shot: Shot = { id, hit, head: (flags & 1) !== 0, enemy: (flags & 2) !== 0, kind: (flags >> 3) & 7, to };
      if (flags & 4) shot.from = [dequantPos(r.u16(), 0), dequantPos(r.u16(), 1), dequantPos(r.u16(), 2)];
      shots.push(shot);
    }
    const projectiles: NetProjectile[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      projectiles.push({ owner: r.u8(), weapon: r.u8(), x: dequantPos(r.u16(), 0), y: dequantPos(r.u16(), 1), z: dequantPos(r.u16(), 2) });
    }
    const pickups = r.u32();
    const drops: NetDrop[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      drops.push({ kind: r.u8(), x: dequantPos(r.u16(), 0), y: dequantPos(r.u16(), 1), z: dequantPos(r.u16(), 2) });
    }
    let coop: CoopState | null = null;
    if (r.left > 0 && r.u8() === 1) {
      const phase = r.u8(), wave = r.u8(), totalWaves = r.u8();
      const timer = r.u16() / 10;
      const buttons = r.u16();
      const ready = r.u8();
      const cores = [];
      for (let i = 0, n = r.u8(); i < n; i++) cores.push({ health: r.u8() / 255, shield: r.u8() / 255 });
      const pads = [];
      for (let i = 0, n = r.u8(); i < n; i++) { const b = r.u16(); pads.push({ kind: b >> 12, tier: (b >> 10) & 3, health: (b & 1023) / 1023 }); }
      const difficulty = r.u8();
      const bossByte = r.u8();
      const boss = bossByte === 255 ? -1 : bossByte / 254;
      let enemies: NetEnemy[] | null = null;
      const hasEnemies = r.u8() === 1;
      if (hasEnemies) enemies = [];
      for (let i = 0, n = hasEnemies ? r.u8() : 0; i < n; i++) {
        const id = r.u16(), th = r.u8();
        const x = dequantPos(r.u16(), 0), z = dequantPos(r.u16(), 2);
        const y = r.u8() / 20;
        enemies!.push({ id, type: th >> 4, x, y, z, health: (th & 15) / 15 });
      }
      coop = { phase, wave, totalWaves, timer, buttons, ready, cores, pads, difficulty, boss, enemies };
    }
    const vehicles: NetVehicle[] = [];
    for (let i = 0, n = r.left > 0 ? r.u8() : 0; i < n; i++) {
      vehicles.push({ kind: r.u8(), x: dequantPos(r.u16(), 0), y: dequantPos(r.u16(), 1), z: dequantPos(r.u16(), 2), yaw: dequantAngle(r.u16()) });
    }
    let koth: KothState | null = null;
    if (r.left > 0 && r.u8() === 1) {
      const hill = r.u8(), holder = r.u8() - 1;
      const a = r.u16() / 10, b = r.u16() / 10;
      koth = { hill, holder, scores: [a, b], timer: r.u8() };
    }
    return { tick, ack, self, respawn, players, shots, projectiles, pickups, drops, coop, koth, vehicles };
  } catch {
    return null;
  }
}

/** Bytes per enemy record, exported for bandwidth maths in tests and tools. */
export const ENEMY_RECORD_BYTES = ENEMY_BYTES;
