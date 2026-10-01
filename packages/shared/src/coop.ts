import { STUCK_SECONDS, BOSS_STOMP, DRONE_DROP, DRUM, ENEMIES, JACK_POP, EnemyType, NavGrid, PTERO_SWOOP, pushOutOfBoxes, RAPTOR_LEAP, REX_ROAR, TRIKE_CHARGE, SNIP_CUT, SOLDIER_ACCURACY, type Enemy } from './enemies.ts';
import type { GameEvent, Shot } from './protocol.ts';
import { hasLineOfSight } from './raycast.ts';
import type { Vec3, World } from './world.ts';

/**
 * Co-op defence director (plan §5, §6.1, §9): build phase -> wave -> build
 * phase ... Heartspools have a shield and health; build pads take a
 * buildable (upgradable to tier 3) paid for with the team's buttons.
 * Blockades re-bake the invaders' flow fields, so players can maze them.
 */

export const Phase = { Build: 0, Wave: 1, Won: 2, Lost: 3 } as const;
export const Buildable = {
  None: 0, Turret: 1, Wall: 2, Mat: 3,
  /** Cheap stackable building-brick blockade. */
  Barricade: 4,
  /** Battery-powered zapper: chains a shock between nearby invaders. */
  Zapper: 5,
  /** One big snap on the first ground invader that steps on it. */
  Mousetrap: 6,
  /** Spring pad: launches toys up onto furniture. */
  Spring: 7,
  /** Healing Sewing Kit: re-stitches toys standing near it. */
  SewingKit: 8,
  /** Desk Fan: blows invaders back and drags flyers out of the air. */
  Fan: 9,
} as const;

export interface BuildableDef { name: string; short: string; cost: number; hp: number; blurb: string }
export const BUILDABLES: BuildableDef[] = [
  { name: '', short: '', cost: 0, hp: 0, blurb: '' },
  { name: 'Pom-Pom Turret', short: 'Turret', cost: 150, hp: 160, blurb: 'Auto-fires at the nearest invader' },
  { name: 'Pin Wall', short: 'Pin Wall', cost: 80, hp: 340, blurb: 'Tough blockade; invaders path around it' },
  { name: 'Tangle Mat', short: 'Tangle', cost: 100, hp: 220, blurb: 'Slows walkers by 60%' },
  { name: 'Brick Barricade', short: 'Bricks', cost: 50, hp: 220, blurb: 'Cheap blockade for mazing' },
  { name: 'Battery Zapper', short: 'Zapper', cost: 175, hp: 150, blurb: 'Chains shocks through up to 4 invaders' },
  { name: 'Mousetrap', short: 'Trap', cost: 90, hp: 120, blurb: 'Huge snap, then re-arms' },
  { name: 'Spring Pad', short: 'Spring', cost: 60, hp: 100, blurb: 'Launches toys up to high ground' },
  { name: 'Healing Sewing Kit', short: 'Sew Kit', cost: 120, hp: 130, blurb: 'Re-stitches toys standing nearby' },
  { name: 'Desk Fan', short: 'Fan', cost: 110, hp: 170, blurb: 'Blows invaders back; drags flyers down' },
];
/** Keys 1-9 in the build deck, in this order. */
export const DECK = [Buildable.Turret, Buildable.Wall, Buildable.Mat, Buildable.Barricade, Buildable.Zapper, Buildable.Mousetrap, Buildable.Spring, Buildable.SewingKit, Buildable.Fan];
export const MAX_TIER = 3;
/** Cost to take a buildable from `tier` to `tier + 1`. */
export function upgradeCost(kind: number, tier: number): number {
  return Math.ceil(BUILDABLES[kind].cost * 0.6 * tier / 5) * 5;
}
const tierHp = (tier: number) => 1 + 0.5 * (tier - 1);
const tierPower = (tier: number) => 1 + 0.4 * (tier - 1);

export const CORE = { hp: 600, shield: 250, shieldRegen: 18, radius: 0.7 };
export const TURRET = { range: 10, fireRate: 2.5, damage: 8, height: 1.3 };
export const ZAPPER = { range: 5.5, every: 1.2, damage: 18, targets: 4, height: 1.2 };
export const MOUSETRAP = { radius: 1.3, damage: 160, rearm: 6 };
export const SPRING = { radius: 1.1, launch: 17 };
/** Sewing kit: stitches per second healed for toys within radius (tiers heal faster). */
export const SEWKIT = { radius: 3.4, heal: 14 };
/**
 * Desk fan: every few seconds a gust blows invaders within radius away from
 * it (about a metre and a half), and slows flyers and knocks them down. It
 * delays a push; it can't hold one back forever.
 */
export const FAN = { radius: 6, gust: 8, every: 3.5, flyerSlow: 1.5, flyerDrop: 1.5 };
export const WALL_RADIUS = 1.1;
export const BARRICADE_RADIUS = 1.0;
export const MAT_RADIUS = 1.8;
export const MAT_SLOW = 0.4;
export const BUILD_RANGE = 2.6;
export const FIRST_BUILD_SECONDS = 40;
export const BUILD_SECONDS = 25;
export const END_SECONDS = 12;
export const MAX_ALIVE = 80;
/** Shot ids at or above this are buildables: id - TURRET_SHOT_BASE is the pad index. */
export const TURRET_SHOT_BASE = 128;
/** Shot id used for invader fire. */
export const ENEMY_SHOT_ID = 255;

// ---------------------------------------------------------------- difficulty and missions

export interface DifficultyDef { name: string; enemyHp: number; enemyCount: number; damageTaken: number; startButtons: number }
export const DIFFICULTIES: DifficultyDef[] = [
  { name: 'Cosy', enemyHp: 0.75, enemyCount: 0.8, damageTaken: 0.7, startButtons: 450 },
  { name: 'Scratchy', enemyHp: 1, enemyCount: 1, damageTaken: 1, startButtons: 350 },
  { name: 'Moth-eaten', enemyHp: 1.3, enemyCount: 1.2, damageTaken: 1.25, startButtons: 300 },
  { name: 'Unravelled', enemyHp: 1.7, enemyCount: 1.4, damageTaken: 1.5, startButtons: 250 },
];

/** Which campaign the waves come from. */
export const Mission = { Unraveller: 0, Stampede: 1 } as const;
export const MISSIONS = [
  { name: 'The Unraveller', blurb: "Baron von Ravel's Mass-Knit Army marches on the Heartspools." },
  { name: 'Dino Stampede', blurb: 'A herd of knitted dinosaurs breaks out of the toy box. Rex leads the charge.' },
];

export interface CoopOptions {
  /** Waves to win (5 skirmish, 10 mission with a boss); 0 = endless. */
  waves?: number;
  difficulty?: number;
  /** Mission.Unraveller (default) or Mission.Stampede. */
  mission?: number;
}

interface SpawnGroup { type: number; count: number; spawn: number; delay: number; interval: number }

const G = EnemyType.Grunt, S = EnemyType.Scuttler, M = EnemyType.Moth, B = EnemyType.Brute;
const T = EnemyType.Teeth, P = EnemyType.Top, O = EnemyType.Soldier, D = EnemyType.Drone, X = EnemyType.Snip, Z = EnemyType.Boss;
const R = EnemyType.Drummer, J = EnemyType.Jack;
const RA = EnemyType.Raptor, TR = EnemyType.Trike, PT = EnemyType.Ptero, RX = EnemyType.Rex;
const g = (type: number, count: number, delay = 0, interval = 1, spawn = -1): SpawnGroup => ({ type, count, spawn, delay, interval });

/** The ten waves of a full mission: each introduces something new, and the Unraveller closes it. */
export const WAVES: SpawnGroup[][] = [
  [g(G, 10, 0, 1.4)],
  [g(G, 10, 0, 1.2), g(T, 12, 6, 0.35)],
  [g(G, 12, 0, 1.0), g(S, 8, 6, 0.8), g(M, 6, 4, 1.0)],
  [g(G, 10, 0, 1.0), g(O, 6, 3, 1.6), g(T, 20, 8, 0.2)],
  [g(G, 14, 0, 0.8), g(P, 6, 4, 1.2), g(M, 8, 8, 0.8), g(B, 1, 15)],
  [g(O, 8, 0, 1.2), g(X, 3, 6, 3), g(T, 24, 4, 0.2), g(S, 10, 12, 0.5), g(J, 3, 10, 3)],
  [g(G, 16, 0, 0.8), g(R, 1, 4), g(D, 3, 6, 4), g(M, 10, 10, 0.7), g(P, 8, 14, 0.9)],
  [g(B, 2, 0, 8), g(X, 4, 4, 3), g(O, 10, 6, 1), g(T, 30, 10, 0.15), g(J, 4, 8, 2)],
  [g(G, 20, 0, 0.7), g(R, 2, 3, 8), g(D, 4, 5, 4), g(P, 10, 8, 0.8), g(M, 12, 12, 0.6), g(B, 2, 18, 6)],
  [g(Z, 1, 4, 1, 0), g(G, 14, 0, 1), g(T, 30, 10, 0.2), g(O, 8, 16, 1.4), g(X, 3, 24, 4), g(R, 2, 12, 6), g(J, 3, 20, 3)],
];
/** A skirmish is five waves; its last wave brings a Brute pack instead of the boss. */
const SKIRMISH: SpawnGroup[][] = [WAVES[0], WAVES[1], WAVES[2], WAVES[3],
  [g(G, 18, 0, 0.7), g(S, 12, 4, 0.4), g(M, 10, 8, 0.6), g(B, 3, 12, 5), g(O, 6, 6, 1.5), g(J, 2, 10, 3)]];

/** Dino Stampede: raptor packs, swooping pteros and charging trikes, then Rex. */
export const STAMPEDE: SpawnGroup[][] = [
  [g(RA, 6, 0, 1.4), g(G, 6, 2, 1.2)],
  [g(RA, 12, 0, 0.8), g(T, 12, 6, 0.3)],
  [g(PT, 6, 0, 1.4), g(RA, 10, 4, 0.8), g(G, 8, 2, 1)],
  [g(TR, 1, 4), g(RA, 14, 0, 0.7), g(O, 6, 8, 1.5)],
  [g(PT, 10, 0, 0.9), g(TR, 2, 6, 8), g(RA, 16, 2, 0.6)],
  [g(RA, 20, 0, 0.5), g(J, 3, 6, 3), g(PT, 8, 10, 1), g(X, 3, 8, 3)],
  [g(TR, 3, 0, 6), g(RA, 18, 4, 0.5), g(R, 2, 2, 6), g(PT, 10, 8, 0.8)],
  [g(RA, 26, 0, 0.4), g(PT, 12, 4, 0.7), g(TR, 3, 10, 6), g(D, 3, 8, 4)],
  [g(TR, 4, 0, 5), g(RA, 30, 2, 0.35), g(PT, 14, 6, 0.6), g(B, 2, 14, 6)],
  [g(RX, 1, 4, 1, 0), g(RA, 24, 0, 0.6), g(PT, 12, 8, 0.8), g(TR, 3, 16, 7)],
];
const STAMPEDE_SKIRMISH: SpawnGroup[][] = [STAMPEDE[0], STAMPEDE[1], STAMPEDE[2], STAMPEDE[3],
  [g(TR, 3, 0, 5), g(RA, 24, 2, 0.4), g(PT, 12, 6, 0.6)]];

/** Endless: loop the mission waves, each loop tougher, a boss every tenth wave. */
function endlessWave(n: number, table: SpawnGroup[][]): { groups: SpawnGroup[]; hp: number; count: number } {
  const loop = Math.floor((n - 1) / table.length);
  return { groups: table[(n - 1) % table.length], hp: 1 + loop * 0.45, count: 1 + loop * 0.3 };
}

export interface CoreState { hp: number; shield: number; alive: boolean }
export interface PadState { kind: number; tier: number; hp: number; cooldown: number }

/** What the director needs from the room it lives in. */
export interface CoopHost {
  /** Standing toys only (downed toys are ignored by invaders). */
  livePlayers(): { id: number; x: number; y: number; z: number }[];
  damagePlayer(id: number, damage: number, enemyType: number, push?: [number, number]): void;
  /** Heal a toy (sewing kits). */
  healPlayer?(id: number, amount: number): void;
  shot(s: Shot): void;
  event(e: GameEvent): void;
  /** An invader just unravelled (for drops). */
  enemyDied?(e: Enemy, byPlayer: boolean): void;
}

interface Pending { at: number; type: number; spawn: number }

export class CoopDirector {
  readonly nav: NavGrid;
  readonly waves: number;
  readonly difficulty: number;
  readonly mission: number;
  phase: number = Phase.Build;
  /** Wave number shown to players, 1-based; 0 before the first wave. */
  wave = 0;
  timer = FIRST_BUILD_SECONDS;
  buttons = 0;
  cores: CoreState[] = [];
  pads: PadState[] = [];
  enemies: Enemy[] = [];
  readonly ready = new Set<number>();
  /** Spring pads (built ones) for movement; kept in sync with pads. */
  readonly springs: { x: number; z: number; r: number; launch: number }[] = [];
  private queue: Pending[] = [];
  private waveTime = 0;
  private nextEnemyId = 1;
  private time = 0;
  private waveHp = 1;
  private navDirty = false;
  private killedByPlayer = new Set<number>();

  constructor(readonly world: World, options: CoopOptions = {}) {
    this.waves = options.waves ?? 10;
    this.difficulty = Math.max(0, Math.min(DIFFICULTIES.length - 1, options.difficulty ?? 1));
    this.mission = options.mission === Mission.Stampede ? Mission.Stampede : Mission.Unraveller;
    this.nav = new NavGrid(world);
    this.reset();
  }

  /** 0 means endless. */
  get totalWaves(): number {
    return this.waves;
  }

  get diff(): DifficultyDef {
    return DIFFICULTIES[this.difficulty];
  }

  reset(): void {
    this.phase = Phase.Build;
    this.wave = 0;
    this.timer = FIRST_BUILD_SECONDS;
    this.buttons = this.diff.startButtons;
    this.cores = this.world.coop.cores.map(() => ({ hp: CORE.hp, shield: CORE.shield, alive: true }));
    this.pads = this.world.coop.pads.map(() => ({ kind: Buildable.None, tier: 0, hp: 0, cooldown: 0 }));
    this.enemies = [];
    this.queue = [];
    this.ready.clear();
    this.onPadsChanged();
  }

  // ------------------------------------------------------------ player actions

  private nearestPad(x: number, z: number): number {
    let best = -1;
    let bestD = BUILD_RANGE;
    this.world.coop.pads.forEach((p, i) => {
      const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** Builds `kind` on the nearest empty pad, or upgrades it if the pad already holds that kind. */
  build(x: number, z: number, kind: number, by: number): boolean {
    if (this.phase === Phase.Won || this.phase === Phase.Lost) return false;
    const def = BUILDABLES[kind];
    if (!def || kind === Buildable.None) return false;
    const i = this.nearestPad(x, z);
    if (i < 0) return false;
    const pad = this.pads[i];
    if (pad.kind === Buildable.None) {
      if (this.buttons < def.cost) return false;
      this.buttons -= def.cost;
      this.pads[i] = { kind, tier: 1, hp: def.hp, cooldown: 0 };
    } else if (pad.kind === kind && pad.tier < MAX_TIER) {
      const cost = upgradeCost(kind, pad.tier);
      if (this.buttons < cost) return false;
      this.buttons -= cost;
      const frac = pad.hp / (def.hp * tierHp(pad.tier));
      pad.tier += 1;
      pad.hp = def.hp * tierHp(pad.tier) * Math.max(frac, 0.5);
    } else {
      return false;
    }
    this.emit({ type: 'built', pad: i, kind, by, tier: this.pads[i].tier });
    this.onPadsChanged();
    return true;
  }

  sell(x: number, z: number, by: number): boolean {
    const i = this.nearestPad(x, z);
    if (i < 0) return false;
    const pad = this.pads[i];
    if (pad.kind === Buildable.None) return false;
    const def = BUILDABLES[pad.kind];
    let spent = def.cost;
    for (let t = 1; t < pad.tier; t++) spent += upgradeCost(pad.kind, t);
    this.buttons += Math.floor((spent * 0.5 * pad.hp) / (def.hp * tierHp(pad.tier)));
    this.pads[i] = { kind: Buildable.None, tier: 0, hp: 0, cooldown: 0 };
    this.emit({ type: 'built', pad: i, kind: Buildable.None, by, tier: 0 });
    this.onPadsChanged();
    return true;
  }

  vote(id: number, humanIds: number[]): void {
    if (this.phase !== Phase.Build) return;
    this.ready.add(id);
    if (humanIds.every((h) => this.ready.has(h))) this.timer = Math.min(this.timer, 3);
  }

  /** Applies weapon damage; returns the reward if this killed the enemy. */
  damageEnemy(e: Enemy, damage: number, dir: Vec3, knockback: number, byPlayer = true): number {
    if (e.hp <= 0) return 0;
    e.hp -= damage;
    const def = ENEMIES[e.type];
    const mass = def.radius * def.radius * 4 * (def.boss ? 6 : 1);
    e.kx += (dir[0] * knockback) / mass;
    e.kz += (dir[2] * knockback) / mass;
    if (e.hp > 0) return 0;
    if (byPlayer) this.killedByPlayer.add(e.id);
    this.buttons += def.reward;
    return def.reward;
  }

  /** Yarn-ball tangle: half speed for a while. */
  tangle(e: Enemy, seconds: number): void {
    e.slow = Math.max(e.slow, ENEMIES[e.type].boss ? seconds * 0.4 : seconds);
  }

  /** The strongest invader alive that is a boss, for the boss health bar. */
  boss(): Enemy | null {
    return this.enemies.find((e) => e.hp > 0 && ENEMIES[e.type].boss) ?? null;
  }

  private onPadsChanged(): void {
    this.springs.length = 0;
    this.world.coop.pads.forEach((p, i) => {
      const pad = this.pads[i];
      if (pad?.kind === Buildable.Spring) this.springs.push({ x: p.pos[0], z: p.pos[2], r: SPRING.radius, launch: SPRING.launch + (pad.tier - 1) * 2.5 });
    });
    this.navDirty = true;
  }

  private rebakeNav(): void {
    const blockers: { x: number; z: number; r: number }[] = [];
    this.world.coop.pads.forEach((p, i) => {
      const k = this.pads[i].kind;
      if (k === Buildable.Wall || k === Buildable.Barricade) blockers.push({ x: p.pos[0], z: p.pos[2], r: 1.9 });
    });
    this.nav.rebake(blockers);
    for (const e of this.enemies) e.node = -1;
    this.navDirty = false;
  }

  // ------------------------------------------------------------ tick

  private host: CoopHost | null = null;

  private emit(e: GameEvent): void {
    this.host?.event(e);
  }

  update(dt: number, host: CoopHost, playerCount: number): void {
    this.host = host;
    this.time += dt;
    if (this.navDirty) this.rebakeNav();
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
    this.stepBuildables(dt, host);
    // Remove the dead after everyone had a chance to hit them this tick.
    const before = this.enemies;
    this.enemies = before.filter((e) => e.hp > 0);
    if (this.enemies.length !== before.length) {
      for (const e of before) {
        if (e.hp > 0) continue;
        host.enemyDied?.(e, this.killedByPlayer.has(e.id));
        if (ENEMIES[e.type].boss) this.emit({ type: 'boss', state: 'down' });
      }
      this.killedByPlayer.clear();
    }
  }

  private startWave(playerCount: number): void {
    this.phase = Phase.Wave;
    this.wave += 1;
    this.waveTime = 0;
    this.ready.clear();
    const n = Math.max(1, playerCount);
    let groups: SpawnGroup[];
    let countScale = (0.6 + 0.4 * n) * 1.25 * this.diff.enemyCount;
    this.waveHp = 1;
    if (this.waves === 0) {
      const w = endlessWave(this.wave, this.mission === Mission.Stampede ? STAMPEDE : WAVES);
      groups = w.groups;
      countScale *= w.count;
      this.waveHp = w.hp;
    } else {
      const table = this.mission === Mission.Stampede ? (this.waves <= 5 ? STAMPEDE_SKIRMISH : STAMPEDE) : this.waves <= 5 ? SKIRMISH : WAVES;
      groups = table[Math.min(this.wave, table.length) - 1];
    }
    const spawns = this.world.coop.enemySpawns.length;
    this.queue = [];
    let rot = 0;
    for (const grp of groups) {
      // Swarms scale gently with team size (a swarm is already a crowd).
      const scale = grp.type === EnemyType.Teeth ? Math.sqrt(countScale) : countScale;
      const count = ENEMIES[grp.type].boss ? grp.count : Math.max(1, Math.round(grp.count * scale));
      for (let i = 0; i < count; i++) {
        this.queue.push({ at: grp.delay + i * grp.interval, type: grp.type, spawn: grp.spawn >= 0 ? grp.spawn % spawns : rot++ % spawns });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
  }

  private endWave(): void {
    this.buttons += 75 + 20 * Math.min(this.wave, 12);
    if (this.waves > 0 && this.wave >= this.waves) {
      this.phase = Phase.Won;
      this.timer = END_SECONDS;
    } else {
      this.phase = Phase.Build;
      this.timer = BUILD_SECONDS;
    }
    this.emit({ type: 'phase', phase: this.phase, wave: this.wave });
  }

  private spawnEnemy(type: number, x: number, y: number, z: number, hpScale: number): Enemy {
    const def = ENEMIES[type];
    const alive = this.cores.map((c, i) => (c.alive ? i : -1)).filter((i) => i >= 0);
    const hp = Math.round(def.hp * hpScale);
    const e: Enemy = {
      id: this.nextEnemyId, type, x, y, z, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp,
      core: alive[Math.floor(Math.random() * alive.length)] ?? 0,
      node: -1, cooldown: 0, kx: 0, kz: 0, slow: 0,
      special: type === EnemyType.Drone ? DRONE_DROP.every * 0.5 : def.boss ? BOSS_STOMP.every : type === EnemyType.Jack ? 1.5
        : type === EnemyType.Raptor ? 1 + Math.random() * 2 : type === EnemyType.Trike ? 3 : 0,
      rush: 0,
      roar: type === EnemyType.Rex ? 3 : 0,
    };
    this.enemies.push(e);
    this.nextEnemyId = (this.nextEnemyId % 65535) + 1;
    if (def.boss) this.emit({ type: 'boss', state: 'arrive' });
    return e;
  }

  private spawnDue(playerCount: number): void {
    const hpScale = (0.7 + 0.3 * Math.max(1, playerCount)) * this.diff.enemyHp * this.waveHp;
    while (this.queue.length && this.queue[0].at <= this.waveTime && this.enemies.length < MAX_ALIVE) {
      const q = this.queue.shift()!;
      const def = ENEMIES[q.type];
      const sp = this.world.coop.enemySpawns[q.spawn];
      const jitter = () => (Math.random() - 0.5) * 1.5;
      this.spawnEnemy(q.type, sp[0] + jitter(), def.flying ? 1 : 0, sp[2] + jitter(), hpScale);
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
    if (p.kind === Buildable.None) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      this.pads[i] = { kind: Buildable.None, tier: 0, hp: 0, cooldown: 0 };
      this.emit({ type: 'built', pad: i, kind: Buildable.None, by: 0, tier: 0 });
      this.onPadsChanged();
    }
  }

  private stepEnemies(dt: number, host: CoopHost): void {
    const players = host.livePlayers();
    const cores = this.world.coop.cores;
    const pads = this.world.coop.pads;
    const boxes = this.world.boxes;
    const aliveCores = this.cores.map((c, i) => (c.alive ? i : -1)).filter((i) => i >= 0);
    if (aliveCores.length === 0) return;
    const spawned: Enemy[] = [];
    const drummers = this.enemies.filter((d) => d.hp > 0 && d.type === EnemyType.Drummer);

    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const def = ENEMIES[e.type];
      const sx = e.x, sz = e.z;
      if (!this.cores[e.core].alive) { e.core = aliveCores[e.id % aliveCores.length]; e.node = -1; }
      e.cooldown = Math.max(0, e.cooldown - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.special -= dt;
      e.rush = Math.max(0, (e.rush ?? 0) - dt);

      let slow = e.slow > 0 ? 0.5 : 1;
      // Charging trikes and dinos rushing after a Rex roar.
      if (e.rush > 0) slow *= e.type === EnemyType.Trike ? TRIKE_CHARGE.boost : REX_ROAR.boost;
      // Marching to the drum: faster within earshot of a Tin Drummer.
      if (e.type !== EnemyType.Drummer && drummers.some((d) => Math.hypot(d.x - e.x, d.z - e.z) < DRUM.radius)) slow *= DRUM.boost;
      if (!def.flying) {
        pads.forEach((p, i) => {
          if (this.pads[i].kind === Buildable.Mat && Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z) < MAT_RADIUS) slow = Math.min(slow, MAT_SLOW / tierPower(this.pads[i].tier));
        });
      }

      // Pick a target: a nearby toy, else the Heartspool (via the flow field).
      let tx = cores[e.core][0];
      let tz = cores[e.core][2];
      let attack: (() => void) | null = null;
      let hold = false;
      // Pteros spot toys from high up and swoop; raptors hunt from further off than toys do.
      const ptero = e.type === EnemyType.Ptero;
      const aggro = ptero ? PTERO_SWOOP.range : e.type === EnemyType.Raptor ? 7 : def.flying ? 4.5 : 3.5;
      const reachY = ptero ? 9 : 2.5;
      let nearestPlayer: { id: number; x: number; y: number; z: number } | null = null;
      let nearestD = aggro;
      for (const p of players) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < nearestD && Math.abs(p.y - e.y) < reachY) { nearestD = d; nearestPlayer = p; }
      }
      const dCore = Math.hypot(tx - e.x, tz - e.z);
      const reach = def.radius + CORE.radius + 0.5;
      const knock = (px: number, pz: number): [number, number] | undefined => {
        if (!def.knockback) return undefined;
        const l = Math.hypot(px - e.x, pz - e.z) || 1;
        return [((px - e.x) / l) * def.knockback, ((pz - e.z) / l) * def.knockback];
      };

      // Scissor snips hunt buildables first.
      let snipPad = -1;
      if (def.cutsBuildables) {
        let best = 30;
        pads.forEach((p, i) => {
          if (this.pads[i].kind === Buildable.None) return;
          const d = Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z);
          if (d < best) { best = d; snipPad = i; }
        });
      }

      if (def.range) {
        // Tin soldiers: stop in range of a toy (or the Heartspool) they can see, and shoot.
        const eye: Vec3 = [e.x, e.y + def.height * 0.8, e.z];
        let target: { id: number; x: number; y: number; z: number } | null = null;
        let best = def.range;
        for (const p of players) {
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < best && hasLineOfSight(eye, [p.x, p.y + 1, p.z], boxes)) { best = d; target = p; }
        }
        if (target) {
          const tgt = target;
          hold = true;
          tx = tgt.x; tz = tgt.z;
          attack = () => {
            const hit = Math.random() < SOLDIER_ACCURACY;
            const miss = hit ? 0 : 0.8;
            const to: Vec3 = [tgt.x + (Math.random() - 0.5) * miss * 2, tgt.y + 0.9 + (Math.random() - 0.5) * miss, tgt.z + (Math.random() - 0.5) * miss * 2];
            host.shot({ id: ENEMY_SHOT_ID, hit: hit ? tgt.id : 0, head: false, enemy: false, kind: ShotKind.Enemy, from: eye, to });
            if (hit) host.damagePlayer(tgt.id, def.damage, e.type);
          };
        } else if (dCore < def.range && hasLineOfSight(eye, [tx, 1, tz], boxes)) {
          hold = true;
          const ci = e.core;
          attack = () => {
            host.shot({ id: ENEMY_SHOT_ID, hit: 0, head: false, enemy: false, kind: ShotKind.Enemy, from: eye, to: [tx, 1, tz] });
            this.damageCore(ci, def.damage);
          };
        }
      }

      if (!attack && snipPad >= 0) {
        const p = pads[snipPad].pos;
        tx = p[0]; tz = p[2];
        if (Math.hypot(p[0] - e.x, p[2] - e.z) < def.radius + 1.4) {
          const pi = snipPad;
          attack = () => this.damagePad(pi, SNIP_CUT);
        }
      } else if (!attack && nearestPlayer && nearestD < dCore) {
        tx = nearestPlayer.x; tz = nearestPlayer.z;
        if (nearestD < def.radius + 0.9 && (!ptero || Math.abs(nearestPlayer.y + 1 - e.y) < 1.6)) {
          const np = nearestPlayer;
          attack = () => host.damagePlayer(np.id, def.damage, e.type, knock(np.x, np.z));
        }
      } else if (!attack && dCore < reach) {
        const ci = e.core;
        attack = () => this.damageCore(ci, def.damage);
      } else if (!attack && !def.flying && snipPad < 0) {
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

      // Specials: drones drop teeth, the boss stomps.
      if (e.type === EnemyType.Drone && e.special <= 0) {
        e.special = DRONE_DROP.every;
        for (let k = 0; k < DRONE_DROP.count && this.enemies.length + spawned.length < MAX_ALIVE; k++) {
          const t = this.spawnEnemyDeferred(EnemyType.Teeth, e.x + (Math.random() - 0.5), 0, e.z + (Math.random() - 0.5), e.maxHp / def.hp);
          spawned.push(t);
        }
      }
      if (e.type === EnemyType.Drummer && e.special <= 0) {
        e.special = DRUM.every;
        this.emit({ type: 'drum', x: e.x, z: e.z });
      }
      if (e.type === EnemyType.Jack && e.special <= 0) {
        let prey: (typeof players)[number] | null = null;
        let best = JACK_POP.range;
        for (const p of players) {
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < best && Math.abs(p.y - e.y) < 2.5) { best = d; prey = p; }
        }
        if (prey) {
          e.special = JACK_POP.every;
          this.emit({ type: 'pop', x: e.x, z: e.z });
          const l = best || 1;
          e.kx = ((prey.x - e.x) / l) * JACK_POP.lunge;
          e.kz = ((prey.z - e.z) / l) * JACK_POP.lunge;
          for (const p of players) {
            const d = Math.hypot(p.x - e.x, p.z - e.z);
            if (d < JACK_POP.radius + 1 && Math.abs(p.y - e.y) < 2.5) host.damagePlayer(p.id, JACK_POP.damage * (1 - (d / (JACK_POP.radius + 1)) * 0.5), e.type, knock(p.x, p.z));
          }
        }
      }
      if (e.type === EnemyType.Raptor && e.special <= 0 && nearestPlayer && nearestD > RAPTOR_LEAP.min && nearestD < RAPTOR_LEAP.range) {
        e.special = RAPTOR_LEAP.every;
        e.kx = ((nearestPlayer.x - e.x) / nearestD) * RAPTOR_LEAP.lunge;
        e.kz = ((nearestPlayer.z - e.z) / nearestD) * RAPTOR_LEAP.lunge;
        this.emit({ type: 'dino', act: 'leap', x: e.x, z: e.z });
      }
      if (e.type === EnemyType.Trike && e.special <= 0 && e.rush <= 0) {
        // Charge the nearest toy in range; the charge carries it straight through.
        let prey: (typeof players)[number] | null = null;
        let best = TRIKE_CHARGE.range;
        for (const p of players) {
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < best && Math.abs(p.y - e.y) < 2.5) { best = d; prey = p; }
        }
        if (prey) {
          e.special = TRIKE_CHARGE.every;
          e.rush = TRIKE_CHARGE.duration;
          this.emit({ type: 'dino', act: 'charge', x: e.x, z: e.z });
        }
      }
      if (e.type === EnemyType.Trike && e.rush > 0) {
        let prey: (typeof players)[number] | null = null;
        let best = TRIKE_CHARGE.range;
        for (const p of players) {
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < best && Math.abs(p.y - e.y) < 2.5) { best = d; prey = p; }
        }
        if (prey && !attack) { tx = prey.x; tz = prey.z; }
      }
      if (e.type === EnemyType.Rex) {
        e.roar = (e.roar ?? 0) - dt;
        if (e.roar <= 0) {
          e.roar = REX_ROAR.every;
          this.emit({ type: 'dino', act: 'roar', x: e.x, z: e.z });
          for (const o of this.enemies) {
            if (o !== e && o.hp > 0 && ENEMIES[o.type].dino && Math.hypot(o.x - e.x, o.z - e.z) < REX_ROAR.radius) o.rush = Math.max(o.rush ?? 0, REX_ROAR.rush);
          }
        }
      }
      if (def.boss && e.special <= 0) {
        e.special = BOSS_STOMP.every;
        this.emit({ type: 'stomp', x: e.x, z: e.z });
        for (const p of players) {
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < BOSS_STOMP.radius) host.damagePlayer(p.id, BOSS_STOMP.damage * (1 - d / BOSS_STOMP.radius * 0.5), e.type, knock(p.x, p.z));
        }
        pads.forEach((p, i) => {
          if (Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z) < BOSS_STOMP.radius) this.damagePad(i, BOSS_STOMP.damage * 2);
        });
      }

      // Steering.
      const dx = tx - e.x, dz = tz - e.z;
      const dl = Math.hypot(dx, dz);
      const speed = attack || hold ? 0 : def.speed * slow;
      let wx = dl > 1e-3 ? (dx / dl) * speed : 0;
      let wz = dl > 1e-3 ? (dz / dl) * speed : 0;
      if (e.type === EnemyType.Top && dl > 1e-3) {
        // Spinning tops wobble across their path.
        const wob = Math.sin(this.time * 3.5 + e.id) * speed * 0.7;
        wx += (-dz / dl) * wob;
        wz += (dx / dl) * wob;
      }
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
        const cruise = def.altitude ?? 3.2;
        // Pteros swoop: lower the closer they get to their toy.
        const alt = ptero && nearestPlayer ? Math.max(nearestPlayer.y + 1, Math.min(cruise, nearestPlayer.y + 1 + (nearestD - def.radius) * 0.6))
          : attack ? Math.min(cruise, 1.2 + (e.type === EnemyType.Drone ? 2 : 0)) : cruise + Math.sin(this.time * 3 + e.id) * 0.4;
        e.y += (alt - e.y) * Math.min(1, dt * (ptero ? 3.5 : 2));
      } else {
        pushOutOfBoxes(e, def.radius, boxes);
        // Buildables: walls and barricades block; brutes and the boss smash whatever they touch.
        pads.forEach((p, i) => {
          const pad = this.pads[i];
          if (pad.kind === Buildable.None) return;
          const d = Math.hypot(p.pos[0] - e.x, p.pos[2] - e.z);
          const blockR = pad.kind === Buildable.Wall ? WALL_RADIUS + def.radius
            : pad.kind === Buildable.Barricade ? BARRICADE_RADIUS + def.radius
            : pad.kind === Buildable.Turret || pad.kind === Buildable.Zapper ? 0.6 + def.radius : 0;
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
      // Wedged somewhere it can't get out of, and not fighting: after a while it just falls apart.
      const moving = Math.hypot(e.x - sx, e.z - sz) > def.speed * 0.15 * dt;
      e.stuck = attack || hold || moving ? 0 : (e.stuck ?? 0) + dt;
      if (e.stuck > STUCK_SECONDS) e.hp = 0;
    }
    this.enemies.push(...spawned);

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

  /** Like spawnEnemy, but returns the enemy for the caller to add (safe while iterating). */
  private spawnEnemyDeferred(type: number, x: number, y: number, z: number, hpScale: number): Enemy {
    const e = this.spawnEnemy(type, x, y, z, hpScale);
    this.enemies.pop();
    return e;
  }

  private stepBuildables(dt: number, host: CoopHost): void {
    const pads = this.world.coop.pads;
    pads.forEach((p, i) => {
      const pad = this.pads[i];
      if (pad.kind === Buildable.None) return;
      pad.cooldown = Math.max(0, pad.cooldown - dt);
      if (pad.cooldown > 0) return;
      const power = tierPower(pad.tier);
      if (pad.kind === Buildable.Turret) {
        const from: Vec3 = [p.pos[0], TURRET.height, p.pos[2]];
        let target: Enemy | null = null;
        let best = TURRET.range + (pad.tier - 1);
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          const aim: Vec3 = [e.x, e.y + ENEMIES[e.type].height * 0.5, e.z];
          const d = Math.hypot(aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]);
          if (d < best && hasLineOfSight(from, aim, this.world.boxes)) { best = d; target = e; }
        }
        if (!target) return;
        pad.cooldown = 1 / (TURRET.fireRate * power);
        const to: Vec3 = [target.x, target.y + ENEMIES[target.type].height * 0.5, target.z];
        const dir: Vec3 = [(to[0] - from[0]) / best, (to[1] - from[1]) / best, (to[2] - from[2]) / best];
        this.damageEnemy(target, TURRET.damage * power, dir, 0.3, false);
        host.shot({ id: TURRET_SHOT_BASE + i, hit: 0, head: false, enemy: true, kind: ShotKind.Hitscan, to });
      } else if (pad.kind === Buildable.Zapper) {
        // Chain: pad -> nearest -> nearest to that ... up to 4 invaders in range.
        let from: Vec3 = [p.pos[0], ZAPPER.height, p.pos[2]];
        const hit = new Set<Enemy>();
        for (let n = 0; n < ZAPPER.targets + pad.tier - 1; n++) {
          let best: Enemy | null = null;
          let bestD = n === 0 ? ZAPPER.range : ZAPPER.range * 0.7;
          for (const e of this.enemies) {
            if (e.hp <= 0 || hit.has(e)) continue;
            const d = Math.hypot(e.x - from[0], e.y + 0.4 - from[1], e.z - from[2]);
            if (d < bestD) { bestD = d; best = e; }
          }
          if (!best) break;
          hit.add(best);
          const to: Vec3 = [best.x, best.y + ENEMIES[best.type].height * 0.5, best.z];
          host.shot({ id: TURRET_SHOT_BASE + i, hit: 0, head: false, enemy: true, kind: ShotKind.Zap, from, to });
          this.damageEnemy(best, ZAPPER.damage * power, [0, 0, 0], 0, false);
          best.slow = Math.max(best.slow, 0.4);
          from = to;
        }
        if (hit.size > 0) pad.cooldown = ZAPPER.every / power;
      } else if (pad.kind === Buildable.SewingKit) {
        const r = SEWKIT.radius + (pad.tier - 1) * 0.6;
        for (const t of host.livePlayers()) {
          if (Math.hypot(t.x - p.pos[0], t.z - p.pos[2]) < r && Math.abs(t.y - p.pos[1]) < 3) host.healPlayer?.(t.id, SEWKIT.heal * power * dt);
        }
      } else if (pad.kind === Buildable.Fan) {
        const r = FAN.radius + (pad.tier - 1);
        let blew = false;
        for (const e of this.enemies) {
          const def = ENEMIES[e.type];
          if (e.hp <= 0) continue;
          const dx = e.x - p.pos[0], dz = e.z - p.pos[2];
          const d = Math.hypot(dx, dz);
          if (d > r || d < 1e-3) continue;
          blew = true;
          // Strongest up close; bosses, brutes and trikes barely budge.
          const heavy = def.boss || e.type === EnemyType.Brute || e.type === EnemyType.Trike ? 0.2 : 1;
          const k = FAN.gust * heavy * (1 - (d / r) * 0.5);
          const nx = dx / d, nz = dz / d;
          // Push outwards, unless something is already flinging it away faster.
          if (e.kx * nx + e.kz * nz < k) { e.kx = nx * k; e.kz = nz * k; }
          if (def.flying) { e.slow = Math.max(e.slow, FAN.flyerSlow); e.y = Math.max(0.6, e.y - FAN.flyerDrop * heavy); }
        }
        if (blew) pad.cooldown = FAN.every / power;
      } else if (pad.kind === Buildable.Mousetrap) {
        for (const e of this.enemies) {
          const def = ENEMIES[e.type];
          if (e.hp <= 0 || def.flying || Math.hypot(e.x - p.pos[0], e.z - p.pos[2]) > MOUSETRAP.radius + def.radius) continue;
          const dmg = MOUSETRAP.damage * power * (def.boss || e.type === EnemyType.Brute ? 0.4 : 1);
          this.damageEnemy(e, dmg, [0, 1, 0], 0, false);
          this.emit({ type: 'snap', pad: i });
          pad.cooldown = MOUSETRAP.rearm;
          break;
        }
      }
    });
  }
}

/** Shot kinds (see protocol Shot.kind). */
export const ShotKind = { Hitscan: 0, Blast: 1, Zap: 2, Enemy: 3 } as const;
