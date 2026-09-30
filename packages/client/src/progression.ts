import { COSMETICS, LOOK_SLOTS, MEDALS, type CosmeticItem, type Look, type MedalDef } from '@stitchstrike/shared';
import { levelOf, saveProfile, type Profile } from './profile.ts';

/**
 * Earning things: XP and credits for play, medals for milestones, and
 * cosmetic unlocks from levels, medals and credits. Purely cosmetic rewards;
 * every weapon and trap is available to everyone from the start.
 */

export const XP = { kill: 10, pvpKo: 50, wave: 100, revive: 40, boss: 500, win: 1000, match: 150 };

export interface Award { xp: number; credits: number; levelUp: number | null; medals: MedalDef[]; unlocks: string[] }

export function isUnlocked(p: Profile, item: CosmeticItem): boolean {
  const u = item.unlock;
  if (u.kind === 'free') return true;
  if (u.kind === 'level') return levelOf(p.xp).level >= u.level;
  if (u.kind === 'medal') return p.medals.includes(u.medal);
  return p.unlocked.includes(item.name);
}

export function unlockText(item: CosmeticItem): string {
  const u = item.unlock;
  if (u.kind === 'free') return 'Unlocked';
  if (u.kind === 'level') return `Reach level ${u.level}`;
  if (u.kind === 'credits') return `${u.price} credits`;
  return `Medal: ${MEDALS.find((m) => m.id === u.medal)?.name ?? u.medal}`;
}

/** Buys a credits-priced cosmetic; returns false if not affordable. */
export function buy(p: Profile, item: CosmeticItem): boolean {
  if (item.unlock.kind !== 'credits' || isUnlocked(p, item) || p.credits < item.unlock.price) return false;
  p.credits -= item.unlock.price;
  p.unlocked.push(item.name);
  saveProfile(p);
  return true;
}

/** Everything a profile can wear right now, as "slot:name" ids. */
function unlockedIds(p: Profile): Set<string> {
  const out = new Set<string>();
  for (const slot of LOOK_SLOTS) for (const item of COSMETICS[slot]) if (isUnlocked(p, item)) out.add(`${slot}:${item.name}`);
  return out;
}

function medalEarned(p: Profile, id: string, ctx: { mapComplete?: boolean }): boolean {
  const s = p.stats;
  switch (id) {
    case 'first': return s.kills >= 1;
    case 'soldier': return s.kills >= 250;
    case 'seamstress': return s.revives >= 10;
    case 'unpicked': return s.bossKills >= 1;
    case 'endless': return s.bestEndless >= 15;
    case 'collector': return !!ctx.mapComplete;
    case 'veteran': return s.matches >= 10;
    case 'builder': return s.wins >= 1;
    default: return false;
  }
}

/**
 * Applies a batch of progress, saves, and reports level-ups, new medals and
 * newly unlocked cosmetics for the HUD.
 */
export function award(p: Profile, xp: number, credits: number, statDelta: Partial<Profile['stats']> = {}, ctx: { mapComplete?: boolean; medals?: string[] } = {}): Award {
  const before = levelOf(p.xp).level;
  const had = unlockedIds(p);
  p.xp += xp;
  p.credits += credits;
  for (const [k, v] of Object.entries(statDelta) as [keyof Profile['stats'], number][]) {
    p.stats[k] = k === 'bestEndless' ? Math.max(p.stats[k], v) : p.stats[k] + v;
  }
  const medals: MedalDef[] = [];
  for (const m of MEDALS) {
    if (p.medals.includes(m.id)) continue;
    if (medalEarned(p, m.id, ctx) || ctx.medals?.includes(m.id)) { p.medals.push(m.id); medals.push(m); }
  }
  const after = levelOf(p.xp).level;
  const now = unlockedIds(p);
  const unlocks = [...now].filter((id) => !had.has(id)).map((id) => id.split(':')[1]);
  saveProfile(p);
  return { xp, credits, levelUp: after > before ? after : null, medals, unlocks };
}

export function wearable(p: Profile, look: Look): Look {
  // Fall back to the first option for anything no longer unlocked.
  const out = { ...look };
  for (const slot of LOOK_SLOTS) if (!COSMETICS[slot][out[slot]] || !isUnlocked(p, COSMETICS[slot][out[slot]])) out[slot] = 0;
  return out;
}
