import { describe, expect, it } from 'vitest';
import { INPUT_DT, isSnapshotTick, JUMP_VELOCITY, PLAYER, POPPER, SNAPSHOT_RATE, TICK_RATE } from './constants.ts';
import { RoomHost, type Connection } from './host.ts';
import { Buttons, clonePlayerState, createPlayerState, stepPlayer, type InputCmd } from './movement.ts';
import { decodeInputs, decodeSnapshot, encodeInputs, encodeSnapshot, MSG_SNAPSHOT, type ServerText } from './protocol.ts';
import { Room } from './room.ts';
import { createBedroom } from './world.ts';

const world = createBedroom();

function cmd(seq: number, buttons: number, yaw = 0, pitch = 0, renderTick = 0, weapon = 0, action = 0): InputCmd {
  return { seq, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), renderTick, weapon, action };
}

describe('movement', () => {
  it('falls onto the floor and stands on it', () => {
    const s = createPlayerState([0, 3, 0]);
    for (let i = 1; i <= 120; i++) stepPlayer(s, cmd(i, 0), world);
    expect(s.onGround).toBe(true);
    expect(s.y).toBeCloseTo(0, 6);
  });

  it('runs at run speed toward -Z at yaw 0', () => {
    const s = createPlayerState([10, 0, 14]);
    for (let i = 1; i <= 60; i++) stepPlayer(s, cmd(i, Buttons.Forward), world);
    expect(s.vz).toBeCloseTo(-PLAYER.runSpeed, 1);
    expect(s.z).toBeLessThan(14 - 3.5);
  });

  it('cannot walk through the outer wall', () => {
    const s = createPlayerState([0, 0, 14]);
    for (let i = 1; i <= 300; i++) stepPlayer(s, cmd(i, Buttons.Back), world);
    expect(s.z).toBeCloseTo(17.5 - PLAYER.radius, 6);
  });

  it('jumps about jumpHeight and double-jumps once', () => {
    const s = createPlayerState([0, 0, 14]);
    stepPlayer(s, cmd(1, 0), world);
    let peak = 0;
    for (let i = 2; i < 80; i++) {
      stepPlayer(s, cmd(i, i === 2 ? Buttons.Jump : 0), world);
      peak = Math.max(peak, s.y);
    }
    expect(peak).toBeGreaterThan(PLAYER.jumpHeight * 0.9);
    expect(peak).toBeLessThan(PLAYER.jumpHeight * 1.05);
    expect(JUMP_VELOCITY).toBeGreaterThan(0);

    const d = createPlayerState([0, 0, 14]);
    stepPlayer(d, cmd(1, 0), world);
    let peak2 = 0;
    const presses = new Set([2, 20, 30]);
    for (let i = 2; i < 120; i++) {
      stepPlayer(d, cmd(i, presses.has(i) ? Buttons.Jump : 0), world);
      peak2 = Math.max(peak2, d.y);
    }
    expect(peak2).toBeGreaterThan(peak * 1.5);
    expect(peak2).toBeLessThan(peak * 2.2);
  });

  it('steps up small ledges but not tall ones', () => {
    const w = { ...world, boxes: [...world.boxes, { min: [9, 0, 5] as [number, number, number], max: [11, 0.3, 6] as [number, number, number], kind: 'prop' as const }] };
    const s = createPlayerState([10, 0, 8]);
    for (let i = 1; i <= 60; i++) stepPlayer(s, cmd(i, Buttons.Forward), w);
    expect(s.z).toBeLessThan(5);
    const bookStack = createPlayerState([0, 0, -6]); // orange box at z -4..-1 is 2 u tall
    for (let i = 1; i <= 60; i++) stepPlayer(bookStack, cmd(i, Buttons.Back), world);
    expect(bookStack.z).toBeCloseTo(-4 - PLAYER.radius, 6);
  });

  it('is deterministic: replaying the same inputs gives identical state', () => {
    const inputs: InputCmd[] = [];
    for (let i = 1; i <= 400; i++) {
      const b = (i % 7 < 4 ? Buttons.Forward : Buttons.Left) | (i % 45 === 0 ? Buttons.Jump : 0) | Buttons.Fire;
      inputs.push(cmd(i, b, i * 0.013, Math.sin(i * 0.05) * 0.3));
    }
    const a = createPlayerState([0, 0, 0]);
    const b = createPlayerState([0, 0, 0]);
    for (const c of inputs) stepPlayer(a, c, world);
    for (const c of inputs) stepPlayer(b, c, world);
    expect(b).toEqual(a);
  });

  it('fires at fire rate and reloads when empty', () => {
    const s = createPlayerState([0, 0, 0]);
    let shots = 0;
    for (let i = 1; i <= 60; i++) if (stepPlayer(s, cmd(i, Buttons.Fire), world).fired) shots++;
    expect(shots).toBeGreaterThanOrEqual(POPPER.fireRate - 1);
    expect(shots).toBeLessThanOrEqual(POPPER.fireRate + 1);
    for (let i = 61; i <= 400; i++) stepPlayer(s, cmd(i, Buttons.Fire), world);
    expect(s.mags[0]).toBeLessThanOrEqual(POPPER.magazine);
  });
});

describe('protocol', () => {
  it('schedules exactly SNAPSHOT_RATE snapshots per second of ticks', () => {
    let n = 0;
    for (let t = 1; t <= TICK_RATE * 10; t++) if (isSnapshotTick(t)) n++;
    expect(n).toBe(SNAPSHOT_RATE * 10);
  });

  it('round-trips inputs', () => {
    const cmds = [cmd(7, Buttons.Fire | Buttons.Jump, 1.25, -0.5, 1234.5), cmd(8, Buttons.Forward, -3, 0.1, 1235)];
    expect(decodeInputs(encodeInputs(cmds))).toEqual(cmds);
  });

  it('rejects malformed input frames', () => {
    const bad = encodeInputs([cmd(1, 0)]).slice(0, 10);
    expect(decodeInputs(bad)).toBeNull();
  });

  it('round-trips snapshots with exact self state and quantised others', () => {
    const self = createPlayerState([1.234567, 2.5, -3.75], Math.fround(0.5));
    self.vx = 0.123456789;
    Object.assign(self, { hooked: true, hx: 3.25, hy: 20.125, hz: -7.5, rope: 11.0625, hookCd: 0.1 });
    const snap = {
      tick: 999, ack: 42, respawn: 0, self,
      players: [{ id: 3, x: 1.2345, y: 2.5, z: -3.75, yaw: 1, pitch: -0.3, health: 73, armor: 40, alive: true, crouch: false, downed: true, powered: true, revive: 0.5, hook: [4, 20, -6] as [number, number, number], weapon: 1, kos: 4, deaths: 2 }],
      shots: [
        { id: 3, hit: 5, head: true, enemy: false, kind: 0, to: [4, 1.3, -2] as [number, number, number] },
        { id: 255, hit: 3, head: false, enemy: false, kind: 3, from: [1, 1, 1] as [number, number, number], to: [2, 1, 2] as [number, number, number] },
      ],
      projectiles: [{ owner: 3, weapon: 5, x: 1, y: 2, z: 3 }],
      pickups: 0b1011,
      drops: [{ kind: 0, x: 5, y: 0, z: -5 }],
      coop: null,
    };
    const out = decodeSnapshot(encodeSnapshot(snap))!;
    expect(out.tick).toBe(999);
    expect(out.ack).toBe(42);
    expect(out.self).toEqual(self);
    const p = out.players[0];
    expect(p.x).toBeCloseTo(1.2345, 2);
    expect(p.z).toBeCloseTo(-3.75, 2);
    expect(p.yaw).toBeCloseTo(1, 3);
    expect(p.pitch).toBeCloseTo(-0.3, 3);
    expect(p.health).toBe(73);
    expect(p.hook![1]).toBeCloseTo(20, 1);
    expect(out.shots[0].hit).toBe(5);
    expect(out.shots[0].head).toBe(true);
    expect(out.shots[0].to[1]).toBeCloseTo(1.3, 2);
    expect(out.shots[1].kind).toBe(3);
    expect(out.shots[1].from![0]).toBeCloseTo(1, 2);
    expect(p.armor).toBe(40);
    expect(p.downed).toBe(true);
    expect(p.powered).toBe(true);
    expect(p.revive).toBeCloseTo(0.5, 2);
    expect(out.projectiles[0].z).toBeCloseTo(3, 2);
    expect(out.pickups).toBe(0b1011);
    expect(out.drops[0].x).toBeCloseTo(5, 2);
  });
});

describe('room', () => {
  function faceEachOther(room: Room) {
    const a = room.addPlayer('A')!;
    const b = room.addPlayer('B')!;
    a.state = createPlayerState([10, 0, 10]);
    b.state = createPlayerState([10, 0, 4]);
    a.state.onGround = b.state.onGround = true;
    a.protect = b.protect = 0; // skip spawn protection
    return { a, b };
  }

  it('spawn protection, then Stitch-up regeneration after a quiet spell', () => {
    const room = new Room(world);
    const { a, b } = faceEachOther(room);
    b.protect = PLAYER.spawnProtection;
    room.update();
    room.queueInputs(a.id, [cmd(1, Buttons.Fire, 0, 0, room.tick)]);
    room.update();
    expect(b.health).toBe(PLAYER.maxHealth);
    b.protect = 0;
    a.state.cooldown = 0;
    room.queueInputs(a.id, [cmd(2, 0), cmd(3, Buttons.Fire, 0, 0, room.tick)]);
    room.update();
    const hurt = b.health;
    expect(hurt).toBeLessThan(PLAYER.maxHealth);
    for (let t = 0; t < TICK_RATE * (PLAYER.regenDelay - 1); t++) room.update();
    expect(b.health).toBe(hurt);
    for (let t = 0; t < TICK_RATE * 3; t++) room.update();
    expect(b.health).toBe(PLAYER.maxHealth);
  });

  it('hitscan damages and knocks out the target, then respawns it', () => {
    const room = new Room(world);
    const { a, b } = faceEachOther(room);
    room.update();
    let seq = 0;
    for (let t = 0; t < 60 && b.alive; t++) {
      room.queueInputs(a.id, [cmd(++seq, Buttons.Fire, 0, 0, room.tick), cmd(++seq, Buttons.Fire, 0, 0, room.tick)]);
      room.update();
    }
    expect(b.alive).toBe(false);
    expect(a.kos).toBe(1);
    const events = room.drainEvents();
    expect(events.some((e) => e.type === 'ko' && e.victim === b.id)).toBe(true);
    expect(room.drainShots().filter((s) => s.hit === b.id).length).toBeGreaterThan(5);
    for (let t = 0; t < TICK_RATE * PLAYER.respawnSeconds + 2; t++) room.update();
    expect(b.alive).toBe(true);
    expect(b.health).toBe(PLAYER.maxHealth);
  });

  it('lag compensation hits where the shooter saw the target', () => {
    const room = new Room(world);
    const { a, b } = faceEachOther(room);
    // Target stands in the line of fire for a while, then moves out of it.
    for (let t = 0; t < 10; t++) room.update();
    const seenAt = room.tick;
    b.state.x = 5 + 10;
    for (let t = 0; t < 3; t++) room.update();
    // Without rewind the shot misses (target already moved).
    room.queueInputs(a.id, [cmd(1, Buttons.Fire, 0, 0, room.tick)]);
    room.update();
    expect(b.health).toBe(PLAYER.maxHealth);
    // Rewound to what the shooter was rendering, it hits.
    a.state.cooldown = 0;
    room.queueInputs(a.id, [cmd(2, 0), cmd(3, Buttons.Fire, 0, 0, seenAt)]);
    room.update();
    expect(b.health).toBeLessThan(PLAYER.maxHealth);
  });

  it('caps rewind so very old view times cannot hit', () => {
    const room = new Room(world);
    const { a, b } = faceEachOther(room);
    for (let t = 0; t < 5; t++) room.update();
    const oldTick = room.tick;
    b.state.x = 5 + 10;
    for (let t = 0; t < 20; t++) room.update(); // ~660 ms later, beyond the 200 ms cap
    room.queueInputs(a.id, [cmd(1, Buttons.Fire, 0, 0, oldTick)]);
    room.update();
    expect(b.health).toBe(PLAYER.maxHealth);
  });

  it('ignores input floods beyond real time (speed hack guard)', () => {
    const room = new Room(world);
    const p = room.addPlayer('Speedy')!;
    p.state = createPlayerState([0, 0, 14]);
    const flood: InputCmd[] = [];
    for (let i = 1; i <= 16; i++) flood.push(cmd(i, Buttons.Forward));
    room.queueInputs(p.id, flood);
    room.update();
    // One tick of budget = 2 inputs at 60 Hz.
    expect(p.lastSeq).toBe(Math.round(1 / (INPUT_DT * TICK_RATE)));
  });
});

describe('host + client prediction', () => {
  it('a predicting client matches the server exactly with no loss', () => {
    const host = new RoomHost({ code: 'TEST', fillTo: 0, mode: 'pvp' });
    const received: (string | Uint8Array)[] = [];
    const conn: Connection = { send: (d) => received.push(d), close: () => {} };
    const h = host.connect(conn);
    h.onMessage(JSON.stringify({ t: 'hello', name: 'Pip' }));
    const welcome = JSON.parse(received[0] as string) as ServerText;
    expect(welcome.t).toBe('welcome');

    // Wait for the first snapshot to learn our spawn.
    let snap = null;
    while (!snap) {
      host.step();
      const bin = received.filter((r): r is Uint8Array => typeof r !== 'string' && r[0] === MSG_SNAPSHOT);
      if (bin.length) snap = decodeSnapshot(bin[bin.length - 1]);
    }
    const predicted = clonePlayerState(snap.self!);
    let seq = 0;
    const pending: InputCmd[] = [];
    let mismatches = 0;
    for (let t = 0; t < 90; t++) {
      const cmds = [];
      for (let k = 0; k < 2; k++) {
        const c = cmd(++seq, Buttons.Forward | (seq % 30 === 0 ? Buttons.Jump : 0) | Buttons.Right, predicted.yaw + 0.01);
        stepPlayer(predicted, c, host.room.world);
        pending.push(c);
        cmds.push(c);
      }
      h.onMessage(encodeInputs(cmds));
      received.length = 0;
      host.step();
      if (!isSnapshotTick(host.room.tick)) continue;
      const s = decodeSnapshot(received.find((r): r is Uint8Array => typeof r !== 'string')!)!;
      // Reconcile: rewind to server state and replay unacknowledged inputs.
      const replay = clonePlayerState(s.self!);
      for (const c of pending) if (c.seq > s.ack) stepPlayer(replay, c, host.room.world);
      if (Math.hypot(replay.x - predicted.x, replay.y - predicted.y, replay.z - predicted.z) > 1e-9) mismatches++;
      while (pending.length && pending[0].seq <= s.ack) pending.shift();
    }
    expect(mismatches).toBe(0);
  });

  it('fills empty slots with bots and makes room for humans', () => {
    const host = new RoomHost({ code: 'BOTS', fillTo: 4, mode: 'pvp' });
    expect(host.room.players.size).toBe(4);
    const h = host.connect({ send: () => {}, close: () => {} });
    h.onMessage(JSON.stringify({ t: 'hello', name: 'Human' }));
    expect(host.room.players.size).toBe(4);
    expect([...host.room.players.values()].filter((p) => !p.bot).length).toBe(1);
    for (let i = 0; i < TICK_RATE * 20; i++) host.step();
    h.onClose();
    expect(host.room.players.size).toBe(4);
    expect([...host.room.players.values()].every((p) => p.bot)).toBe(true);
  });
});
