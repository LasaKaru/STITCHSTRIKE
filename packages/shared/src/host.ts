import { Bot } from './bots.ts';
import { isSnapshotTick, MAX_PLAYERS, TICK_RATE } from './constants.ts';
import { decodeInputs, encodeSnapshot, sanitizeLook, type ClientText, type GameMode, type ServerText } from './protocol.ts';
import { Room } from './room.ts';
import { createWorld, type MapId } from './world.ts';

/** Anything that can carry frames to one client: a WebSocket, a worker port, a test double. */
export interface Connection {
  send(data: string | Uint8Array): void;
  close(): void;
}

export interface HostOptions {
  /** Room code shown to players (share links use it). */
  code: string;
  /** Bots are added until humans + bots reach this count. */
  fillTo: number;
  mode?: GameMode;
  map?: MapId;
  /** Co-op: waves to win (5 skirmish, 10 mission), 0 = endless. */
  waves?: number;
  /** Co-op difficulty 0..3 (Cosy, Scratchy, Moth-eaten, Unravelled). */
  difficulty?: number;
  /** Co-op practice: start at this wave (solo only). */
  startWave?: number;
}

/**
 * Glue between a Room and its connections: parses client frames, runs the
 * fixed-rate tick, and fans out snapshots and events. Used unchanged by the
 * Node server and by the solo Web Worker.
 */
export class RoomHost {
  readonly room: Room;
  private conns = new Map<number, Connection>();
  private bots = new Map<number, Bot>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private acc = 0;
  private snapshots = 0;

  constructor(readonly options: HostOptions) {
    this.room = new Room(createWorld(options.map ?? 'bedroom'), options.mode ?? 'coop', { waves: options.waves, difficulty: options.difficulty });
    if (this.room.coop && options.startWave && options.startWave > 1) {
      this.room.coop.wave = options.startWave - 1;
      this.room.coop.buttons += 150 * (options.startWave - 1);
    }
    this.balanceBots();
  }

  get humans(): number {
    return this.conns.size;
  }

  /** Returns the handlers the transport should call for this connection. */
  connect(conn: Connection): { onMessage(data: string | Uint8Array): void; onClose(): void } {
    let id = 0;
    return {
      onMessage: (data) => {
        if (typeof data === 'string') {
          let msg: ClientText;
          try { msg = JSON.parse(data) as ClientText; } catch { return; }
          if (msg.t === 'hello' && id === 0) {
            if (this.conns.size >= MAX_PLAYERS) {
              this.sendText(conn, { t: 'full' });
              conn.close();
              return;
            }
            this.removeOneBot();
            const p = this.room.addPlayer(String(msg.name ?? ''), false, sanitizeLook(msg.look));
            if (!p) { this.sendText(conn, { t: 'full' }); conn.close(); return; }
            id = p.id;
            this.conns.set(id, conn);
            this.sendText(conn, {
              t: 'welcome', id, tick: this.room.tick, room: this.options.code, mode: this.room.mode, map: this.room.world.id,
              waves: this.room.coop?.totalWaves ?? 0, difficulty: this.room.coop?.difficulty ?? 1,
            });
            this.broadcastRoster();
          } else if (msg.t === 'ping') {
            this.sendText(conn, { t: 'pong', c: msg.c, tick: this.room.tick });
          }
          return;
        }
        if (id === 0) return;
        const cmds = decodeInputs(data);
        if (cmds) this.room.queueInputs(id, cmds);
      },
      onClose: () => {
        if (id === 0) return;
        this.conns.delete(id);
        this.room.removePlayer(id);
        this.balanceBots();
        this.broadcastRoster();
      },
    };
  }

  private balanceBots(): void {
    while (this.room.players.size < this.options.fillTo && !this.room.isFull) {
      const p = this.room.addPlayer(Bot.pickName(this.room), true);
      if (!p) break;
      this.bots.set(p.id, new Bot(this.room, p));
    }
  }

  private removeOneBot(): void {
    if (this.room.players.size < this.options.fillTo && !this.room.isFull) return;
    const first = this.bots.keys().next();
    if (first.done) return;
    this.bots.delete(first.value);
    this.room.removePlayer(first.value);
  }

  /** Advances exactly one server tick. */
  step(): void {
    for (const b of this.bots.values()) b.update();
    this.room.update();
    if (isSnapshotTick(this.room.tick)) this.broadcastState();
  }

  private broadcastState(): void {
    // Enemy positions go out at half the snapshot rate (10 Hz); clients interpolate them further in the past.
    this.snapshots += 1;
    const shared = this.room.sharedSnapshot(this.snapshots % 2 === 0);
    for (const [id, conn] of this.conns) {
      conn.send(encodeSnapshot(this.room.snapshotFor(id, shared)));
    }
    const list = this.room.drainEvents();
    if (list.length > 0) this.broadcastText({ t: 'events', tick: this.room.tick, list });
  }

  private broadcastRoster(): void {
    this.broadcastText({ t: 'roster', players: this.room.roster() });
  }

  private broadcastText(msg: ServerText): void {
    const s = JSON.stringify(msg);
    for (const conn of this.conns.values()) conn.send(s);
  }

  private sendText(conn: Connection, msg: ServerText): void {
    conn.send(JSON.stringify(msg));
  }

  /** Fixed-step loop driven by wall-clock time so late timers catch up. */
  start(now: () => number = () => performance.now()): void {
    if (this.timer) return;
    this.lastTime = now();
    this.timer = setInterval(() => {
      const t = now();
      this.acc += Math.min(250, t - this.lastTime);
      this.lastTime = t;
      const stepMs = 1000 / TICK_RATE;
      while (this.acc >= stepMs) {
        this.acc -= stepMs;
        this.step();
      }
    }, 1000 / TICK_RATE / 2);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
