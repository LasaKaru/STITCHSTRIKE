import {
  clonePlayerState, decodeSnapshot, encodeInputs, INPUT_DT, INPUTS_PER_PACKET, INTERP_DELAY_MS, MSG_SNAPSHOT,
  stepPlayer, TICK_RATE,
  type GameEvent, type InputCmd, type NetPlayer, type PlayerState, type RosterEntry, type ServerText, type Shot, type Snapshot, type World,
} from '@stitchstrike/shared';
import type { Frame, Transport } from './transport.ts';

/**
 * Client half of the netcode (plan §17.3):
 *  - client-side prediction with the shared step function
 *  - server reconciliation (rewind to server state, replay unacked inputs, smooth the error)
 *  - entity interpolation ~100 ms in the past
 *  - render-time stamp on every input so the server can lag-compensate hits
 */

interface Buffered { snap: Snapshot; players: Map<number, NetPlayer> }

export interface RemoteView {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  alive: boolean; crouch: boolean;
}

export interface NetStats {
  rtt: number;
  kbpsIn: number;
  snapshotHz: number;
  pending: number;
  lastCorrection: number;
  transport: string;
}

const MAX_PENDING = 180;
const TICK_MS = 1000 / TICK_RATE;

export class NetClient {
  id = 0;
  room = '';
  roster = new Map<number, RosterEntry>();
  /** Predicted local state; null while unravelled (dead). */
  predicted: PlayerState | null = null;
  /** Local state one input ago, for sub-step render interpolation. */
  previous: PlayerState | null = null;
  respawn = 0;
  /** Visual-only offset that eases reconciliation corrections out over ~100 ms. */
  readonly correction = { x: 0, y: 0, z: 0 };
  latest: Snapshot | null = null;
  status: 'connecting' | 'joined' | 'closed' | 'full' = 'connecting';
  closeReason = '';

  onShot: (s: Shot) => void = () => {};
  onEvent: (e: GameEvent) => void = () => {};
  onRoster: () => void = () => {};
  onSpawn: (s: PlayerState) => void = () => {};

  private seq = 0;
  private pending: InputCmd[] = [];
  private outbox: InputCmd[] = [];
  private buffer: Buffered[] = [];
  /** serverTick ~= localMs * TICK_RATE / 1000 + tickOffset */
  private tickOffset: number | null = null;
  private stats: NetStats;
  private bytesMark = 0;
  private snapsMark = 0;
  private snaps = 0;
  private statsTime = performance.now();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private transport: Transport, private world: World, name: string) {
    this.stats = { rtt: 0, kbpsIn: 0, snapshotHz: 0, pending: 0, lastCorrection: 0, transport: transport.kind };
    transport.onOpen = () => {
      transport.send(JSON.stringify({ t: 'hello', name }));
      this.pingTimer = setInterval(() => transport.send(JSON.stringify({ t: 'ping', c: performance.now() })), 1000);
    };
    transport.onMessage = (d) => this.receive(d);
    transport.onClose = (reason) => {
      if (this.status !== 'full') this.status = 'closed';
      this.closeReason = reason;
      if (this.pingTimer) clearInterval(this.pingTimer);
    };
  }

  close(): void {
    this.transport.close();
  }

  // ------------------------------------------------------------ clock

  private serverTickNow(now: number): number {
    return (now * TICK_RATE) / 1000 + (this.tickOffset ?? 0);
  }

  /** The (fractional) server tick remote players are drawn at. Sent with inputs for lag compensation. */
  renderTick(now = performance.now()): number {
    return this.serverTickNow(now) - (INTERP_DELAY_MS * TICK_RATE) / 1000;
  }

  private observeTick(tick: number, now: number): void {
    const sample = tick - (now * TICK_RATE) / 1000;
    if (this.tickOffset === null || Math.abs(sample - this.tickOffset) > TICK_RATE * 0.5) {
      this.tickOffset = sample;
    } else if (sample > this.tickOffset) {
      // Packets that arrive "early" show the true latest timeline; follow them quickly.
      this.tickOffset += (sample - this.tickOffset) * 0.2;
    } else {
      // Late packets are jitter; drift down slowly.
      this.tickOffset += (sample - this.tickOffset) * 0.02;
    }
  }

  // ------------------------------------------------------------ receive

  private receive(d: Frame): void {
    if (typeof d === 'string') {
      let msg: ServerText;
      try { msg = JSON.parse(d) as ServerText; } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.id = msg.id;
          this.room = msg.room;
          this.status = 'joined';
          break;
        case 'roster':
          this.roster = new Map(msg.players.map((p) => [p.id, p]));
          this.onRoster();
          break;
        case 'events':
          for (const e of msg.list) this.onEvent(e);
          break;
        case 'pong':
          this.stats.rtt = performance.now() - msg.c;
          break;
        case 'full':
          this.status = 'full';
          break;
      }
      return;
    }
    if (d[0] !== MSG_SNAPSHOT) return;
    const snap = decodeSnapshot(d);
    if (!snap) return;
    this.snaps++;
    const now = performance.now();
    this.observeTick(snap.tick, now);
    this.latest = snap;
    this.buffer.push({ snap, players: new Map(snap.players.map((p) => [p.id, p])) });
    while (this.buffer.length > 30) this.buffer.shift();
    for (const s of snap.shots) this.onShot(s);
    this.reconcile(snap);
  }

  private reconcile(snap: Snapshot): void {
    this.pending = this.pending.filter((c) => c.seq > snap.ack);
    this.stats.pending = this.pending.length;
    this.respawn = snap.respawn;
    if (!snap.self) {
      this.predicted = null;
      this.previous = null;
      return;
    }
    const replay = clonePlayerState(snap.self);
    for (const c of this.pending) stepPlayer(replay, c, this.world);
    if (!this.predicted) {
      // Just (re)spawned: adopt the server's facing.
      this.predicted = replay;
      this.previous = clonePlayerState(replay);
      this.correction.x = this.correction.y = this.correction.z = 0;
      this.onSpawn(replay);
      return;
    }
    const ex = this.predicted.x - replay.x;
    const ey = this.predicted.y - replay.y;
    const ez = this.predicted.z - replay.z;
    const err = Math.hypot(ex, ey, ez);
    this.stats.lastCorrection = err;
    if (err > 2) {
      this.correction.x = this.correction.y = this.correction.z = 0;
    } else if (err > 1e-6) {
      this.correction.x += ex;
      this.correction.y += ey;
      this.correction.z += ez;
    }
    // Keep client-owned view angles; the server state echoes the ones we sent.
    replay.yaw = this.predicted.yaw;
    replay.pitch = this.predicted.pitch;
    this.predicted = replay;
  }

  // ------------------------------------------------------------ send / predict

  /**
   * Produces one fixed-step input, predicts it locally, and queues it for the server.
   * Returns true if the local weapon fired this step.
   */
  input(buttons: number, yaw: number, pitch: number, now: number): boolean {
    const cmd: InputCmd = {
      seq: ++this.seq,
      buttons,
      yaw: Math.fround(yaw),
      pitch: Math.fround(pitch),
      renderTick: this.renderTick(now),
    };
    let fired = false;
    if (this.predicted) {
      this.previous = clonePlayerState(this.predicted);
      fired = stepPlayer(this.predicted, cmd, this.world).fired;
    }
    this.pending.push(cmd);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.outbox.push(cmd);
    if (this.outbox.length >= INPUTS_PER_PACKET) this.flush();
    return fired;
  }

  flush(): void {
    if (this.outbox.length === 0 || this.status !== 'joined') { this.outbox.length = 0; return; }
    this.transport.send(encodeInputs(this.outbox));
    this.outbox.length = 0;
  }

  /** Eases out reconciliation error; call once per rendered frame. */
  decayCorrection(dt: number): void {
    const k = Math.exp(-dt / 0.1);
    this.correction.x *= k;
    this.correction.y *= k;
    this.correction.z *= k;
  }

  // ------------------------------------------------------------ interpolation

  /** Remote players sampled at renderTick between the two bracketing snapshots. */
  remotes(now = performance.now()): RemoteView[] {
    const b = this.buffer;
    if (b.length === 0) return [];
    const rt = this.renderTick(now);
    let a = b[0];
    let c = b[b.length - 1];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].snap.tick <= rt) { a = b[i]; c = b[Math.min(b.length - 1, i + 1)]; break; }
    }
    const span = c.snap.tick - a.snap.tick;
    const f = span > 0 ? Math.max(0, Math.min(1, (rt - a.snap.tick) / span)) : 0;
    const out: RemoteView[] = [];
    for (const [id, pa] of a.players) {
      if (id === this.id) continue;
      const pc = c.players.get(id) ?? pa;
      // Don't slide across the map on respawn: snap if the jump is large.
      const teleport = Math.hypot(pc.x - pa.x, pc.z - pa.z) > 3 || pa.alive !== pc.alive;
      const g = teleport ? (f < 0.5 ? 0 : 1) : f;
      let dyaw = pc.yaw - pa.yaw;
      if (dyaw > Math.PI) dyaw -= Math.PI * 2;
      if (dyaw < -Math.PI) dyaw += Math.PI * 2;
      out.push({
        id,
        x: pa.x + (pc.x - pa.x) * g,
        y: pa.y + (pc.y - pa.y) * g,
        z: pa.z + (pc.z - pa.z) * g,
        yaw: pa.yaw + dyaw * g,
        pitch: pa.pitch + (pc.pitch - pa.pitch) * g,
        alive: g < 0.5 ? pa.alive : pc.alive,
        crouch: pc.crouch,
      });
    }
    return out;
  }

  me(): NetPlayer | undefined {
    return this.latest?.players.find((p) => p.id === this.id);
  }

  netStats(now = performance.now()): NetStats {
    const dt = (now - this.statsTime) / 1000;
    if (dt >= 1) {
      this.stats.kbpsIn = ((this.transport.bytesIn - this.bytesMark) * 8) / 1000 / dt;
      this.stats.snapshotHz = (this.snaps - this.snapsMark) / dt;
      this.bytesMark = this.transport.bytesIn;
      this.snapsMark = this.snaps;
      this.statsTime = now;
    }
    return this.stats;
  }

  /** Milliseconds per server tick, exposed for HUD maths. */
  static readonly tickMs = TICK_MS;
  static readonly inputDt = INPUT_DT;
}
