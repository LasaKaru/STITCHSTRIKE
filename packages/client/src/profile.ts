import type { Look } from '@stitchstrike/shared';

/**
 * The player's toy-box profile: level, credits, collectibles found, medals,
 * cosmetic unlocks and the look they wear. Everything is earned by playing
 * (zero pay-to-win); it lives in local storage (and in the desktop app's own
 * storage), so it survives between matches.
 */

export interface Stats {
  matches: number;
  wins: number;
  waves: number;
  kills: number;
  revives: number;
  bossKills: number;
  bestEndless: number;
}

export interface Profile {
  xp: number;
  credits: number;
  collected: string[];
  medals: string[];
  unlocked: string[];
  look: Look;
  stats: Stats;
  /** Today's daily challenges (see dailies.ts). */
  daily?: { day: string; ids: string[]; progress: number[]; done: boolean[] };
}

const KEY = 'ss-profile';

export const DEFAULT_LOOK: Look = { head: 0, hat: 0, beard: 0, glasses: 0, pattern: 0, skin: 0, jacket: 0, pants: 0, packaging: 0, charm: 0, wrap: 0 };

function fresh(): Profile {
  return {
    xp: 0, credits: 0, collected: [], medals: [], unlocked: [], look: { ...DEFAULT_LOOK },
    stats: { matches: 0, wins: 0, waves: 0, kills: 0, revives: 0, bossKills: 0, bestEndless: 0 },
  };
}

export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    if (!raw) return fresh();
    const f = fresh();
    return { ...f, ...raw, look: { ...f.look, ...raw.look }, stats: { ...f.stats, ...raw.stats } };
  } catch {
    return fresh();
  }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

/** XP needed to go from level n to n + 1 (gentle curve). */
export function xpForLevel(level: number): number {
  return 400 + level * 150;
}

export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = xp;
  while (left >= xpForLevel(level)) { left -= xpForLevel(level); level++; }
  return { level, into: left, need: xpForLevel(level) };
}
