import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './constants.ts';
import { Buildable, BUILDABLES, CORE, FIRST_BUILD_SECONDS, Phase, START_BUTTONS, TURRET_SHOT_BASE } from './coop.ts';
import { ENEMIES, EnemyType, NavGrid } from './enemies.ts';
import { RoomHost } from './host.ts';
import { Buttons, createPlayerState, type InputCmd } from './movement.ts';
import { decodeSnapshot, encodeSnapshot } from './protocol.ts';
import { Room } from './room.ts';
import { pelletDirections, WEAPONS } from './weapons.ts';
import { circleClear, createBedroom, type Vec3 } from './world.ts';

const world = createBedroom();

function cmd(seq: number, buttons: number, yaw = 0, pitch = 0, renderTick = 0): InputCmd {
  return { seq, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), renderTick };
}

function skipBuildPhase(room: Room): void {
  room.coop!.timer = 0;
  room.update();
}

describe('co-op layout', () => {
  it('has three Heartspools, build pads for each and clear spawns', () => {
    const { cores, pads, enemySpawns, playerSpawns } = world.coop;
    expect(cores).toHaveLength(3);
    expect(pads.length).toBeGreaterThanOrEqual(9);
    for (let c = 0; c < cores.length; c++) expect(pads.some((p) => p.core === c)).toBe(true);
    for (const p of [...cores, ...enemySpawns, ...playerSpawns]) expect(circleClear(world.boxes, p[0], p[2], 0.8)).toBe(true);
  });

  it('every enemy burrow has a walkable route to every Heartspool', () => {
    const nav = new NavGrid(world);
    for (const s of world.coop.enemySpawns) {
      const start = nav.nearest(s[0], s[2], world.boxes);
      expect(start).toBeGreaterThanOrEqual(0);
      for (let c = 0; c < world.coop.cores.length; c++) {
        expect(Number.isFinite(nav.dist[c][start])).toBe(true);
        // Follow the flow field and make sure it ends at the core.
        let node = start;
        for (let i = 0; i < 200 && nav.dist[c][node] > 0; i++) node = nav.next[c][node];
        expect(nav.dist[c][node]).toBe(0);
      }
    }
  });
});

describe('co-op waves', () => {
  it('starts in the build phase and opens wave 1 when the timer runs out', () => {
    const room = new Room(world, 'coop');
    expect(room.coop!.phase).toBe(Phase.Build);
    expect(room.coop!.buttons).toBe(START_BUTTONS);
    for (let t = 0; t < TICK_RATE * (FIRST_BUILD_SECONDS + 3); t++) room.update();
    expect(room.coop!.phase).toBe(Phase.Wave);
    expect(room.coop!.wave).toBe(1);
    expect(room.coop!.enemies.length).toBeGreaterThan(0);
    expect(room.drainEvents().some((e) => e.type === 'phase' && e.wave === 1)).toBe(true);
  });

  it('undefended Heartspools take damage and the match is lost', () => {
    const room = new Room(world, 'coop');
    skipBuildPhase(room);
    let lost = false;
    for (let t = 0; t < TICK_RATE * 400 && !lost; t++) {
      room.update();
      // Keep feeding waves so the cores eventually fall.
      if (room.coop!.phase === Phase.Build) room.coop!.timer = 0;
      lost = room.coop!.phase === Phase.Lost;
    }
    expect(room.coop!.cores.every((c) => !c.alive)).toBe(true);
    expect(lost).toBe(true);
  });

  it('a player shooting a grunt kills it and earns buttons (with lag compensation)', () => {
    const room = new Room(world, 'coop');
    const p = room.addPlayer('Pip')!;
    p.state = createPlayerState([10, 0, 12]);
    room.update();
    const coop = room.coop!;
    coop.phase = Phase.Wave;
    coop.enemies.push({ id: 900, type: EnemyType.Grunt, x: 10, y: 0, z: 6, vx: 0, vz: 0, yaw: 0, hp: 70, maxHp: 70, core: 0, node: -1, cooldown: 0, kx: 0, kz: 0 });
    for (let t = 0; t < 3; t++) room.update();
    const seenAt = room.tick;
    // It moves out of the line of fire before our shots arrive; rewind still hits it.
    const before = coop.buttons;
    let seq = 0;
    for (let t = 0; t < 40 && coop.enemies.some((e) => e.id === 900); t++) {
      const g = coop.enemies.find((e) => e.id === 900);
      if (g) { g.x = 10; g.z = 6; }
      room.queueInputs(p.id, [cmd(++seq, Buttons.Fire, 0, -0.03, seenAt), cmd(++seq, Buttons.Fire, 0, -0.03, seenAt)]);
      room.update();
    }
    expect(coop.enemies.some((e) => e.id === 900)).toBe(false);
    expect(coop.buttons).toBeGreaterThanOrEqual(before + ENEMIES[EnemyType.Grunt].reward);
    expect(p.kos).toBe(1);
    expect(room.drainEvents().some((e) => e.type === 'kill' && e.by === p.id)).toBe(true);
  });

  it('building on a pad costs buttons, and a turret shoots enemies', () => {
    const room = new Room(world, 'coop');
    const p = room.addPlayer('Dot')!;
    const pad = world.coop.pads[0];
    p.state = createPlayerState([pad.pos[0], 0, pad.pos[2] + 0.5]);
    room.queueInputs(p.id, [cmd(1, 0), cmd(2, Buttons.Build1)]);
    room.update();
    const coop = room.coop!;
    expect(coop.pads[0].kind).toBe(Buildable.Turret);
    expect(coop.buttons).toBe(START_BUTTONS - BUILDABLES[Buildable.Turret].cost);

    // Not enough buttons for a second turret after spending down.
    coop.buttons = 10;
    const pad2 = world.coop.pads[1];
    p.state = createPlayerState([pad2.pos[0], 0, pad2.pos[2]]);
    room.queueInputs(p.id, [cmd(3, 0), cmd(4, Buttons.Build1)]);
    room.update();
    expect(coop.pads[1].kind).toBe(Buildable.None);

    coop.phase = Phase.Wave;
    coop.enemies.push({ id: 7, type: EnemyType.Scuttler, x: pad.pos[0] + 5, y: 0, z: pad.pos[2], vx: 0, vz: 0, yaw: 0, hp: 32, maxHp: 32, core: 0, node: -1, cooldown: 0, kx: 0, kz: 0 });
    room.drainShots();
    let turretShots = 0;
    for (let t = 0; t < TICK_RATE * 3; t++) {
      room.update();
      turretShots += room.drainShots().filter((s) => s.id === TURRET_SHOT_BASE).length;
    }
    expect(turretShots).toBeGreaterThan(0);
    expect(coop.enemies.some((e) => e.id === 7)).toBe(false);
  });

  it('selling refunds half and frees the pad', () => {
    const room = new Room(world, 'coop');
    const p = room.addPlayer('Moss')!;
    const pad = world.coop.pads[2];
    p.state = createPlayerState([pad.pos[0], 0, pad.pos[2]]);
    room.queueInputs(p.id, [cmd(1, 0), cmd(2, Buttons.Build2), cmd(3, 0), cmd(4, Buttons.Sell)]);
    room.update();
    room.update();
    expect(room.coop!.pads[2].kind).toBe(Buildable.None);
    expect(room.coop!.buttons).toBe(START_BUTTONS - BUILDABLES[Buildable.Wall].cost / 2);
  });

  it('Heartspool shields absorb damage before health', () => {
    const room = new Room(world, 'coop');
    const coop = room.coop!;
    coop.phase = Phase.Wave;
    const c = world.coop.cores[1];
    coop.enemies.push({ id: 3, type: EnemyType.Brute, x: c[0] + 1.2, y: 0, z: c[2], vx: 0, vz: 0, yaw: 0, hp: 9999, maxHp: 9999, core: 1, node: -1, cooldown: 0, kx: 0, kz: 0 });
    room.update();
    expect(coop.cores[1].shield).toBeLessThan(CORE.shield);
    expect(coop.cores[1].hp).toBe(CORE.hp);
  });

  it('ready votes from every human cut the build phase short', () => {
    const room = new Room(world, 'coop');
    const a = room.addPlayer('A')!;
    const b = room.addPlayer('B')!;
    room.queueInputs(a.id, [cmd(1, 0), cmd(2, Buttons.Ready)]);
    room.update();
    expect(room.coop!.timer).toBeGreaterThan(10);
    room.queueInputs(b.id, [cmd(1, 0), cmd(2, Buttons.Ready)]);
    room.update();
    expect(room.coop!.timer).toBeLessThanOrEqual(3);
  });

  it('a full match with bots runs to an ending and restarts', () => {
    const host = new RoomHost({ code: 'SIM', fillTo: 4, mode: 'coop' });
    const coop = host.room.coop!;
    let ended = -1;
    let maxAlive = 0;
    for (let t = 0; t < TICK_RATE * 60 * 12 && ended < 0; t++) {
      if (coop.phase === Phase.Build) coop.timer = Math.min(coop.timer, 2);
      host.step();
      maxAlive = Math.max(maxAlive, coop.enemies.length);
      if (coop.phase === Phase.Won || coop.phase === Phase.Lost) ended = coop.phase;
    }
    expect(ended).toBeGreaterThanOrEqual(Phase.Won);
    expect(maxAlive).toBeGreaterThan(5);
    // Bots should have built something along the way and scored kills.
    const kills = [...host.room.players.values()].reduce((a, p) => a + p.kos, 0);
    expect(kills).toBeGreaterThan(10);
    for (let t = 0; t < TICK_RATE * 14; t++) host.step();
    expect(coop.phase).toBe(Phase.Build);
    expect(coop.wave).toBe(0);
  });
});

describe('weapons + protocol', () => {
  it('Button Buster pellets are deterministic and stay inside the cone', () => {
    const buster = WEAPONS[1];
    const dir: Vec3 = [0, 0, -1];
    const a = pelletDirections(buster, dir, 42);
    expect(a).toHaveLength(buster.pellets);
    expect(pelletDirections(buster, dir, 42)).toEqual(a);
    expect(pelletDirections(buster, dir, 43)).not.toEqual(a);
    for (const d of a) expect(Math.acos(-d[2])).toBeLessThanOrEqual(buster.spread + 1e-6);
  });

  it('switching weapons uses the other magazine', () => {
    const room = new Room(world, 'pvp');
    const p = room.addPlayer('Cable')!;
    room.queueInputs(p.id, [cmd(1, Buttons.Weapon2), cmd(2, 0)]);
    room.update();
    expect(p.state.weapon).toBe(1);
    p.state.cooldown = 0;
    room.queueInputs(p.id, [cmd(3, Buttons.Fire), cmd(4, 0)]);
    room.update();
    expect(p.state.ammoB).toBe(WEAPONS[1].magazine - 1);
    expect(p.state.ammo).toBe(WEAPONS[0].magazine);
    // One trigger pull fired every pellet.
    expect(room.drainShots().filter((s) => s.id === p.id)).toHaveLength(WEAPONS[1].pellets);
  });

  it('co-op snapshots round-trip enemies, cores and pads', () => {
    const host = new RoomHost({ code: 'NET', fillTo: 2, mode: 'coop' });
    host.room.coop!.timer = 0;
    for (let t = 0; t < TICK_RATE * 6; t++) host.step();
    const coop = host.room.coopState()!;
    expect(coop.enemies!.length).toBeGreaterThan(0);
    const snap = decodeSnapshot(encodeSnapshot(host.room.snapshotFor(1, host.room.netPlayers(), [], coop)))!;
    expect(snap.coop!.wave).toBe(1);
    expect(snap.coop!.cores).toHaveLength(3);
    expect(snap.coop!.pads).toHaveLength(world.coop.pads.length);
    expect(snap.coop!.enemies).toHaveLength(coop.enemies!.length);
    expect(snap.coop!.enemies![0].x).toBeCloseTo(coop.enemies![0].x, 2);
    const lean = decodeSnapshot(encodeSnapshot(host.room.snapshotFor(1, host.room.netPlayers(), [], host.room.coopState(false))))!;
    expect(lean.coop!.enemies).toBeNull();
    expect(lean.coop!.wave).toBe(1);
    expect(snap.coop!.buttons).toBe(coop.buttons);
  });
});
