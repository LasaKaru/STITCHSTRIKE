import type { Look } from './protocol.ts';

/**
 * The cosmetics catalogue: every option for every Look slot, and how it is
 * unlocked. Everything is earned by playing (levels, medals, credits found
 * and earned in matches); nothing affects combat. Zero pay-to-win.
 */

export type Unlock =
  | { kind: 'free' }
  | { kind: 'level'; level: number }
  | { kind: 'credits'; price: number }
  | { kind: 'medal'; medal: string }
  /** Weapon parts found as secrets around the maps. */
  | { kind: 'parts'; parts: number };

export interface CosmeticItem { name: string; unlock: Unlock; color?: number }

const free: Unlock = { kind: 'free' };
const lvl = (level: number): Unlock => ({ kind: 'level', level });
const cr = (price: number): Unlock => ({ kind: 'credits', price });
const medal = (m: string): Unlock => ({ kind: 'medal', medal: m });
const parts = (n: number): Unlock => ({ kind: 'parts', parts: n });

export const COSMETICS: Record<keyof Look, CosmeticItem[]> = {
  head: [
    { name: 'Felt hair', unlock: free }, { name: 'Bobble beanie', unlock: lvl(2) }, { name: 'Army helmet', unlock: lvl(5) }, { name: 'Bald and proud', unlock: lvl(3) },
  ],
  hat: [
    { name: 'Charcoal', unlock: free, color: 0x3a3a40 }, { name: 'Cream', unlock: free, color: 0xefe3c8 }, { name: 'Chestnut', unlock: free, color: 0x6a3a22 },
    { name: 'Pillar-box red', unlock: lvl(4), color: 0xd8262e }, { name: 'Moss', unlock: lvl(6), color: 0x5a8a3a }, { name: 'Midnight', unlock: lvl(8), color: 0x1e2a4a },
    { name: 'Candyfloss', unlock: cr(400), color: 0xf2a8c8 }, { name: 'Gold thread', unlock: medal('collector'), color: 0xffc94a },
  ],
  beard: [{ name: 'Clean shaven', unlock: free }, { name: 'Mustache', unlock: free }, { name: 'Full beard', unlock: lvl(3) }],
  glasses: [{ name: 'None', unlock: free }, { name: 'Specs', unlock: lvl(2) }],
  pattern: [
    { name: 'Stocking stitch', unlock: free }, { name: 'Rib', unlock: lvl(2) }, { name: 'Garter', unlock: lvl(4) },
    { name: 'Crochet', unlock: lvl(7) }, { name: 'Felted', unlock: cr(600) },
  ],
  skin: [
    { name: 'Peach', unlock: free, color: 0xd9b89a }, { name: 'Caramel', unlock: free, color: 0xc79a78 }, { name: 'Cocoa', unlock: free, color: 0x9a6b4c },
    { name: 'Porcelain', unlock: free, color: 0xe6ccb0 }, { name: 'Walnut', unlock: free, color: 0x7a5038 },
  ],
  jacket: [
    { name: 'Team yarn', unlock: free },
    { name: 'Tangerine', unlock: free, color: 0xe8742a }, { name: 'Lime', unlock: free, color: 0x8bcb3a }, { name: 'Denim', unlock: free, color: 0x3a5da8 },
    { name: 'Tomato', unlock: free, color: 0xd8262e }, { name: 'Sunflower', unlock: lvl(3), color: 0xffc94a }, { name: 'Sky', unlock: lvl(4), color: 0x6fd6ff },
    { name: 'Lavender', unlock: lvl(5), color: 0xb46fd6 }, { name: 'Oatmeal', unlock: lvl(6), color: 0xefe3c8 }, { name: 'Bubblegum', unlock: cr(300), color: 0xff7ab8 },
    { name: 'Forest', unlock: cr(500), color: 0x2e6a3a }, { name: "Baron's velvet", unlock: medal('unpicked'), color: 0x6a2a4a }, { name: 'Veteran olive', unlock: medal('survivor'), color: 0x6a6a3a },
  ],
  pants: [
    { name: 'Navy', unlock: free, color: 0x3b5a8a }, { name: 'Slate', unlock: free, color: 0x5a5f6a }, { name: 'Brown cord', unlock: free, color: 0x6a4a2e },
    { name: 'Black', unlock: free, color: 0x24242a }, { name: 'Khaki', unlock: lvl(2), color: 0x9a8a5a }, { name: 'Red tartan', unlock: lvl(3), color: 0x9a2a2a },
    { name: 'Teal', unlock: lvl(4), color: 0x2a7a7a }, { name: 'Plum', unlock: lvl(5), color: 0x5a2a5a },
  ],
  packaging: [
    { name: 'Classic blister card', unlock: free }, { name: 'Saturday Special', unlock: lvl(3) }, { name: 'Deluxe window box', unlock: lvl(6) },
    { name: "Collector's tin", unlock: lvl(10) }, { name: 'Boss-buster edition', unlock: medal('unpicked') }, { name: 'Gold foil limited run', unlock: cr(1000) },
  ],
  // Weapon parts: purely cosmetic attachments on every weapon you carry.
  charm: [
    { name: 'No charm', unlock: free }, { name: 'Pom-pom', unlock: parts(1), color: 0xe8742a }, { name: 'Brass bell', unlock: parts(2), color: 0xd9b24a },
    { name: 'Coat button', unlock: lvl(2), color: 0x6a3a22 }, { name: 'Felt star', unlock: parts(3), color: 0xffc94a }, { name: 'Tiny heart', unlock: parts(4), color: 0xd8262e },
    { name: 'Mini thimble', unlock: parts(6), color: 0xc9ccd2 }, { name: 'Golden spool', unlock: parts(8), color: 0xffd24a },
    { name: "Baron's monocle", unlock: medal('unpicked'), color: 0xd9b24a },
  ],
  wrap: [
    { name: 'Bare grip', unlock: free }, { name: 'Tangerine wrap', unlock: free, color: 0xe8742a }, { name: 'Denim wrap', unlock: free, color: 0x3a5da8 },
    { name: 'Candy stripe', unlock: parts(1), color: 0xff7ab8 }, { name: 'Moss wrap', unlock: parts(2), color: 0x5a8a3a }, { name: 'Midnight wrap', unlock: parts(3), color: 0x1e2a4a },
    { name: 'Sunflower wrap', unlock: lvl(4), color: 0xffc94a }, { name: 'Gold thread wrap', unlock: parts(5), color: 0xd9b24a }, { name: 'Veteran olive wrap', unlock: medal('survivor'), color: 0x6a6a3a },
  ],
};

export const LOOK_SLOTS = Object.keys(COSMETICS) as (keyof Look)[];

/** A random look within the catalogue (bots wear these). */
export function randomLook(rand: () => number = Math.random): Look {
  const look = {} as Look;
  for (const k of LOOK_SLOTS) look[k] = Math.floor(rand() * COSMETICS[k].length);
  return look;
}

// ---------------------------------------------------------------- medals

export interface MedalDef { id: string; name: string; blurb: string }
export const MEDALS: MedalDef[] = [
  { id: 'first', name: 'First Stitch', blurb: 'Unravel your first invader' },
  { id: 'soldier', name: 'Toy Soldier', blurb: 'Unravel 250 invaders' },
  { id: 'seamstress', name: 'Seamstress', blurb: 'Re-stitch 10 teammates' },
  { id: 'unpicked', name: 'Unpicked', blurb: 'Take down The Unraveller' },
  { id: 'survivor', name: 'Moth-proof', blurb: 'Win a mission on Moth-eaten or harder' },
  { id: 'endless', name: 'Endless Yarn', blurb: 'Reach wave 15 in Endless' },
  { id: 'collector', name: 'Collector', blurb: 'Find every secret on one map' },
  { id: 'veteran', name: 'Veteran', blurb: 'Play 10 matches' },
  { id: 'builder', name: 'Master Builder', blurb: 'Win a mission' },
  { id: 'duelist', name: 'Duelist', blurb: 'Knock out 25 toys in PvP' },
];
