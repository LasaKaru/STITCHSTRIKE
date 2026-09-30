import { ENEMIES, EnemyType, MOTH_ALTITUDE, NavGrid, pushOutOfBoxes, type Enemy } from './enemies.ts';
import type { GameEvent, Shot } from './protocol.ts';
import { hasLineOfSight } from './raycast.ts';
import type { Vec3, World } from './world.ts';

/**
 * Co-op defence director (plan §5, §6.1, §9): build phase -> wave -> build
 * phase ... Heartspools have a shield and health; build pads take one of three
 * buildables paid for with the team's buttons.
 */

export const Phase = { Build: 0, Wave: 1, Won: 2, Lost: 3 } as const;
export const Buildable = { None: 0, Turret: 1, Wall: 2, Mat: 3 } as const;

export interface BuildableDef { name: string; cost: number; hp: number }
export const BUILDABLES: BuildableDef[] = [
  { name: '', cost: 0, hp: 0 },
  { name: 'Pom-Pom Turret', cost: 150, hp: 160 },
  { name: 'Pin Wall', cost: 80, hp: 340 },
  { name: 'Tangle Mat', cost: 100, hp: 220 },
];

export const CORE = { hp: 600, shield: 250, shieldRegen: 18, radius: 0.7 };
export const TURRET = { range: 10, fireRate: 2.5, damage: 8, height: 1.3 };
export const WALL_RADIUS = 1.1;
export const MAT_RADIUS = 1.8;
export const MAT_SLOW = 0.4;
export const BUILD_RANGE = 2.6;
export const FIRST_BUILD_SECONDS = 40;
export const BUILD_SECONDS = 25;
export const END_SECONDS = 12;
export const START_BUTTONS = 350;
export const MAX_ALIVE = 64;
/** Shot ids at or above this are turrets: id - TURRET_SHOT_BASE is the pad index. */
export const TURRET_SHOT_BASE = 128;

interface SpawnGroup { type: number; count: number; spawn: number; delay: number; interval: number }

const G = EnemyType.Grunt, S = EnemyType.Scuttler, M = EnemyType.Moth, B = EnemyType.Brute;
export const WAVES: SpawnGroup[][] = [
  [{ type: G, count: 10, spawn: -1, delay: 0, interval: 1.4 }],
  [{ type: G, count: 12, spawn: -1, delay: 0, interval: 1.2 }, { type: S, count: 8, spawn: 1, delay: 6, interval: 0.8 }],
  [{ type: G, count: 14, spawn: -1, delay: 0, interval: 1.0 }, { type: M, count: 8, spawn: -1, delay: 4, interval: 1.0 }, { type: S, count: 8, spawn: 0, delay: 12, interval: 0.6 }],
  [{ type: G, count: 16, spawn: -1, delay: 0, interval: 0.9 }, { type: S, count: 12, spawn: -1, delay: 5, interval: 0.5 }, { type: M, count: 10, spawn: -1, delay: 10, interval: 0.8 }, { type: B, count: 1, spawn: 0, delay: 15, interval: 1 }],
  [{ type: G, count: 20, spawn: -1, delay: 0, interval: 0.7 }, { type: S, count: 14, spawn: -1, delay: 4, interval: 0.4 }, { type: M, count: 14, spawn: -1, delay: 8, interval: 0.6 }, { type: B, count: 3, spawn: -1, delay: 12, interval: 5 }],
];

export interface CoreState { hp: number; shield: number; alive: boolean }
export interface PadState { kind: number; hp: number; cooldown: number }

/** What the director needs from the room it lives in. */
export interface CoopHost {
  livePlayers(): { id: number; x: number; y: number; z: number }[];
  damagePlayer(id: number, damage: number, enemyType: number): void;
  shot(s: Shot): void;
  event(e: GameEvent): void;
}

interface Pending { at: number; type: number; spawn: number }

export class CoopDirector {
  readonly nav: NavGrid;
  phase: number = Phase.Build;
  /** Wave number shown to players, 1-based; 0 before the first wave. */
  wave = 0;
  timer = FIRST_BUILD_SECONDS;
  buttons = START_BUTTONS;
  cores: CoreState[] = [];
  pads: PadState[] = [];
  enemies: Enemy[] = [];
  readonly ready = new Set<number>();
  private queue: Pending[] = [];
  private waveTime = 0;
  private nextEnemyId = 1;
  private time = 0;

  constructor(readonly world: World) {
    this.nav = new NavGrid(world);
    this.reset();
  }

  get totalWaves(): number {
    return WAVES.length;
  }

  reset(): void {
    this.phase = Phase.Build;
    this.wave = 0;
    this.timer = FIRST_BUILD_SECONDS;
    this.buttons = START_BUTTONS;
    this.cores = this.world.coop.cores.map(() => ({ hp: CORE.hp, shield: CORE.shield, alive: true }));
    this.pads = this.world.coop.pads.map(() => ({ kind: Buildable.None, hp: 0, cooldown: 0 }));
    this.enemies = [];
    this.queue = [];
    this.ready.clear();
  }

  // ------------------------------------------------------------ player actions

  private nearestPad(x: number, z: number, filled: boolean): number {
    let best = -1;
    let bestD = BUILD_RANGE;
    this.world.coop.pads.forEach((p, i) => {
      const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
      if (d < bestD && (this.pads[i].kind !== Buildable.None) === filled) { bestD = d; best = i; }
    });
    return best;
  }

  build(x: number, z: number, kind: number, by: number): boolean {
    if (this.phase === Phase.Won || this.phase === Phase.Lost) return false;
    const def = BUILDABLES[kind];
    if (!def || kind === Buildable.None || this.buttons < def.cost) return false;
    const i = this.nearestPad(x, z, false);
    if (i < 0) return false;
    this.buttons -= def.cost;
    this.pads[i] = { kind, hp: def.hp, cooldown: 0 };
    this.emit({ type: 'built', pad: i, kind, by });
    return true;
  }

  sell(x: number, z: number, by: number): boolean {
    const i = this.nearestPad(x, z, true);
    if (i < 0) return false;
    const pad = this.pads[i];
    const def = BUILDABLES[pad.kind];
    this.buttons += Math.floor((def.cost * 0.5 * pad.hp) / def.hp);
    this.pads[i] = { kind: Buildable.None, hp: 0, cooldown: 0 };
    this.emit({ type: 'built', pad: i, kind: Buildable.None, by });
    return true;
  }

  vote(id: number, humanIds: number[]): void {
    if (this.phase !== Phase.Build) return;
    this.ready.add(id);
    if (humanIds.every((h) => this.ready.has(h))) this.timer = Math.min(this.timer, 3);
  }

  /** Applies weapon damage; returns the reward if this killed the enemy. */
  damageEnemy(e: Enemy, damage: number, dir: Vec3, knockback: number): number {
    if (e.hp <= 0) return 0;
    e.hp -= damage;
    const def = ENEMIES[e.type];
    const mass = def.radius * def.radius * 4;
    e.kx += (dir[0] * knockback) / mass;
    e.kz += (dir[2] * knockback) / mass;
    if (e.hp > 0) return 0;
    this.buttons += def.reward;
    return def.reward;
  }

  // ------------------------------------------------------------ tick

  private host: CoopHost | null = null;

  private emit(e: GameEvent): void {
    this.host?.event(e);
  }

  update(dt: number, host: CoopHost, playerCount: number): void {
    this.host = host;
    this.time += dt;
    switch (this.phase) {
      case Phase.Build:
        this.timer -= dt;
        for (const c of this.cores) if (c.alive) c.shield = Math.min(CORE.shield, c.shield + CORE.shieldRegen * dt);
        if (this.timer <= 0) this.startWave(playerCount);
        break;
      case Phase.Wave:
        this.waveTime += dt;
        this.spawnDue(playerCount);
        if (this.queue.length === 0 && this.enemies.length === 0) this.endWave();
        break;
      case Phase.Won:
      case Phase.Lost:
        this.timer -= dt;
        if (this.timer <= 0) {
          this.reset();
          this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
        }
        break;
    }
    this.stepEnemies(dt, host);
    this.stepTurrets(dt, host);
    // Remove the dead after everyone had a chance to hit them this tick.
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private startWave(playerCount: number): void {
    this.phase = Phase.Wave;
    this.wave += 1;
    this.waveTime = 0;
    this.ready.clear();
    const n = Math.max(1, playerCount);
    const countScale = (0.6 + 0.4 * n) * 1.25;
    const spawns = this.world.coop.enemySpawns.length;
    this.queue = [];
    let rot = 0;
    for (const g of WAVES[this.wave - 1]) {
      const count = Math.max(1, Math.round(g.count * countScale));
      for (let i = 0; i < count; i++) {
        this.queue.push({ at: g.delay + i * g.interval, type: g.type, spawn: g.spawn >= 0 ? g.spawn : rot++ % spawns });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
  }

  private endWave(): void {
    this.buttons += 75 + 20 * this.wave;
    if (this.wave >= WAVES.length) {
      this.phase = Phase.Won;
      this.timer = END_SECONDS;
    } else {
      this.phase = Phase.Build;
      this.timer = BUILD_SECONDS;
    }
    this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
  }

  private spawnDue(playerCount: number): void {
    const hpScale = 0.7 + 0.3 * Math.max(1, playerCount);
    while (this.queue.length && this.queue[0].at <= this.waveTime && this.enemies.length < MAX_ALIVE) {
      const q = this.queue.shift()!;
      const def = ENEMIES[q.type];
      const sp = this.world.coop.enemySpawns[q.spawn];
      const alive = this.cores.map((c, i) => (c.alive ? i : -1)).filter((i) => i >= 0);
      const jitter = () => (Math.random() - 0.5) * 1.5;
      const hp = Math.round(def.hp * hpScale);
      this.enemies.push({
        id: this.nextEnemyId,
        type: q.type,
        x: sp[0] + jitter(), y: def.flying ? 1 : 0, z: sp[2] + jitter(),
        vx: 0, vz: 0, yaw: 0,
        hp, maxHp: hp,
        core: alive[Math.floor(Math.random() * alive.length)] ?? 0,
        node: -1, cooldown: 0, kx: 0, kz: 0,
      });
      this.nextEnemyId = (this.nextEnemyId % 65535) + 1;
    }
  }

  private damageCore(i: number, dmg: number): void {
    const c = this.cores[i];
    if (!c.alive) return;
    const absorbed = Math.min(c.shield, dmg);
    c.shield -= absorbed;
    c.hp -= dmg - absorbed;
    if (c.hp <= 0) {
      c.hp = 0;
      c.alive = false;
      this.emit({ type: 'coreDown', core: i });
      if (this.cores.every((k) => !k.alive)) {
        this.phase = Phase.Lost;
        this.timer = END_SECONDS;
        this.queue = [];
        this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
      }
    }
  }

  private damagePad(i: number, dmg: number): void {
    const p = this.pads[i];
    p.hp -= dmg;
    if (p.hp <= 0) {
      this.pads[i] = { kind: Buildable.None, hp: 0, cooldown: 0 };
      this.emit({ type: 'built', pad: i, kind: Buildable.None, by: 0 });
    }
  }

  private stepEnemies(dt: number, host: CoopHost): void {
    const players = host.livePlayers();
    const cores = this.world.coop.cores;
    const pads = this.world.coop.pads;
    const boxes = this.world.boxes;
    const aliveCores = this.cores.map((c, i) => (c.alive ? i : -1)).filter((i) => i >= 0);
    if (aliveCores.length === 0) return;

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const def = ENEMIES[e.type];
      if (!this.cores[e.core].alive) { e.core = aliveCores[e.id % aliveCores.length]; e.node = -1; }
      e.cooldown = Math.max(0, e.cooldown - dt);

      let slow = 1;
      if (!def.flying) {
        pads.forEach((p, i) => {
          if (this.pads[i].kind === Buildable.Mat && Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z) < MAT_RADIUS) slow = MAT_SLOW;
        });
      }

      // Pick a target: a nearby toy, else the Heartspool (via the flow field).
      let tx = cores[e.core][0];
      let tz = cores[e.core][2];
      let attack: (() => void) | null = null;
      const aggro = def.flying ? 4.5 : 3.5;
      let nearestPlayer: { id: number; x: number; y: number; z: number } | null = null;
      let nearestD = aggro;
      for (const p of players) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < nearestD && Math.abs(p.y - e.y) < 2.5) { nearestD = d; nearestPlayer = p; }
      }
      const dCore = Math.hypot(tx - e.x, tz - e.z);
      const reach = def.radius + CORE.radius + 0.5;
      if (nearestPlayer && nearestD < dCore) {
        tx = nearestPlayer.x; tz = nearestPlayer.z;
        if (nearestD < def.radius + 0.9) {
          const id = nearestPlayer.id;
          attack = () => host.damagePlayer(id, def.damage, e.type);
        }
      } else if (dCore < reach) {
        const ci = e.core;
        attack = () => this.damageCore(ci, def.damage);
      } else if (!def.flying) {
        if (e.node < 0) e.node = this.nav.nearest(e.x, e.z, boxes);
        if (e.node >= 0) {
          const n = this.nav.nodes[e.node];
          const next = this.nav.next[e.core][e.node];
          if (Math.hypot(n.x - e.x, n.z - e.z) < 1.1) e.node = next;
          if (e.node >= 0 && this.nav.dist[e.core][e.node] > 0) {
            tx = this.nav.nodes[e.node].x;
            tz = this.nav.nodes[e.node].z;
          }
        }
      }

      // Steering.
      const dx = tx - e.x, dz = tz - e.z;
      const dl = Math.hypot(dx, dz);
      const speed = attack ? 0 : def.speed * slow;
      const wx = dl > 1e-3 ? (dx / dl) * speed : 0;
      const wz = dl > 1e-3 ? (dz / dl) * speed : 0;
      const k = Math.min(1, dt * 8);
      e.vx += (wx - e.vx) * k;
      e.vz += (wz - e.vz) * k;
      e.x += (e.vx + e.kx) * dt;
      e.z += (e.vz + e.kz) * dt;
      const decay = Math.exp(-dt * 6);
      e.kx *= decay;
      e.kz *= decay;
      if (dl > 1e-3) e.yaw = Math.atan2(-dx, -dz);

      if (def.flying) {
        const alt = attack ? 1.2 : MOTH_ALTITUDE + Math.sin(this.time * 3 + e.id) * 0.4;
        e.y += (alt - e.y) * Math.min(1, dt * 2);
      } else {
        pushOutOfBoxes(e, def.radius, boxes);
        // Buildables: walls block, brutes smash whatever they touch.
        pads.forEach((p, i) => {
          const pad = this.pads[i];
          if (pad.kind === Buildable.None) return;
          const d = Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z);
          const blockR = pad.kind === Buildable.Wall ? WALL_RADIUS + def.radius : pad.kind === Buildable.Turret ? 0.6 + def.radius : 0;
          if (blockR > 0 && d < blockR && d > 1e-6) {
            e.x = p.pos[0] + ((e.x - p.pos[0]) / d) * blockR;
            e.z = p.pos[2] + ((e.z - p.pos[2]) / d) * blockR;
            if (!attack) attack = () => this.damagePad(i, def.damage);
          } else if (def.breaksBuildables && d < def.radius + 1.3 && !attack) {
            attack = () => this.damagePad(i, def.damage);
          }
        });
      }

      if (attack && e.cooldown <= 0) {
        attack();
        e.cooldown = 1 / def.attackRate;
      }
    }

    // Separation so crowds spread into a flowing line instead of one blob.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ra = ENEMIES[a.type].radius;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (ENEMIES[a.type].flying !== ENEMIES[b.type].flying) continue;
        const r = ra + ENEMIES[b.type].radius;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const push = (r - d) * 0.5;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        b.x += (dx / d) * push; b.z += (dz / d) * push;
      }
    }
  }

  private stepTurrets(dt: number, host: CoopHost): void {
    const pads = this.world.coop.pads;
    pads.forEach((p, i) => {
      const pad = this.pads[i];
      if (pad.kind !== Buildable.Turret) return;
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      if (pad.cooldown > 0) return;
      const from: Vec3 = [p.pos[0], TURRET.height, p.pos[2]];
      let target: Enemy | null = null;
      let best = TURRET.range;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const aim: Vec3 = [e.x, e.y + ENEMIES[e.type].height * 0.5, e.z];
        const d = Math.hypot(aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]);
        if (d < best && hasLineOfSight(from, aim, this.world.boxes)) { best = d; target = e; }
      }
      if (!target) return;
      pad.cooldown = 1 / TURRET.fireRate;
      const to: Vec3 = [target.x, target.y + ENEMIES[target.type].height * 0.5, target.z];
      const dir: Vec3 = [(to[0] - from[0]) / best, (to[1] - from[1]) / best, (to[2] - from[2]) / best];
      this.damageEnemy(target, TURRET.damage, dir, 0.3);
      host.shot({ id: TURRET_SHOT_BASE + i, hit: 0, head: false, enemy: true, to });
    });
  }
}
