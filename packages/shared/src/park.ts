import { box, CollectibleKind, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "The City Park": a knitted city park in autumn, walled with four gates where
 * the invaders march in. A pond crossed by a humped footbridge, a bandstand
 * (its roof is the best perch, reached by a spring), two grassy hills, big
 * pom-pom trees you can climb into, benches, lamp posts and a hot-dog cart,
 * all under a knitted skyline and a parade balloon.
 */
export function createPark(): World {
  const s = (b: Box, shape: string, climb = false): Box => ({ ...b, shape, climb });
  const boxes: Box[] = [
    box(-62, -1, -52, 62, 0, 52, 'floor', 0x7a8a3a),
    // Low stone walls with a gate in the middle of each side.
    s(box(-62, 0, -52, -6, 7, -48, 'wall', 0x9a8a78), 'parkWall'),
    s(box(6, 0, -52, 62, 7, -48, 'wall', 0x9a8a78), 'parkWall'),
    s(box(-62, 0, 48, -6, 7, 52, 'wall', 0x9a8a78), 'parkWall'),
    s(box(6, 0, 48, 62, 7, 52, 'wall', 0x9a8a78), 'parkWall'),
    s(box(-62, 0, -48, -58, 7, -6, 'wall', 0x9a8a78), 'parkWall'),
    s(box(-62, 0, 6, -58, 7, 48, 'wall', 0x9a8a78), 'parkWall'),
    s(box(58, 0, -48, 62, 7, -6, 'wall', 0x9a8a78), 'parkWall'),
    s(box(58, 0, 6, 62, 7, 48, 'wall', 0x9a8a78), 'parkWall'),

    // The humped footbridge over the pond: steps up, a deck, steps down.
    s(box(-4, 0, -4, 4, 1.2, -2, 'furniture', 0x8a5a3a), 'bridgeStep'),
    s(box(-4, 0, -2, 4, 2.4, 0, 'furniture', 0x8a5a3a), 'bridgeStep'),
    s(box(-4, 0, 0, 4, 3.6, 16, 'furniture', 0x8a5a3a), 'bridgeDeck'),
    s(box(-4, 0, 16, 4, 2.4, 18, 'furniture', 0x8a5a3a), 'bridgeStep'),
    s(box(-4, 0, 18, 4, 1.2, 20, 'furniture', 0x8a5a3a), 'bridgeStep'),
    s(box(-4.4, 3.6, 0, -3.8, 5.2, 16, 'furniture', 0xefe3c8), 'bridgeRail'),
    s(box(3.8, 3.6, 0, 4.4, 5.2, 16, 'furniture', 0xefe3c8), 'bridgeRail'),

    // The bandstand: a raised floor with steps, four posts and a roof to stand on.
    s(box(-9, 0, -34, 9, 2.5, -22, 'furniture', 0xefe3c8), 'bandstandFloor'),
    s(box(-4, 0, -22, 4, 1.25, -20, 'furniture', 0xefe3c8), 'bandstandStep'),
    s(box(-8.5, 2.5, -33.5, -7.5, 13, -32.5, 'prop', 0xefe3c8), 'bandstandPost', true),
    s(box(7.5, 2.5, -33.5, 8.5, 13, -32.5, 'prop', 0xefe3c8), 'bandstandPost', true),
    s(box(-8.5, 2.5, -23.5, -7.5, 13, -22.5, 'prop', 0xefe3c8), 'bandstandPost', true),
    s(box(7.5, 2.5, -23.5, 8.5, 13, -22.5, 'prop', 0xefe3c8), 'bandstandPost', true),
    s(box(-10, 13, -35, 10, 14, -21, 'furniture', 0xb5452a), 'bandstandRoof'),

    // Two grassy hills, two tiers each.
    s(box(-48, 0, -36, -28, 3, -16, 'furniture', 0x8a9a42), 'hill'),
    s(box(-44, 3, -32, -32, 6, -20, 'furniture', 0x8a9a42), 'hill'),
    s(box(28, 0, 20, 48, 3, 40, 'furniture', 0x8a9a42), 'hill'),
    s(box(32, 3, 24, 44, 6, 36, 'furniture', 0x8a9a42), 'hill'),

    // Big pom-pom trees: knitted trunks you can climb, a canopy you can stand in.
    ...[[-24, -8], [22, -14], [-40, 28], [42, -30], [-14, 34], [18, 36]].flatMap(([x, z]) => [
      s(box(x - 1.5, 0, z - 1.5, x + 1.5, 16, z + 1.5, 'prop', 0x6a4a2e), 'parkTrunk', true),
      s(box(x - 5, 16, z - 5, x + 5, 16.6, z + 5, 'furniture', 0xd9772e), 'canopy'),
    ]),

    // Benches, lamp posts, a hot-dog cart, a boulder.
    s(box(-22, 0, 14, -14, 2.6, 16.5, 'furniture', 0x8a5a3a), 'parkBench'),
    s(box(14, 0, 14, 22, 2.6, 16.5, 'furniture', 0x8a5a3a), 'parkBench'),
    s(box(-30, 0, -4, -22, 2.6, -1.5, 'furniture', 0x8a5a3a), 'parkBench'),
    s(box(24, 0, 0, 32, 2.6, 2.5, 'furniture', 0x8a5a3a), 'parkBench'),
    ...[[-12, -12], [12, -12], [-26, 24], [26, 24], [-46, 6], [46, 8]].map(([x, z]) => s(box(x - 0.4, 0, z - 0.4, x + 0.4, 10, z + 0.4, 'prop', 0x2a2a30), 'lampPost')),
    s(box(30, 0, -38, 37, 6, -33, 'furniture', 0xd8262e), 'hotdogCart'),
    s(box(-50, 0, 34, -44, 5, 40, 'prop', 0x9a968e), 'boulder', true),
  ];

  const cores: Vec3[] = [[0, 0, -12], [-30, 0, 12], [30, 0, 12]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // The four park gates.
    enemySpawns: [[0, 0, 45], [0, 0, -45], [-55, 0, 0], [55, 0, 0]],
    playerSpawns: [[-5, 0, -16], [5, 0, -16], [-34, 0, 8], [-26, 0, 8], [26, 0, 8], [34, 0, 8]],
  };
  const T = CollectibleKind.Thimble, P = CollectibleKind.Part, C = CollectibleKind.Credits;
  return {
    id: 'park', name: 'The City Park', bounds: { min: [-57, -47], max: [57, 47] }, outdoor: true,
    boxes, coop,
    spawns: [[0, 0, 40], [0, 0, -40], [-50, 0, 0], [50, 0, 0], [0, 3.6, 8], [-38, 6, -26], [38, 6, 30], [0, 14, -28]],
    waypoints: [[0, 0, 24], [0, 0, -16], [-30, 0, 0], [30, 0, 0], [-24, 0, 30], [24, 0, -30], [-40, 0, -40], [40, 0, 40], [0, 3.6, 8], [-48, 0, 20], [48, 0, -16]],
    pickups: [
      { pos: [-20, 0, 6], kind: 0 }, { pos: [20, 0, 6], kind: 0 }, { pos: [0, 0, 30], kind: 0 },
      { pos: [0, 3.6, 8], kind: 1 }, { pos: [-38, 6, -26], kind: 1 }, { pos: [0, 14, -28], kind: 2 }, { pos: [0, 0, -38], kind: 3 },
    ],
    jumpPads: [
      { x: -13, y: 0, z: -27, r: 1.1, launch: 30 },
      { x: 26, y: 0, z: 16, r: 1.1, launch: 24 },
    ],
    collectibles: [
      { id: 'park-bandstand', pos: [0, 14, -28], kind: T },
      { id: 'park-bridge', pos: [0, 3.6, 8], kind: C },
      { id: 'park-canopy', pos: [-24, 16.6, -8], kind: T },
      { id: 'park-hill', pos: [38, 6, 30], kind: P },
      { id: 'park-pond', pos: [12, 0, 8], kind: C },
      { id: 'park-cart', pos: [33.5, 6, -35.5], kind: P },
      { id: 'park-boulder', pos: [-47, 5, 37], kind: T },
      { id: 'park-gate', pos: [0, 7, 50], kind: P },
    ],
  };
}
