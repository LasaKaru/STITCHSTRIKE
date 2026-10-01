import { describe, expect, it } from 'vitest';
import { assistAim } from './aimAssist.ts';

const eye: [number, number, number] = [0, 1.2, 0];

describe('gamepad aim assist', () => {
  it('slows the look over a target, and pulls only while you look', () => {
    // Straight ahead (-Z) at 10 m, a hair to the left.
    const target = { x: -0.4, y: 1.2, z: -10 };
    const still = assistAim(eye, 0, 0, 0, 0, [target]);
    expect(still).toEqual({ dYaw: 0, dPitch: 0 });
    const turning = assistAim(eye, 0, 0, -0.02, 0, [target]);
    // Turning right (negative yaw) away from it: slowed down.
    expect(Math.abs(turning.dYaw)).toBeLessThan(0.02);
    // Turning towards it (positive yaw is left): helped along.
    const toward = assistAim(eye, 0, 0, 0.01, 0, [target]);
    expect(toward.dYaw).toBeGreaterThan(0.01 * 0.55);
  });

  it('ignores targets outside the cone, behind you or too far away', () => {
    const d = { dYaw: 0.02, dPitch: 0.01 };
    expect(assistAim(eye, 0, 0, d.dYaw, d.dPitch, [{ x: 6, y: 1.2, z: -10 }])).toEqual(d);
    expect(assistAim(eye, 0, 0, d.dYaw, d.dPitch, [{ x: 0, y: 1.2, z: 10 }])).toEqual(d);
    expect(assistAim(eye, 0, 0, d.dYaw, d.dPitch, [{ x: 0, y: 1.2, z: -80 }])).toEqual(d);
  });

  it('strength 0 turns it off', () => {
    expect(assistAim(eye, 0, 0, 0.02, 0, [{ x: 0, y: 1.2, z: -10 }], 0)).toEqual({ dYaw: 0.02, dPitch: 0 });
  });
});
