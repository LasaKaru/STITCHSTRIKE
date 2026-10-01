import { describe, expect, it } from 'vitest';
import { CHALLENGES, dailies, dayKey, pickDailies, trackDaily } from './dailies.ts';
import type { Profile } from './profile.ts';

const fresh = (): Profile => ({
  xp: 0, credits: 0, collected: [], medals: [], unlocked: [],
  look: { head: 0, hat: 0, beard: 0, glasses: 0, pattern: 0, skin: 0, jacket: 0, pants: 0, packaging: 0, charm: 0, wrap: 0 },
  stats: { matches: 0, wins: 0, waves: 0, kills: 0, revives: 0, bossKills: 0, bestEndless: 0 },
});

describe('daily challenges', () => {
  it('three different challenges a day, the same for everyone that day', () => {
    const a = pickDailies('2026-10-01');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(pickDailies('2026-10-01')).toEqual(a);
    // Across a month, most of the pool comes up.
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) for (const c of pickDailies(`2026-11-${String(d).padStart(2, '0')}`)) seen.add(c.id);
    expect(seen.size).toBeGreaterThan(CHALLENGES.length * 0.6);
  });

  it('progress counts up, completes once, and resets on a new day', () => {
    const p = fresh();
    const today = new Date(2026, 9, 1, 12);
    const { defs } = dailies(p, today);
    const c = defs[0];
    const step = Math.max(1, Math.floor(c.target / 2));
    expect(trackDaily(p, c.event, step, today)).toEqual(c.target <= step ? [c] : []);
    const done = trackDaily(p, c.event, c.target, today);
    expect(done.map((d) => d.id).includes(c.id) || c.target <= step).toBe(true);
    expect(trackDaily(p, c.event, c.target, today).some((d) => d.id === c.id)).toBe(false);
    const tomorrow = new Date(2026, 9, 2, 9);
    const next = dailies(p, tomorrow);
    expect(next.state.day).toBe(dayKey(tomorrow));
    expect(next.state.progress).toEqual([0, 0, 0]);
  });

  it('events that are not on today\'s list do nothing', () => {
    const p = fresh();
    const today = new Date(2026, 9, 1, 12);
    const { defs, state } = dailies(p, today);
    const other = CHALLENGES.find((c) => !defs.some((d) => d.event === c.event))!;
    expect(trackDaily(p, other.event, 999, today)).toEqual([]);
    expect(state.progress).toEqual([0, 0, 0]);
  });
});
