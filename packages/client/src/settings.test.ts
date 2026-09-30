import { describe, expect, it } from 'vitest';
import { BIND_ACTIONS, DEFAULT_KEYS, DEFAULTS, keyLabel, palette, rebind } from './settings.ts';

describe('settings', () => {
  it('rebinding a key another action uses swaps them, so nothing is left unbound', () => {
    const s = { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
    rebind(s, 'jump', 'KeyE');
    expect(s.keys.jump).toBe('KeyE');
    expect(s.keys.use).toBe('Space');
    const codes = Object.values(s.keys);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Object.keys(s.keys).sort()).toEqual(Object.keys(BIND_ACTIONS).sort());
  });

  it('labels keys for people', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Left Shift');
    expect(keyLabel('ControlRight')).toBe('Right Ctrl');
    expect(keyLabel('ArrowUp')).toBe('Up');
  });

  it('colour-blind palettes keep the two teams and good/bad apart', () => {
    for (const mode of ['off', 'deuteranopia', 'protanopia', 'tritanopia'] as const) {
      const p = palette(mode);
      expect(p.team[0]).not.toBe(p.team[1]);
      expect(p.good).not.toBe(p.bad);
      expect(p.healthLow).not.toBe(p.healthHigh);
    }
    // Red-green modes never pair red with green.
    const d = palette('deuteranopia');
    expect([d.good, d.bad]).not.toContain(0xd8262e);
    expect([d.good, d.bad]).not.toContain(0x8bcb3a);
  });
});
