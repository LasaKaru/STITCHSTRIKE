import type { GameEvent } from './protocol.ts';
import type { Vec3 } from './world.ts';

/**
 * King of the Spool: two teams fight over a Golden Spool that sits on one
 * of the map's Heartspool spots and hops to the next one every minute.
 * A team scores while it has toys on the spool and the other team doesn't;
 * first to the target wins the round.
 */

export const KOTH = {
  /** Toys within this horizontal radius (and height band) are on the spool. */
  radius: 4.5,
  height: 3,
  /** Seconds before the spool hops to the next spot. */
  moveSeconds: 60,
  /** Points to win a round (one point per second held). */
  target: 100,
  rate: 1,
} as const;

export interface KothState {
  /** Index into the map's hill spots. */
  hill: number;
  /** Team holding the spool: -1 nobody, 0/1 a team, 2 contested. */
  holder: number;
  scores: [number, number];
  /** Seconds until the spool hops. */
  timer: number;
}

export interface KothToy { team: number; x: number; y: number; z: number }

export class KothDirector {
  hill = 0;
  holder = -1;
  scores: [number, number] = [0, 0];
  timer: number = KOTH.moveSeconds;

  constructor(readonly hills: Vec3[]) {}

  /** Advances the round. Returns the winning team when a round ends, else -1. */
  update(dt: number, toys: KothToy[], emit: (e: GameEvent) => void): number {
    const h = this.hills[this.hill];
    const on = [false, false];
    for (const t of toys) {
      if (t.team > 1 || Math.hypot(t.x - h[0], t.z - h[2]) > KOTH.radius || t.y < h[1] - 0.5 || t.y > h[1] + KOTH.height) continue;
      on[t.team] = true;
    }
    this.holder = on[0] && on[1] ? 2 : on[0] ? 0 : on[1] ? 1 : -1;
    if (this.holder === 0 || this.holder === 1) {
      this.scores[this.holder] = Math.min(KOTH.target, this.scores[this.holder] + KOTH.rate * dt);
      if (this.scores[this.holder] >= KOTH.target) {
        const winner = this.holder;
        emit({ type: 'kothWin', team: winner });
        this.reset();
        emit({ type: 'hillMove', hill: this.hill });
        return winner;
      }
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.hill = (this.hill + 1) % this.hills.length;
      this.timer = KOTH.moveSeconds;
      emit({ type: 'hillMove', hill: this.hill });
    }
    return -1;
  }

  reset(): void {
    this.hill = 0;
    this.holder = -1;
    this.scores = [0, 0];
    this.timer = KOTH.moveSeconds;
  }

  state(): KothState {
    return { hill: this.hill, holder: this.holder, scores: [this.scores[0], this.scores[1]], timer: Math.max(0, this.timer) };
  }
}
