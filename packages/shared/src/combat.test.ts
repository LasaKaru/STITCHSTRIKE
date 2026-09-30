import { describe, expect, it } from 'vitest';
import { PLAYER, TICK_RATE } from './constants.ts';
import { Buildable, BUILDABLES, DIFFICULTIES, MAX_TIER, Phase, ShotKind, upgradeCost, WAVES } from './coop.ts';
import { ENEMIES, EnemyType, type Enemy } from './enemies.ts';
import { RoomHost } from './host.ts';
import { Action, Buttons, createPlayerState, stepPlayer, type InputCmd } from './movement.ts';
import { PickupKind, PICKUPS } from './pickups.ts';
import { Room } from './room.ts';
import { WEAPONS } from './weapons.ts';
import { createBedroom, createWorld, type World } from './world.ts';

function cmd(seq: number, buttons: number, weapon = 0, action = 0, yaw = 0, pitch = 0, renderTick = 0): InputCmd {
  return { seq, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), renderTick, weapon, action };
}

function enemy(id: number, type: number, x: number, z: number, hp = ENEMIES[type].hp): Enemy {
  return { id, type, x, y: ENEMIES[type].flying ? 3 : 0, z, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp, core: 0, node: -1, cooldown: 0, kx: 0, kz: 0, slow: 0, special: 0 };
}

/** The bedroom's floor and walls only: an open arena for weapon tests. */
function flat(): World {
  const w = createBedroom();
  return { ...w, boxes: w.boxes.filter((b) => b.kind === 'floor' || b.kind === 'wall') };
}

/** A co-op room paused mid-wave with no spawns queued, so tests control every enemy. */
function arena(): Room {
  const room = new Room(flat(), 'coop');
  room.coop!.phase = Phase.Wave;
  // A spawn far in the future keeps the wave from ending while tests clear enemies.
  (room.coop as unknown as { queue: unknown[] }).queue = [{ at: 1e9, type: 0, spawn: 0 }];
  return room;
}

describe('weapons', () => {
  it('has seven weapons with their own magazines, switched by the weapon byte', () => {
    expect(WEAPONS).toHaveLength(7);
    const room = new Room(createBedroom(), 'pvp');
    const p = room.addPlayer('Pip')!;
    let seq = 0;
    for (let w = 0; w < WEAPONS.length; w++) {
      room.queueInputs(p.id, [cmd(++seq, 0, w), cmd(++seq, 0, w)]);
      room.update();
      expect(p.state.weapon).toBe(w);
    }
    expect(p.state.mags).toEqual(WEAPONS.map((w) => w.magazine));
  });

  it('the Needle Lance pierces up to three toys in a line', () => {
    const room = arena();
    const p = room.addPlayer('Lance')!;
    p.state = createPlayerState([0, 0, 12]);
    p.protect = 0;
    const coop = room.coop!;
    // Four grunts in a row down -Z; the Lance hits the first three.
    for (let i = 0; i < 4; i++) coop.enemies.push(enemy(100 + i, EnemyType.Grunt, 0, 8 - i * 1.6, 500));
    room.update();
    room.queueInputs(p.id, [cmd(1, 0, 2), cmd(2, 0, 2)]);
    room.update();
    p.state.cooldown = 0;
    room.queueInputs(p.id, [cmd(3, Buttons.Fire, 2, 0, 0, -0.05, room.tick), cmd(4, 0, 2)]);
    room.update();
    const hurt = coop.enemies.filter((e) => e.hp < 500).map((e) => e.id).sort();
    expect(hurt).toEqual([100, 101, 102]);
  });

  it('a yarn ball lobs, bursts, splashes a crowd and tangles it', () => {
    const room = arena();
    const p = room.addPlayer('Lobber')!;
    p.state = createPlayerState([0, 0, 12]);
    const coop = room.coop!;
    for (let i = 0; i < 4; i++) coop.enemies.push(enemy(200 + i, EnemyType.Grunt, (i % 2) * 1.2 - 0.6, 4 + Math.floor(i / 2) * 1.2, 500));
    room.update();
    room.queueInputs(p.id, [cmd(1, 0, 4), cmd(2, 0, 4)]);
    room.update();
    p.state.cooldown = 0;
    room.queueInputs(p.id, [cmd(3, Buttons.Fire, 4, 0, 0, -0.12, room.tick), cmd(4, 0, 4)]);
    let blast = null;
    for (let t = 0; t < TICK_RATE * 3 && !blast; t++) {
      room.update();
      blast = room.drainShots().find((s) => s.kind === ShotKind.Blast) ?? null;
      // Hold the crowd still.
      for (const e of coop.enemies) { e.vx = e.vz = 0; e.cooldown = 99; }
    }
    expect(blast).not.toBeNull();
    const hit = coop.enemies.filter((e) => e.hp < 500);
    expect(hit.length).toBeGreaterThanOrEqual(3);
    expect(hit.every((e) => e.slow > 0)).toBe(true);
  });

  it('a Glue Gun glob bursts on an invader and glues it (long slow)', () => {
    const room = arena();
    const p = room.addPlayer('Gluer')!;
    p.state = createPlayerState([0, 0, 12]);
    const coop = room.coop!;
    coop.enemies.push(enemy(300, EnemyType.Grunt, 0, 5, 500));
    room.update();
    room.queueInputs(p.id, [cmd(1, 0, 5), cmd(2, 0, 5)]);
    room.update();
    p.state.cooldown = 0;
    room.queueInputs(p.id, [cmd(3, Buttons.Fire, 5, 0, 0, -0.1, room.tick), cmd(4, 0, 5)]);
    let blast = null;
    for (let t = 0; t < TICK_RATE * 2 && !blast; t++) {
      room.update();
      blast = room.drainShots().find((s) => s.kind === ShotKind.Blast) ?? null;
      for (const e of coop.enemies) { e.vx = e.vz = 0; e.cooldown = 99; }
    }
    expect(blast?.hit).toBe(5);
    const e = coop.enemies[0];
    expect(e.hp).toBeLessThan(500);
    expect(e.slow).toBeGreaterThan(3.5);
  });

  it('the Static Sock chains to nearby invaders it can see, weaker each jump', () => {
    const room = arena();
    const p = room.addPlayer('Sock')!;
    p.state = createPlayerState([0, 0, 12]);
    p.protect = 0;
    const coop = room.coop!;
    // One in the crosshair, two within arc range of each other, one far away.
    coop.enemies.push(enemy(400, EnemyType.Grunt, 0, 6, 500), enemy(401, EnemyType.Grunt, 4, 6, 500), enemy(402, EnemyType.Grunt, 8, 6, 500), enemy(403, EnemyType.Grunt, 25, 6, 500));
    room.update();
    room.queueInputs(p.id, [cmd(1, 0, 6), cmd(2, 0, 6)]);
    room.update();
    room.drainShots();
    p.state.cooldown = 0;
    room.queueInputs(p.id, [cmd(3, Buttons.Fire, 6, 0, 0, -0.05, room.tick), cmd(4, 0, 6)]);
    room.update();
    const shots = room.drainShots();
    expect(shots.filter((s) => s.kind === ShotKind.Zap)).toHaveLength(2);
    const dmg = (id: number) => 500 - coop.enemies.find((e) => e.id === id)!.hp;
    expect(dmg(400)).toBeGreaterThan(0);
    expect(dmg(401)).toBeGreaterThan(0);
    expect(dmg(401)).toBeLessThan(dmg(400));
    expect(dmg(402)).toBeLessThan(dmg(401));
    expect(dmg(403)).toBe(0);
  });

  it('the Crochet Hook sprays deterministically inside its cone', () => {
    const room = new Room(createBedroom(), 'pvp');
    const p = room.addPlayer('Hook')!;
    p.state = createPlayerState([0, 0, 12]);
    room.queueInputs(p.id, [cmd(1, 0, 3), cmd(2, 0, 3)]);
    room.update();
    const s = createPlayerState([0, 0, 12]);
    s.weapon = 3;
    let fired = 0;
    for (let i = 1; i <= 60; i++) if (stepPlayer(s, cmd(i, Buttons.Fire, 3), createBedroom()).fired) fired++;
    expect(fired).toBeGreaterThanOrEqual(WEAPONS[3].fireRate - 1);
    expect(fired).toBeLessThanOrEqual(WEAPONS[3].fireRate + 1);
  });
});

describe('toys: armour, pickups, down and re-stitch', () => {
  it('thimble armour soaks damage before stitches', () => {
    const room = arena();
    const p = room.addPlayer('Tuft')!;
    p.protect = 0;
    p.armor = 50;
    const coop = room.coop!;
    coop.enemies.push(enemy(1, EnemyType.Brute, p.state.x + 0.5, p.state.z, 9999));
    room.update();
    expect(p.armor).toBeLessThan(50);
    expect(p.health).toBe(PLAYER.maxHealth);
  });

  it('stuffing heals, then its spot respawns on a timer', () => {
    const world = createBedroom();
    const room = new Room(world, 'pvp');
    const p = room.addPlayer('Hungry')!;
    const i = world.pickups.findIndex((s) => s.kind === PickupKind.Stuffing && s.pos[1] === 0);
    const spot = world.pickups[i];
    p.health = 50;
    p.state = createPlayerState(spot.pos);
    room.update();
    expect(p.health).toBeGreaterThanOrEqual(50 + PICKUPS[PickupKind.Stuffing].amount);
    expect(room.pickupMask() & (1 << i)).toBe(0);
    for (let t = 0; t < TICK_RATE * (PICKUPS[PickupKind.Stuffing].respawn + 1); t++) room.update();
    expect(room.pickupMask() & (1 << i)).not.toBe(0);
  });

  it('a Power Pom boosts damage', () => {
    const room = arena();
    const p = room.addPlayer('Pow')!;
    p.state = createPlayerState([0, 0, 12]);
    p.power = 5;
    room.coop!.enemies.push(enemy(9, EnemyType.Brute, 0, 6, 500));
    room.update();
    room.queueInputs(p.id, [cmd(1, Buttons.Fire, 0, 0, 0, -0.03, room.tick), cmd(2, 0)]);
    room.update();
    expect(500 - room.coop!.enemies[0].hp).toBeCloseTo(WEAPONS[0].damage * 1.5, 3);
  });

  it('co-op toys go down instead of out, and a teammate holding Use re-stitches them', () => {
    const room = arena();
    const a = room.addPlayer('Down')!;
    const b = room.addPlayer('Helper')!;
    a.protect = 0;
    a.health = 1;
    a.state = createPlayerState([0, 0, 0]);
    b.state = createPlayerState([1.5, 0, 0]);
    room.coop!.enemies.push(enemy(3, EnemyType.Grunt, -0.9, 0, 9999));
    room.update();
    expect(a.bleed).toBeGreaterThan(0);
    expect(a.state.downed).toBe(true);
    expect(a.alive).toBe(true);
    room.coop!.enemies.length = 0;
    // Downed toys can't shoot.
    expect(stepPlayer(a.state, cmd(99, Buttons.Fire), room.world).fired).toBe(false);
    let seq = 0;
    for (let t = 0; t < TICK_RATE * (PLAYER.reviveSeconds + 0.5) && a.bleed > 0; t++) {
      room.queueInputs(b.id, [cmd(++seq, Buttons.Use), cmd(++seq, Buttons.Use)]);
      room.update();
    }
    expect(a.bleed).toBe(0);
    expect(a.state.downed).toBe(false);
    expect(a.health).toBe(PLAYER.reviveHealth);
    expect(b.revives).toBe(1);
    expect(room.drainEvents().some((e) => e.type === 'revived' && e.id === a.id && e.by === b.id)).toBe(true);
  });

  it('left alone, a downed toy bleeds out and is knocked out', () => {
    const room = arena();
    const a = room.addPlayer('Alone')!;
    a.protect = 0;
    a.health = 1;
    room.coop!.enemies.push(enemy(4, EnemyType.Grunt, a.state.x + 0.5, a.state.z, 9999));
    room.update();
    room.coop!.enemies.length = 0;
    for (let t = 0; t < TICK_RATE * (PLAYER.bleedSeconds + 1); t++) room.update();
    expect(a.alive).toBe(false);
  });
});

describe('traps, upgrades and mazing', () => {
  it('building the same trap again upgrades it up to tier 3', () => {
    const room = new Room(createBedroom(), 'coop');
    const coop = room.coop!;
    coop.buttons = 5000;
    const pad = room.world.coop.pads[0];
    const p = room.addPlayer('Builder')!;
    p.state = createPlayerState([pad.pos[0], 0, pad.pos[2]]);
    let seq = 0;
    for (let i = 0; i < 4; i++) {
      room.queueInputs(p.id, [cmd(++seq, 0), cmd(++seq, 0, 0, Buildable.Zapper)]);
      room.update();
    }
    expect(coop.pads[0].kind).toBe(Buildable.Zapper);
    expect(coop.pads[0].tier).toBe(MAX_TIER);
    const spent = BUILDABLES[Buildable.Zapper].cost + upgradeCost(Buildable.Zapper, 1) + upgradeCost(Buildable.Zapper, 2);
    expect(coop.buttons).toBe(5000 - spent);
    // Recycling refunds half of everything spent.
    room.queueInputs(p.id, [cmd(++seq, 0), cmd(++seq, 0, 0, Action.Sell)]);
    room.update();
    expect(coop.buttons).toBe(5000 - spent + Math.floor(spent / 2));
  });

  it('a battery zapper chains through several invaders', () => {
    const room = arena();
    const coop = room.coop!;
    const pad = room.world.coop.pads[0];
    coop.pads[0] = { kind: Buildable.Zapper, tier: 1, hp: 150, cooldown: 0 };
    for (let i = 0; i < 4; i++) coop.enemies.push(enemy(10 + i, EnemyType.Grunt, pad.pos[0] + 1.5 + i * 0.9, pad.pos[2], 500));
    room.update();
    const zaps = room.drainShots().filter((s) => s.kind === ShotKind.Zap);
    expect(zaps.length).toBeGreaterThanOrEqual(3);
  });

  it('a mousetrap snaps the first walker onto it', () => {
    const room = arena();
    const coop = room.coop!;
    const pad = room.world.coop.pads[1];
    coop.pads[1] = { kind: Buildable.Mousetrap, tier: 1, hp: 120, cooldown: 0 };
    coop.enemies.push(enemy(20, EnemyType.Grunt, pad.pos[0] + 0.5, pad.pos[2]));
    room.update();
    expect(coop.enemies.some((e) => e.id === 20)).toBe(false);
  });

  it('blockades re-bake the flow field so invaders path around them', () => {
    const room = new Room(createWorld('garden'), 'coop');
    const nav = room.coop!.nav;
    const core = 1;
    const spawn = room.world.coop.enemySpawns[0];
    const start = nav.nearest(spawn[0], spawn[2], room.world.boxes);
    const route = (): number[] => {
      const out = [start];
      for (let n = start; nav.dist[core][n] > 0 && out.length < 300;) out.push((n = nav.next[core][n]));
      return out;
    };
    const before = nav.dist[core][start];
    const path = route();
    // Drop a blockade on the middle of the current route.
    const mid = nav.nodes[path[Math.floor(path.length / 2)]];
    nav.rebake([{ x: mid.x, z: mid.z, r: 3 }]);
    const after = route();
    expect(nav.dist[core][start]).toBeGreaterThan(before);
    expect(Number.isFinite(nav.dist[core][start])).toBe(true);
    // The new route goes around the blockade.
    expect(after.some((n) => Math.hypot(nav.nodes[n].x - mid.x, nav.nodes[n].z - mid.z) < 2.5)).toBe(false);
  });

  it('building a blockade re-bakes the flow field', () => {
    const room = new Room(createWorld('garden'), 'coop');
    const coop = room.coop!;
    const snapshot = Float32Array.from(coop.nav.cost);
    coop.buttons = 1000;
    const pad = room.world.coop.pads[0];
    const p = room.addPlayer('Mason')!;
    p.state = createPlayerState([pad.pos[0], 0, pad.pos[2]]);
    room.queueInputs(p.id, [cmd(1, 0), cmd(2, 0, 0, Buildable.Barricade)]);
    room.update();
    room.update();
    expect(coop.pads[0].kind).toBe(Buildable.Barricade);
    expect(Array.from(coop.nav.cost).some((c, i) => c !== snapshot[i])).toBe(true);
  });

  it('spring pads launch toys that land on them', () => {
    const room = new Room(createBedroom(), 'coop');
    const coop = room.coop!;
    const pad = room.world.coop.pads[0];
    coop.buttons = 1000;
    const p = room.addPlayer('Boing')!;
    p.state = createPlayerState([pad.pos[0], 0, pad.pos[2]]);
    room.queueInputs(p.id, [cmd(1, 0), cmd(2, 0, 0, Buildable.Spring)]);
    room.update();
    expect(coop.pads[0].kind).toBe(Buildable.Spring);
    let maxY = 0;
    let seq = 2;
    for (let t = 0; t < TICK_RATE; t++) {
      room.queueInputs(p.id, [cmd(++seq, 0), cmd(++seq, 0)]);
      room.update();
      maxY = Math.max(maxY, p.state.y);
    }
    expect(maxY).toBeGreaterThan(4);
  });
});

describe('the Mass-Knit Army', () => {
  it('tin soldiers stop at range and shoot', () => {
    const room = arena();
    const p = room.addPlayer('Target')!;
    p.state = createPlayerState([0, 0, 12]);
    p.protect = 0;
    room.coop!.enemies.push(enemy(30, EnemyType.Soldier, 0, 2));
    for (let t = 0; t < TICK_RATE * 4; t++) room.update();
    const soldier = room.coop!.enemies[0];
    expect(Math.hypot(soldier.x - p.state.x, soldier.z - p.state.z)).toBeGreaterThan(5);
    expect(room.drainShots().some((s) => s.kind === ShotKind.Enemy)).toBe(true);
  });

  it('RC drones drop chattering teeth', () => {
    const room = arena();
    room.coop!.enemies.push(enemy(40, EnemyType.Drone, 10, 10));
    for (let t = 0; t < TICK_RATE * 5; t++) room.update();
    expect(room.coop!.enemies.some((e) => e.type === EnemyType.Teeth)).toBe(true);
  });

  it('scissor snips cut buildables apart', () => {
    const room = arena();
    const coop = room.coop!;
    const pad = room.world.coop.pads[0];
    coop.pads[0] = { kind: Buildable.Wall, tier: 1, hp: 340, cooldown: 0 };
    coop.enemies.push(enemy(50, EnemyType.Snip, pad.pos[0] + 3, pad.pos[2]));
    for (let t = 0; t < TICK_RATE * 12 && coop.pads[0].kind !== Buildable.None; t++) room.update();
    expect(coop.pads[0].kind).toBe(Buildable.None);
  });

  it('a ten-wave mission ends with the Unraveller, who stomps', () => {
    expect(WAVES).toHaveLength(10);
    expect(WAVES[9].some((g) => g.type === EnemyType.Boss)).toBe(true);
    const room = arena();
    const p = room.addPlayer('Brave')!;
    p.protect = 0;
    room.coop!.enemies.push(enemy(60, EnemyType.Boss, p.state.x + 2, p.state.z, 99999));
    room.coop!.enemies[0].special = 0.01;
    room.update();
    const events = room.drainEvents();
    expect(events.some((e) => e.type === 'stomp')).toBe(true);
    expect(p.health).toBeLessThan(PLAYER.maxHealth);
    expect(room.coopState()!.boss).toBeGreaterThan(0.9);
  });

  it('endless mode keeps going past wave 10 with tougher invaders', () => {
    const host = new RoomHost({ code: 'END', fillTo: 0, mode: 'coop', waves: 0, difficulty: 0 });
    const coop = host.room.coop!;
    expect(coop.totalWaves).toBe(0);
    coop.wave = 10;
    coop.timer = 0;
    host.step();
    expect(coop.phase).toBe(Phase.Wave);
    expect(coop.wave).toBe(11);
  });

  it('difficulty scales starting buttons', () => {
    for (let d = 0; d < DIFFICULTIES.length; d++) {
      const room = new Room(createBedroom(), 'coop', { difficulty: d });
      expect(room.coop!.buttons).toBe(DIFFICULTIES[d].startButtons);
    }
  });
});

describe('team deathmatch', () => {
  it('splits toys into two teams with no friendly fire', () => {
    const room = new Room(createBedroom(), 'tdm');
    const a = room.addPlayer('A')!;
    const b = room.addPlayer('B')!;
    const c = room.addPlayer('C')!;
    expect(a.team).not.toBe(b.team);
    expect(c.team).toBe(a.team);
    // C shoots teammate A point blank: nothing.
    a.state = createPlayerState([10, 0, 4]);
    c.state = createPlayerState([10, 0, 10]);
    a.protect = 0;
    room.update();
    room.queueInputs(c.id, [cmd(1, Buttons.Fire, 0, 0, 0, 0, room.tick), cmd(2, 0)]);
    room.update();
    expect(a.health).toBe(PLAYER.maxHealth);
  });
});

describe('traversal', () => {
  it('toys climb knitted fabric by walking into it', () => {
    const world = createBedroom();
    // Face the bed's side (it sits at x < -9) from the open floor and walk into it.
    const s = createPlayerState([-8, 0, -6]);
    const yaw = Math.PI / 2; // looking down -X
    let top = 0;
    for (let i = 1; i <= 240; i++) {
      stepPlayer(s, cmd(i, Buttons.Forward, 0, 0, yaw), world);
      top = Math.max(top, s.y);
    }
    expect(top).toBeGreaterThanOrEqual(4.9);
    expect(s.x).toBeLessThan(-9);
  });

  it('plain walls cannot be climbed', () => {
    const world = createBedroom();
    const s = createPlayerState([18, 0, -3]);
    for (let i = 1; i <= 120; i++) stepPlayer(s, cmd(i, Buttons.Forward, 0, 0, -Math.PI / 2), world);
    expect(s.y).toBeLessThan(0.5);
  });

  it('map jump pads launch toys high', () => {
    for (const map of ['bedroom', 'garden', 'garage', 'bathroom', 'toystore'] as const) {
      const world = createWorld(map);
      for (const j of world.jumpPads) {
        const s = createPlayerState([j.x, j.y + 0.5, j.z]);
        let top = 0;
        for (let i = 1; i <= 90; i++) { stepPlayer(s, cmd(i, 0), world); top = Math.max(top, s.y); }
        expect(top - j.y).toBeGreaterThan(7.2);
      }
    }
  });

  it('every map hides collectibles', () => {
    for (const map of ['bedroom', 'garden', 'garage', 'bathroom', 'toystore'] as const) {
      const world = createWorld(map);
      expect(world.collectibles.length).toBeGreaterThanOrEqual(8);
      expect(new Set(world.collectibles.map((c) => c.id)).size).toBe(world.collectibles.length);
    }
  });
});
