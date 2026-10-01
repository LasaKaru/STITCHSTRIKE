import { describe, expect, it } from 'vitest';
import { Streaks } from './streaks.ts';

describe('streaks', () => {
  it('PvP: quick unravels make a multi, a long life makes a streak', () => {
    const s = new Streaks(false);
    expect(s.kill(0)).toBeNull();
    expect(s.kill(2)).toBe('DOUBLE UNRAVEL!');
    expect(s.kill(3)).toBe('TRIPLE UNRAVEL!');
    expect(s.kill(20)).toBeNull();
    expect(s.kill(40)).toBe('ON A ROLL!');
    expect(s.life).toBe(5);
  });

  it('past the top tier every extra kill still shouts', () => {
    const s = new Streaks(false);
    for (let i = 0; i < 5; i++) s.kill(i * 0.5);
    expect(s.kill(3)).toBe('YARNAGEDDON!');
  });

  it('co-op needs bigger crowds and longer lives', () => {
    const s = new Streaks(true);
    expect(s.kill(0)).toBeNull();
    expect(s.kill(0.5)).toBeNull();
    expect(s.kill(1)).toBe('TRIPLE UNRAVEL!');
    for (let i = 0; i < 21; i++) s.kill(10 + i * 5);
    expect(s.kill(200)).toBe('ON A ROLL!');
  });

  it('being unravelled ends the streak but keeps the best', () => {
    const s = new Streaks(false);
    for (let i = 0; i < 4; i++) s.kill(i * 10);
    expect(s.died()).toBe(4);
    expect(s.life).toBe(0);
    expect(s.kill(100)).toBeNull();
    expect(s.best).toBe(4);
  });
});
