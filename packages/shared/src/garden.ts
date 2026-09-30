import { box, ringPads, type Box, type CoopLayout, type Vec3, type World } from './world.ts';

/**
 * "Back Garden": a big outdoor map at toy scale (1 u = 10 cm). A house with a
 * deck along the back, a shed you can walk into, a treehouse reached by a
 * crate climb, three big trees, sandbox, paddling pool, garden table, hedges
 * and a fence all round. Ground is flat; height comes from the props.
 */

const s = (b: Box, shape: string): Box => ({ ...b, shape });

export function createGarden(): World {
  const boxes: Box[] = [
    box(-52, -1, -50, 52, 0, 52, 'floor', 0x5a8a3a),
    // House facade along the back, fence on the other three sides.
    s(box(-52, 0, -48, 52, 40, -40, 'wall', 0xe9e4da), 'house'),
    s(box(-47, 0, -40, -45, 9, 47, 'wall', 0x9a7050), 'fence'),
    s(box(45, 0, -40, 47, 9, 47, 'wall', 0x9a7050), 'fence'),
    s(box(-47, 0, 45, 47, 9, 47, 'wall', 0x9a7050), 'fence'),
    // Wooden deck with two steps and a bench.
    s(box(-32, 0, -40, -4, 3, -31, 'furniture', 0x9a7a5a), 'deck'),
    s(box(-22, 0, -31, -14, 2, -29, 'furniture', 0x9a7a5a), 'deckStep'),
    s(box(-22, 0, -29, -14, 1, -27, 'furniture', 0x9a7a5a), 'deckStep'),
    s(box(-30, 3, -39.5, -22, 5, -37.5, 'furniture', 0x6a8a5a), 'bench'),
    // Garden table with a parasol pole, and two chairs.
    s(box(8, 6, -20, 18, 6.6, -10, 'furniture', 0xefe3c8), 'tableTop'),
    s(box(12.6, 0, -15.4, 13.4, 6, -14.6, 'furniture', 0x3b3f4a), 'tablePole'),
    s(box(4.5, 0, -17, 7.5, 3, -13, 'furniture', 0x2f7fe0), 'gardenChair'),
    s(box(18.5, 0, -17, 21.5, 3, -13, 'furniture', 0x2f7fe0), 'gardenChair'),
    // Shed: walls with a doorway, a roof you can stand on, a workbench inside.
    s(box(24, 0, -38, 40, 18, -37.4, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(24, 0, -38, 24.6, 18, -22, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(39.4, 0, -38, 40, 18, -22, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(24, 0, -22.6, 29, 18, -22, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(35, 0, -22.6, 40, 18, -22, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(29, 12, -22.6, 35, 18, -22, 'wall', 0x8a5a3a), 'shedWall'),
    s(box(23, 18, -39, 41, 19, -21, 'furniture', 0x6a3a2a), 'shedRoof'),
    s(box(26, 0, -37.2, 38, 6, -34, 'furniture', 0xa88858), 'workbench'),
    // Three big trees; the first holds a treehouse reached by a crate climb.
    s(box(-34.5, 0, 2.5, -29.5, 34, 7.5, 'prop', 0x6a4a2a), 'treeTrunk'),
    s(box(-41, 12, -3, -23, 12.8, 12, 'furniture', 0x9a7a5a), 'treehouse'),
    s(box(34.5, 0, 19.5, 39.5, 30, 24.5, 'prop', 0x6a4a2a), 'treeTrunk'),
    s(box(-8.5, 0, 29.5, -3.5, 28, 34.5, 'prop', 0x6a4a2a), 'treeTrunk'),
    // Sandbox and paddling pool (low walls you can hop over).
    s(box(0, 0, 10, 16, 1.5, 10.8, 'prop', 0xc89a58), 'sandbox'),
    s(box(0, 0, 23.2, 16, 1.5, 24, 'prop', 0xc89a58), 'sandbox'),
    s(box(0, 0, 10, 0.8, 1.5, 24, 'prop', 0xc89a58), 'sandbox'),
    s(box(15.2, 0, 10, 16, 1.5, 24, 'prop', 0xc89a58), 'sandbox'),
    s(box(-26, 0, 20, -12, 2, 20.8, 'prop', 0x2f7fe0), 'pool'),
    s(box(-26, 0, 31.2, -12, 2, 32, 'prop', 0x2f7fe0), 'pool'),
    s(box(-26, 0, 20, -25.2, 2, 32, 'prop', 0x2f7fe0), 'pool'),
    s(box(-12.8, 0, 20, -12, 2, 32, 'prop', 0x2f7fe0), 'pool'),
    // Hedges along the front with a gap in the middle (where the invaders squeeze through).
    s(box(-44, 0, 39, -8, 7, 44, 'prop', 0x3e6a34), 'hedge'),
    s(box(8, 0, 39, 44, 7, 44, 'prop', 0x3e6a34), 'hedge'),
    // Garden clutter.
    s(box(22, 0, 6, 30, 4, 10, 'prop', 0xd8262e), 'wheelbarrow'),
    s(box(39, 0, -4, 43, 5, 2, 'prop', 0xc8683a), 'pots'),
    s(box(-40, 0, -30, -36, 3, -26, 'prop', 0x7a7a74), 'rock'),
    s(box(10, 0, 31, 14, 2, 35, 'prop', 0x8a8a84), 'rock'),
    s(box(24, 0, 33, 34, 3, 36, 'prop', 0x6a4a2a), 'log'),
    s(box(-6, 0, -8, -4.5, 3.5, -6.5, 'prop', 0xd8262e), 'gnome'),
    s(box(20.2, 0, 25.2, 21.8, 6, 26.8, 'prop', 0xbab4a8), 'birdbath'),
    s(box(-38, 0, 28, -35, 3, 31, 'prop', 0x2f7fe0), 'bucket'),
    s(box(-41, 0, 36, -40.4, 14, 36.6, 'prop', 0xefe3c8), 'clothesPost'),
    s(box(-15, 0, 36, -14.4, 14, 36.6, 'prop', 0xefe3c8), 'clothesPost'),
  ];
  // Crate climb up to the treehouse: 2 u rises so single jumps chain.
  for (let i = 0; i < 5; i++) {
    const x0 = -22 - i * 3;
    boxes.push(s(box(x0 - 3, 0, 12.5, x0, 2 * (i + 1), 16, 'prop', 0xb88a58), 'crate'));
  }

  const cores: Vec3[] = [[-18, 0, -22], [4, 0, 2], [28, 0, -12]];
  const coop: CoopLayout = {
    cores,
    pads: ringPads(boxes, cores, 5, 3.6),
    // Burrows: the hedge gap, along both fences, and out of the shed.
    enemySpawns: [[0, 0, 41], [42, 0, 12], [-42, 0, -16], [32, 0, -30]],
    playerSpawns: [[-14, 0, -18], [-22, 0, -18], [0, 0, -4], [8, 0, 4], [24, 0, -6], [34, 0, -8]],
  };
  const spawns: Vec3[] = [[-38, 0, -20], [38, 0, -12], [0, 0, 36], [-20, 0, 12], [20, 0, 14], [0, 0, -14], [-18, 3, -36], [32, 0, -28]];
  const waypoints: Vec3[] = [
    [0, 0, 0], [-20, 0, -20], [20, 0, -20], [30, 0, -28], [-36, 0, 20], [36, 0, 8], [0, 0, 30],
    [-18, 0, 10], [18, 0, 20], [-40, 0, -8], [8, 0, -26], [-10, 0, 16],
  ];
  return {
    id: 'garden', name: 'Back Garden', bounds: { min: [-44, -39], max: [44, 44] }, outdoor: true,
    boxes, spawns, waypoints, coop,
    pickups: [
      { pos: [-20, 0, 2], kind: 0 }, { pos: [18, 0, -4], kind: 0 }, { pos: [-2, 0, 30], kind: 0 }, { pos: [36, 0, 26], kind: 0 },
      // Climb rewards: armour on the deck and in the shed, power up in the treehouse.
      { pos: [-24, 3, -36], kind: 1 }, { pos: [36, 0, -34], kind: 1 }, { pos: [-36, 12.8, 6], kind: 2 },
    ],
    jumpPads: [],
  };
}
