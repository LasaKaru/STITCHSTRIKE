import { circleClear, type Box, type Vec3, type World } from './world.ts';

/**
 * Enemies (plan §10), all knitted: cheap acrylic "Mass-Knit" toys plus the
 * wool-eating Moths. They run only on the server; clients interpolate them.
 */

export const EnemyType = {
  Grunt: 0, Scuttler: 1, Moth: 2, Brute: 3,
  /** Wind-up chattering teeth: a fast, fragile swarm. */
  Teeth: 4,
  /** Spinning top: zig-zags in fast and bowls toys over. */
  Top: 5,
  /** Tin toy soldier: stops at range and shoots. */
  Soldier: 6,
  /** RC drone: a flying carrier that drops teeth on the defence. */
  Drone: 7,
  /** Scissor snip: goes for buildables and cuts them apart. */
  Snip: 8,
  /** Boss: The Unraveller, Baron von Ravel's giant felted bear. */
  Boss: 9,
  /** Tin Drummer: beats the march, speeding up every invader around it. */
  Drummer: 10,
  /** Jack-in-the-Box: waddles up in its box, then springs out at toys nearby. */
  Jack: 11,
  /** Knitted raptor: a fast pack hunter that leaps at toys. */
  Raptor: 12,
  /** Woolly triceratops: lowers its frill and charges, flattening buildables. */
  Trike: 13,
  /** Felt pterodactyl: circles high and swoops down on toys. */
  Ptero: 14,
  /** Boss: Rex, the Yarnasaur. Stomps, and roars the herd into a rush. */
  Rex: 15,
  /** Paper plane: fast fragile flyers in squadrons that crumple into whatever they hit. */
  Plane: 16,
  /** Yo-Yo Slinger: flings its yo-yo from range and yanks toys towards it. */
  YoYo: 17,
} as const;

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
  /** Brutes and the boss also flatten buildables in their way. */
  breaksBuildables: boolean;
  /** Stops at this range with line of sight and fires (tin soldiers). */
  range?: number;
  /** Hunts buildables before anything else (scissor snips). */
  cutsBuildables?: boolean;
  /** Cruising height for flyers. */
  altitude?: number;
  boss?: boolean;
  /** Knocks toys back on hit (spinning tops, the boss). */
  knockback?: number;
  /** One of the Dino Stampede herd (a Rex roar sends these rushing). */
  dino?: boolean;
  /** Crumples on its first hit (paper planes). */
  kamikaze?: boolean;
}

export const ENEMIES: EnemyDef[] = [
  { name: 'Knit Grunt', hp: 70, speed: 2.4, radius: 0.45, height: 1.5, damage: 10, attackRate: 1, reward: 7, flying: false, breaksBuildables: false },
  { name: 'Scuttler', hp: 32, speed: 4.8, radius: 0.38, height: 0.7, damage: 6, attackRate: 2, reward: 6, flying: false, breaksBuildables: false },
  { name: 'Moth', hp: 40, speed: 3.6, radius: 0.45, height: 0.7, damage: 8, attackRate: 1.2, reward: 9, flying: true, breaksBuildables: false, altitude: 3.2 },
  { name: 'Felted Brute', hp: 520, speed: 1.5, radius: 0.9, height: 2.6, damage: 35, attackRate: 0.6, reward: 45, flying: false, breaksBuildables: true, knockback: 4 },
  { name: 'Chatter Teeth', hp: 14, speed: 5, radius: 0.28, height: 0.45, damage: 3, attackRate: 1.6, reward: 2, flying: false, breaksBuildables: false },
  { name: 'Spinning Top', hp: 60, speed: 6, radius: 0.5, height: 0.9, damage: 12, attackRate: 1, reward: 8, flying: false, breaksBuildables: false, knockback: 7 },
  { name: 'Tin Soldier', hp: 55, speed: 2, radius: 0.4, height: 1.35, damage: 7, attackRate: 0.8, reward: 10, flying: false, breaksBuildables: false, range: 14 },
  { name: 'RC Drone', hp: 90, speed: 3.2, radius: 0.6, height: 0.5, damage: 10, attackRate: 1, reward: 14, flying: true, breaksBuildables: false, altitude: 5.5 },
  { name: 'Scissor Snip', hp: 110, speed: 3, radius: 0.55, height: 0.8, damage: 12, attackRate: 1, reward: 16, flying: false, breaksBuildables: false, cutsBuildables: true },
  { name: 'The Unraveller', hp: 4200, speed: 1.2, radius: 1.6, height: 4.6, damage: 50, attackRate: 0.5, reward: 300, flying: false, breaksBuildables: true, boss: true, knockback: 9 },
  { name: 'Tin Drummer', hp: 150, speed: 1.9, radius: 0.5, height: 1.45, damage: 8, attackRate: 0.8, reward: 18, flying: false, breaksBuildables: false },
  { name: 'Jack-in-the-Box', hp: 90, speed: 2.8, radius: 0.55, height: 1.1, damage: 26, attackRate: 0.5, reward: 15, flying: false, breaksBuildables: false, knockback: 8 },
  { name: 'Knitted Raptor', hp: 65, speed: 4.6, radius: 0.5, height: 1.4, damage: 12, attackRate: 1.4, reward: 10, flying: false, breaksBuildables: false, dino: true },
  { name: 'Woolly Trike', hp: 650, speed: 1.7, radius: 1.2, height: 2, damage: 38, attackRate: 0.6, reward: 50, flying: false, breaksBuildables: true, knockback: 10, dino: true },
  { name: 'Felt Ptero', hp: 60, speed: 4.6, radius: 0.7, height: 0.8, damage: 11, attackRate: 1.1, reward: 11, flying: true, breaksBuildables: false, altitude: 7, knockback: 5, dino: true },
  { name: 'Rex, the Yarnasaur', hp: 5200, speed: 1.4, radius: 2, height: 5.2, damage: 60, attackRate: 0.5, reward: 400, flying: false, breaksBuildables: true, boss: true, knockback: 11, dino: true },
  { name: 'Paper Plane', hp: 22, speed: 7.5, radius: 0.4, height: 0.3, damage: 9, attackRate: 2, reward: 4, flying: true, breaksBuildables: false, altitude: 4.5, kamikaze: true },
  { name: 'Yo-Yo Slinger', hp: 120, speed: 2.2, radius: 0.45, height: 1.25, damage: 10, attackRate: 0.5, reward: 14, flying: false, breaksBuildables: false },
];

/** Damage scissor snips do to buildables per cut. */
export const SNIP_CUT = 60;
/** Seconds between a drone's teeth drops, and how many per drop. */
export const DRONE_DROP = { every: 6, count: 3 };
/** The boss stomps every few seconds: damage and radius. */
export const BOSS_STOMP = { every: 6, damage: 30, radius: 5 };
/** Tin Drummers speed up every other invader within radius, and beat the drum this often (seconds). */
export const DRUM = { radius: 7, boost: 1.35, every: 2 };
/** Jack-in-the-Box: springs when a toy is within range, hurting toys within radius and lunging at them. */
export const JACK_POP = { range: 4, radius: 3, damage: 26, every: 5, lunge: 9 };
/** Yo-Yo Slinger: every few seconds, a toy within range it can see gets yanked towards it (and stung). */
export const YOYO = { range: 10, every: 3.2, damage: 10, pull: 9 };

/** Raptors leap at a toy within range (but not too close), every few seconds. */
export const RAPTOR_LEAP = { range: 9, min: 2.5, every: 4, lunge: 15 };
/** Trikes charge a toy within range: a burst of speed for a moment. */
export const TRIKE_CHARGE = { range: 16, every: 8, duration: 1.8, boost: 3.2 };
/** Pteros spot toys from this far off and swoop down at them. */
export const PTERO_SWOOP = { range: 14 };
/** Rex roars this often: every dino within radius rushes (faster) for a while. */
export const REX_ROAR = { every: 11, radius: 26, rush: 4, boost: 1.6 };

/** Tin soldiers' chance to hit a toy per shot (they are toys, after all). */
export const SOLDIER_ACCURACY = 0.55;

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
  /** Seconds left tangled by a yarn ball (half speed). */
  slow: number;
  /** Type-specific timer: drone drops, boss stomps, raptor leaps, trike charges. */
  special: number;
  /** Seconds left charging (trikes) or rushing after a Rex roar. */
  rush?: number;
  /** Seconds until Rex roars again. */
  roar?: number;
  /** Seconds spent neither moving nor attacking (a stuck invader gives up after a while). */
  stuck?: number;
}

/** An invader that neither moves nor attacks for this long unravels by itself, so a wave can never stall. */
export const STUCK_SECONDS = 20;

// ---------------------------------------------------------------- navigation

/**
 * A coarse grid of walkable floor nodes with a flow field per Heartspool:
 * next[core][node] is the neighbour one step closer to that core.
 */
export class NavGrid {
  readonly nodes: { x: number; z: number }[] = [];
  readonly neighbours: number[][] = [];
  next: Int32Array[] = [];
  dist: Float32Array[] = [];
  /** Extra cost multiplier per node (blockades make routes expensive, not impossible). */
  readonly cost: Float32Array;
  private cores: Vec3[];

  constructor(world: World, step = 2, clearance = 0.8) {
    const boxes = world.boxes;
    const index = new Map<string, number>();
    const { min, max } = world.bounds;
    for (let gx = Math.ceil(min[0]); gx <= max[0]; gx += step) {
      for (let gz = Math.ceil(min[1]); gz <= max[1]; gz += step) {
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
    this.cost = new Float32Array(this.nodes.length).fill(1);
    this.cores = world.coop.cores;
    this.rebake([]);
  }

  /**
   * Re-bakes every Heartspool's flow field around the current blockades, so
   * invaders route around walls the moment they are built (tower-defence
   * mazing). Nodes under a blockade cost 14x: if there is no way round,
   * enemies still come through and chew the wall.
   */
  rebake(blockers: { x: number; z: number; r: number }[]): void {
    this.cost.fill(1);
    for (const b of blockers) {
      this.nodes.forEach((n, i) => {
        if (Math.hypot(n.x - b.x, n.z - b.z) < b.r) this.cost[i] = 14;
      });
    }
    this.next = [];
    this.dist = [];
    for (const core of this.cores) this.buildFlow(core);
  }

  private buildFlow(core: Vec3): void {
    const n = this.nodes.length;
    const dist = new Float32Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    // Binary-heap Dijkstra (the garden grid has ~2000 nodes).
    const heap: number[] = [];
    const push = (i: number) => {
      heap.push(i);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (dist[heap[p]] <= dist[heap[c]]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l;
          if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const done = new Uint8Array(n);
    // Seed every node within reach of the core.
    this.nodes.forEach((p, i) => {
      if (Math.hypot(p.x - core[0], p.z - core[2]) < 3.2) { dist[i] = 0; push(i); }
    });
    while (heap.length) {
      const i = pop();
      if (done[i]) continue;
      done[i] = 1;
      for (const j of this.neighbours[i]) {
        const d = dist[i] + Math.hypot(this.nodes[i].x - this.nodes[j].x, this.nodes[i].z - this.nodes[j].z) * this.cost[j];
        if (d < dist[j]) {
          dist[j] = d;
          next[j] = i;
          push(j);
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
