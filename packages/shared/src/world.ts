export type Vec3 = [number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
  /** Render hint only; collision treats every box the same. */
  kind: 'floor' | 'wall' | 'furniture' | 'prop' | 'shelf';
  color?: number;
  /** Render hint only: draw as something softer than a box. */
  shape?: 'beanbag' | 'books' | 'bed';
}

export interface World {
  name: string;
  boxes: Box[];
  spawns: Vec3[];
  /** Bot navigation waypoints at floor level or on reachable tops. */
  waypoints: Vec3[];
  coop: CoopLayout;
}

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

function ringPads(boxes: Box[], cores: Vec3[], perCore: number, radius: number): BuildPad[] {
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

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: Box['kind'], color?: number): Box {
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
    box(-W - T, -1, -D - T, W + T, 0, D + T, 'floor', 0x8a93a8),
    box(-W - T, 0, -D - T, W + T, H, -D, 'wall', 0x5e6b86),
    box(-W - T, 0, D, W + T, H, D + T, 'wall', 0x5e6b86),
    box(-W - T, 0, -D, -W, H, D, 'wall', 0x66728c),
    box(W, 0, -D, W + T, H, D, 'wall', 0x66728c),

    // Bed along the back wall: mattress top at 5 u.
    { ...box(-W, 0, -D, -W + 11, 5, -D + 18, 'furniture', 0x3a5da8), shape: 'bed' },
    box(-W, 5, -D, -W + 11, 9, -D + 1.2, 'furniture', 0x6a5a4a),

    // Desk (top at 7.5) with legs, and a chair seat at 4.5.
    box(8, 7, -D, W, 7.5, -D + 7, 'furniture', 0xc8a878),
    box(8, 0, -D, 8.8, 7, -D + 0.8, 'furniture', 0xa88858),
    box(8, 0, -D + 6.2, 8.8, 7, -D + 7, 'furniture', 0xa88858),
    box(W - 0.8, 0, -D, W, 7, -D + 7, 'furniture', 0xa88858),
    box(11, 4, -D + 7.5, 15, 4.5, -D + 11.5, 'furniture', 0xd8262e),
    box(12.6, 0, -D + 9.1, 13.4, 4, -D + 9.9, 'furniture', 0x333333),

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
    box(-2, 0, -4, 1, 2, -1, 'prop', 0xe8742a),
    box(4, 0, 2, 6, 2.6, 4, 'prop', 0x2f7fe0),
    box(-12, 0, 6, -9, 1.2, 9, 'prop', 0xd8262e),
    box(2, 0, 10, 8, 1, 11, 'prop', 0xefe3c8),
    box(-4, 0, -12, -1, 4, -11, 'prop', 0x5e6b86),
    box(12, 0, -2, 14, 3, 0, 'prop', 0xffc94a),
  ];

  // Book-stack stairs up to the bed (mattress at 5) and the bookshelf's first shelf.
  boxes.push(...steps(-W + 11, -4, -1, 5, 1, 1.1, 1, 0x3a5da8));
  boxes.push(...steps(W - 4, 5, 7, 4, 1.1, 1, -1, 0xe8742a));
  // Chair -> desk: a book block to hop from the chair seat onto the desk.
  boxes.push(box(10, 0, -D + 7, 12, 6, -D + 8, 'prop', 0xefe3c8));

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

  return { name: 'Sunbeam Bedroom', boxes, spawns, waypoints, coop };
}
