import { HISTORY_MS, INPUT_DT, MAX_PLAYERS, MAX_REWIND_MS, PLAYER, TICK_DT, TICK_RATE } from './constants.ts';
import { Buildable, BUILDABLES, CORE, CoopDirector, Phase, type CoopHost } from './coop.ts';
import { ENEMIES } from './enemies.ts';
import { Buttons, createPlayerState, eyePosition, lookDirection, stepPlayer, type InputCmd, type PlayerState } from './movement.ts';
import type { CoopState, GameEvent, GameMode, NetPlayer, RosterEntry, Shot, Snapshot } from './protocol.ts';
import { rayBox, rayPlayer, rayWorld } from './raycast.ts';
import { pelletDirections, WEAPONS } from './weapons.ts';
import type { Vec3, World } from './world.ts';

export interface RoomPlayer {
  id: number;
  name: string;
  color: number;
  bot: boolean;
  state: PlayerState;
  health: number;
  alive: boolean;
  respawnTimer: number;
  kos: number;
  deaths: number;
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

const MAX_QUEUE = 24;
const MAX_BUDGET = 0.3;
const HISTORY_TICKS = Math.ceil((HISTORY_MS / 1000) * TICK_RATE);
const MAX_REWIND_TICKS = (MAX_REWIND_MS / 1000) * TICK_RATE;
/** Player ids stay below the turret shot-id range. */
const MAX_PLAYER_ID = 127;
const COOP_RESPAWN_SECONDS = 5;

export const PALETTE = [0xe8742a, 0x8bcb3a, 0x3a5da8, 0xd8262e, 0xffc94a, 0x6fd6ff, 0xb46fd6, 0xefe3c8];

/**
 * The authoritative simulation for one match. Transport-agnostic: the Node
 * server and the in-browser solo worker both drive it.
 */
export class Room {
  readonly world: World;
  readonly mode: GameMode;
  readonly coop: CoopDirector | null;
  readonly players = new Map<number, RoomPlayer>();
  tick = 0;
  private events: GameEvent[] = [];
  private shots: Shot[] = [];
  private history: HistoryFrame[] = [];
  private nextId = 1;
  private coopHost: CoopHost;

  constructor(world: World, mode: GameMode = 'pvp') {
    this.world = world;
    this.mode = mode;
    this.coop = mode === 'coop' ? new CoopDirector(world) : null;
    this.coopHost = {
      livePlayers: () => [...this.players.values()].filter((p) => p.alive).map((p) => ({ id: p.id, x: p.state.x, y: p.state.y, z: p.state.z })),
      damagePlayer: (id, dmg, enemyType) => {
        const p = this.players.get(id);
        if (p) this.damage(null, p, dmg, enemyType);
      },
      shot: (s) => this.shots.push(s),
      event: (e) => this.events.push(e),
    };
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  addPlayer(name: string, bot = false): RoomPlayer | null {
    if (this.isFull) return null;
    let id = this.nextId;
    while (this.players.has(id)) id = (id % MAX_PLAYER_ID) + 1;
    this.nextId = (id % MAX_PLAYER_ID) + 1;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[id % PALETTE.length];
    const player: RoomPlayer = {
      id, name: name.slice(0, 16) || `Toy ${id}`, color, bot,
      state: createPlayerState([0, 0, 0]),
      health: PLAYER.maxHealth, alive: true, respawnTimer: 0,
      kos: 0, deaths: 0, queue: [], lastSeq: 0, budget: 0,
    };
    this.players.set(id, player);
    this.spawn(player);
    return player;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
    this.coop?.ready.delete(id);
  }

  roster(): RosterEntry[] {
    return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot }));
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
    const coopWasOver = this.coop && (this.coop.phase === Phase.Won || this.coop.phase === Phase.Lost);
    for (const p of this.players.values()) {
      p.budget = Math.min(MAX_BUDGET, p.budget + TICK_DT);
      while (p.queue.length > 0 && p.budget >= INPUT_DT - 1e-9) {
        const cmd = p.queue.shift()!;
        p.budget -= INPUT_DT;
        p.lastSeq = cmd.seq;
        const pressed = cmd.buttons & ~p.state.buttons;
        if (!p.alive) {
          p.state.buttons = cmd.buttons;
          continue;
        }
        const { fired, weapon } = stepPlayer(p.state, cmd, this.world);
        if (fired) this.fire(p, cmd, weapon);
        if (this.coop && pressed) this.coopActions(p, pressed);
      }
      if (!p.alive) {
        p.respawnTimer -= TICK_DT;
        if (p.respawnTimer <= 0) this.spawn(p);
      }
    }
    if (this.coop) {
      this.coop.update(TICK_DT, this.coopHost, this.players.size);
      // A fresh match after win/lose: everyone back to full and reset scores.
      if (coopWasOver && this.coop.phase === Phase.Build) {
        for (const p of this.players.values()) { p.kos = 0; p.deaths = 0; this.spawn(p); }
      }
    }
    this.recordHistory();
  }

  private coopActions(p: RoomPlayer, pressed: number): void {
    const coop = this.coop!;
    const cards: [number, number][] = [[Buttons.Build1, Buildable.Turret], [Buttons.Build2, Buildable.Wall], [Buttons.Build3, Buildable.Mat]];
    for (const [bit, kind] of cards) if (pressed & bit) coop.build(p.state.x, p.state.z, kind, p.id);
    if (pressed & Buttons.Sell) coop.sell(p.state.x, p.state.z, p.id);
    if (pressed & Buttons.Ready) {
      const humans = [...this.players.values()].filter((q) => !q.bot).map((q) => q.id);
      coop.vote(p.id, humans);
    }
  }

  private spawn(p: RoomPlayer): void {
    const points = this.coop ? this.world.coop.playerSpawns : this.world.spawns;
    // PvP: farthest from any living opponent. Co-op: any point near the Heartspools.
    let best: Vec3 = points[0];
    let bestScore = -Infinity;
    for (const s of points) {
      let nearest = Infinity;
      if (!this.coop) {
        for (const o of this.players.values()) {
          if (o === p || !o.alive) continue;
          nearest = Math.min(nearest, Math.hypot(o.state.x - s[0], o.state.z - s[2]));
        }
      }
      const score = (this.coop ? 0 : nearest) + Math.random() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    const yaw = Math.fround(Math.atan2(best[0], best[2]));
    const prevButtons = p.state.buttons;
    p.state = createPlayerState(best, yaw);
    p.state.buttons = prevButtons;
    p.health = PLAYER.maxHealth;
    p.alive = true;
    p.respawnTimer = 0;
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

  private fire(shooter: RoomPlayer, cmd: InputCmd, weaponIndex: number): void {
    const weapon = WEAPONS[weaponIndex];
    const crouch = (cmd.buttons & Buttons.Crouch) !== 0;
    const o = eyePosition(shooter.state, crouch);
    const aim = lookDirection(shooter.state.yaw, shooter.state.pitch);

    // Rewind targets once per shot, not per pellet.
    const targets: { player?: RoomPlayer; enemyIndex?: number; pos: Pos; r: number; h: number }[] = [];
    if (!this.coop) {
      for (const p of this.players.values()) {
        if (p === shooter || !p.alive) continue;
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
      let bestT = rayWorld(o, d, this.world.boxes, weapon.range);
      let hit: (typeof targets)[number] | null = null;
      for (const tg of targets) {
        const t = tg.player
          ? rayPlayer(o, d, tg.pos, bestT)
          : rayBox(o, d, [tg.pos.x - tg.r, tg.pos.y, tg.pos.z - tg.r], [tg.pos.x + tg.r, tg.pos.y + tg.h, tg.pos.z + tg.r], bestT);
        if (t < bestT) { bestT = t; hit = tg; }
      }
      const to: Vec3 = [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT];
      const head = hit !== null && to[1] - hit.pos.y >= hit.h * (hit.player ? PLAYER.headHeight / PLAYER.height : 0.7);
      const dmg = weapon.damage * (head ? weapon.headshotMultiplier : 1);
      if (hit?.player) {
        this.shots.push({ id: shooter.id, hit: hit.player.id, head, enemy: false, to });
        if (hit.player.alive) this.damage(shooter, hit.player, dmg);
      } else if (hit && hit.enemyIndex !== undefined && this.coop) {
        const e = this.coop.enemies[hit.enemyIndex];
        this.shots.push({ id: shooter.id, hit: 0, head, enemy: true, to });
        const reward = this.coop.damageEnemy(e, dmg, d, weapon.knockback);
        if (reward > 0) {
          shooter.kos += 1;
          this.events.push({ type: 'kill', by: shooter.id, enemyType: e.type, reward });
        }
      } else {
        this.shots.push({ id: shooter.id, hit: 0, head: false, enemy: false, to });
      }
    }
  }

  private damage(attacker: RoomPlayer | null, victim: RoomPlayer, dmg: number, enemyType = -1): void {
    if (!victim.alive) return;
    victim.health -= dmg;
    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.respawnTimer = this.coop ? COOP_RESPAWN_SECONDS : PLAYER.respawnSeconds;
      victim.deaths += 1;
      if (attacker) attacker.kos += 1;
      victim.state.vx = victim.state.vy = victim.state.vz = 0;
      this.events.push(attacker
        ? { type: 'ko', attacker: attacker.id, victim: victim.id }
        : { type: 'ko', attacker: 0, victim: victim.id, enemyType });
    }
  }

  netPlayers(): NetPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.state.yaw, pitch: p.state.pitch,
      health: p.health, alive: p.alive, crouch: (p.state.buttons & Buttons.Crouch) !== 0,
      weapon: p.state.weapon, kos: p.kos, deaths: p.deaths,
    }));
  }

  coopState(withEnemies = true): CoopState | null {
    const c = this.coop;
    if (!c) return null;
    return {
      phase: c.phase,
      wave: c.wave,
      totalWaves: c.totalWaves,
      timer: Math.max(0, c.timer),
      buttons: c.buttons,
      ready: c.ready.size,
      cores: c.cores.map((k) => ({ health: k.hp / CORE.hp, shield: k.shield / CORE.shield })),
      pads: c.pads.map((p) => ({ kind: p.kind, health: p.kind ? p.hp / BUILDABLES[p.kind].hp : 0 })),
      enemies: !withEnemies ? null : c.enemies.filter((e) => e.hp > 0).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, z: e.z, health: e.hp / e.maxHp })),
    };
  }

  snapshotFor(id: number, players: NetPlayer[], shots: Shot[], coop: CoopState | null = null): Snapshot {
    const p = this.players.get(id);
    return {
      tick: this.tick,
      ack: p?.lastSeq ?? 0,
      self: p && p.alive ? { ...p.state } : null,
      respawn: p && !p.alive ? Math.max(0, p.respawnTimer) : 0,
      players,
      shots,
      coop,
    };
  }
}
