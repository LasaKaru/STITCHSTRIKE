import { describe, expect, it } from 'vitest';
import { GRAPPLE, PLAYER } from './constants.ts';
import { Buttons, clonePlayerState, createPlayerState, stepPlayer, type InputCmd } from './movement.ts';
import { box, createBedroom, type Box, type World } from './world.ts';

function cmd(seq: number, buttons: number, yaw = 0, pitch = 0): InputCmd {
  return { seq, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), renderTick: 0, weapon: 0, action: 0 };
}

/** The bedroom's floor and walls plus the given boxes. */
function course(...extra: Box[]): World {
  const w = createBedroom();
  return { ...w, jumpPads: [], boxes: [...w.boxes.filter((b) => b.kind === 'floor' || b.kind === 'wall'), ...extra] };
}

/** Walk forward (-Z) and jump once at the start. */
function jumpAt(world: World, start: [number, number, number], steps = 90) {
  const s = createPlayerState(start);
  let mantles = 0;
  for (let i = 1; i <= steps; i++) {
    const r = stepPlayer(s, cmd(i, Buttons.Forward | (i === 3 ? Buttons.Jump : 0)), world);
    if (r.mantled) mantles++;
  }
  return { s, mantles };
}

describe('ledge mantle', () => {
  it('pulls a toy up onto a ledge above its jump height', () => {
    // 3 units high: a plain jump (2.2) cannot step onto it, a mantle at the apex can.
    const world = course(box(-3, 0, -10, 3, 3, -6, 'furniture', 0x888888));
    const { s, mantles } = jumpAt(world, [0, 0, -4]);
    expect(mantles).toBeGreaterThan(0);
    expect(s.y).toBeCloseTo(3, 3);
    expect(s.z).toBeLessThan(-6);
  });

  it('cannot reach ledges beyond jump height + mantle reach', () => {
    const high = PLAYER.jumpHeight + PLAYER.mantleReach + 0.4;
    const world = course(box(-3, 0, -10, 3, high, -6, 'furniture', 0x888888));
    const { s, mantles } = jumpAt(world, [0, 0, -4]);
    expect(mantles).toBe(0);
    expect(s.y).toBeLessThan(0.01);
  });

  it('needs headroom on top of the ledge', () => {
    const world = course(
      box(-3, 0, -10, 3, 3, -6, 'furniture', 0x888888),
      // A shelf just above the ledge leaves no room to stand.
      box(-3, 3.6, -10, 3, 4, -6, 'furniture', 0x888888),
    );
    const { mantles } = jumpAt(world, [0, 0, -4]);
    expect(mantles).toBe(0);
  });
});

describe('yarn swing', () => {
  // A beam high overhead, ahead of the player.
  const beam = () => course(box(-4, 16, -14, 4, 17, -10, 'furniture', 0x886644));
  const up = Math.atan2(16 - PLAYER.eyeHeight, 12);

  it('attaches to a surface above and lifts the toy off the floor', () => {
    const world = beam();
    const s = createPlayerState([0, 0, 0]);
    const first = stepPlayer(s, cmd(1, Buttons.Grapple, 0, up), world);
    expect(first.hook).toBe(1);
    expect(s.hooked).toBe(true);
    expect(s.hy).toBeCloseTo(16, 3);
    let top = 0;
    for (let i = 2; i <= 240; i++) {
      stepPlayer(s, cmd(i, Buttons.Grapple, 0, up), world);
      top = Math.max(top, s.y);
      // The strand snatches in its slack within a second and a half, then stays taut.
      const d = Math.hypot(s.x - s.hx, s.y + 0.9 - s.hy, s.z - s.hz);
      if (i > 90) expect(d).toBeLessThan(s.rope + 1);
    }
    expect(top).toBeGreaterThan(3);
    expect(s.rope).toBeLessThan(20);
  });

  it('lets go when released, then cools down', () => {
    const world = beam();
    const s = createPlayerState([0, 0, 0]);
    for (let i = 1; i <= 30; i++) stepPlayer(s, cmd(i, Buttons.Grapple, 0, up), world);
    expect(s.hooked).toBe(true);
    stepPlayer(s, cmd(31, 0, 0, up), world);
    expect(s.hooked).toBe(false);
    expect(s.hookCd).toBeGreaterThan(0);
    // Pressing again during the cooldown does nothing.
    expect(stepPlayer(s, cmd(32, Buttons.Grapple, 0, up), world).hook).toBe(0);
    expect(s.hooked).toBe(false);
  });

  it('jumping off the rope releases it with a boost', () => {
    const world = beam();
    const s = createPlayerState([0, 0, 0]);
    for (let i = 1; i <= 60; i++) stepPlayer(s, cmd(i, Buttons.Grapple, 0, up), world);
    const vy = s.vy;
    stepPlayer(s, cmd(61, Buttons.Grapple | Buttons.Jump, 0, up), world);
    expect(s.hooked).toBe(false);
    expect(s.vy).toBeGreaterThan(vy);
  });

  it('misses when aimed at the floor or level at a wall', () => {
    const world = beam();
    const down = createPlayerState([0, 0, 0]);
    expect(stepPlayer(down, cmd(1, Buttons.Grapple, 0, -0.6), world).hook).toBe(-1);
    expect(down.hooked).toBe(false);
    const far = createPlayerState([0, 0, 0]);
    expect(stepPlayer(far, cmd(1, Buttons.Grapple, Math.PI, 0), world).hook).toBe(-1);
    expect(far.hookCd).toBeCloseTo(GRAPPLE.missCooldown, 5);
  });

  it('downed toys cannot swing', () => {
    const world = beam();
    const s = createPlayerState([0, 0, 0]);
    s.downed = true;
    expect(stepPlayer(s, cmd(1, Buttons.Grapple, 0, up), world).hook).toBe(0);
    expect(s.hooked).toBe(false);
  });

  it('is deterministic for prediction replay', () => {
    const world = beam();
    const a = createPlayerState([0, 0, 0]);
    const cmds = Array.from({ length: 180 }, (_, i) => cmd(i + 1, Buttons.Grapple | (i % 40 < 20 ? Buttons.Forward : Buttons.Left), 0.01 * i, up));
    for (const c of cmds.slice(0, 90)) stepPlayer(a, c, world);
    const b = clonePlayerState(a);
    for (const c of cmds.slice(90)) { stepPlayer(a, c, world); stepPlayer(b, c, world); }
    expect(b).toEqual(a);
  });
});
