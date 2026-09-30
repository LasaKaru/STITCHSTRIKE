import { circleClear, type Box, type Vec3, type World } from './world.ts';

/**
 * Enemies (plan §10), all knitted: cheap acrylic "Mass-Knit" toys plus the
 * wool-eating Moths. They run only on the server; clients interpolate them.
 */

export const EnemyType = { Grunt: 0, Scuttler: 1, Moth: 2, Brute: 3 } as const;

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  damage: number;
  attackRate: number;
  reward: number;
  flying: boolean;
  /** Brutes also flatten buildables in their way. */
  breaksBuildables: boolean;
}

export const ENEMIES: EnemyDef[] = [
  { name: 'Knit Grunt', hp: 70, speed: 2.4, radius: 0.45, height: 1.5, damage: 10, attackRate: 1, reward: 7, flying: false, breaksBuildables: false },
  { name: 'Scuttler', hp: 32, speed: 4.8, radius: 0.38, height: 0.7, damage: 6, attackRate: 2, reward: 6, flying: false, breaksBuildables: false },
  { name: 'Moth', hp: 40, speed: 3.6, radius: 0.45, height: 0.7, damage: 8, attackRate: 1.2, reward: 9, flying: true, breaksBuildables: false },
  { name: 'Felted Brute', hp: 520, speed: 1.5, radius: 0.9, height: 2.6, damage: 35, attackRate: 0.6, reward: 45, flying: false, breaksBuildables: true },
];

export const MOTH_ALTITUDE = 3.2;

export interface Enemy {
  id: number;
  type: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  core: number;
  node: number;
  cooldown: number;
  /** Seconds of remaining knockback drift. */
  kx: number;
  kz: number;
}

// ---------------------------------------------------------------- navigation

/**
 * A coarse grid of walkable floor nodes with a flow field per Heartspool:
 * next[core][node] is the neighbour one step closer to that core.
 */
export class NavGrid {
  readonly nodes: { x: number; z: number }[] = [];
  readonly neighbours: number[][] = [];
  readonly next: Int32Array[] = [];
  readonly dist: Float32Array[] = [];

  constructor(world: World, step = 2, clearance = 0.8) {
    const boxes = world.boxes;
    const index = new Map<string, number>();
    for (let gx = -19; gx <= 19; gx += step) {
      for (let gz = -17; gz <= 17; gz += step) {
        if (!circleClear(boxes, gx, gz, clearance)) continue;
        index.set(`${gx},${gz}`, this.nodes.length);
        this.nodes.push({ x: gx, z: gz });
      }
    }
    for (const n of this.nodes) {
      const list: number[] = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const j = index.get(`${n.x + dx * step},${n.z + dz * step}`);
        if (j !== undefined && segmentClear(boxes, n.x, n.z, this.nodes[j].x, this.nodes[j].z, clearance * 0.85)) list.push(j);
      }
      this.neighbours.push(list);
    }
    for (const core of world.coop.cores) this.buildFlow(core);
  }

  private buildFlow(core: Vec3): void {
    const n = this.nodes.length;
    const dist = new Float32Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const open: number[] = [];
    // Seed every node within reach of the core.
    this.nodes.forEach((p, i) => {
      if (Math.hypot(p.x - core[0], p.z - core[2]) < 3.2) { dist[i] = 0; open.push(i); }
    });
    // Dijkstra over a small graph; a sorted array is plenty.
    while (open.length) {
      open.sort((a, b) => dist[a] - dist[b]);
      const i = open.shift()!;
      for (const j of this.neighbours[i]) {
        const d = dist[i] + Math.hypot(this.nodes[i].x - this.nodes[j].x, this.nodes[i].z - this.nodes[j].z);
        if (d < dist[j]) {
          dist[j] = d;
          next[j] = i;
          if (!open.includes(j)) open.push(j);
        }
      }
    }
    this.next.push(next);
    this.dist.push(dist);
  }

  nearest(x: number, z: number, boxes: Box[]): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const d = Math.hypot(this.nodes[i].x - x, this.nodes[i].z - z);
      if (d < bestD && (d < 1 || segmentClear(boxes, x, z, this.nodes[i].x, this.nodes[i].z, 0.3))) { bestD = d; best = i; }
    }
    return best;
  }
}

function segmentClear(boxes: Box[], x0: number, z0: number, x1: number, z1: number, r: number): boolean {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(2, Math.ceil(len / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!circleClear(boxes, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r)) return false;
  }
  return true;
}

/** Pushes a circle out of floor-level boxes. */
export function pushOutOfBoxes(e: { x: number; z: number }, r: number, boxes: Box[], maxY = 1.2): void {
  for (const b of boxes) {
    if (b.kind === 'floor' || b.min[1] > maxY || b.max[1] < 0.05) continue;
    const cx = Math.max(b.min[0], Math.min(e.x, b.max[0]));
    const cz = Math.max(b.min[2], Math.min(e.z, b.max[2]));
    const dx = e.x - cx, dz = e.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      e.x = cx + (dx / d) * r;
      e.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: exit through the nearest face.
      const exits = [e.x - b.min[0], b.max[0] - e.x, e.z - b.min[2], b.max[2] - e.z];
      const m = exits.indexOf(Math.min(...exits));
      if (m === 0) e.x = b.min[0] - r; else if (m === 1) e.x = b.max[0] + r;
      else if (m === 2) e.z = b.min[2] - r; else e.z = b.max[2] + r;
    }
  }
}
