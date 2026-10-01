import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The Dino Den": a giant knitted prehistoric playset. A stepped volcano
 * you can climb to a smoking crater, a yarn jungle of palm trees, a river
 * with a fallen-log crossing, a fossil skeleton whose spine is a sniper
 * perch, a stone arch, a ranger's lookout tower and rocky felt cliffs all
 * round with a gap on each side where the herd breaks in.
 */
export function createDinoDen(): World {
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const cliff = 0xa8784a;
  const boxes: Box[] = [
    box(-62, -1, -52, 62, 0, 52, 'floor', 0xd8b878),
    // Rocky cliffs with a gap in the middle of each side.
    s(box(-62, 0, -52, -6, 9, -47, 'wall', cliff), 'cliff'),
    s(box(6, 0, -52, 62, 9, -47, 'wall', cliff), 'cliff'),
    s(box(-62, 0, 47, -6, 9, 52, 'wall', cliff), 'cliff'),
    s(box(6, 0, 47, 62, 9, 52, 'wall', cliff), 'cliff'),
    s(box(-62, 0, -47, -57, 9, -6, 'wall', cliff), 'cliff'),
    s(box(-62, 0, 6, -57, 9, 47, 'wall', cliff), 'cliff'),
    s(box(57, 0, -47, 62, 9, -6, 'wall', cliff), 'cliff'),
    s(box(57, 0, 6, 62, 9, 47, 'wall', cliff), 'cliff'),

    // The volcano: four knitted tiers, each a mantle-able ledge, a smoking crater on top.
    s(box(-15, 0, 12, 15, 3, 32, 'furniture', 0x6a4a3a), 'volcano'),
    s(box(-11, 3, 15, 11, 6, 29, 'furniture', 0x6a4a3a), 'volcano'),
    s(box(-8, 6, 17, 8, 9, 27, 'furniture', 0x6a4a3a), 'volcano'),
    s(box(-5, 9, 19, 5, 12, 25, 'furniture', 0x5a3a2e), 'volcanoTop'),

    // The fossil skeleton: climbable leg bones up to a spine you can walk along, the skull at the end.
    ...[[22, 4], [27, 8], [33, 4], [38, 8]].map(([x, z]) => s(box(x - 0.6, 0, z - 0.6, x + 0.6, 7, z + 0.6, 'prop', 0xefe3c8), 'fossilLeg', true)),
    s(box(19, 7, 4, 41, 8, 8, 'furniture', 0xefe3c8), 'fossilSpine'),
    s(box(41, 0, 2, 48, 6, 10, 'furniture', 0xefe3c8), 'fossilSkull'),

    // The yarn jungle: palm trunks to climb, fronds to stand in.
    ...[[-42, 22], [-28, 34], [-46, 2], [-22, 18], [-40, 38], [44, 30], [24, 38]].flatMap(([x, z]) => [
      s(box(x - 1.2, 0, z - 1.2, x + 1.2, 14, z + 1.2, 'prop', 0x8a5a3a), 'palmTrunk', true),
      s(box(x - 4.5, 14, z - 4.5, x + 4.5, 14.6, z + 4.5, 'furniture', 0x4a8a3a), 'frond'),
    ]),

    // A stone arch over the west path.
    s(box(-37, 0, -3, -34, 8, 3, 'furniture', 0x9a8a78), 'archPillar'),
    s(box(-26, 0, -3, -23, 8, 3, 'furniture', 0x9a8a78), 'archPillar'),
    s(box(-37.5, 8, -3.5, -22.5, 10, 3.5, 'furniture', 0x9a8a78), 'archTop'),

    // The river (decorative) and a fallen log you can run along.
    s(box(-30, 0, -33.5, -12, 1.6, -30.5, 'furniture', 0x7a5a3a), 'log'),

    // The ranger's lookout: four posts, a platform, a ladder.
    ...[[-50, -40], [-42, -40], [-50, -32], [-42, -32]].map(([x, z]) => s(box(x - 0.5, 0, z - 0.5, x + 0.5, 9, z + 0.5, 'prop', 0x8a5a3a), 'towerLeg', true)),
    s(box(-51, 9, -41, -41, 10, -31, 'furniture', 0x8a5a3a), 'towerDeck'),
    s(box(-46.5, 0, -31, -45.5, 9, -30.6, 'prop', 0x6a4a2e), 'ladder', true),

    // Boulders, a nest of dino eggs and big knitted ferns for cover.
    s(box(10, 0, -24, 16, 4, -18, 'prop', 0x9a968e), 'boulder', true),
    s(box(-16, 0, -14, -11, 3.5, -9, 'prop', 0x9a968e), 'boulder', true),
    s(box(44, 0, -40, 50, 5, -34, 'prop', 0x9a968e), 'boulder', true),
    s(box(16, 0, -6, 22, 1.4, 0, 'furniture', 0xb08850), 'nest'),
    ...[[-8, -22], [24, -9], [-46, -18], [46, 14], [8, 40], [-14, 40]].map(([x, z]) => s(box(x - 1.6, 0, z - 1.6, x + 1.6, 3, z + 1.6, 'prop', 0x4a8a3a), 'fern')),
  ];

  const cores: Vec3[] = [[0, 0, 0], [-32, 0, -18], [32, 0, -18]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // The four gaps in the cliffs.
    enemySpawns: [[0, 0, 45], [0, 0, -45], [-55, 0, 0], [55, 0, 0]],
    playerSpawns: [[-5, 0, -4], [5, 0, -4], [-36, 0, -14], [-28, 0, -14], [28, 0, -14], [36, 0, -14]],
  };
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'dinoden', name: 'The Dino Den', bounds: { min: [-56, -46], max: [56, 46] }, outdoor: true,
    boxes, coop,
    spawns: [[0, 0, 40], [0, 0, -40], [-50, 0, 0], [50, 0, 0], [0, 12, 22], [-46, 10, -36], [30, 8, 6], [-20, 0, 30]],
    waypoints: [[0, 0, -12], [-30, 0, 8], [30, 0, 8], [0, 0, 38], [-24, 0, -40], [24, 0, -36], [-44, 0, 14], [44, 0, 20], [20, 0, 20], [-20, 0, 6], [0, 12, 22], [0, 0, -38]],
    pickups: [
      { pos: [-20, 0, -6], kind: 0 }, { pos: [20, 0, 10], kind: 0 }, { pos: [0, 0, -30], kind: 0 },
      { pos: [-46, 10, -36], kind: 1 }, { pos: [30, 8, 6], kind: 1 }, { pos: [0, 12, 22], kind: 2 }, { pos: [36, 0, -36], kind: 3 },
    ],
    jumpPads: [
      { x: 0, y: 0, z: 9, r: 1.1, launch: 30 },
      { x: 30, y: 0, z: 12, r: 1.1, launch: 22 },
    ],
    vehicles: [
      { kind: 1, pos: [-14, 0, -40], yaw: 0 },
      { kind: 1, pos: [40, 0, -26], yaw: Math.PI / 2 },
      { kind: 2, pos: [-44, 0, 28], yaw: Math.PI },
    ],
    collectibles: [
      { id: 'den-crater', pos: [0, 12, 22], kind: T },
      { id: 'den-skull', pos: [44.5, 6, 6], kind: P },
      { id: 'den-spine', pos: [24, 8, 6], kind: C },
      { id: 'den-frond', pos: [-22, 14.6, 18], kind: T },
      { id: 'den-arch', pos: [-30, 10, 0], kind: C },
      { id: 'den-tower', pos: [-49, 10, -39], kind: P },
      { id: 'den-nest', pos: [19, 1.4, -3], kind: T },
      { id: 'den-log', pos: [-21, 1.6, -32], kind: P },
    ],
  };
}
