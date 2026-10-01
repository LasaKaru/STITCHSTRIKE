import { rayWorld } from './raycast.ts';
import type { Box, Vec3 } from './world.ts';

/**
 * Weapon table (plan §8). Hitscan weapons fire deterministic pellet patterns
 * (seeded by the input sequence) so client prediction and server agree; the
 * Yarn-Ball Launcher lobs a real projectile that both sides step with the
 * same ballistic code.
 */

export interface WeaponDef {
  id: number;
  name: string;
  /** One-line role for HUDs and menus. */
  role: string;
  damage: number;
  headshotMultiplier: number;
  fireRate: number;
  magazine: number;
  reloadSeconds: number;
  range: number;
  pellets: number;
  /** Cone half-angle in radians (pellet cone, or random jitter for single-pellet weapons). */
  spread: number;
  /** Knockback impulse applied to enemies per pellet. */
  knockback: number;
  /** Hitscan passes through this many enemies/players (1 = stops at the first). */
  pierce: number;
  /** Projectile weapons: launch speed and splash. */
  projectile?: { speed: number; gravity: number; radius: number; slowSeconds: number };
  /** Chain-zap weapons: after the first hit, arc to this many more targets within radius, each hit scaled by falloff. */
  chain?: { count: number; radius: number; falloff: number };
  /** Tracer colour. */
  color: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 0, name: 'Pom-Pom Popper', role: 'Assault · all-rounder', damage: 9, headshotMultiplier: 1.5, fireRate: 12, magazine: 60,
    reloadSeconds: 1.4, range: 60, pellets: 1, spread: 0, knockback: 0.2, pierce: 1, color: 0xe8742a,
  },
  {
    id: 1, name: 'Button Buster', role: 'Shotgun · close range', damage: 11, headshotMultiplier: 1.25, fireRate: 1.2, magazine: 12,
    reloadSeconds: 1.8, range: 22, pellets: 8, spread: 0.075, knockback: 1.2, pierce: 1, color: 0xffc94a,
  },
  {
    id: 2, name: 'Needle Lance', role: 'Sniper · pierces 3 toys', damage: 95, headshotMultiplier: 2, fireRate: 0.9, magazine: 8,
    reloadSeconds: 2.2, range: 140, pellets: 1, spread: 0, knockback: 2.5, pierce: 3, color: 0xdfe8ff,
  },
  {
    id: 3, name: 'Crochet Hook', role: 'SMG · fast, short range', damage: 7, headshotMultiplier: 1.4, fireRate: 15, magazine: 90,
    reloadSeconds: 1.6, range: 32, pellets: 1, spread: 0.035, knockback: 0.1, pierce: 1, color: 0xb46fd6,
  },
  {
    id: 4, name: 'Yarn-Ball Launcher', role: 'Splash · tangles (slows)', damage: 75, headshotMultiplier: 1, fireRate: 1.1, magazine: 6,
    reloadSeconds: 2.4, range: 80, pellets: 1, spread: 0, knockback: 3, pierce: 1, color: 0x8bcb3a,
    projectile: { speed: 26, gravity: 14, radius: 3.2, slowSeconds: 3 },
  },
  {
    id: 5, name: 'Glue Gun', role: 'Sticky · globs glue invaders in place', damage: 24, headshotMultiplier: 1, fireRate: 2.6, magazine: 15,
    reloadSeconds: 1.9, range: 60, pellets: 1, spread: 0, knockback: 0.3, pierce: 1, color: 0xf3e6a0,
    projectile: { speed: 38, gravity: 8, radius: 1.9, slowSeconds: 4.5 },
  },
  {
    id: 6, name: 'Static Sock', role: 'Chain zap · arcs between toys', damage: 16, headshotMultiplier: 1.2, fireRate: 3.5, magazine: 27,
    reloadSeconds: 1.7, range: 30, pellets: 1, spread: 0, knockback: 0.3, pierce: 1, color: 0x9fd8ff,
    chain: { count: 3, radius: 6, falloff: 0.7 },
  },
];

export const WEAPON_COUNT = WEAPONS.length;
export const LAUNCHER = 4;
export const GLUE_GUN = 5;
export const STATIC_SOCK = 6;
export const SWITCH_SECONDS = 0.25;

/** Cheap deterministic hash in [0, 1) from integers (no Math.random: prediction must agree). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Golden-angle pellet pattern, rotated per shot by its input sequence number. */
export function pelletDirections(weapon: WeaponDef, dir: Vec3, seq: number): Vec3[] {
  if (weapon.pellets <= 1 && weapon.spread <= 0) return [dir];
  // Orthonormal basis around the aim direction.
  const up: Vec3 = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const r: Vec3 = [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r[0] /= rl; r[1] /= rl; r[2] /= rl;
  const u: Vec3 = [dir[1] * r[2] - dir[2] * r[1], dir[2] * r[0] - dir[0] * r[2], dir[0] * r[1] - dir[1] * r[0]];
  const out: Vec3[] = [];
  const offset = (ox: number, oy: number) => {
    const d: Vec3 = [dir[0] + r[0] * ox + u[0] * oy, dir[1] + r[1] * ox + u[1] * oy, dir[2] + r[2] * ox + u[2] * oy];
    const l = Math.hypot(d[0], d[1], d[2]);
    out.push([d[0] / l, d[1] / l, d[2] / l]);
  };
  if (weapon.pellets <= 1) {
    // Single-pellet spray (Crochet Hook): a seeded jitter inside the cone.
    const a = hash01(seq, weapon.id) * Math.PI * 2;
    const rad = weapon.spread * Math.sqrt(hash01(seq * 7 + 3, weapon.id));
    offset(Math.cos(a) * rad, Math.sin(a) * rad);
    return out;
  }
  const rot = (seq * 2.399963) % (Math.PI * 2);
  for (let i = 0; i < weapon.pellets; i++) {
    const a = rot + i * 2.399963;
    const rad = weapon.spread * Math.sqrt((i + 0.5) / weapon.pellets);
    offset(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  return out;
}

// ---------------------------------------------------------------- projectiles

export interface Projectile {
  id: number;
  /** Player id of the thrower. */
  owner: number;
  weapon: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Seconds left before it bursts on its own. */
  life: number;
}

export function launchProjectile(id: number, owner: number, weapon: number, from: Vec3, dir: Vec3): Projectile {
  const p = WEAPONS[weapon].projectile!;
  // A slight upward lob so the ball arcs like a thrown toy.
  return {
    id, owner, weapon, x: from[0], y: from[1], z: from[2],
    vx: dir[0] * p.speed, vy: dir[1] * p.speed + 3, vz: dir[2] * p.speed, life: 3,
  };
}

/**
 * Advances a projectile by dt. Returns the point where it struck the world
 * (or expired), or null while it is still flying. Target hits are checked by
 * the caller, which knows who can be hit.
 */
export function stepProjectile(p: Projectile, dt: number, boxes: Box[]): Vec3 | null {
  const g = WEAPONS[p.weapon].projectile!.gravity;
  p.vy -= g * dt;
  const dx = p.vx * dt, dy = p.vy * dt, dz = p.vz * dt;
  const len = Math.hypot(dx, dy, dz);
  p.life -= dt;
  if (len > 1e-9) {
    const o: Vec3 = [p.x, p.y, p.z];
    const d: Vec3 = [dx / len, dy / len, dz / len];
    const t = rayWorld(o, d, boxes, len);
    if (t < len) return [p.x + d[0] * t, p.y + d[1] * t, p.z + d[2] * t];
  }
  p.x += dx; p.y += dy; p.z += dz;
  if (p.life <= 0 || p.y < -2) return [p.x, p.y, p.z];
  return null;
}
