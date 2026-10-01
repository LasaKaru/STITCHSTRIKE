import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './constants.ts';
import { CTY, CtyDirector, ctyBases, YarnState, type CtyToy } from './cty.ts';
import { RoomHost } from './host.ts';
import { createPlayerState } from './movement.ts';
import { decodeSnapshot, encodeSnapshot, type GameEvent } from './protocol.ts';
import { Room } from './room.ts';
import { createWorld, type Vec3 } from './world.ts';

const BASES: [Vec3, Vec3] = [[-30, 0, 0], [30, 0, 0]];

function step(d: CtyDirector, toys: CtyToy[], seconds = 1 / 30): { events: GameEvent[]; winner: number } {
  const events: GameEvent[] = [];
  let winner = -1;
  for (let t = 0; t < seconds * 30; t++) winner = Math.max(winner, d.update(1 / 30, toys, (e) => events.push(e)));
  return { events, winner };
}

const toy = (id: number, team: number, x: number, z: number, alive = true): CtyToy => ({ id, team, alive, x, y: 0, z });

describe('Capture the Yarn', () => {
  it('bases are the two Heartspool spots farthest apart', () => {
    expect(ctyBases([[0, 0, 0], [-30, 0, -18], [30, 0, -18]])).toEqual([[-30, 0, -18], [30, 0, -18]]);
  });

  it('grab their ball, carry it home and capture', () => {
    const d = new CtyDirector(BASES);
    const runner = toy(1, 0, 30, 0);
    let r = step(d, [runner]);
    expect(r.events).toContainEqual({ type: 'yarn', team: 1, act: 'take', id: 1 });
    expect(d.balls[1].state).toBe(YarnState.Carried);
    // It rides above the carrier.
    runner.x = 0;
    step(d, [runner]);
    expect(d.balls[1].x).toBe(0);
    expect(d.balls[1].y).toBe(CTY.carryHeight);
    runner.x = -30;
    r = step(d, [runner]);
    expect(r.events).toContainEqual({ type: 'yarn', team: 1, act: 'capture', id: 1 });
    expect(d.scores).toEqual([1, 0]);
    expect(d.balls[1].state).toBe(YarnState.Home);
    expect(d.balls[1].x).toBe(30);
  });

  it('you can only score while your own ball is home', () => {
    const d = new CtyDirector(BASES);
    const a = toy(1, 0, 30, 0), b = toy(2, 1, -30, 0);
    step(d, [a, b]);
    expect(d.balls[0].state).toBe(YarnState.Carried);
    expect(d.balls[1].state).toBe(YarnState.Carried);
    a.x = -30; b.x = 30;
    step(d, [a, b]);
    expect(d.scores).toEqual([0, 0]);
  });

  it('an unravelled carrier drops it; a teammate sends it home, or it rolls home by itself', () => {
    const d = new CtyDirector(BASES);
    const thief = toy(1, 0, 30, 0);
    step(d, [thief]);
    thief.x = 10;
    step(d, [thief]);
    thief.alive = false;
    let r = step(d, [thief]);
    expect(r.events.some((e) => e.type === 'yarn' && e.act === 'drop')).toBe(true);
    expect(d.balls[1].state).toBe(YarnState.Dropped);
    expect(d.balls[1].y).toBe(0);
    // A defender touches it: straight home.
    const defender = toy(2, 1, 10, 0.5);
    r = step(d, [thief, defender]);
    expect(r.events).toContainEqual({ type: 'yarn', team: 1, act: 'return', id: 2 });
    expect(d.balls[1].state).toBe(YarnState.Home);
    // Dropped again with nobody about: it rolls home after the timer.
    thief.alive = true; thief.x = 30;
    step(d, [thief]);
    thief.alive = false;
    step(d, [thief]);
    r = step(d, [thief], CTY.returnSeconds + 0.5);
    expect(r.events.some((e) => e.type === 'yarn' && e.act === 'return')).toBe(true);
    expect(d.balls[1].state).toBe(YarnState.Home);
  });

  it('first to three wins and the round resets', () => {
    const d = new CtyDirector(BASES);
    const a = toy(1, 0, 30, 0);
    let winner = -1;
    let wins: GameEvent[] = [];
    for (let k = 0; k < CTY.target; k++) {
      a.x = 30; step(d, [a]);
      a.x = -30;
      const r = step(d, [a]);
      winner = r.winner;
      wins = r.events.filter((e) => e.type === 'ctyWin');
    }
    expect(winner).toBe(0);
    expect(wins).toEqual([{ type: 'ctyWin', team: 0 }]);
    expect(d.scores).toEqual([0, 0]);
  });

  it('runs in a room: teams, a capture, and the state in snapshots', () => {
    const room = new Room(createWorld('dinoden'), 'cty');
    const a = room.addPlayer('Cotton')!;
    const b = room.addPlayer('Wool')!;
    expect(a.team).not.toBe(b.team);
    const theirs = room.cty!.bases[1 - a.team];
    a.state = createPlayerState(theirs);
    room.update();
    expect(room.cty!.carrying(a.id)).toBe(1 - a.team);
    const snap = decodeSnapshot(encodeSnapshot(room.snapshotFor(a.id, room.sharedSnapshot())))!;
    expect(snap.cty!.balls[1 - a.team].state).toBe(YarnState.Carried);
    expect(snap.cty!.balls[1 - a.team].carrier).toBe(a.id);
    a.state = createPlayerState(room.cty!.bases[a.team]);
    room.update();
    expect(room.drainEvents().some((e) => e.type === 'yarn' && e.act === 'capture')).toBe(true);
    expect(room.cty!.scores[a.team]).toBe(1);
  });

  it('bots go for the yarn', () => {
    // The bedroom is small enough that 3v3 bots reliably get to the yarn (on big maps they can brawl midfield for minutes).
    const host = new RoomHost({ code: 'CTY', fillTo: 6, mode: 'cty', map: 'bedroom' });
    let took = false;
    for (let i = 0; i < TICK_RATE * 180 && !took; i++) {
      host.step();
      took = host.room.cty!.balls.some((b) => b.state !== YarnState.Home);
    }
    expect(took).toBe(true);
  }, 60000);
});
