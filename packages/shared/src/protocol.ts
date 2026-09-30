import { WORLD_BOUNDS } from './constants.ts';
import type { InputCmd, PlayerState } from './movement.ts';
import type { MapId, Vec3 } from './world.ts';

/**
 * Wire format. Hot-path traffic (inputs, snapshots) is binary; rare control
 * messages (hello, roster, events, ping) are JSON text frames.
 */

export type GameMode = 'coop' | 'pvp';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export interface RosterEntry {
  id: number;
  name: string;
  color: number;
  bot: boolean;
}

/** Rare, reliable events go as JSON. Shots/hits are frequent, so they ride in the binary snapshot. */
export type GameEvent =
  /** attacker 0 with enemyType set: unravelled by an enemy. */
  | { type: 'ko'; attacker: number; victim: number; enemyType?: number }
  | { type: 'spawn'; id: number }
  | { type: 'phase'; phase: number; wave: number }
  | { type: 'built'; pad: number; kind: number; by: number }
  | { type: 'coreDown'; core: number }
  | { type: 'kill'; by: number; enemyType: number; reward: number };

export type ClientText =
  | { t: 'hello'; name: string }
  | { t: 'ping'; c: number };

export type ServerText =
  | { t: 'welcome'; id: number; tick: number; room: string; mode: GameMode; map: MapId }
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

const INPUT_BYTES = 18;

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
  alive: boolean;
  crouch: boolean;
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
  to: Vec3;
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
  pads: { kind: number; health: number }[];
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
  coop: CoopState | null;
}

/** Bytes per record, for bandwidth maths: own state 91, player 18, shot 9, enemy 9. */
const ENEMY_BYTES = 9;
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
    w.u8(p.onGround ? 1 : 0);
    w.u8(p.airJumps);
    w.u16(p.buttons);
    w.f64(p.cooldown);
    w.u8(p.weapon);
    w.u8(p.ammo);
    w.u8(p.ammoB);
    w.f64(p.reload);
    w.f32(p.yaw);
    w.f32(p.pitch);
  }
  w.u8(s.players.length);
  for (const p of s.players) {
    w.u8(p.id);
    w.u16(quantPos(p.x, 0)); w.u16(quantPos(p.y, 1)); w.u16(quantPos(p.z, 2));
    w.u16(quantAngle(p.yaw));
    w.i16(Math.round((p.pitch / (Math.PI / 2)) * 32767));
    w.u8(Math.max(0, Math.min(255, Math.ceil(p.health))));
    w.u8((p.alive ? 1 : 0) | (p.crouch ? 2 : 0));
    w.u8(p.weapon);
    w.u16(p.kos);
    w.u16(p.deaths);
  }
  const shots = s.shots.length > MAX_SHOTS ? s.shots.slice(-MAX_SHOTS) : s.shots;
  w.u8(shots.length);
  for (const sh of shots) {
    w.u8(sh.id);
    w.u8(sh.hit);
    w.u8((sh.head ? 1 : 0) | (sh.enemy ? 2 : 0));
    w.u16(quantPos(sh.to[0], 0)); w.u16(quantPos(sh.to[1], 1)); w.u16(quantPos(sh.to[2], 2));
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
    for (const p of c.pads) w.u8((p.kind << 6) | Math.round(Math.max(0, Math.min(1, p.health)) * 63));
    w.u8(c.enemies ? 1 : 0);
    const enemies = !c.enemies ? [] : c.enemies.length > MAX_ENEMIES ? c.enemies.slice(0, MAX_ENEMIES) : c.enemies;
    if (c.enemies) w.u8(enemies.length);
    for (const e of enemies) {
      w.u16(e.id);
      w.u8(e.type);
      w.u16(quantPos(e.x, 0));
      w.u16(quantPos(e.z, 2));
      w.u8(Math.max(0, Math.min(255, Math.round(e.y * 20))));
      w.u8(pct(e.health));
    }
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
      const onGround = r.u8() === 1;
      const airJumps = r.u8();
      const buttons = r.u16();
      const cooldown = r.f64();
      const weapon = r.u8();
      const ammo = r.u8();
      const ammoB = r.u8();
      const reload = r.f64();
      const yaw = r.f32();
      const pitch = r.f32();
      self = { x: f[0], y: f[1], z: f[2], vx: f[3], vy: f[4], vz: f[5], onGround, airJumps, buttons, cooldown, weapon, ammo, ammoB, reload, yaw, pitch };
    }
    const players: NetPlayer[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      const id = r.u8();
      const x = dequantPos(r.u16(), 0), y = dequantPos(r.u16(), 1), z = dequantPos(r.u16(), 2);
      const yaw = dequantAngle(r.u16());
      const pitch = (r.i16() / 32767) * (Math.PI / 2);
      const health = r.u8();
      const flags = r.u8();
      const weapon = r.u8();
      players.push({ id, x, y, z, yaw, pitch, health, alive: (flags & 1) !== 0, crouch: (flags & 2) !== 0, weapon, kos: r.u16(), deaths: r.u16() });
    }
    const shots: Shot[] = [];
    for (let i = 0, n = r.u8(); i < n; i++) {
      const id = r.u8(), hit = r.u8(), flags = r.u8();
      shots.push({ id, hit, head: (flags & 1) !== 0, enemy: (flags & 2) !== 0, to: [dequantPos(r.u16(), 0), dequantPos(r.u16(), 1), dequantPos(r.u16(), 2)] });
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
      for (let i = 0, n = r.u8(); i < n; i++) { const b = r.u8(); pads.push({ kind: b >> 6, health: (b & 63) / 63 }); }
      let enemies: NetEnemy[] | null = null;
      const hasEnemies = r.u8() === 1;
      if (hasEnemies) enemies = [];
      for (let i = 0, n = hasEnemies ? r.u8() : 0; i < n; i++) {
        const id = r.u16(), type = r.u8();
        const x = dequantPos(r.u16(), 0), z = dequantPos(r.u16(), 2);
        const y = r.u8() / 20;
        enemies!.push({ id, type, x, y, z, health: r.u8() / 255 });
      }
      coop = { phase, wave, totalWaves, timer, buttons, ready, cores, pads, enemies };
    }
    return { tick, ack, self, respawn, players, shots, coop };
  } catch {
    return null;
  }
}

/** Bytes per enemy record, exported for bandwidth maths in tests and tools. */
export const ENEMY_RECORD_BYTES = ENEMY_BYTES;
