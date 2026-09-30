import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The Bathroom": 80 x 60 floor, 50 high. A claw-foot bathtub you can jump
 * into (its knitted shower curtain is climbable), a toilet with its tank as
 * a sniper perch, a vanity counter reached by climbing the hanging towel, a
 * toilet-roll staircase and a laundry basket. Invaders come in under the
 * door, up the floor drain and out from behind the laundry.
 */
export function createBathroom(): World {
  const W = 40, D = 30, H = 50;
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const boxes: Box[] = [
    s(box(-W - 1, -1, -D - 1, W + 1, 0, D + 1, 'floor', 0xe8eef0), 'tileFloor'),
    s(box(-W - 1, 0, -D - 1, W + 1, H, -D, 'wall', 0x9ad0d8), 'tileWall'),
    s(box(-W - 1, 0, -D, -W, H, D, 'wall', 0x9ad0d8), 'tileWall'),
    s(box(W, 0, -D, W + 1, H, D, 'wall', 0x9ad0d8), 'tileWall'),
    // Front wall with the door gap (x -6..6) where the invaders crawl in under the door.
    s(box(-W, 0, D, -6, H, D + 1, 'wall', 0x9ad0d8), 'tileWall'),
    s(box(6, 0, D, W, H, D + 1, 'wall', 0x9ad0d8), 'tileWall'),
    s(box(-6, 2.5, D, 6, H, D + 1, 'wall', 0xf2ece0), 'door'),

    // Bathtub: four rim walls (top at 11) around a walkable bottom (at 1).
    s(box(-38, 0, -30, 2, 1, -12, 'furniture', 0xf6f4ee), 'tubFloor'),
    s(box(-38, 1, -30, 2, 11, -28.5, 'furniture', 0xf6f4ee), 'tubRim'),
    s(box(-38, 1, -13.5, 2, 11, -12, 'furniture', 0xf6f4ee), 'tubRim'),
    s(box(-38, 1, -28.5, -36.5, 11, -13.5, 'furniture', 0xf6f4ee), 'tubRim'),
    s(box(0.5, 1, -28.5, 2, 11, -13.5, 'furniture', 0xf6f4ee), 'tubRim'),
    // The knitted shower curtain hangs from its rail to the floor in front of the tub: climb it.
    s(box(-38, 0, -11.4, -22, 40, -10.8, 'furniture', 0xb46fd6), 'showerCurtain', true),

    // Toilet: bowl and seat, then the tank (a high perch).
    s(box(21, 0, -27, 29, 8, -19, 'furniture', 0xf6f4ee), 'toiletBowl'),
    s(box(20, 0, -30, 30, 18, -27, 'furniture', 0xf6f4ee), 'toiletTank'),
    // A three-roll toilet paper staircase.
    s(box(8, 0, -29, 13, 4.5, -24, 'prop', 0xfaf8f2), 'tpRoll'),
    s(box(8, 4.5, -29, 13, 9, -24, 'prop', 0xfaf8f2), 'tpRoll'),
    s(box(13, 0, -29, 18, 4.5, -24, 'prop', 0xfaf8f2), 'tpRoll'),

    // Vanity with a counter at 16 and a knitted towel hanging down its front (climbable).
    s(box(30, 0, -10, 40, 16, 12, 'furniture', 0x8a6a48), 'vanity'),
    s(box(29.3, 3, 0, 30, 16, 7, 'furniture', 0xe8742a), 'towel', true),

    // Laundry basket (woven wool: climbable), a towel pile, a bathroom scale and a giant rubber duck.
    s(box(-37, 0, 16, -27, 12, 27, 'prop', 0xc8a070), 'laundry', true),
    s(box(12, 0, 19, 20, 3, 26, 'prop', 0x6fd6ff), 'towelPile'),
    s(box(14, 0, 3, 21, 1.4, 10, 'prop', 0xdfe4ea), 'scale'),
    s(box(-6, 0, 8, -1, 5, 13, 'prop', 0xffd24a), 'duck'),
  ];

  const cores: Vec3[] = [[-16, 0, 2], [10, 0, -10], [6, 0, 14]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // Burrows: under the door, the floor drain, and behind the laundry basket.
    enemySpawns: [[0, 0, 27], [-22, 0, 24], [34, 0, 24], [26, 0, -14]],
    playerSpawns: [[-12, 0, -4], [-20, 0, 6], [6, 0, -4], [14, 0, -14], [2, 0, 8], [10, 0, 20]],
  };
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'bathroom', name: 'The Bathroom', bounds: { min: [-39, -29], max: [39, 29] }, outdoor: false,
    boxes, coop,
    spawns: [[-18, 1, -20], [24, 0, 20], [-24, 0, 10], [0, 0, 0], [34, 16, 2], [25, 18, -28.5], [10, 0, -18], [-6, 0, 22]],
    waypoints: [[0, 0, 0], [-20, 0, 4], [20, 0, 6], [10, 0, -16], [-10, 0, 20], [24, 0, 16], [-30, 0, 4], [0, 0, 22], [16, 0, -8]],
    pickups: [
      { pos: [-20, 0, 12], kind: 0 }, { pos: [22, 0, 0], kind: 0 }, { pos: [0, 0, -6], kind: 0 },
      { pos: [-12, 1, -20], kind: 1 }, { pos: [35, 16, -6], kind: 1 }, { pos: [25, 18, -28.5], kind: 2 },
    ],
    jumpPads: [
      { x: -8, y: 0, z: -8.5, r: 1.1, launch: 24 },
      { x: 26.5, y: 0, z: 10, r: 1.1, launch: 30 },
    ],
    collectibles: [
      { id: 'bath-tub', pos: [-24, 1, -24], kind: T },
      { id: 'bath-tank', pos: [27, 18, -28.8], kind: T },
      { id: 'bath-vanity', pos: [38, 16, 10], kind: T },
      { id: 'bath-laundry', pos: [-32, 12, 21], kind: C },
      { id: 'bath-tp', pos: [10.5, 9, -26.5], kind: P },
      { id: 'bath-behind-toilet', pos: [31.5, 0, -29], kind: P },
      { id: 'bath-curtain', pos: [-30, 40, -11.1], kind: T },
      { id: 'bath-scale', pos: [17.5, 1.4, 6.5], kind: C },
    ],
  };
}
