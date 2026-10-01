import { describe, expect, it } from 'vitest';
import { TICK_RATE } from './constants.ts';
import { Mission, Phase, STAMPEDE } from './coop.ts';
import { ENEMIES, EnemyType, REX_ROAR, TRIKE_CHARGE, type Enemy } from './enemies.ts';
import { RoomHost } from './host.ts';
import { createPlayerState } from './movement.ts';
import type { GameEvent } from './protocol.ts';
import { Room } from './room.ts';
import { createBedroom, type World } from './world.ts';

function enemy(id: number, type: number, x: number, z: number): Enemy {
  const hp = ENEMIES[type].hp;
  return { id, type, x, y: ENEMIES[type].flying ? ENEMIES[type].altitude ?? 3 : 0, z, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp, core: 0, node: -1, cooldown: 0, kx: 0, kz: 0, slow: 0, special: 0, rush: 0, roar: 99 };
}

function flat(): World {
  const w = createBedroom();
  return { ...w, boxes: w.boxes.filter((b) => b.kind === 'floor' || b.kind === 'wall') };
}

/** A co-op room mid-wave with nothing queued, so the test controls every dino. */
function arena(): Room {
  const room = new Room(flat(), 'coop', { mission: Mission.Stampede });
  room.coop!.phase = Phase.Wave;
  (room.coop as unknown as { queue: unknown[] }).queue = [{ at: 1e9, type: 0, spawn: 0 }];
  return room;
}

const dinoEvents = (events: GameEvent[], act: string) => events.filter((e) => e.type === 'dino' && e.act === act);

describe('Dino Stampede', () => {
  it('the mission is a herd of dinosaurs, closed out by Rex', () => {
    const types = new Set(STAMPEDE.flat().map((g) => g.type));
    for (const t of [EnemyType.Raptor, EnemyType.Trike, EnemyType.Ptero, EnemyType.Rex]) expect(types.has(t)).toBe(true);
    expect(STAMPEDE).toHaveLength(10);
    expect(STAMPEDE[9].some((g) => g.type === EnemyType.Rex)).toBe(true);
    expect(ENEMIES[EnemyType.Rex].boss).toBe(true);
  });

  it('starting the Stampede sends raptors in the first wave', () => {
    const host = new RoomHost({ code: 'DINO', fillTo: 0, mode: 'coop', waves: 10, difficulty: 1, mission: Mission.Stampede });
    const coop = host.room.coop!;
    expect(coop.mission).toBe(Mission.Stampede);
    coop.timer = 0;
    for (let i = 0; i < TICK_RATE * 4; i++) host.step();
    expect(coop.phase).toBe(Phase.Wave);
    expect(coop.enemies.some((e) => e.type === EnemyType.Raptor)).toBe(true);
  });

  it('the default campaign has no dinosaurs', () => {
    const host = new RoomHost({ code: 'TOYS', fillTo: 0, mode: 'coop', waves: 10, difficulty: 1 });
    const coop = host.room.coop!;
    coop.timer = 0;
    for (let i = 0; i < TICK_RATE * 6; i++) host.step();
    expect(coop.enemies.length).toBeGreaterThan(0);
    expect(coop.enemies.every((e) => !ENEMIES[e.type].dino)).toBe(true);
  });

  it('a raptor leaps at a toy a few steps away', () => {
    const room = arena();
    const p = room.addPlayer('Lunch')!;
    p.state = createPlayerState([0, 0, 0]);
    const r = enemy(1, EnemyType.Raptor, 5, 0);
    room.coop!.enemies.push(r);
    room.update();
    expect(dinoEvents(room.drainEvents(), 'leap')).toHaveLength(1);
    expect(r.kx).toBeLessThan(-5);
    expect(r.special).toBeGreaterThan(3);
  });

  it('a trike charges: much faster for a moment, then winds down', () => {
    const room = arena();
    const p = room.addPlayer('Target')!;
    p.state = createPlayerState([0, 0, -10]);
    const t = enemy(2, EnemyType.Trike, 0, 4);
    room.coop!.enemies.push(t);
    const z0 = t.z;
    room.update();
    expect(dinoEvents(room.drainEvents(), 'charge')).toHaveLength(1);
    expect(t.rush).toBeGreaterThan(0);
    for (let i = 0; i < TICK_RATE / 2; i++) room.update();
    // Half a second of charging covers far more ground than its walking pace would.
    expect(z0 - t.z).toBeGreaterThan(ENEMIES[EnemyType.Trike].speed * 0.5 * 2);
    for (let i = 0; i < TICK_RATE * TRIKE_CHARGE.duration; i++) room.update();
    expect(t.rush).toBe(0);
  });

  it('a ptero swoops down from its cruising height at a toy below', () => {
    const room = arena();
    const p = room.addPlayer('Spotted')!;
    p.state = createPlayerState([0, 0, 0]);
    const f = enemy(3, EnemyType.Ptero, 8, 0);
    room.coop!.enemies.push(f);
    const y0 = f.y;
    for (let i = 0; i < TICK_RATE * 2; i++) room.update();
    expect(f.y).toBeLessThan(y0 - 2);
    expect(Math.hypot(f.x, f.z)).toBeLessThan(6);
  });

  it("Rex roars, and every dino nearby rushes", () => {
    const room = arena();
    const rex = enemy(4, EnemyType.Rex, 0, 10);
    rex.roar = 0;
    rex.special = 99;
    const pack = [enemy(5, EnemyType.Raptor, 4, 10), enemy(6, EnemyType.Trike, -6, 12)];
    const far = enemy(7, EnemyType.Raptor, 0, 10 + REX_ROAR.radius + 10);
    const toy = enemy(8, EnemyType.Grunt, 2, 8);
    room.coop!.enemies.push(rex, ...pack, far, toy);
    room.update();
    expect(dinoEvents(room.drainEvents(), 'roar')).toHaveLength(1);
    for (const d of pack) expect(d.rush).toBeGreaterThan(0);
    expect(far.rush ?? 0).toBe(0);
    // Toys from the Baron's army don't answer to Rex.
    expect(toy.rush ?? 0).toBe(0);
    expect(rex.roar).toBeGreaterThan(REX_ROAR.every - 1);
  });
});
