import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './constants.ts';
import { Phase, ShotKind } from './coop.ts';
import { ENEMIES, EnemyType, type Enemy } from './enemies.ts';
import { Buttons, clonePlayerState, createPlayerState, fitsAt, stepPlayer, type InputCmd } from './movement.ts';
import { decodeSnapshot, encodeSnapshot } from './protocol.ts';
import { Room } from './room.ts';
import { VehicleKind, VEHICLES } from './vehicles.ts';
import { createBedroom, createWorld, MAPS, type World } from './world.ts';

function cmd(seq: number, buttons: number, yaw = 0, pitch = 0): InputCmd {
  return { seq, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), renderTick: 0, weapon: 0, action: 0 };
}

/** Floor and walls only, with a jeep and a tank parked in the open. */
function lot(): World {
  const w = createBedroom();
  return { ...w, jumpPads: [], boxes: w.boxes.filter((b) => b.kind === 'floor' || b.kind === 'wall'), vehicles: [{ kind: VehicleKind.Jeep, pos: [0, 0, 8], yaw: 0 }, { kind: VehicleKind.Tank, pos: [-10, 0, 0], yaw: 0 }] };
}

function enemy(id: number, type: number, x: number, z: number, hp = ENEMIES[type].hp): Enemy {
  return { id, type, x, y: 0, z, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp, core: 0, node: -1, cooldown: 99, kx: 0, kz: 0, slow: 0, special: 0 };
}

/** Run room ticks with one command per tick-pair for player id. */
function drive(room: Room, id: number, seq: { n: number }, buttons: number, ticks: number, yaw = 0): void {
  for (let t = 0; t < ticks; t++) {
    room.queueInputs(id, [cmd(++seq.n, buttons, yaw), cmd(++seq.n, buttons, yaw)]);
    room.update();
  }
}

describe('vehicles', () => {
  it('drive: throttle, steering, and top speed', () => {
    const world = lot();
    const s = createPlayerState([0, 0, 0]);
    s.car = VehicleKind.Jeep;
    s.z = 14;
    for (let i = 1; i <= 60; i++) stepPlayer(s, cmd(i, Buttons.Forward), world);
    expect(s.z).toBeLessThan(8);
    expect(Math.abs(s.carSpeed)).toBeLessThanOrEqual(VEHICLES[VehicleKind.Jeep].maxSpeed + 1e-6);
    const yaw0 = s.carYaw;
    for (let i = 61; i <= 100; i++) stepPlayer(s, cmd(i, Buttons.Forward | Buttons.Left), world);
    expect(s.carYaw).toBeGreaterThan(yaw0 + 0.5);
  });

  it('driving is deterministic for prediction replay', () => {
    const world = lot();
    const a = createPlayerState([0, 0, 0]);
    a.car = VehicleKind.Tank;
    const cmds = Array.from({ length: 200 }, (_, i) => cmd(i + 1, Buttons.Forward | (i % 50 < 25 ? Buttons.Left : Buttons.Right) | (i % 30 === 0 ? Buttons.Fire : 0), i * 0.01));
    for (const c of cmds.slice(0, 100)) stepPlayer(a, c, world);
    const b = clonePlayerState(a);
    for (const c of cmds.slice(100)) { stepPlayer(a, c, world); stepPlayer(b, c, world); }
    expect(b).toEqual(a);
  });

  it('every parked vehicle fits where it is parked', () => {
    for (const m of MAPS) {
      const w = createWorld(m.id);
      for (const v of w.vehicles ?? []) expect(fitsAt(w, v.pos[0], v.pos[1] + 0.05, v.pos[2], VEHICLES[v.kind].radius), `${m.id} vehicle at ${v.pos}`).toBe(true);
    }
  });

  it('Use climbs in and out; the vehicle stays where you parked it', () => {
    const room = new Room(lot(), 'pvp');
    const p = room.addPlayer('Driver')!;
    p.state = createPlayerState([1.5, 0, 8]);
    p.protect = 0;
    const seq = { n: 0 };
    drive(room, p.id, seq, Buttons.Use, 1);
    expect(p.state.car).toBe(VehicleKind.Jeep);
    expect(room.netVehicles()).toHaveLength(1);
    drive(room, p.id, seq, 0, 1);
    drive(room, p.id, seq, Buttons.Forward, TICK_RATE);
    const z = p.state.z;
    expect(z).toBeLessThan(4);
    drive(room, p.id, seq, Buttons.Use, 1);
    expect(p.state.car).toBe(0);
    const jeep = room.netVehicles().find((v) => v.kind === VehicleKind.Jeep)!;
    expect(jeep.z).toBeCloseTo(z, 0);
    // Stepped out beside it, not inside it.
    expect(Math.hypot(p.state.x - jeep.x, p.state.z - jeep.z)).toBeGreaterThan(1);
  });

  it('ramming flattens invaders in co-op', () => {
    const world = lot();
    const room = new Room(world, 'coop');
    room.coop!.phase = Phase.Wave;
    (room.coop as unknown as { queue: unknown[] }).queue = [{ at: 1e9, type: 0, spawn: 0 }];
    const p = room.addPlayer('Rammer')!;
    p.state = createPlayerState([1.5, 0, 8]);
    const seq = { n: 0 };
    drive(room, p.id, seq, Buttons.Use, 1);
    drive(room, p.id, seq, 0, 1);
    const target = enemy(900, EnemyType.Grunt, 0, -4);
    room.coop!.enemies.push(target);
    let rammed = false;
    for (let t = 0; t < TICK_RATE * 2 && !rammed; t++) {
      drive(room, p.id, seq, Buttons.Forward, 1);
      target.vx = target.vz = 0; target.x = 0; target.z = -4;
      rammed = target.hp < ENEMIES[EnemyType.Grunt].hp;
    }
    expect(rammed).toBe(true);
  });

  it('the wind-up tank fires yarn-ball shells where you aim', () => {
    const room = new Room(lot(), 'pvp');
    const p = room.addPlayer('Tanker')!;
    p.state = createPlayerState([-10, 0, 1.5]);
    const seq = { n: 0 };
    drive(room, p.id, seq, Buttons.Use, 1);
    expect(p.state.car).toBe(VehicleKind.Tank);
    drive(room, p.id, seq, 0, 1);
    room.drainShots();
    let blast = false;
    for (let t = 0; t < TICK_RATE * 3 && !blast; t++) {
      drive(room, p.id, seq, Buttons.Fire, 1, Math.PI / 2);
      blast = room.drainShots().some((s) => s.kind === ShotKind.Blast);
    }
    expect(blast).toBe(true);
  });

  it('a driver knocked out leaves the vehicle parked for someone else', () => {
    const room = new Room(lot(), 'pvp');
    const p = room.addPlayer('Unlucky')!;
    p.state = createPlayerState([1.5, 0, 8]);
    const seq = { n: 0 };
    drive(room, p.id, seq, Buttons.Use, 1);
    expect(room.netVehicles()).toHaveLength(1);
    p.protect = 0;
    (room as unknown as { damage(a: null, v: typeof p, d: number): void }).damage(null, p, 9999);
    expect(p.state.car).toBe(0);
    expect(room.netVehicles()).toHaveLength(2);
  });

  it('snapshots carry driving state, drivers and parked vehicles', () => {
    const room = new Room(lot(), 'pvp');
    const p = room.addPlayer('Snap')!;
    p.state = createPlayerState([1.5, 0, 8]);
    const seq = { n: 0 };
    drive(room, p.id, seq, Buttons.Use, 1);
    drive(room, p.id, seq, Buttons.Forward | Buttons.Left, 10);
    const snap = decodeSnapshot(encodeSnapshot(room.snapshotFor(p.id, room.sharedSnapshot())))!;
    expect(snap.self!.car).toBe(VehicleKind.Jeep);
    expect(snap.self!.carYaw).toBe(p.state.carYaw);
    expect(snap.self!.carSpeed).toBe(p.state.carSpeed);
    expect(snap.players[0].car).toBe(VehicleKind.Jeep);
    expect(snap.vehicles).toHaveLength(1);
    expect(snap.vehicles![0].kind).toBe(VehicleKind.Tank);
  });
});
