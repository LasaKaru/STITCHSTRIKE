import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './constants.ts';
import { RoomHost } from './host.ts';
import { KOTH, KothDirector } from './koth.ts';
import { decodeSnapshot, encodeSnapshot, type GameEvent } from './protocol.ts';
import { Room } from './room.ts';
import type { Vec3 } from './world.ts';
import { createWorld } from './world.ts';

const hills: Vec3[] = [[0, 0, 0], [20, 0, 0], [0, 0, 20]];

describe('King of the Spool', () => {
  it('a team scores while it alone stands on the spool', () => {
    const k = new KothDirector(hills);
    const events: GameEvent[] = [];
    for (let i = 0; i < 10; i++) k.update(0.5, [{ team: 0, x: 1, y: 0, z: 1 }, { team: 1, x: 12, y: 0, z: 0 }], (e) => events.push(e));
    expect(k.holder).toBe(0);
    expect(k.scores[0]).toBeCloseTo(5 * KOTH.rate, 5);
    expect(k.scores[1]).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('nobody scores while the spool is contested', () => {
    const k = new KothDirector(hills);
    for (let i = 0; i < 10; i++) k.update(0.5, [{ team: 0, x: 1, y: 0, z: 1 }, { team: 1, x: -2, y: 0, z: 0 }], () => {});
    expect(k.holder).toBe(2);
    expect(k.scores).toEqual([0, 0]);
  });

  it('toys high above the spool are not on it', () => {
    const k = new KothDirector(hills);
    k.update(1, [{ team: 1, x: 0, y: KOTH.height + 2, z: 0 }], () => {});
    expect(k.holder).toBe(-1);
  });

  it('the spool hops to the next spot on a timer', () => {
    const k = new KothDirector(hills);
    const events: GameEvent[] = [];
    for (let t = 0; t <= KOTH.moveSeconds; t += 1) k.update(1, [], (e) => events.push(e));
    expect(k.hill).toBe(1);
    expect(events).toContainEqual({ type: 'hillMove', hill: 1 });
  });

  it('first to the target wins the round, which resets', () => {
    const k = new KothDirector(hills);
    const events: GameEvent[] = [];
    let winner = -1;
    k.scores[1] = KOTH.target - 0.5;
    winner = k.update(1, [{ team: 1, x: 0, y: 0, z: 0 }], (e) => events.push(e));
    expect(winner).toBe(1);
    expect(events[0]).toEqual({ type: 'kothWin', team: 1 });
    expect(k.scores).toEqual([0, 0]);
  });

  it('rooms run it in teams without friendly fire, and snapshots carry it', () => {
    const room = new Room(createWorld('garage'), 'koth');
    const a = room.addPlayer('A')!;
    const b = room.addPlayer('B')!;
    expect(a.team).not.toBe(b.team);
    const h = room.world.coop.cores[0];
    a.state.x = h[0]; a.state.y = h[1]; a.state.z = h[2];
    b.state.x = h[0] + 30; b.state.z = h[2] + 30;
    for (let i = 0; i < TICK_RATE * 2; i++) room.update();
    const shared = room.sharedSnapshot();
    expect(shared.koth!.holder).toBe(a.team);
    const snap = decodeSnapshot(encodeSnapshot(room.snapshotFor(a.id, shared)))!;
    expect(snap.koth!.holder).toBe(a.team);
    expect(snap.koth!.scores[a.team]).toBeGreaterThan(1.5);
  });

  it('bots go and fight over the spool', () => {
    const host = new RoomHost({ code: 'KOTH', fillTo: 6, mode: 'koth', map: 'bedroom' });
    const koth = host.room.koth!;
    let held = 0;
    for (let t = 0; t < TICK_RATE * 90; t++) {
      host.step();
      if (koth.holder === 0 || koth.holder === 1) held++;
    }
    expect(held).toBeGreaterThan(TICK_RATE * 5);
    expect(koth.scores[0] + koth.scores[1]).toBeGreaterThan(5);
  }, 60000);
});
