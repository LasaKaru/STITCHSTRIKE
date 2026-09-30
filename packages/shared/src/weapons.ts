import type { Vec3 } from './world.ts';

/**
 * Weapon table (plan §8). Each weapon is hitscan for now; the Button Buster
 * fires a deterministic pellet pattern so client prediction and server agree.
 */

export interface WeaponDef {
  id: number;
  name: string;
  damage: number;
  headshotMultiplier: number;
  fireRate: number;
  magazine: number;
  reloadSeconds: number;
  range: number;
  pellets: number;
  /** Cone half-angle in radians for pellets. */
  spread: number;
  /** Knockback impulse applied to enemies per pellet. */
  knockback: number;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 0, name: 'Pom-Pom Popper', damage: 9, headshotMultiplier: 1.5, fireRate: 12, magazine: 40,
    reloadSeconds: 1.4, range: 60, pellets: 1, spread: 0, knockback: 0.2,
  },
  {
    id: 1, name: 'Button Buster', damage: 11, headshotMultiplier: 1.25, fireRate: 1.2, magazine: 8,
    reloadSeconds: 1.8, range: 22, pellets: 8, spread: 0.075, knockback: 1.2,
  },
];

export const SWITCH_SECONDS = 0.25;

/** Golden-angle pellet pattern, rotated per shot by its input sequence number. */
export function pelletDirections(weapon: WeaponDef, dir: Vec3, seq: number): Vec3[] {
  if (weapon.pellets <= 1) return [dir];
  // Orthonormal basis around the aim direction.
  const up: Vec3 = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const r: Vec3 = [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r[0] /= rl; r[1] /= rl; r[2] /= rl;
  const u: Vec3 = [dir[1] * r[2] - dir[2] * r[1], dir[2] * r[0] - dir[0] * r[2], dir[0] * r[1] - dir[1] * r[0]];
  const out: Vec3[] = [];
  const rot = (seq * 2.399963) % (Math.PI * 2);
  for (let i = 0; i < weapon.pellets; i++) {
    const a = rot + i * 2.399963;
    const rad = weapon.spread * Math.sqrt((i + 0.5) / weapon.pellets);
    const ox = Math.cos(a) * rad;
    const oy = Math.sin(a) * rad;
    const d: Vec3 = [dir[0] + r[0] * ox + u[0] * oy, dir[1] + r[1] * ox + u[1] * oy, dir[2] + r[2] * ox + u[2] * oy];
    const l = Math.hypot(d[0], d[1], d[2]);
    out.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  return out;
}
