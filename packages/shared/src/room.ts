import {
  HISTORY_MS, INPUT_DT, MAX_PLAYERS, MAX_REWIND_MS, PLAYER, POPPER, TICK_DT, TICK_RATE,
} from './constants.ts';
import { Buttons, createPlayerState, eyePosition, lookDirection, stepPlayer, type InputCmd, type PlayerState } from './movement.ts';
import type { GameEvent, NetPlayer, RosterEntry, Shot, Snapshot } from './protocol.ts';
import { rayPlayer, rayWorld } from './raycast.ts';
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

interface HistoryFrame {
  tick: number;
  players: Map<number, { x: number; y: number; z: number; alive: boolean }>;
}

const MAX_QUEUE = 24;
const MAX_BUDGET = 0.3;
const HISTORY_TICKS = Math.ceil((HISTORY_MS / 1000) * TICK_RATE);
const MAX_REWIND_TICKS = (MAX_REWIND_MS / 1000) * TICK_RATE;

export const PALETTE = [0xe8742a, 0x8bcb3a, 0x3a5da8, 0xd8262e, 0xffc94a, 0x6fd6ff, 0xb46fd6, 0xefe3c8];

/**
 * The authoritative simulation for one match. Transport-agnostic: the Node
 * server and the in-browser solo worker both drive it.
 */
export class Room {
  readonly world: World;
  readonly players = new Map<number, RoomPlayer>();
  tick = 0;
  private events: GameEvent[] = [];
  private shots: Shot[] = [];
  private history: HistoryFrame[] = [];
  private nextId = 1;

  constructor(world: World) {
    this.world = world;
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  addPlayer(name: string, bot = false): RoomPlayer | null {
    if (this.isFull) return null;
    let id = this.nextId;
    while (this.players.has(id)) id = (id % 255) + 1;
    this.nextId = (id % 255) + 1;
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
    for (const p of this.players.values()) {
      p.budget = Math.min(MAX_BUDGET, p.budget + TICK_DT);
      while (p.queue.length > 0 && p.budget >= INPUT_DT - 1e-9) {
        const cmd = p.queue.shift()!;
        p.budget -= INPUT_DT;
        p.lastSeq = cmd.seq;
        if (!p.alive) continue;
        const { fired } = stepPlayer(p.state, cmd, this.world);
        if (fired) this.fire(p, cmd);
      }
      if (!p.alive) {
        p.respawnTimer -= TICK_DT;
        if (p.respawnTimer <= 0) this.spawn(p);
      }
    }
    this.recordHistory();
  }

  private spawn(p: RoomPlayer): void {
    // Pick the spawn point farthest from any living opponent.
    let best: Vec3 = this.world.spawns[0];
    let bestScore = -Infinity;
    for (const s of this.world.spawns) {
      let nearest = Infinity;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        nearest = Math.min(nearest, Math.hypot(o.state.x - s[0], o.state.z - s[2]));
      }
      const score = nearest + Math.random() * 4;
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
    const frame: HistoryFrame = { tick: this.tick, players: new Map() };
    for (const p of this.players.values()) {
      frame.players.set(p.id, { x: p.state.x, y: p.state.y, z: p.state.z, alive: p.alive });
    }
    this.history.push(frame);
    if (this.history.length > HISTORY_TICKS) this.history.shift();
  }

  /** Target position as the shooter saw it at renderTick (lag compensation). */
  private rewound(id: number, renderTick: number): { x: number; y: number; z: number; alive: boolean } | null {
    const h = this.history;
    if (h.length === 0) return null;
    const t = Math.max(this.tick - MAX_REWIND_TICKS, Math.min(this.tick, renderTick));
    let a = h[0];
    let b = h[h.length - 1];
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].tick <= t) { a = h[i]; b = h[Math.min(h.length - 1, i + 1)]; break; }
    }
    const pa = a.players.get(id);
    const pb = b.players.get(id) ?? pa;
    if (!pa || !pb) return null;
    const span = b.tick - a.tick;
    const f = span > 0 ? Math.max(0, Math.min(1, (t - a.tick) / span)) : 0;
    return { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f, z: pa.z + (pb.z - pa.z) * f, alive: pa.alive && pb.alive };
  }

  private fire(shooter: RoomPlayer, cmd: InputCmd): void {
    const crouch = (cmd.buttons & Buttons.Crouch) !== 0;
    const o = eyePosition(shooter.state, crouch);
    const d = lookDirection(shooter.state.yaw, shooter.state.pitch);
    let bestT = rayWorld(o, d, this.world.boxes, POPPER.range);
    let victim: RoomPlayer | null = null;
    let victimY = 0;
    for (const p of this.players.values()) {
      if (p === shooter || !p.alive) continue;
      const pos = this.rewound(p.id, cmd.renderTick);
      if (!pos || !pos.alive) continue;
      const t = rayPlayer(o, d, pos, bestT);
      if (t < bestT) { bestT = t; victim = p; victimY = pos.y; }
    }
    const to: Vec3 = [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT];
    const head = victim !== null && to[1] - victimY >= PLAYER.headHeight;
    this.shots.push({ id: shooter.id, hit: victim ? victim.id : 0, head, to });
    if (victim) this.damage(shooter, victim, head);
  }

  private damage(attacker: RoomPlayer, victim: RoomPlayer, head: boolean): void {
    const dmg = POPPER.damage * (head ? POPPER.headshotMultiplier : 1);
    victim.health -= dmg;
    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.respawnTimer = PLAYER.respawnSeconds;
      victim.deaths += 1;
      attacker.kos += 1;
      victim.state.vx = victim.state.vy = victim.state.vz = 0;
      this.events.push({ type: 'ko', attacker: attacker.id, victim: victim.id });
    }
  }

  netPlayers(): NetPlayer[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.state.yaw, pitch: p.state.pitch,
      health: p.health, alive: p.alive, crouch: (p.state.buttons & Buttons.Crouch) !== 0,
      kos: p.kos, deaths: p.deaths,
    }));
  }

  snapshotFor(id: number, players: NetPlayer[], shots: Shot[]): Snapshot {
    const p = this.players.get(id);
    return {
      tick: this.tick,
      ack: p?.lastSeq ?? 0,
      self: p && p.alive ? { ...p.state } : null,
      respawn: p && !p.alive ? Math.max(0, p.respawnTimer) : 0,
      players,
      shots,
    };
  }
}
