import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The Toy Store Aisle": a long aisle (60 x 110, 60 high) between towering
 * shelving loaded with boxed toys, crossed by a cross-aisle at the middle.
 * A pyramid display, a ball pit bin, a shopping trolley and the checkout at
 * the back. Sale banners hang down the shelf ends (climbable); invaders burst
 * out of their packaging at the sliding doors and the far corners.
 */
export function createToyStore(): World {
  const W = 30, D = 55, H = 60;
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const boxes: Box[] = [
    s(box(-W - 1, -1, -D - 1, W + 1, 0, D + 1, 'floor', 0xd8d4c8), 'storeFloor'),
    s(box(-W - 1, 0, -D - 1, W + 1, H, -D, 'wall', 0xe8e0d0), 'storeWall'),
    s(box(-W - 1, 0, D, -8, H, D + 1, 'wall', 0xe8e0d0), 'storeWall'),
    s(box(8, 0, D, W + 1, H, D + 1, 'wall', 0xe8e0d0), 'storeWall'),
    s(box(-8, 3, D, 8, H, D + 1, 'wall', 0xcfe8f0), 'slidingDoor'),
    s(box(-W - 1, 0, -D, -W, H, D, 'wall', 0xe8e0d0), 'storeWall'),
    s(box(W, 0, -D, W + 1, H, D, 'wall', 0xe8e0d0), 'storeWall'),
  ];
  // Four shelving units (two per side, split by the cross-aisle), shelves at 10, 20, 30, 40.
  for (const [x0, x1] of [[-W, -20], [20, W]]) {
    for (const [z0, z1] of [[-50, -4], [4, 50]]) {
      for (const y of [10, 20, 30, 40]) boxes.push(s(box(x0, y - 0.8, z0, x1, y, z1, 'shelf', 0x9aa0aa), 'storeShelf'));
      boxes.push(s(box(x0, 0, z0, x1, 1.5, z1, 'shelf', 0x6a707a), 'shelfBase'));
      const outer = x0 < 0 ? x0 : x1 - 0.8;
      boxes.push(s(box(outer, 0, z0, outer + 0.8, 40, z1, 'shelf', 0x6a707a), 'shelfBack'));
      // A knitted SALE banner hangs down the end facing the cross-aisle: climb it to the top shelf.
      const zEnd = z0 < 0 ? z1 : z0;
      const inner = zEnd === z1 ? [zEnd - 0.6, zEnd] : [zEnd, zEnd + 0.6];
      boxes.push(s(box(x0 + 1, 1.5, inner[0], x1 - 1, 40, inner[1], 'furniture', 0xd8262e), 'saleBanner', true));
    }
  }
  boxes.push(
    // Pyramid display of boxed toys.
    s(box(-7, 0, -32, 7, 4, -22, 'prop', 0x3a5da8), 'boxPile'),
    s(box(-5, 4, -30, 5, 8, -24, 'prop', 0xd8262e), 'boxPile'),
    s(box(-3, 8, -28.5, 3, 12, -25.5, 'prop', 0xffc94a), 'boxPile'),
    // A ball-pit bin: four low walls around a pile of knitted balls.
    s(box(-6, 0, 22, 6, 6, 23, 'prop', 0x2f7fe0), 'binWall'),
    s(box(-6, 0, 31, 6, 6, 32, 'prop', 0x2f7fe0), 'binWall'),
    s(box(-6, 0, 23, -5, 6, 31, 'prop', 0x2f7fe0), 'binWall'),
    s(box(5, 0, 23, 6, 6, 31, 'prop', 0x2f7fe0), 'binWall'),
    // A shopping trolley and the checkout counter with its conveyor.
    s(box(8, 2, 0, 15, 9, 9, 'furniture', 0xc0c4ca), 'trolley'),
    s(box(-18, 0, -54, 18, 10, -47, 'furniture', 0x3a3a40), 'checkout'),
  );

  const cores: Vec3[] = [[0, 0, -12], [-8, 0, 12], [10, 0, 38]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // Burrows: the sliding doors, behind the checkout, and both ends of the cross-aisle.
    enemySpawns: [[0, 0, 52], [-14, 0, -44], [26, 0, 0], [-26, 0, 0]],
    playerSpawns: [[4, 0, -8], [-4, 0, -16], [-12, 0, 8], [-4, 0, 16], [14, 0, 34], [6, 0, 42]],
  };
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'toystore', name: 'The Toy Store Aisle', bounds: { min: [-29, -46], max: [29, 53] }, outdoor: false,
    boxes, coop,
    spawns: [[0, 0, 44], [0, 0, -40], [-14, 0, 24], [14, 0, -24], [0, 12, -27], [-25, 10, 30], [25, 20, -30], [12, 9, 4.5]],
    waypoints: [[0, 0, 0], [0, 0, 30], [0, 0, -38], [-14, 0, -20], [14, 0, 20], [-24, 0, 0], [24, 0, 0], [12, 0, -36], [-12, 0, 44]],
    pickups: [
      { pos: [-14, 0, -30], kind: 0 }, { pos: [14, 0, 26], kind: 0 }, { pos: [0, 0, 4], kind: 0 },
      { pos: [0, 12, -27], kind: 1 }, { pos: [-25, 20, -30], kind: 1 }, { pos: [25, 40, 30], kind: 2 }, { pos: [0, 0, 18], kind: 3 },
    ],
    jumpPads: [
      { x: -17, y: 0, z: 20, r: 1.1, launch: 22 },
      { x: 17, y: 0, z: -20, r: 1.1, launch: 32 },
    ],
    vehicles: [{ kind: 1, pos: [-8, 0, 0], yaw: Math.PI / 2 }],
    collectibles: [
      { id: 'toy-top-left', pos: [-25, 40, 40], kind: T },
      { id: 'toy-top-right', pos: [25, 40, -40], kind: T },
      { id: 'toy-ballpit', pos: [0, 0, 27], kind: C },
      { id: 'toy-trolley', pos: [11.5, 9, 4.5], kind: P },
      { id: 'toy-checkout', pos: [10, 10, -50.5], kind: C },
      { id: 'toy-pyramid', pos: [0, 12, -27], kind: T },
      { id: 'toy-banner', pos: [-25, 40, -4.3], kind: T },
      { id: 'toy-mid-shelf', pos: [25, 20, 8], kind: P },
    ],
  };
}
