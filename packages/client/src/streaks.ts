/**
 * Kill streaks and multi-unravels, announced with a banner. PvP counts toys,
 * co-op counts invaders (which come in crowds, so the bar is higher).
 */

const MULTI_PVP: [number, string][] = [[2, 'DOUBLE UNRAVEL!'], [3, 'TRIPLE UNRAVEL!'], [4, 'QUADRUPLE UNRAVEL!'], [5, 'YARNAGEDDON!']];
const MULTI_COOP: [number, string][] = [[3, 'TRIPLE UNRAVEL!'], [5, 'PENTA-PURL!'], [8, 'YARNAGEDDON!']];
const LIFE_PVP: [number, string][] = [[5, 'ON A ROLL!'], [10, 'UNSTOPPABLE STITCHER!'], [15, 'LEGENDARY KNITTER!']];
const LIFE_COOP: [number, string][] = [[25, 'ON A ROLL!'], [50, 'UNSTOPPABLE STITCHER!'], [100, 'LEGENDARY KNITTER!']];

export class Streaks {
  /** Unravels this life. */
  life = 0;
  /** Unravels in the current flurry. */
  multi = 0;
  best = 0;
  private last = -Infinity;
  private readonly window: number;
  private readonly multiNames: [number, string][];
  private readonly lifeNames: [number, string][];

  constructor(coop: boolean) {
    this.window = coop ? 1.6 : 4;
    this.multiNames = coop ? MULTI_COOP : MULTI_PVP;
    this.lifeNames = coop ? LIFE_COOP : LIFE_PVP;
  }

  /** Records an unravel at time t (seconds); returns a callout to show, if this one earns one. */
  kill(t: number): string | null {
    this.multi = t - this.last <= this.window ? this.multi + 1 : 1;
    this.last = t;
    this.life += 1;
    this.best = Math.max(this.best, this.life);
    // A multi-unravel beats a life streak; past the top tier every extra kill still shouts.
    const top = this.multiNames[this.multiNames.length - 1];
    const multi = this.multiNames.find(([n]) => n === this.multi)?.[1] ?? (this.multi > top[0] ? top[1] : null);
    if (multi) return multi;
    return this.lifeNames.find(([n]) => n === this.life)?.[1] ?? null;
  }

  /** You were unravelled: the life streak ends. Returns the streak you lost (for "streak ended" notes). */
  died(): number {
    const lost = this.life;
    this.life = 0;
    this.multi = 0;
    this.last = -Infinity;
    return lost;
  }
}
