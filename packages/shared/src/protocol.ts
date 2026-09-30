import { WORLD_BOUNDS } from './constants.ts';
import type { InputCmd, PlayerState } from './movement.ts';
import type { Vec3 } from './world.ts';

/**
 * Wire format. Hot-path traffic (inputs, snapshots) is binary; rare control
 * messages (hello, roster, events, ping) are JSON text frames.
 */

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
  | { type: 'ko'; attacker: number; victim: number }
  | { type: 'spawn'; id: number };

export type ClientText =
  | { t: 'hello'; name: string }
  | { t: 'ping'; c: number };

export type ServerText =
  | { t: 'welcome'; id: number; tick: number; room: string }
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
  kos: number;
  deaths: number;
}

/** One hitscan shot. The shooter's muzzle is known client-side, so only the end point is sent. */
export interface Shot {
  id: number;
  /** Player hit, or 0 for a miss. */
  hit: number;
  head: boolean;
  to: Vec3;
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
}

const SELF_BYTES = 8 * 6 + 1 + 1 + 2 + 8 + 1 + 8 + 4 + 4;
const PLAYER_BYTES = 17;
const SHOT_BYTES = 9;
const MAX_SHOTS = 255;

export function encodeSnapshot(s: Snapshot): Uint8Array {
  const shots = s.shots.length > MAX_SHOTS ? s.shots.slice(-MAX_SHOTS) : s.shots;
  const size = 1 + 4 + 4 + 1 + 1 + (s.self ? SELF_BYTES : 0) + 1 + s.players.length * PLAYER_BYTES + 1 + shots.length * SHOT_BYTES;
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  let o = 0;
  v.setUint8(o, MSG_SNAPSHOT); o += 1;
  v.setUint32(o, s.tick, true); o += 4;
  v.setUint32(o, s.ack >>> 0, true); o += 4;
  v.setUint8(o, Math.min(255, Math.round(s.respawn * 10))); o += 1;
  v.setUint8(o, s.self ? 1 : 0); o += 1;
  if (s.self) {
    const p = s.self;
    for (const n of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) { v.setFloat64(o, n, true); o += 8; }
    v.setUint8(o, p.onGround ? 1 : 0); o += 1;
    v.setUint8(o, p.airJumps); o += 1;
    v.setUint16(o, p.buttons, true); o += 2;
    v.setFloat64(o, p.cooldown, true); o += 8;
    v.setUint8(o, p.ammo); o += 1;
    v.setFloat64(o, p.reload, true); o += 8;
    v.setFloat32(o, p.yaw, true); o += 4;
    v.setFloat32(o, p.pitch, true); o += 4;
  }
  v.setUint8(o, s.players.length); o += 1;
  for (const p of s.players) {
    v.setUint8(o, p.id);
    v.setUint16(o + 1, quantPos(p.x, 0), true);
    v.setUint16(o + 3, quantPos(p.y, 1), true);
    v.setUint16(o + 5, quantPos(p.z, 2), true);
    v.setUint16(o + 7, quantAngle(p.yaw), true);
    v.setInt16(o + 9, Math.round((p.pitch / (Math.PI / 2)) * 32767), true);
    v.setUint8(o + 11, Math.max(0, Math.min(255, Math.ceil(p.health))));
    v.setUint8(o + 12, (p.alive ? 1 : 0) | (p.crouch ? 2 : 0));
    v.setUint16(o + 13, p.kos, true);
    v.setUint16(o + 15, p.deaths, true);
    o += PLAYER_BYTES;
  }
  v.setUint8(o, shots.length); o += 1;
  for (const sh of shots) {
    v.setUint8(o, sh.id);
    v.setUint8(o + 1, sh.hit);
    v.setUint8(o + 2, sh.head ? 1 : 0);
    v.setUint16(o + 3, quantPos(sh.to[0], 0), true);
    v.setUint16(o + 5, quantPos(sh.to[1], 1), true);
    v.setUint16(o + 7, quantPos(sh.to[2], 2), true);
    o += SHOT_BYTES;
  }
  return buf;
}

export function decodeSnapshot(buf: Uint8Array): Snapshot | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 12 || v.getUint8(0) !== MSG_SNAPSHOT) return null;
  let o = 1;
  const tick = v.getUint32(o, true); o += 4;
  const ack = v.getUint32(o, true); o += 4;
  const respawn = v.getUint8(o) / 10; o += 1;
  const hasSelf = v.getUint8(o) === 1; o += 1;
  let self: PlayerState | null = null;
  if (hasSelf) {
    const f: number[] = [];
    for (let i = 0; i < 6; i++) { f.push(v.getFloat64(o, true)); o += 8; }
    const onGround = v.getUint8(o) === 1; o += 1;
    const airJumps = v.getUint8(o); o += 1;
    const buttons = v.getUint16(o, true); o += 2;
    const cooldown = v.getFloat64(o, true); o += 8;
    const ammo = v.getUint8(o); o += 1;
    const reload = v.getFloat64(o, true); o += 8;
    const yaw = v.getFloat32(o, true); o += 4;
    const pitch = v.getFloat32(o, true); o += 4;
    self = { x: f[0], y: f[1], z: f[2], vx: f[3], vy: f[4], vz: f[5], onGround, airJumps, buttons, cooldown, ammo, reload, yaw, pitch };
  }
  const n = v.getUint8(o); o += 1;
  const players: NetPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const flags = v.getUint8(o + 12);
    players.push({
      id: v.getUint8(o),
      x: dequantPos(v.getUint16(o + 1, true), 0),
      y: dequantPos(v.getUint16(o + 3, true), 1),
      z: dequantPos(v.getUint16(o + 5, true), 2),
      yaw: dequantAngle(v.getUint16(o + 7, true)),
      pitch: (v.getInt16(o + 9, true) / 32767) * (Math.PI / 2),
      health: v.getUint8(o + 11),
      alive: (flags & 1) !== 0,
      crouch: (flags & 2) !== 0,
      kos: v.getUint16(o + 13, true),
      deaths: v.getUint16(o + 15, true),
    });
    o += PLAYER_BYTES;
  }
  const shots: Shot[] = [];
  const ns = o < buf.byteLength ? v.getUint8(o) : 0; o += 1;
  for (let i = 0; i < ns && o + SHOT_BYTES <= buf.byteLength; i++) {
    shots.push({
      id: v.getUint8(o),
      hit: v.getUint8(o + 1),
      head: v.getUint8(o + 2) === 1,
      to: [dequantPos(v.getUint16(o + 3, true), 0), dequantPos(v.getUint16(o + 5, true), 1), dequantPos(v.getUint16(o + 7, true), 2)],
    });
    o += SHOT_BYTES;
  }
  return { tick, ack, self, respawn, players, shots };
}
