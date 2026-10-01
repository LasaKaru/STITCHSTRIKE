import { HISTORY_MS, INPUT_DT, MAX_PLAYERS, MAX_REWIND_MS, PLAYER, TICK_DT, TICK_RATE } from './constants.ts';
import { BUILDABLES, CORE, CoopDirector, Phase, ShotKind, type CoopHost, type CoopOptions } from './coop.ts';
import { ENEMIES, NavGrid, type Enemy } from './enemies.ts';
import { Action, Buttons, createPlayerState, EMOTE_COOLDOWN, EMOTES, eyePosition, fitsAt, lookDirection, stepPlayer, type InputCmd, type PlayerState } from './movement.ts';
import { ENTER_RANGE, RAM_COOLDOWN, RAM_MIN_SPEED, VEHICLES, type NetVehicle } from './vehicles.ts';
import { DROP_CHANCE, DROP_SECONDS, MAX_DROPS, PICKUP_RADIUS, PickupKind, PICKUPS, POWER_MULTIPLIER, type Drop } from './pickups.ts';
import { isTeamMode, type CoopState, type GameEvent, type GameMode, type Look, type NetDrop, type NetPlayer, type NetProjectile, type RosterEntry, type Shot, type Snapshot } from './protocol.ts';
import { KothDirector, type KothState } from './koth.ts';
import { CtyDirector, ctyBases, type CtyState } from './cty.ts';
import { hasLineOfSight, rayBox, rayPlayer, rayWorld } from './raycast.ts';
import { launchProjectile, pelletDirections, stepProjectile, WEAPONS, type Projectile } from './weapons.ts';
import type { Vec3, World } from './world.ts';

export interface RoomPlayer {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  /** Team Deathmatch side. */
  team: number;
  /** Seconds until this toy may emote again. */
  emoteCd: number;
  look?: Look;
  state: PlayerState;
  health: number;
  armor: number;
  alive: boolean;
  respawnTimer: number;
  /** Seconds since this player last took damage (drives Stitch-up regeneration). */
  sinceHurt: number;
  /** Remaining spawn protection, seconds. */
  protect: number;
  /** Co-op: seconds left before a downed toy bleeds out (0 = standing). */
  bleed: number;
  /** Co-op: 0..1 re-stitch progress while downed. */
  revive: number;
  /** Seconds of Power Pom left. */
  power: number;
  kos: number;
  deaths: number;
  /** Co-op: teammates re-stitched this match. */
  revives: number;
  queue: InputCmd[];
  /** Last applied input sequence (acked back to the client). */
  lastSeq: number;
  /** Seconds of movement this player is allowed to consume; stops speed hacks by input flooding. */
  budget: number;
}

interface Pos { x: number; y: number; z: number; alive: boolean }

interface HistoryFrame {
  tick: number;
  players: Map<number, Pos>;
  enemies: Map<number, Pos>;
}

/** Everything a snapshot shares between all recipients (computed once per broadcast). */
export interface SharedSnapshot {
  players: NetPlayer[];
  shots: Shot[];
  projectiles: NetProjectile[];
  pickups: number;
  drops: NetDrop[];
  coop: CoopState | null;
  koth: KothState | null;
  vehicles: NetVehicle[];
  cty: CtyState | null;
}

const MAX_QUEUE = 24;
const MAX_BUDGET = 0.3;
const HISTORY_TICKS = Math.ceil((HISTORY_MS / 1000) * TICK_RATE);
const MAX_REWIND_TICKS = (MAX_REWIND_MS / 1000) * TICK_RATE;
/** Player ids stay below the turret shot-id range. */
const MAX_PLAYER_ID = 127;
const COOP_RESPAWN_SECONDS = 8;

export const PALETTE = [0xe8742a, 0x8bcb3a, 0x3a5da8, 0xd8262e, 0xffc94a, 0x6fd6ff, 0xb46fd6, 0xefe3c8];
/** Team Deathmatch yarn colours: Team Cotton (warm) and Team Wool (cool). */
export const TEAM_COLORS = [0xe8742a, 0x3a5da8];
export const TEAM_NAMES = ['Team Cotton', 'Team Wool'];

/**
 * The authoritative simulation for one match. Transport-agnostic: the Node
 * server and the in-browser solo worker both drive it.
 */
export class Room {
  readonly world: World;
  readonly mode: GameMode;
  readonly coop: CoopDirector | null;
  readonly koth: KothDirector | null;
  readonly cty: CtyDirector | null;
  /** Capture the Yarn: flow fields to each base, so bots can find their way round the map. */
  readonly ctyNav: NavGrid | null;
  readonly players = new Map<number, RoomPlayer>();
  tick = 0;
  private events: GameEvent[] = [];
  private shots: Shot[] = [];
  private history: HistoryFrame[] = [];
  private nextId = 1;
  private coopHost: CoopHost;
  private projectiles: Projectile[] = [];
  private nextProjectile = 1;
  /** Seconds until each static pickup spot refills (0 = available). */
  private pickupTimers: number[];
  private drops: Drop[] = [];
  private nextDrop = 1;
  private lastPhase: number = Phase.Build;
  /** Vehicles on the map; driver 0 means parked. */
  readonly vehicles: { kind: number; x: number; y: number; z: number; yaw: number; driver: number }[];
  /** Ram cooldowns, keyed "driver:target". */
  private ramCd = new Map<string, number>();

  constructor(world: World, mode: GameMode = 'pvp', coopOptions: CoopOptions = {}) {
    this.world = world;
    this.mode = mode;
    this.coop = mode === 'coop' ? new CoopDirector(world, coopOptions) : null;
    // King of the Spool: the spool hops between the map's Heartspool spots.
    this.koth = mode === 'koth' ? new KothDirector(world.coop.cores) : null;
    this.cty = mode === 'cty' ? new CtyDirector(ctyBases(world.coop.cores)) : null;
    this.ctyNav = mode === 'cty' ? new NavGrid(world) : null;
    // Built spring pads launch toys exactly like the map's own jump pads.
    world.springs = this.coop ? this.coop.springs : [];
    this.pickupTimers = world.pickups.map(() => 0);
    this.vehicles = (world.vehicles ?? []).map((v) => ({ kind: v.kind, x: v.pos[0], y: v.pos[1], z: v.pos[2], yaw: v.yaw, driver: 0 }));
    this.coopHost = {
      livePlayers: () => [...this.players.values()].filter((p) => p.alive && p.bleed <= 0).map((p) => ({ id: p.id, x: p.state.x, y: p.state.y, z: p.state.z })),
      damagePlayer: (id, dmg, enemyType, push) => {
        const p = this.players.get(id);
        if (!p) return;
        this.damage(null, p, dmg * PLAYER.coopDamageScale * (this.coop?.diff.damageTaken ?? 1), enemyType);
        if (push && p.alive && p.bleed <= 0) { p.state.vx += push[0]; p.state.vz += push[1]; p.state.vy = Math.max(p.state.vy, 4); p.state.onGround = false; }
      },
      healPlayer: (id, amount) => {
        const p = this.players.get(id);
        if (p && p.alive && !p.state.downed) p.health = Math.min(PLAYER.maxHealth, p.health + amount);
      },
      shot: (s) => this.shots.push(s),
      event: (e) => this.events.push(e),
      enemyDied: (e) => this.maybeDrop(e),
    };
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  addPlayer(name: string, bot = false, look?: Look): RoomPlayer | null {
    if (this.isFull) return null;
    let id = this.nextId;
    while (this.players.has(id)) id = (id % MAX_PLAYER_ID) + 1;
    this.nextId = (id % MAX_PLAYER_ID) + 1;
    // Team Deathmatch: join the smaller side and wear its colour.
    const sizes = [0, 0];
    for (const p of this.players.values()) sizes[p.team] += 1;
    const team = isTeamMode(this.mode) ? (sizes[0] <= sizes[1] ? 0 : 1) : 0;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = isTeamMode(this.mode) ? TEAM_COLORS[team] : PALETTE.find((c) => !used.has(c)) ?? PALETTE[id % PALETTE.length];
    const player: RoomPlayer = {
      id, name: name.slice(0, 16) || `Toy ${id}`, color, bot, team, look,
      state: createPlayerState([0, 0, 0]),
      health: PLAYER.maxHealth, armor: 0, alive: true, respawnTimer: 0, sinceHurt: 0, protect: 0, bleed: 0, revive: 0, power: 0,
      kos: 0, deaths: 0, revives: 0, queue: [], lastSeq: 0, budget: 0, emoteCd: 0,
    };
    this.players.set(id, player);
    this.spawn(player);
    return player;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (p) this.leaveVehicle(p);
    this.players.delete(id);
    this.coop?.ready.delete(id);
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, team: p.team, look: p.look }));
  }

  queueInputs(id: number, cmds: InputCmd[]): void {
    const p = this.players.get(id);
    if (!p) return;
    for (const c of cmds) {
      // Drop duplicates and stale commands (inputs are resent after loss).
      if (c.seq <= p.lastSeq) continue;
      const last = p.queue[p.queue.length - 1];
      if (last && c.seq <= last.seq) continue;
      p.queue.push(c);
    }
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  drainShots(): Shot[] {
    const s = this.shots;
    this.shots = [];
    return s;
  }

  update(): void {
    this.tick += 1;
    for (const p of this.players.values()) p.emoteCd = Math.max(0, p.emoteCd - TICK_DT);
    const coopWasOver = this.coop && (this.coop.phase === Phase.Won || this.coop.phase === Phase.Lost);
    for (const p of this.players.values()) {
      p.budget = Math.min(MAX_BUDGET, p.budget + TICK_DT);
      while (p.queue.length > 0 && p.budget >= INPUT_DT - 1e-9) {
        const cmd = p.queue.shift()!;
        p.budget -= INPUT_DT;
        p.lastSeq = cmd.seq;
        if (!p.alive) {
          p.state.buttons = cmd.buttons;
          continue;
        }
        // Use, newly pressed: climb in or out (re-stitching a downed teammate comes first).
        if ((cmd.buttons & Buttons.Use) && !(p.state.buttons & Buttons.Use) && !p.state.downed && !this.reviveTarget(p)) {
          if (p.state.car) this.leaveVehicle(p); else this.enterVehicle(p);
        }
        const { fired, weapon } = stepPlayer(p.state, cmd, this.world);
        if (fired) this.fire(p, cmd, weapon);
        if (cmd.action >= Action.Emote && cmd.action < Action.Emote + EMOTES.length) {
          if (p.emoteCd <= 0 && !p.state.downed && !p.state.car) {
            this.events.push({ type: 'emote', id: p.id, kind: cmd.action - Action.Emote });
            p.emoteCd = EMOTE_COOLDOWN;
          }
        } else if (this.coop && cmd.action && !p.state.downed) this.coopAction(p, cmd.action);
      }
      if (!p.alive) {
        p.respawnTimer -= TICK_DT;
        if (p.respawnTimer <= 0) this.spawn(p);
        continue;
      }
      p.protect = Math.max(0, p.protect - TICK_DT);
      p.power = Math.max(0, p.power - TICK_DT);
      if (p.bleed > 0) continue;
      p.sinceHurt += TICK_DT;
      if (p.sinceHurt >= PLAYER.regenDelay && p.health < PLAYER.maxHealth) {
        p.health = Math.min(PLAYER.maxHealth, p.health + PLAYER.regenRate * TICK_DT);
      }
    }
    if (this.coop) this.stepDowned();
    this.stepRams();
    if (this.koth) {
      const toys = [...this.players.values()].filter((p) => p.alive).map((p) => ({ team: p.team, x: p.state.x, y: p.state.y, z: p.state.z }));
      // A round won: everyone back to their side of the room, full stitches.
      if (this.koth.update(TICK_DT, toys, (e) => this.events.push(e)) >= 0) for (const p of this.players.values()) this.spawn(p);
    }
    if (this.cty) {
      const toys = [...this.players.values()].map((p) => ({ id: p.id, team: p.team, alive: p.alive, x: p.state.x, y: p.state.y, z: p.state.z }));
      if (this.cty.update(TICK_DT, toys, (e) => this.events.push(e)) >= 0) for (const p of this.players.values()) this.spawn(p);
    }
    this.stepProjectiles();
    this.stepPickups();
    if (this.coop) {
      this.coop.update(TICK_DT, this.coopHost, this.players.size);
      // A fresh match after win/lose: everyone back to full and reset scores.
      if (coopWasOver && this.coop.phase === Phase.Build) {
        for (const p of this.players.values()) { p.kos = 0; p.deaths = 0; p.revives = 0; p.armor = 0; this.spawn(p); }
        this.drops = [];
      } else if (this.lastPhase === Phase.Wave && this.coop.phase === Phase.Build) {
        // Wave cleared: the unravelled are re-stitched for the build phase.
        for (const p of this.players.values()) {
          if (!p.alive) this.spawn(p);
          else if (p.bleed > 0) this.standUp(p, 0);
        }
      }
      this.lastPhase = this.coop.phase;
    }
    this.recordHistory();
  }

  private coopAction(p: RoomPlayer, action: number): void {
    const coop = this.coop!;
    if (action >= 1 && action < BUILDABLES.length) coop.build(p.state.x, p.state.z, action, p.id);
    else if (action === Action.Sell) coop.sell(p.state.x, p.state.z, p.id);
    else if (action === Action.Ready) {
      const humans = [...this.players.values()].filter((q) => !q.bot).map((q) => q.id);
      coop.vote(p.id, humans);
    }
  }

  // ------------------------------------------------------------ down and re-stitch (co-op)

  private stepDowned(): void {
    for (const p of this.players.values()) {
      if (!p.alive || p.bleed <= 0) continue;
      const helpers = [...this.players.values()].filter((q) => q !== p && q.alive && q.bleed <= 0 && (q.state.buttons & Buttons.Use)
        && Math.hypot(q.state.x - p.state.x, q.state.y - p.state.y, q.state.z - p.state.z) < PLAYER.reviveRange);
      if (helpers.length > 0) {
        p.revive += (TICK_DT * helpers.length) / PLAYER.reviveSeconds;
        if (p.revive >= 1) {
          helpers[0].revives += 1;
          this.standUp(p, helpers[0].id);
        }
      } else {
        p.revive = Math.max(0, p.revive - TICK_DT * 0.5);
        p.bleed -= TICK_DT;
        if (p.bleed <= 0) this.knockOut(p, null);
      }
    }
  }

  private standUp(p: RoomPlayer, by: number): void {
    p.bleed = 0;
    p.revive = 0;
    p.state.downed = false;
    p.health = PLAYER.reviveHealth;
    p.protect = 1.5;
    p.sinceHurt = 0;
    this.events.push({ type: 'revived', id: p.id, by });
  }

  // ------------------------------------------------------------ pickups

  private stepPickups(): void {
    this.pickupTimers = this.pickupTimers.map((t) => Math.max(0, t - TICK_DT));
    this.drops = this.drops.filter((d) => (d.life -= TICK_DT) > 0);
    for (const p of this.players.values()) {
      if (!p.alive || p.bleed > 0) continue;
      const near = (x: number, y: number, z: number) => Math.hypot(p.state.x - x, p.state.z - z) < PICKUP_RADIUS && Math.abs(p.state.y - y) < 1.2;
      this.world.pickups.forEach((spot, i) => {
        if (this.pickupTimers[i] > 0 || !near(spot.pos[0], spot.pos[1], spot.pos[2])) return;
        if (this.take(p, spot.kind)) this.pickupTimers[i] = PICKUPS[spot.kind].respawn;
      });
      this.drops = this.drops.filter((d) => !(near(d.x, d.y, d.z) && this.take(p, d.kind)));
    }
  }

  /** Applies a pickup if the toy needs it. */
  private take(p: RoomPlayer, kind: number): boolean {
    const def = PICKUPS[kind];
    if (kind === PickupKind.Stuffing) {
      if (p.health >= PLAYER.maxHealth) return false;
      p.health = Math.min(PLAYER.maxHealth, p.health + def.amount);
    } else if (kind === PickupKind.Thimble) {
      if (p.armor >= PLAYER.maxArmor) return false;
      p.armor = Math.min(PLAYER.maxArmor, p.armor + def.amount);
    } else if (kind === PickupKind.YarnBasket) {
      // A basket of fresh yarn: every magazine full, no reload needed.
      if (WEAPONS.every((w, i) => p.state.mags[i] >= w.magazine) && p.state.reload <= 0) return false;
      p.state.mags = WEAPONS.map((w) => w.magazine);
      p.state.reload = 0;
    } else {
      p.power = def.amount;
    }
    this.events.push({ type: 'pickup', id: p.id, kind });
    return true;
  }

  private maybeDrop(e: Enemy): void {
    if (this.drops.length >= MAX_DROPS || Math.random() > DROP_CHANCE * (ENEMIES[e.type].boss ? 20 : 1)) return;
    this.drops.push({ id: this.nextDrop++, kind: PickupKind.Stuffing, x: e.x, y: 0, z: e.z, life: DROP_SECONDS });
  }

  /** Static pickup spots available right now (for bots). */
  availablePickups(): { pos: Vec3; kind: number }[] {
    return this.world.pickups.filter((_, i) => this.pickupTimers[i] <= 0);
  }

  pickupMask(): number {
    let m = 0;
    this.pickupTimers.forEach((t, i) => { if (t <= 0 && i < 32) m |= 1 << i; });
    return m >>> 0;
  }

  // ------------------------------------------------------------ spawning and history

  // ------------------------------------------------------------ vehicles

  /** A downed teammate close enough to re-stitch (Use goes to them first). */
  private reviveTarget(p: RoomPlayer): boolean {
    if (!this.coop) return false;
    for (const q of this.players.values()) {
      if (q !== p && q.alive && q.bleed > 0 && Math.hypot(q.state.x - p.state.x, q.state.z - p.state.z) < PLAYER.reviveRange) return true;
    }
    return false;
  }

  private enterVehicle(p: RoomPlayer): void {
    let best: (typeof this.vehicles)[number] | null = null;
    let bestD = ENTER_RANGE;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - p.state.x, v.z - p.state.z);
      if (!v.driver && d < bestD && Math.abs(v.y - p.state.y) < 3) { bestD = d; best = v; }
    }
    if (!best) return;
    best.driver = p.id;
    const s = p.state;
    s.car = best.kind;
    s.carYaw = best.yaw;
    s.carSpeed = 0;
    s.x = best.x; s.y = best.y; s.z = best.z;
    s.vx = s.vy = s.vz = 0;
    s.hooked = false;
    s.reload = 0;
    this.events.push({ type: 'vehicle', id: p.id, kind: best.kind, enter: true });
  }

  /** Park the vehicle where it is and step out beside it (somewhere the toy fits). */
  private leaveVehicle(p: RoomPlayer): void {
    const s = p.state;
    if (!s.car) return;
    const v = this.vehicles.find((q) => q.driver === p.id);
    if (v) { v.driver = 0; v.x = s.x; v.y = s.y; v.z = s.z; v.yaw = s.carYaw; }
    const kind = s.car;
    const side = VEHICLES[kind].radius + 0.9;
    const right: [number, number] = [Math.cos(s.carYaw), -Math.sin(s.carYaw)];
    const spots: [number, number][] = [[right[0] * side, right[1] * side], [-right[0] * side, -right[1] * side], [Math.sin(s.carYaw) * side, Math.cos(s.carYaw) * side], [0, 0]];
    let out: [number, number] = [0, 0];
    for (const o of spots) if (fitsAt(this.world, s.x + o[0], s.y + 0.05, s.z + o[1])) { out = o; break; }
    s.car = 0;
    s.carSpeed = 0;
    s.x += out[0]; s.z += out[1]; s.y += 0.05;
    s.vx = s.vz = 0;
    s.onGround = false;
    this.events.push({ type: 'vehicle', id: p.id, kind, enter: false });
  }

  /** Drivers flatten what they hit: invaders in co-op, rival toys in PvP. */
  private stepRams(): void {
    for (const [k, t] of this.ramCd) { if (t - TICK_DT <= 0) this.ramCd.delete(k); else this.ramCd.set(k, t - TICK_DT); }
    for (const p of this.players.values()) {
      const s = p.state;
      if (!p.alive || !s.car || Math.abs(s.carSpeed) < RAM_MIN_SPEED) continue;
      const def = VEHICLES[s.car];
      const power = Math.min(1, Math.abs(s.carSpeed) / def.maxSpeed);
      const fwd: Vec3 = [-Math.sin(s.carYaw) * Math.sign(s.carSpeed), 0, -Math.cos(s.carYaw) * Math.sign(s.carSpeed)];
      if (this.coop) {
        for (const e of this.coop.enemies) {
          const ed = ENEMIES[e.type];
          if (e.hp <= 0 || ed.flying || Math.hypot(e.x - s.x, e.z - s.z) > def.radius + ed.radius + 0.3) continue;
          const key = `${p.id}:e${e.id}`;
          if (this.ramCd.has(key)) continue;
          this.ramCd.set(key, RAM_COOLDOWN);
          this.shots.push({ id: p.id, hit: 0, head: false, enemy: true, kind: ShotKind.Hitscan, to: [e.x, e.y + ed.height * 0.5, e.z] });
          this.creditKill(p, e, this.coop.damageEnemy(e, def.ram * (0.4 + 0.6 * power), fwd, 4 * power));
        }
      } else {
        for (const q of this.players.values()) {
          if (!q.alive || !this.hostile(p, q) || Math.hypot(q.state.x - s.x, q.state.z - s.z) > def.radius + PLAYER.radius + 0.3 || Math.abs(q.state.y - s.y) > 2) continue;
          const key = `${p.id}:p${q.id}`;
          if (this.ramCd.has(key)) continue;
          this.ramCd.set(key, RAM_COOLDOWN);
          this.shots.push({ id: p.id, hit: q.id, head: false, enemy: false, kind: ShotKind.Hitscan, to: [q.state.x, q.state.y + 0.9, q.state.z] });
          this.damage(p, q, def.ram * (0.4 + 0.6 * power));
          if (q.alive && !q.state.car) { q.state.vx += fwd[0] * 9 * power; q.state.vz += fwd[2] * 9 * power; q.state.vy = Math.max(q.state.vy, 6); q.state.onGround = false; }
        }
      }
    }
  }

  netVehicles(): NetVehicle[] {
    return this.vehicles.filter((v) => !v.driver).map((v) => ({ kind: v.kind, x: v.x, y: v.y, z: v.z, yaw: v.yaw }));
  }

  private spawn(p: RoomPlayer): void {
    this.leaveVehicle(p);
    const points = this.coop ? this.world.coop.playerSpawns : this.world.spawns;
    // PvP: farthest from any living opponent. Co-op: any point near the Heartspools.
    let best: Vec3 = points[0];
    let bestScore = -Infinity;
    for (const s of points) {
      let nearest = Infinity;
      if (!this.coop) {
        for (const o of this.players.values()) {
          if (o === p || !o.alive || (isTeamMode(this.mode) && o.team === p.team)) continue;
          nearest = Math.min(nearest, Math.hypot(o.state.x - s[0], o.state.z - s[2]));
        }
      }
      // Capture the Yarn: re-stitch near your own base.
      const home = this.cty?.bases[p.team];
      const score = home ? -Math.hypot(home[0] - s[0], home[2] - s[2]) + Math.random() * 8 : (this.coop ? 0 : nearest) + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    const yaw = Math.fround(Math.atan2(best[0], best[2]));
    const prevButtons = p.state.buttons;
    p.state = createPlayerState(best, yaw);
    p.state.buttons = prevButtons;
    p.health = PLAYER.maxHealth;
    p.alive = true;
    p.respawnTimer = 0;
    p.sinceHurt = PLAYER.regenDelay;
    p.protect = PLAYER.spawnProtection;
    p.bleed = 0;
    p.revive = 0;
    p.power = 0;
    this.events.push({ type: 'spawn', id: p.id });
  }

  private recordHistory(): void {
    const frame: HistoryFrame = { tick: this.tick, players: new Map(), enemies: new Map() };
    for (const p of this.players.values()) {
      frame.players.set(p.id, { x: p.state.x, y: p.state.y, z: p.state.z, alive: p.alive });
    }
    if (this.coop) for (const e of this.coop.enemies) frame.enemies.set(e.id, { x: e.x, y: e.y, z: e.z, alive: e.hp > 0 });
    this.history.push(frame);
    if (this.history.length > HISTORY_TICKS) this.history.shift();
  }

  /** Where a target was when the shooter saw it at renderTick (lag compensation). */
  private rewound(kind: 'players' | 'enemies', id: number, renderTick: number): Pos | null {
    const h = this.history;
    if (h.length === 0) return null;
    const t = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, renderTick));
    let a = h[0];
    let b = h[h.length - 1];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].tick <= t) { a = h[i]; b = h[Math.min(h.length - 1, i + 1)]; break; }
    }
    const pb = b[kind].get(id);
    const pa = a[kind].get(id) ?? pb;
    if (!pa || !pb) return null;
    const span = b.tick - a.tick;
    const f = span > 0 ? Math.max(0, Math.min(1, (t - a.tick) / span)) : 0;
    return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f, z: pa.z + (pb.z - pa.z) * f, alive: pa.alive && pb.alive };
  }

  // ------------------------------------------------------------ weapons

  /** True when a shot from a may hurt b (no friendly fire in co-op or Team Deathmatch). */
  private hostile(a: RoomPlayer, b: RoomPlayer): boolean {
    if (a === b || this.coop) return false;
    return !isTeamMode(this.mode) || a.team !== b.team;
  }

  private fire(shooter: RoomPlayer, cmd: InputCmd, weaponIndex: number): void {
    const weapon = WEAPONS[weaponIndex];
    const crouch = (cmd.buttons & Buttons.Crouch) !== 0;
    const o = eyePosition(shooter.state, crouch);
    const aim = lookDirection(shooter.state.yaw, shooter.state.pitch);
    const boost = shooter.power > 0 ? POWER_MULTIPLIER : 1;

    if (weapon.projectile) {
      const from: Vec3 = [o[0] + aim[0] * 0.5, o[1] - 0.15 + aim[1] * 0.5, o[2] + aim[2] * 0.5];
      this.projectiles.push(launchProjectile(this.nextProjectile++, shooter.id, weaponIndex, from, aim));
      return;
    }

    // Rewind targets once per shot, not per pellet.
    const targets: { player?: RoomPlayer; enemyIndex?: number; pos: Pos; r: number; h: number }[] = [];
    if (!this.coop) {
      for (const p of this.players.values()) {
        if (!p.alive || !this.hostile(shooter, p)) continue;
        const pos = this.rewound('players', p.id, cmd.renderTick);
        if (pos && pos.alive) targets.push({ player: p, pos, r: PLAYER.radius, h: PLAYER.height });
      }
    } else {
      this.coop.enemies.forEach((e, i) => {
        if (e.hp <= 0) return;
        const pos = this.rewound('enemies', e.id, cmd.renderTick) ?? { x: e.x, y: e.y, z: e.z, alive: true };
        const def = ENEMIES[e.type];
        targets.push({ enemyIndex: i, pos, r: def.radius, h: def.height });
      });
    }

    for (const d of pelletDirections(weapon, aim, cmd.seq)) {
      const wallT = rayWorld(o, d, this.world.boxes, weapon.range);
      // Every target along the ray, nearest first; piercing weapons keep going.
      const hits: { t: number; tg: (typeof targets)[number] }[] = [];
      for (const tg of targets) {
        const t = tg.player
          ? rayPlayer(o, d, tg.pos, wallT)
          : rayBox(o, d, [tg.pos.x - tg.r, tg.pos.y, tg.pos.z - tg.r], [tg.pos.x + tg.r, tg.pos.y + tg.h, tg.pos.z + tg.r], wallT);
        if (t < wallT) hits.push({ t, tg });
      }
      hits.sort((a, b) => a.t - b.t);
      const used = hits.slice(0, weapon.pierce);
      const endT = used.length === weapon.pierce && used.length > 0 ? used[used.length - 1].t : wallT;
      const end: Vec3 = [o[0] + d[0] * endT, o[1] + d[1] * endT, o[2] + d[2] * endT];
      if (used.length === 0) {
        this.shots.push({ id: shooter.id, hit: 0, head: false, enemy: false, kind: ShotKind.Hitscan, to: end });
        continue;
      }
      for (const { t, tg } of used) {
        const to: Vec3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        const head = to[1] - tg.pos.y >= tg.h * (tg.player ? PLAYER.headHeight / PLAYER.height : 0.7);
        const dmg = weapon.damage * (head ? weapon.headshotMultiplier : 1) * boost;
        if (weapon.chain) this.chainZap(shooter, weapon, targets, tg, to, weapon.damage * boost);
        if (tg.player) {
          this.shots.push({ id: shooter.id, hit: tg.player.id, head, enemy: false, kind: ShotKind.Hitscan, to });
          if (tg.player.alive) this.damage(shooter, tg.player, dmg);
        } else if (tg.enemyIndex !== undefined && this.coop) {
          const e = this.coop.enemies[tg.enemyIndex];
          this.shots.push({ id: shooter.id, hit: 0, head, enemy: true, kind: ShotKind.Hitscan, to });
          this.creditKill(shooter, e, this.coop.damageEnemy(e, dmg, d, weapon.knockback));
        }
      }
      // Pierced all the way through: show the tracer to the wall too.
      if (weapon.pierce > 1 && used.length < weapon.pierce) {
        this.shots.push({ id: shooter.id, hit: 0, head: false, enemy: false, kind: ShotKind.Hitscan, to: end });
      }
    }
  }

  /** Static Sock: the charge jumps from the first target to the nearest others it can see. */
  private chainZap(
    shooter: RoomPlayer, weapon: (typeof WEAPONS)[number],
    targets: { player?: RoomPlayer; enemyIndex?: number; pos: Pos; r: number; h: number }[],
    first: (typeof targets)[number], from: Vec3, damage: number,
  ): void {
    const chain = weapon.chain!;
    const hit = new Set([first]);
    let at = from;
    let dmg = damage;
    for (let k = 0; k < chain.count; k++) {
      let best: (typeof targets)[number] | null = null;
      let bestD = chain.radius;
      for (const tg of targets) {
        if (hit.has(tg)) continue;
        if (tg.player ? !tg.player.alive : this.coop!.enemies[tg.enemyIndex!].hp <= 0) continue;
        const c: Vec3 = [tg.pos.x, tg.pos.y + tg.h * 0.5, tg.pos.z];
        const dd = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
        if (dd < bestD && hasLineOfSight(at, c, this.world.boxes)) { bestD = dd; best = tg; }
      }
      if (!best) return;
      hit.add(best);
      dmg *= chain.falloff;
      const to: Vec3 = [best.pos.x, best.pos.y + best.h * 0.5, best.pos.z];
      if (best.player) {
        this.shots.push({ id: shooter.id, hit: best.player.id, head: false, enemy: false, kind: ShotKind.Zap, from: at, to });
        this.damage(shooter, best.player, dmg);
      } else if (this.coop) {
        const e = this.coop.enemies[best.enemyIndex!];
        this.shots.push({ id: shooter.id, hit: 0, head: false, enemy: true, kind: ShotKind.Zap, from: at, to });
        this.creditKill(shooter, e, this.coop.damageEnemy(e, dmg, [0, 0, 0], weapon.knockback));
      }
      at = to;
    }
  }

  private creditKill(shooter: RoomPlayer, e: Enemy, reward: number): void {
    if (reward <= 0) return;
    shooter.kos += 1;
    this.events.push({ type: 'kill', by: shooter.id, enemyType: e.type, reward });
  }

  private stepProjectiles(): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      const owner = this.players.get(pr.owner);
      let at = stepProjectile(pr, TICK_DT, this.world.boxes);
      if (!at) {
        // Direct contact with a target bursts the ball too.
        if (this.coop) {
          for (const e of this.coop.enemies) {
            const def = ENEMIES[e.type];
            if (e.hp > 0 && Math.hypot(e.x - pr.x, e.z - pr.z) < def.radius + 0.25 && pr.y > e.y - 0.2 && pr.y < e.y + def.height + 0.2) { at = [pr.x, pr.y, pr.z]; break; }
          }
        } else if (owner) {
          for (const p of this.players.values()) {
            if (p.alive && this.hostile(owner, p) && Math.hypot(p.state.x - pr.x, p.state.z - pr.z) < PLAYER.radius + 0.25 && pr.y > p.state.y && pr.y < p.state.y + PLAYER.height) { at = [pr.x, pr.y, pr.z]; break; }
          }
        }
      }
      if (!at) { keep.push(pr); continue; }
      this.blast(pr, owner ?? null, at);
    }
    this.projectiles = keep;
  }

  /** Yarn-ball burst: splash damage with falloff, knockback and a tangle. */
  private blast(pr: Projectile, owner: RoomPlayer | null, at: Vec3): void {
    const w = WEAPONS[pr.weapon];
    const spec = w.projectile!;
    const boost = owner && owner.power > 0 ? POWER_MULTIPLIER : 1;
    let any = false;
    if (this.coop) {
      for (const e of this.coop.enemies) {
        if (e.hp <= 0) continue;
        const def = ENEMIES[e.type];
        const d = Math.hypot(e.x - at[0], e.y + def.height * 0.5 - at[1], e.z - at[2]);
        if (d > spec.radius + def.radius) continue;
        any = true;
        const k = Math.max(0.35, 1 - d / (spec.radius + def.radius));
        const len = Math.hypot(e.x - at[0], e.z - at[2]) || 1;
        this.coop.tangle(e, spec.slowSeconds);
        const reward = this.coop.damageEnemy(e, w.damage * k * boost, [(e.x - at[0]) / len, 0, (e.z - at[2]) / len], w.knockback * k);
        if (owner) this.creditKill(owner, e, reward);
      }
    } else if (owner) {
      for (const p of this.players.values()) {
        if (!p.alive || !this.hostile(owner, p)) continue;
        const d = Math.hypot(p.state.x - at[0], p.state.y + 0.75 - at[1], p.state.z - at[2]);
        if (d > spec.radius) continue;
        any = true;
        this.damage(owner, p, w.damage * 0.8 * Math.max(0.3, 1 - d / spec.radius) * boost);
      }
    }
    this.shots.push({ id: pr.owner, hit: pr.weapon, head: false, enemy: any, kind: ShotKind.Blast, to: at });
  }

  // ------------------------------------------------------------ damage

  private knockOut(victim: RoomPlayer, attacker: RoomPlayer | null, enemyType = -1): void {
    this.leaveVehicle(victim);
    victim.health = 0;
    victim.alive = false;
    victim.bleed = 0;
    victim.revive = 0;
    victim.state.downed = false;
    victim.respawnTimer = this.coop ? COOP_RESPAWN_SECONDS : PLAYER.respawnSeconds;
    victim.deaths += 1;
    if (attacker) attacker.kos += 1;
    victim.state.vx = victim.state.vy = victim.state.vz = 0;
    this.events.push(attacker
      ? { type: 'ko', attacker: attacker.id, victim: victim.id }
      : { type: 'ko', attacker: 0, victim: victim.id, enemyType });
  }

  private damage(attacker: RoomPlayer | null, victim: RoomPlayer, dmg: number, enemyType = -1): void {
    if (!victim.alive || victim.protect > 0 || victim.bleed > 0) return;
    if (attacker && !this.hostile(attacker, victim)) return;
    victim.sinceHurt = 0;
    const absorbed = Math.min(victim.armor, dmg);
    victim.armor -= absorbed;
    victim.health -= dmg - absorbed;
    if (victim.health > 0) return;
    if (this.coop) {
      // Co-op: knocked down, not out. A teammate can re-stitch you.
      victim.health = 0;
      victim.bleed = PLAYER.bleedSeconds;
      victim.revive = 0;
      this.leaveVehicle(victim);
      victim.state.downed = true;
      victim.deaths += 1;
      this.events.push({ type: 'downed', id: victim.id });
      return;
    }
    this.knockOut(victim, attacker, enemyType);
  }

  // ------------------------------------------------------------ snapshots

  netPlayers(): NetPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.state.yaw, pitch: p.state.pitch,
      health: p.health, armor: p.armor, alive: p.alive, crouch: (p.state.buttons & Buttons.Crouch) !== 0,
      downed: p.bleed > 0, powered: p.power > 0, revive: p.revive,
      hook: p.state.hooked ? [p.state.hx, p.state.hy, p.state.hz] : null,
      car: p.alive ? p.state.car : 0, carYaw: p.state.carYaw,
      weapon: p.state.weapon, kos: p.kos, deaths: p.deaths,
    }));
  }

  netProjectiles(): NetProjectile[] {
    return this.projectiles.map((p) => ({ owner: p.owner, weapon: p.weapon, x: p.x, y: p.y, z: p.z }));
  }

  netDrops(): NetDrop[] {
    return this.drops.map((d) => ({ kind: d.kind, x: d.x, y: d.y, z: d.z }));
  }

  coopState(withEnemies = true): CoopState | null {
    const c = this.coop;
    if (!c) return null;
    const boss = c.boss();
    return {
      phase: c.phase,
      wave: c.wave,
      totalWaves: c.totalWaves,
      timer: Math.max(0, c.timer),
      buttons: c.buttons,
      ready: c.ready.size,
      cores: c.cores.map((k) => ({ health: k.hp / CORE.hp, shield: k.shield / CORE.shield })),
      pads: c.pads.map((p) => ({ kind: p.kind, tier: p.tier, health: p.kind ? Math.min(1, p.hp / (BUILDABLES[p.kind].hp * (1 + 0.5 * (p.tier - 1)))) : 0 })),
      difficulty: c.difficulty,
      boss: boss ? boss.hp / boss.maxHp : -1,
      enemies: !withEnemies ? null : c.enemies.filter((e) => e.hp > 0).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, health: e.hp / e.maxHp })),
    };
  }

  sharedSnapshot(withEnemies = true): SharedSnapshot {
    return {
      players: this.netPlayers(),
      shots: this.drainShots(),
      projectiles: this.netProjectiles(),
      pickups: this.pickupMask(),
      drops: this.netDrops(),
      coop: this.coopState(withEnemies),
      koth: this.koth ? this.koth.state() : null,
      cty: this.cty ? this.cty.state() : null,
      vehicles: this.netVehicles(),
    };
  }

  snapshotFor(id: number, shared: SharedSnapshot): Snapshot {
    const p = this.players.get(id);
    return {
      tick: this.tick,
      ack: p?.lastSeq ?? 0,
      self: p && p.alive ? { ...p.state, mags: p.state.mags.slice() } : null,
      respawn: p && !p.alive ? Math.max(0, p.respawnTimer) : p && p.bleed > 0 ? p.bleed : 0,
      ...shared,
    };
  }
}

