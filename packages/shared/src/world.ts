import type { PickupSpot } from './pickups.ts';

export type Vec3 = [number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
  /** Render hint only; collision treats every box the same. */
  kind: 'floor' | 'wall' | 'furniture' | 'prop' | 'shelf';
  color?: number;
  /** Render hint only: what real object this collision box is drawn as. */
  shape?: string;
  /** Fabric you can climb (bedsheets, curtains, pegboard, tree bark): push into it to climb. */
  climb?: boolean;
}

export type MapId = 'bedroom' | 'garden' | 'garage' | 'bathroom' | 'toystore' | 'park';
export const MAPS: { id: MapId; name: string; blurb: string }[] = [
  { id: 'bedroom', name: 'Sunbeam Bedroom', blurb: 'A messy knitted bedroom lit by one sunbeam.' },
  { id: 'garden', name: 'Back Garden', blurb: 'Lawn, trees, a house, a shed and a treehouse, all wool.' },
  { id: 'garage', name: 'The Garage', blurb: 'A family car, steel shelving, a workbench and a half-open door.' },
  { id: 'bathroom', name: 'The Bathroom', blurb: 'A bathtub to jump into, a climbable shower curtain and a toilet-tank perch.' },
  { id: 'toystore', name: 'The Toy Store Aisle', blurb: 'Towering shelves of boxed toys, a ball pit, a trolley and the checkout.' },
  { id: 'park', name: 'The City Park', blurb: 'An autumn park: pom-pom trees, a knitted pond and bridge, a bandstand and the city all around.' },
];

export interface World {
  id: MapId;
  name: string;
  /** Playable XZ area (nav grid and bots stay inside it). */
  bounds: { min: [number, number]; max: [number, number] };
  outdoor: boolean;
  boxes: Box[];
  spawns: Vec3[];
  /** Bot navigation waypoints at floor level or on reachable tops. */
  waypoints: Vec3[];
  coop: CoopLayout;
  /** Static pickup spots (health, armour, power), respawning on a timer. */
  pickups: PickupSpot[];
  /** Map jump pads: stand on one and it launches you (y is the surface height). */
  jumpPads: JumpPad[];
  /** Built spring pads (co-op), kept in sync by the room; also launch toys. Floor level. */
  springs?: { x: number; z: number; r: number; launch: number }[];
  /** Hidden golden thimbles and weapon parts; collected per player profile (client-side). */
  collectibles: Collectible[];
}

export const CollectibleKind = { Thimble: 0, Part: 1, Credits: 2 } as const;
export interface Collectible { id: string; pos: Vec3; kind: number }

export interface JumpPad { x: number; y: number; z: number; r: number; launch: number }

export interface BuildPad {
  pos: Vec3;
  /** Index of the Heartspool this pad protects (colour-coded in the client). */
  core: number;
}

/** Co-op defence layout (plan §9, §11): Heartspools, stitched build pads, enemy burrows. */
export interface CoopLayout {
  cores: Vec3[];
  pads: BuildPad[];
  enemySpawns: Vec3[];
  playerSpawns: Vec3[];
}

/** Circle (in XZ) vs every floor-level box. */
export function circleClear(boxes: Box[], x: number, z: number, r: number, maxY = 1.2): boolean {
  for (const b of boxes) {
    if (b.kind === 'floor' || b.min[1] > maxY || b.max[1] < 0.05) continue;
    const cx = Math.max(b.min[0], Math.min(x, b.max[0]));
    const cz = Math.max(b.min[2], Math.min(z, b.max[2]));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  return true;
}

export function ringPads(boxes: Box[], cores: Vec3[], perCore: number, radius: number): BuildPad[] {
  const pads: BuildPad[] = [];
  cores.forEach((c, ci) => {
    let placed = 0;
    for (let k = 0; k < 16 && placed < perCore; k++) {
      const a = (k / 16) * Math.PI * 2 * 3 + ci; // stride around the ring to spread pads out
      const x = c[0] + Math.cos(a) * radius;
      const z = c[2] + Math.sin(a) * radius;
      if (!circleClear(boxes, x, z, 1.3)) continue;
      if (cores.some((o) => Math.hypot(o[0] - x, o[2] - z) < 2.2)) continue;
      if (pads.some((p) => Math.hypot(p.pos[0] - x, p.pos[2] - z) < 2.6)) continue;
      pads.push({ pos: [x, 0, z], core: ci });
      placed++;
    }
  });
  return pads;
}

export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: Box['kind'], color?: number): Box {
  return { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], kind, color };
}

/** Stairs that start tallest at x and step down along dir; climb routes onto furniture. */
function steps(x: number, z0: number, z1: number, count: number, rise: number, run: number, dir: 1 | -1, color: number): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < count; i++) {
    const xa = x + dir * i * run;
    out.push({ ...box(xa, 0, z0, xa + dir * run, rise * (count - i), z1, 'prop', color), shape: 'books' });
  }
  return out;
}

/**
 * Grey-box "Sunbeam Bedroom": 40 x 35 floor, 25 high. Three height layers
 * (floor, furniture tops at 4-8 u, shelf tops at 12+ u) linked by step routes.
 */
export function createBedroom(): World {
  const W = 20;
  const D = 17.5;
  const H = 25;
  const T = 1;
  const boxes: Box[] = [
    box(-W - T, -1, -D - T, W + T, 0, D + T, 'floor', 0x9a6a44),
    box(-W - T, 0, -D - T, W + T, H, -D, 'wall', 0xe6d3b3),
    box(-W - T, 0, D, W + T, H, D + T, 'wall', 0xe6d3b3),
    box(-W - T, 0, -D, -W, H, D, 'wall', 0xeadcc0),
    box(W, 0, -D, W + T, H, D, 'wall', 0xeadcc0),

    // Bed along the back wall: mattress top at 5 u.
    { ...box(-W, 0, -D, -W + 11, 5, -D + 18, 'furniture', 0x3a5da8), shape: 'bed', climb: true },
    { ...box(-W, 5, -D, -W + 11, 9, -D + 1.2, 'furniture', 0x6a5a4a), shape: 'headboard', climb: true },
    // A long knitted curtain by the window, hanging to the floor: climb it to the sill.
    { ...box(-W, 0, 12.2, -W + 0.6, 17, 14, 'furniture', 0xd9a441), shape: 'curtain', climb: true },

    // Desk (top at 7.5) with legs, and a chair seat at 4.5.
    { ...box(8, 7, -D, W, 7.5, -D + 7, 'furniture', 0xc8a878), shape: 'deskTop' },
    { ...box(8, 0, -D, 8.8, 7, -D + 0.8, 'furniture', 0xa88858), shape: 'deskLeg' },
    { ...box(8, 0, -D + 6.2, 8.8, 7, -D + 7, 'furniture', 0xa88858), shape: 'deskLeg' },
    { ...box(W - 0.8, 0, -D, W, 7, -D + 7, 'furniture', 0xa88858), shape: 'deskSide' },
    { ...box(11, 4, -D + 7.5, 15, 4.5, -D + 11.5, 'furniture', 0xd8262e), shape: 'chairSeat' },
    { ...box(11.2, 4.5, -D + 11.1, 14.8, 8.5, -D + 11.6, 'furniture', 0xd8262e), shape: 'chairBack' },
    { ...box(12.6, 0, -D + 9.1, 13.4, 4, -D + 9.9, 'furniture', 0x333333), shape: 'chairPost' },

    // Bookshelf tower on the right wall: shelves every 4 u, top at 16.
    box(W - 4, 0, 4, W, 0.6, 12, 'shelf', 0xb89870),
    box(W - 4, 4, 4, W, 4.5, 12, 'shelf', 0xb89870),
    box(W - 4, 8, 4, W, 8.5, 12, 'shelf', 0xb89870),
    box(W - 4, 12, 4, W, 12.5, 12, 'shelf', 0xb89870),
    box(W - 4, 15.5, 4, W, 16, 12, 'shelf', 0xb89870),
    box(W - 4, 0, 3.4, W, 16, 4, 'shelf', 0x9a7a55),
    box(W - 4, 0, 12, W, 16, 12.6, 'shelf', 0x9a7a55),

    // Bean bag (soft high ground) and toy clutter used as cover.
    { ...box(-6, 0, 6, 0, 3, 12, 'prop', 0x8bcb3a), shape: 'beanbag' },
    { ...box(-2, 0, -4, 1, 2, -1, 'prop', 0xe8742a), shape: 'toyChest' },
    { ...box(4, 0, 2, 6, 2.6, 4, 'prop', 0x2f7fe0), shape: 'blocks' },
    { ...box(-12, 0, 6, -9, 1.2, 9, 'prop', 0xd8262e), shape: 'car' },
    { ...box(2, 0, 10, 8, 1, 11, 'prop', 0xefe3c8), shape: 'ruler' },
    { ...box(-4, 0, -12, -1, 4, -11, 'prop', 0x8a3a2a), shape: 'book' },
    { ...box(12, 0, -2, 14, 3, 0, 'prop', 0xffc94a), shape: 'drum' },
  ];

  // Book-stack stairs up to the bed (mattress at 5) and the bookshelf's first shelf.
  boxes.push(...steps(-W + 11, -4, -1, 5, 1, 1.1, 1, 0x3a5da8));
  boxes.push(...steps(W - 4, 5, 7, 4, 1.1, 1, -1, 0xe8742a));
  // Chair -> desk: a book block to hop from the chair seat onto the desk.
  boxes.push({ ...box(10, 0, -D + 7, 12, 6, -D + 8, 'prop', 0xefe3c8), shape: 'bookStack' });

  const spawns: Vec3[] = [
    [0, 0, 14],
    [-14, 0, 12],
    [14, 0, 14],
    [8, 0, -6],
    [-14, 5, -10],
    [0, 0, -8],
    [-16, 0, 3],
    [16, 0, -2],
  ];

  const waypoints: Vec3[] = [
    [0, 0, 0], [-6, 0, 3], [6, 0, 6], [10, 0, -4], [-3, 0, 14], [14, 0, 14],
    [-14, 0, 13], [-15, 5, -10], [16, 0, 0], [3, 0, -12], [-8, 0, -3], [17, 0, 8],
  ];

  const cores: Vec3[] = [[-6, 0, -7], [2, 0, 3.5], [8, 0, -5]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.4),
    // Burrows: under the desk, the doorway, the dark corner behind the toy box.
    enemySpawns: [[14, 0, -14], [13, 0, 16], [-17, 0, 14]],
    playerSpawns: [[-1, 0, 0.5], [-3.5, 0, 1.5], [5, 0, 0], [4, 0, 8], [-8, 0, 2], [10, 0, 2]],
  };

  const pickups: PickupSpot[] = [
    { pos: [-14, 0, 12], kind: 0 }, { pos: [15, 0, 14], kind: 0 }, { pos: [3, 0, -12], kind: 0 },
    // Rewards for climbing: armour on the bed, power on the top shelf, armour on the desk.
    { pos: [-15, 5, -8], kind: 1 }, { pos: [18, 16, 8], kind: 2 }, { pos: [16, 7.5, -13], kind: 1 },
  ];
  // Spring toys: one by the bookshelf (to the top shelf), one by the desk.
  const jumpPads = [
    { x: 14, y: 0, z: 8, r: 1, launch: 30 },
    { x: 5.5, y: 0, z: -12, r: 1, launch: 21 },
  ];
  const T0 = CollectibleKind.Thimble, PT = CollectibleKind.Part, CR = CollectibleKind.Credits;
  const collectibles: Collectible[] = [
    { id: 'bed-shelf-top', pos: [18, 16, 5], kind: T0 },
    { id: 'bed-headboard', pos: [-15, 9, -16.8], kind: T0 },
    { id: 'bed-desk', pos: [19, 7.5, -16], kind: T0 },
    { id: 'bed-chair', pos: [13, 8.5, -6.3], kind: PT },
    { id: 'bed-drum', pos: [13, 3, -1], kind: CR },
    { id: 'bed-curtain', pos: [-19.3, 17, 13.1], kind: T0 },
    { id: 'bed-corner', pos: [18.5, 0, 16], kind: PT },
    { id: 'bed-beanbag', pos: [-3, 3, 9], kind: CR },
  ];
  return { id: 'bedroom', name: 'Sunbeam Bedroom', bounds: { min: [-19, -17], max: [19, 17] }, outdoor: false, boxes, spawns, waypoints, coop, pickups, jumpPads, collectibles };
}

export function createWorld(map: MapId = 'bedroom'): World {
  switch (map) {
    case 'garden': return createGarden();
    case 'garage': return createGarage();
    case 'bathroom': return createBathroom();
    case 'toystore': return createToyStore();
    case 'park': return createPark();
    default: return createBedroom();
  }
}

import { createBathroom } from './bathroom.ts';
import { createGarage } from './garage.ts';
import { createToyStore } from './toystore.ts';
import { createPark } from './park.ts';
import { createGarden } from './garden.ts';
