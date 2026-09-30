import { Action, Buttons, DECK, WEAPON_COUNT } from '@stitchstrike/shared';

/**
 * Gamepad play (standard mapping; Xbox names):
 *   left stick move · right stick look · RT fire · A jump · B crouch · X reload
 *   Y hold to re-stitch · LB/RB weapons · L3 sprint · R3 camera
 *   D-pad up build deck · D-pad left/right pick a card · LT build/upgrade
 *   D-pad down recycle · Start ready up · View scoreboard
 */

export interface PadFrame {
  connected: boolean;
  /** Any input this frame (to decide who is playing). */
  active: boolean;
  buttons: number;
  /** Radians to add this frame. */
  dYaw: number;
  dPitch: number;
  weaponDelta: number;
  action: number;
  toggleDeck: boolean;
  cardDelta: number;
  thirdPerson: boolean;
  scoreboard: boolean;
}

const DEAD = 0.18;
const shape = (v: number) => {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  return Math.sign(v) * ((a - DEAD) / (1 - DEAD)) ** 1.6;
};

export class PadReader {
  private prev: boolean[] = [];

  constructor(readonly index: number) {}

  /** Reads the pad; `lookScale` is the settings sensitivity relative to the default. */
  poll(dt: number, lookScale: number, invertY: boolean): PadFrame {
    const pad = navigator.getGamepads?.()[this.index] ?? null;
    const f: PadFrame = { connected: !!pad, active: false, buttons: 0, dYaw: 0, dPitch: 0, weaponDelta: 0, action: 0, toggleDeck: false, cardDelta: 0, thirdPerson: false, scoreboard: false };
    if (!pad) return f;
    const down = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
    const edge = (i: number) => down(i) && !this.prev[i];
    const lx = shape(pad.axes[0] ?? 0), ly = shape(pad.axes[1] ?? 0);
    const rx = shape(pad.axes[2] ?? 0), ry = shape(pad.axes[3] ?? 0);
    if (ly < -0.3) f.buttons |= Buttons.Forward;
    if (ly > 0.3) f.buttons |= Buttons.Back;
    if (lx < -0.3) f.buttons |= Buttons.Left;
    if (lx > 0.3) f.buttons |= Buttons.Right;
    if (down(0)) f.buttons |= Buttons.Jump;
    if (down(1)) f.buttons |= Buttons.Crouch;
    if (down(2)) f.buttons |= Buttons.Reload;
    if (down(3)) f.buttons |= Buttons.Use;
    if (down(7)) f.buttons |= Buttons.Fire;
    if (down(10)) f.buttons |= Buttons.Sprint;
    const speed = 3.4 * lookScale;
    f.dYaw = -rx * speed * dt;
    f.dPitch = -ry * speed * 0.75 * dt * (invertY ? -1 : 1);
    if (edge(4)) f.weaponDelta = -1;
    if (edge(5)) f.weaponDelta = 1;
    if (edge(12)) f.toggleDeck = true;
    if (edge(14)) f.cardDelta = -1;
    if (edge(15)) f.cardDelta = 1;
    if (edge(13)) f.action = Action.Sell;
    if (edge(9)) f.action = Action.Ready;
    if (edge(11)) f.thirdPerson = true;
    f.scoreboard = down(8);
    f.active = f.buttons !== 0 || rx !== 0 || ry !== 0 || pad.buttons.some((b) => b.pressed);
    this.ltEdge = edge(6);
    this.prev = pad.buttons.map((_, i) => down(i));
    return f;
  }

  /** LT was pressed this poll (build or upgrade the selected card). */
  ltEdge = false;
}

export function cycleWeapon(current: number, delta: number): number {
  return (current + delta + WEAPON_COUNT) % WEAPON_COUNT;
}

export function cycleCard(current: number, delta: number): number {
  const i = DECK.indexOf(current as never);
  return DECK[(Math.max(0, i) + delta + DECK.length) % DECK.length];
}
