import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The Garage": a suburban garage at toy scale (80 x 68 floor, 40 high).
 * A family car you can crawl under or climb onto, steel shelving, a workbench
 * under a climbable pegboard, a leaning ladder, cardboard-box steps and a
 * roll-up door left half open, which is where the invaders crawl in.
 */
export function createGarage(): World {
  const W = 40, D = 34, H = 40;
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const boxes: Box[] = [
    s(box(-W - 1, -1, -D - 1, W + 1, 0, D + 1, 'floor', 0x8a8a86), 'garageFloor'),
    s(box(-W - 1, 0, -D - 1, W + 1, H, -D, 'wall', 0x9a5a44), 'garageWall'),
    s(box(-W - 1, 0, -D, -W, H, -12, 'wall', 0x9a5a44), 'garageWall'),
    s(box(-W - 1, 0, -8, -W, H, D, 'wall', 0x9a5a44), 'garageWall'),
    s(box(-W - 1, 16, -12, -W, H, -8, 'wall', 0x9a5a44), 'garageWall'),
    s(box(W, 0, -D, W + 1, H, D, 'wall', 0x9a5a44), 'garageWall'),
    // The roll-up door, stuck three units off the floor.
    s(box(-W, 3, D, W, H, D + 1, 'wall', 0xd8d4c8), 'garageDoor'),

    // The family car: crawl under the body (2 u clearance), climb the hood and the roof.
    s(box(-17, 2, -18, 1, 8, 20, 'furniture', 0x2f5a9a), 'carBody'),
    s(box(-16, 8, -10, 0, 14, 8, 'furniture', 0x2f5a9a), 'carCabin'),
    s(box(-18, 0, -15, -14, 4.2, -8, 'prop', 0x1e1e22), 'wheel'),
    s(box(-2, 0, -15, 2, 4.2, -8, 'prop', 0x1e1e22), 'wheel'),
    s(box(-18, 0, 10, -14, 4.2, 17, 'prop', 0x1e1e22), 'wheel'),
    s(box(-2, 0, 10, 2, 4.2, 17, 'prop', 0x1e1e22), 'wheel'),

    // Steel shelving on the right wall: shelves at 8, 16 and 24.
    ...[0, 8, 16, 24].map((y) => s(box(31, y === 0 ? 0 : y - 0.6, -30, W, y === 0 ? 0.6 : y, 0, 'shelf', 0x9aa0aa), 'shelf')),
    ...[[31, -30], [31, -0.8], [39.2, -30], [39.2, -0.8]].map(([x, z]) => s(box(x, 0, z, x + 0.8, 24, z + 0.8, 'shelf', 0x6a707a), 'shelfPost')),

    // Workbench on the back wall, pegboard above it (climbable).
    s(box(4, 8.2, -D, 30, 9, -26, 'furniture', 0xb88a58), 'benchTop'),
    ...[[4, -27], [29, -27]].map(([x, z]) => s(box(x, 0, z, x + 1, 8.2, z + 1, 'furniture', 0x8a6a48), 'benchLeg')),
    s(box(4, 9, -D, 30, 30, -33.4, 'wall', 0xc8a878), 'pegboard', true),

    // Cardboard-box steps by the side door, a leaning ladder, a toolbox, paint tins and the lawn mower.
    s(box(-38, 0, -30, -32, 6, -24, 'prop', 0xc8a070), 'cardboard'),
    s(box(-38, 0, -24, -32, 3, -19, 'prop', 0xb89060), 'cardboard'),
    s(box(-38, 6, -30, -33, 10, -26, 'prop', 0xd8b080), 'cardboard'),
    s(box(-W, 0, 8, -38.8, 30, 12, 'prop', 0xc0c4ca), 'ladder', true),
    s(box(14, 0, 8, 20, 4, 12, 'prop', 0xd8262e), 'toolbox'),
    s(box(20, 0, 22, 23, 3.5, 25, 'prop', 0x3a5da8), 'paint'),
    s(box(24, 0, 22, 27, 3.5, 25, 'prop', 0x8bcb3a), 'paint'),
    s(box(22, 0, 12, 32, 5, 20, 'prop', 0x3e7a34), 'mower'),
  ];

  const cores: Vec3[] = [[-28, 0, -8], [12, 0, -12], [-26, 0, 22]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // Burrows: under the roll-up door (two spots), the side door and the floor drain.
    enemySpawns: [[-22, 0, 31], [20, 0, 31], [-38, 0, -10], [4, 0, 26]],
    playerSpawns: [[-24, 0, -4], [-30, 0, -14], [8, 0, -8], [16, 0, -16], [-22, 0, 18], [-30, 0, 26]],
  };
  const spawns: Vec3[] = [[-30, 0, -28], [34, 0, 28], [-34, 0, 28], [10, 0, 0], [26, 0, -14], [-8, 14, -1], [35, 8.1, -15], [-24, 0, 4]];
  const waypoints: Vec3[] = [
    [0, 0, 0], [-28, 0, -20], [20, 0, -20], [28, 0, 6], [-30, 0, 16], [10, 0, 24], [-8, 0, 28], [-24, 0, 0], [8, 0, -28], [-8, 0, -24],
  ];
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'garage', name: 'The Garage', bounds: { min: [-39, -33], max: [39, 33] }, outdoor: false,
    boxes, spawns, waypoints, coop,
    pickups: [
      { pos: [0, 0, 26], kind: 0 }, { pos: [-30, 0, 0], kind: 0 }, { pos: [26, 0, -18], kind: 0 },
      { pos: [-8, 14, -2], kind: 1 }, { pos: [17, 9, -30], kind: 1 }, { pos: [35.5, 24, -15], kind: 2 }, { pos: [-14, 0, 18], kind: 3 },
    ],
    jumpPads: [
      { x: 28.5, y: 0, z: -15, r: 1.1, launch: 22 },
      { x: -20, y: 0, z: 0, r: 1.1, launch: 28 },
    ],
    collectibles: [
      { id: 'gar2-top-shelf', pos: [36, 24, -27], kind: T },
      { id: 'gar2-pegboard', pos: [17, 30, -33.7], kind: T },
      { id: 'gar2-under-car', pos: [-8, 0, 1], kind: T },
      { id: 'gar2-mower', pos: [27, 5, 16], kind: P },
      { id: 'gar2-ladder', pos: [-39.4, 30, 10], kind: T },
      { id: 'gar2-boxes', pos: [-35.5, 10, -28], kind: C },
      { id: 'gar2-paint', pos: [25, 0, 28], kind: P },
      { id: 'gar2-toolbox', pos: [17, 4, 10], kind: C },
    ],
  };
}
