import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The Frosty Living Room": a knitted living room on a snowy evening. An
 * 80 x 60 floor, 45 high. A Christmas tree in the corner you can climb tier
 * by tier to a star-top perch, a fireplace whose mantel is a sniper shelf
 * (the Baron's toys come down the chimney), a sofa, an armchair, a coffee
 * table, stacks of presents as steps, and a toy train looping the tree.
 * Invaders also come in under the front door and from behind the sofa.
 */
export function createLivingRoom(): World {
  const W = 40, D = 30, H = 45;
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const boxes: Box[] = [
    s(box(-W - 1, -1, -D - 1, W + 1, 0, D + 1, 'floor', 0x9a6a44), 'woodFloor'),
    s(box(-W - 1, 0, -D - 1, W + 1, H, -D, 'wall', 0xb5452a), 'wallpaper'),
    s(box(-W - 1, 0, -D, -W, H, D, 'wall', 0xb5452a), 'wallpaper'),
    s(box(W, 0, -D, W + 1, H, D, 'wall', 0xb5452a), 'wallpaper'),
    // Front wall with the door (x -6..6) the invaders crawl under.
    s(box(-W, 0, D, -6, H, D + 1, 'wall', 0xb5452a), 'wallpaper'),
    s(box(6, 0, D, W, H, D + 1, 'wall', 0xb5452a), 'wallpaper'),
    s(box(-6, 2.5, D, 6, H, D + 1, 'wall', 0x6a4a2e), 'frontDoor'),

    // The fireplace on the back wall: a brick surround with an opening, and a mantel to stand on.
    s(box(-12, 0, -D, -5, 14, -25, 'furniture', 0xa8584a), 'brick'),
    s(box(5, 0, -D, 12, 14, -25, 'furniture', 0xa8584a), 'brick'),
    s(box(-5, 8, -D, 5, 14, -25, 'furniture', 0xa8584a), 'brick'),
    s(box(-13, 14, -D, 13, 15.5, -24, 'furniture', 0x7a4a2e), 'mantel'),

    // The Christmas tree: four knitted tiers, climbable (push into the branches), a star perch on top.
    s(box(18, 0, -26, 32, 8, -12, 'furniture', 0x2f6a3a), 'treeTier', true),
    s(box(19.5, 8, -24.5, 30.5, 15, -13.5, 'furniture', 0x3a7a42), 'treeTier', true),
    s(box(21, 15, -23, 29, 21, -15, 'furniture', 0x2f6a3a), 'treeTier', true),
    s(box(22.5, 21, -21.5, 27.5, 26, -16.5, 'furniture', 0x3a7a42), 'treeTop', true),

    // Presents: a stepped pile in front of the tree, and a few strays.
    s(box(12, 0, -12, 17, 3, -7, 'prop', 0xd8262e), 'present'),
    s(box(14, 3, -12, 17, 6, -9, 'prop', 0x2f7a8a), 'present'),
    s(box(9, 0, -10, 12, 2, -7, 'prop', 0xe8b04a), 'present'),
    s(box(33, 0, -8, 38, 4, -3, 'prop', 0x6a3a8a), 'present'),
    s(box(-36, 0, -26, -31, 3.5, -21, 'prop', 0x2f6a3a), 'present'),

    // The sofa: seat (top at 6), back and arms, facing the fireplace.
    s(box(-30, 0, 6, -10, 6, 13, 'furniture', 0x2f5a8a), 'sofaSeat'),
    s(box(-30, 6, 11, -10, 13, 13, 'furniture', 0x2f5a8a), 'sofaBack'),
    s(box(-32, 0, 6, -30, 9, 13, 'furniture', 0x2f5a8a), 'sofaArm'),
    s(box(-10, 0, 6, -8, 9, 13, 'furniture', 0x2f5a8a), 'sofaArm'),
    // Coffee table (top at 5) on four legs, with a gingerbread house on it.
    s(box(-24, 4.4, -6, -14, 5, 0, 'furniture', 0x8a5a3a), 'tableTop'),
    ...[[-23.5, -5.5], [-14.5, -5.5], [-23.5, -0.5], [-14.5, -0.5]].map(([x, z]) => s(box(x - 0.4, 0, z - 0.4, x + 0.4, 4.4, z + 0.4, 'prop', 0x6a4a2e), 'tableLeg')),
    s(box(-21, 5, -4.5, -17, 8, -1.5, 'prop', 0xc8864a), 'gingerbread'),
    // An armchair by the window and a footstool step up to it.
    s(box(26, 0, 12, 36, 6, 22, 'furniture', 0xb5452a), 'armchair'),
    s(box(34, 6, 12, 36, 14, 22, 'furniture', 0xb5452a), 'armchairBack'),
    s(box(21, 0, 14, 25, 3, 18, 'prop', 0xe8b04a), 'footstool'),
    // A knitted snowman toy, a basket of logs and a rocking horse for cover.
    s(box(-37, 0, -6, -32, 7, -1, 'prop', 0xf6f4ee), 'snowman'),
    s(box(-16, 0, -27, -13, 3, -24, 'prop', 0x8a5a3a), 'logBasket'),
    s(box(4, 0, 17, 10, 6, 20, 'prop', 0xd8262e), 'rockingHorse'),
  ];

  const cores: Vec3[] = [[-2, 0, -14], [-20, 0, 20], [16, 0, 4]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // Down the chimney, under the front door, behind the sofa, and from under the tree skirt.
    enemySpawns: [[0, 0, -27], [0, 0, 27], [-36, 0, 18], [36, 0, -2]],
    playerSpawns: [[-6, 0, -10], [4, 0, -10], [-24, 0, 16], [-16, 0, 24], [12, 0, 8], [20, 0, 2]],
  };
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'livingroom', name: 'The Frosty Living Room', bounds: { min: [-39, -29], max: [39, 29] }, outdoor: false,
    boxes, coop,
    spawns: [[-20, 6, 9], [25, 26, -19], [0, 15.5, -25], [30, 6, 17], [-30, 0, -14], [28, 0, -2], [-4, 0, 22], [8, 0, -2]],
    waypoints: [[0, 0, 0], [-20, 0, 2], [10, 0, 10], [-30, 0, -14], [30, 0, 0], [0, 0, 22], [-26, 0, 24], [20, 0, 24], [-6, 0, -18]],
    pickups: [
      { pos: [-4, 0, 4], kind: 0 }, { pos: [22, 0, -4], kind: 0 }, { pos: [-28, 0, 22], kind: 0 },
      { pos: [-20, 6, 9], kind: 1 }, { pos: [8, 15.5, -25], kind: 1 }, { pos: [25, 26, -19], kind: 2 }, { pos: [-8, 0, 20], kind: 3 },
    ],
    jumpPads: [
      { x: 0, y: 0, z: -20, r: 1.1, launch: 26 },
      { x: 28, y: 0, z: -6, r: 1.1, launch: 28 },
    ],
    vehicles: [
      { kind: 1, pos: [-30, 0, -16], yaw: Math.PI / 2 },
    ],
    collectibles: [
      { id: 'xmas-star', pos: [25, 26, -19], kind: T },
      { id: 'xmas-mantel', pos: [-11, 15.5, -25.5], kind: C },
      { id: 'xmas-presents', pos: [15.5, 6, -10.5], kind: P },
      { id: 'xmas-sofa-back', pos: [-12, 13, 12], kind: T },
      { id: 'xmas-gingerbread', pos: [-19, 8, -3], kind: C },
      { id: 'xmas-armchair', pos: [35, 14, 17], kind: P },
      { id: 'xmas-snowman', pos: [-34.5, 7, -3.5], kind: T },
      { id: 'xmas-under-tree', pos: [33, 0, -28], kind: P },
    ],
  };
}
