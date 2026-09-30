import { COSMETICS, type Look } from '@stitchstrike/shared';
import type { StitchPattern } from '../wool/stitches.ts';
import type { HumanoidOptions } from './humanoid.ts';

/**
 * Turns a cosmetic Look into sculpting options for a hero figure. Each
 * distinct look knits (and caches) its own figure template.
 */

const HEADWEAR = ['hair', 'beanie', 'helmet', 'none'] as const;
const BEARDS = ['none', 'mustache', 'full'] as const;
const PATTERNS: StitchPattern[] = ['stocking', 'rib', 'garter', 'crochet', 'felt'];

const pick = <T>(list: T[], i: number): T => list[Math.max(0, Math.min(list.length - 1, i))];

/** The jacket colour a look wears (index 0 = the player's team/roster yarn). */
export function jacketColor(look: Look | undefined, teamColor: number): number {
  if (!look || look.jacket === 0) return teamColor;
  return pick(COSMETICS.jacket, look.jacket).color ?? teamColor;
}

export function lookOptions(look: Look, teamColor: number, quality: 'game' | 'hero' = 'game'): HumanoidOptions {
  const jacket = jacketColor(look, teamColor);
  const hat = pick(COSMETICS.hat, look.hat).color ?? 0x3a3a40;
  const trim = ((jacket >> 16 & 255) * 0.72) << 16 | ((jacket >> 8 & 255) * 0.72) << 8 | ((jacket & 255) * 0.72);
  const key = [look.head, look.hat, look.beard, look.glasses, look.pattern, look.skin, jacket.toString(16), look.pants].join('-');
  return {
    name: `look-${key}-${quality}`,
    headwear: pick([...HEADWEAR], look.head),
    beard: pick([...BEARDS], look.beard),
    glasses: look.glasses === 1,
    gloves: true,
    merged: quality === 'game',
    cell: quality === 'hero' ? 0.0085 : 0.012,
    colors: {
      skin: pick(COSMETICS.skin, look.skin).color ?? 0xd9b89a,
      jacket,
      trim: trim >>> 0,
      pants: pick(COSMETICS.pants, look.pants).color ?? 0x3b5a8a,
      boots: 0x5a3a26,
      gloves: 0x3b3f4a,
      hat,
      hair: hat,
      beard: 0x8a8a90,
      mustache: 0x4a3024,
    },
    patterns: { jacket: pick(PATTERNS, look.pattern) },
  };
}
