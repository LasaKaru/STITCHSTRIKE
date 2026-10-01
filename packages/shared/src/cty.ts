import type { GameEvent } from './protocol.ts';
import type { Vec3 } from './world.ts';

/**
 * Capture the Yarn: each team has a giant ball of yarn at its base. Run over
 * the other team's ball to pick it up, carry it home and touch your own base
 * while your own ball is safely there to score. A carrier who is unravelled
 * drops the ball; a teammate touching a dropped ball sends it straight home,
 * and it rolls home by itself after a while anyway. First to three wins.
 */

export const CTY = {
  /** Touch distance for picking up, returning and capturing. */
  radius: 2.4,
  /** Captures to win a round. */
  target: 3,
  /** Seconds a dropped ball waits before rolling home. */
  returnSeconds: 20,
  /** How high above the carrier's feet the ball rides. */
  carryHeight: 2.6,
} as const;

export const YarnState = { Home: 0, Carried: 1, Dropped: 2 } as const;

export interface YarnBall {
  state: number;
  /** Player id carrying it (0 when not carried). */
  carrier: number;
  x: number; y: number; z: number;
  /** Seconds until a dropped ball rolls home. */
  timer: number;
}

export interface CtyState { balls: [YarnBall, YarnBall]; scores: [number, number] }

export interface CtyToy { id: number; team: number; alive: boolean; x: number; y: number; z: number }

/** The two Heartspool spots farthest apart become the team bases. */
export function ctyBases(spots: Vec3[]): [Vec3, Vec3] {
  let best: [Vec3, Vec3] = [spots[0], spots[spots.length - 1]];
  let bestD = -1;
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
    const d = Math.hypot(spots[i][0] - spots[j][0], spots[i][2] - spots[j][2]);
    if (d > bestD) { bestD = d; best = [spots[i], spots[j]]; }
  }
  return best;
}

export class CtyDirector {
  balls: [YarnBall, YarnBall];
  scores: [number, number] = [0, 0];

  constructor(readonly bases: [Vec3, Vec3]) {
    this.balls = [this.home(0), this.home(1)];
  }

  private home(team: number): YarnBall {
    const b = this.bases[team];
    return { state: YarnState.Home, carrier: 0, x: b[0], y: b[1], z: b[2], timer: 0 };
  }

  /** Which team's ball this toy is carrying, or -1. */
  carrying(id: number): number {
    return this.balls.findIndex((b) => b.state === YarnState.Carried && b.carrier === id);
  }

  /** Advances the round. Returns the winning team when a round ends, else -1. */
  update(dt: number, toys: CtyToy[], emit: (e: GameEvent) => void): number {
    const byId = new Map(toys.map((t) => [t.id, t]));
    // Carried balls ride with their carrier; a carrier who's gone or unravelled drops it.
    this.balls.forEach((b, team) => {
      if (b.state === YarnState.Carried) {
        const c = byId.get(b.carrier);
        if (!c || !c.alive) {
          emit({ type: 'yarn', team, act: 'drop', id: b.carrier });
          b.state = YarnState.Dropped;
          b.carrier = 0;
          b.y = Math.max(0, b.y - CTY.carryHeight);
          b.timer = CTY.returnSeconds;
        } else {
          b.x = c.x; b.y = c.y + CTY.carryHeight; b.z = c.z;
        }
      } else if (b.state === YarnState.Dropped) {
        b.timer -= dt;
        if (b.timer <= 0) {
          this.balls[team] = this.home(team);
          emit({ type: 'yarn', team, act: 'return', id: 0 });
        }
      }
    });

    for (const t of toys) {
      if (!t.alive || t.team > 1) continue;
      const own = this.balls[t.team];
      const theirs = this.balls[1 - t.team];
      const touching = (b: YarnBall) => Math.hypot(b.x - t.x, b.z - t.z) < CTY.radius && t.y > b.y - 3 && t.y < b.y + 3;
      // Your own dropped ball: touch it to send it home.
      if (own.state === YarnState.Dropped && touching(own)) {
        this.balls[t.team] = this.home(t.team);
        emit({ type: 'yarn', team: t.team, act: 'return', id: t.id });
      }
      // Their ball, at home or dropped: grab it.
      if (theirs.state !== YarnState.Carried && touching(theirs)) {
        theirs.state = YarnState.Carried;
        theirs.carrier = t.id;
        theirs.timer = 0;
        emit({ type: 'yarn', team: 1 - t.team, act: 'take', id: t.id });
      }
      // Carrying theirs home to your base while yours is safe: capture!
      const base = this.bases[t.team];
      if (theirs.state === YarnState.Carried && theirs.carrier === t.id && this.balls[t.team].state === YarnState.Home
        && Math.hypot(base[0] - t.x, base[2] - t.z) < CTY.radius && Math.abs(t.y - base[1]) < 3) {
        this.scores[t.team] += 1;
        this.balls[1 - t.team] = this.home(1 - t.team);
        emit({ type: 'yarn', team: 1 - t.team, act: 'capture', id: t.id });
        if (this.scores[t.team] >= CTY.target) {
          emit({ type: 'ctyWin', team: t.team });
          this.reset();
          return t.team;
        }
      }
    }
    return -1;
  }

  reset(): void {
    this.balls = [this.home(0), this.home(1)];
    this.scores = [0, 0];
  }

  state(): CtyState {
    return { balls: [{ ...this.balls[0] }, { ...this.balls[1] }], scores: [this.scores[0], this.scores[1]] };
  }
}
