import { describe, expect, it } from 'vitest';
import { COSMETICS, LOOK_SLOTS, randomLook } from '@stitchstrike/shared';
import { levelOf, type Profile } from './profile.ts';
import { award, buy, isUnlocked, partsFound, wearable } from './progression.ts';

function fresh(): Profile {
  return {
    xp: 0, credits: 0, collected: [], medals: [], unlocked: [], look: randomLook(() => 0),
    stats: { matches: 0, wins: 0, waves: 0, kills: 0, revives: 0, bossKills: 0, bestEndless: 0 },
  };
}

describe('progression (zero pay-to-win)', () => {
  it('levels up from XP and reports newly unlocked cosmetics', () => {
    const p = fresh();
    expect(levelOf(0).level).toBe(1);
    const a = award(p, 600, 0);
    expect(a.levelUp).toBe(2);
    expect(a.unlocks).toContain('Bobble beanie');
  });

  it('weapon charms and wraps unlock from weapon parts found around the maps', () => {
    const p = fresh();
    const heart = COSMETICS.charm.find((c) => c.name === 'Tiny heart')!;
    expect(isUnlocked(p, heart)).toBe(false);
    // Thimbles and credits secrets don't count; parts do.
    p.collected = ['toy-top-left', 'toy-trolley', 'toy-mid-shelf', 'bath-tp'];
    expect(partsFound(p)).toBe(3);
    expect(isUnlocked(p, heart)).toBe(false);
    p.collected.push('bath-behind-toilet');
    expect(isUnlocked(p, heart)).toBe(true);
    p.look.charm = COSMETICS.charm.indexOf(COSMETICS.charm.find((c) => c.name === 'Golden spool')!);
    expect(wearable(p, p.look).charm).toBe(0);
  });

  it('medals come from milestones and unlock their cosmetics', () => {
    const p = fresh();
    const a = award(p, 500, 200, { bossKills: 1, kills: 1 });
    expect(a.medals.map((m) => m.id)).toEqual(expect.arrayContaining(['first', 'unpicked']));
    const velvet = COSMETICS.jacket.find((c) => c.name === "Baron's velvet")!;
    expect(isUnlocked(p, velvet)).toBe(true);
  });

  it('credits buy credit-priced cosmetics only when affordable', () => {
    const p = fresh();
    const item = COSMETICS.jacket.find((c) => c.unlock.kind === 'credits')!;
    expect(buy(p, item)).toBe(false);
    p.credits = 10000;
    expect(buy(p, item)).toBe(true);
    expect(isUnlocked(p, item)).toBe(true);
    expect(p.credits).toBeLessThan(10000);
  });

  it('a look falls back to unlocked options', () => {
    const p = fresh();
    const look = randomLook(() => 0.999);
    const w = wearable(p, look);
    for (const s of LOOK_SLOTS) expect(isUnlocked(p, COSMETICS[s][w[s]])).toBe(true);
  });
});
