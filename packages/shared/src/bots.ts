import { INPUT_RATE, TICK_RATE } from './constants.ts';
import { Buttons, eyePosition, type InputCmd } from './movement.ts';
import { hasLineOfSight } from './raycast.ts';
import type { Room, RoomPlayer } from './room.ts';
import type { Vec3 } from './world.ts';

const BOT_NAMES = ['Bobbin', 'Purl', 'Tassel', 'Moss', 'Skein', 'Cable', 'Fuzz', 'Loop'];
const INPUTS_PER_TICK = Math.round(INPUT_RATE / TICK_RATE);

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Simple server-side bot that fills empty slots. It sends the same InputCmds a
 * human would, so it obeys exactly the same movement and weapon rules.
 */
export class Bot {
  readonly id: number;
  private seq = 0;
  private yaw = 0;
  private pitch = 0;
  private goal: Vec3;
  private strafe = 1;
  private strafeTimer = 0;
  private stuckTimer = 0;
  private last: Vec3 = [0, 0, 0];
  private aimError = 0;
  private reaction = 0;
  private targetId = 0;

  constructor(private room: Room, player: RoomPlayer) {
    this.id = player.id;
    this.goal = this.pickGoal();
  }

  static pickName(room: Room): string {
    const used = new Set([...room.players.values()].map((p) => p.name));
    return BOT_NAMES.find((n) => !used.has(`${n} (bot)`))?.concat(' (bot)') ?? 'Stuffing (bot)';
  }

  private pickGoal(): Vec3 {
    const w = this.room.world.waypoints;
    return w[Math.floor(Math.random() * w.length)];
  }

  update(): void {
    const me = this.room.players.get(this.id);
    if (!me) return;
    const cmds: InputCmd[] = [];
    for (let i = 0; i < INPUTS_PER_TICK; i++) cmds.push(this.think(me, i));
    this.room.queueInputs(this.id, cmds);
  }

  private think(me: RoomPlayer, sub: number): InputCmd {
    const s = me.state;
    const dt = 1 / INPUT_RATE;
    let buttons = 0;

    // Find the nearest visible living opponent.
    const eye = eyePosition(s, false);
    let target: RoomPlayer | null = null;
    let targetDist = 28;
    if (sub === 0) {
      for (const o of this.room.players.values()) {
        if (o.id === me.id || !o.alive) continue;
        const d = Math.hypot(o.state.x - s.x, o.state.y - s.y, o.state.z - s.z);
        if (d >= targetDist) continue;
        const aim: Vec3 = [o.state.x, o.state.y + 1.0, o.state.z];
        if (!hasLineOfSight(eye, aim, this.room.world.boxes)) continue;
        target = o;
        targetDist = d;
      }
      if (target && target.id !== this.targetId) {
        this.targetId = target.id;
        this.reaction = 0.25 + Math.random() * 0.35;
        this.aimError = (Math.random() - 0.5) * 0.25;
      }
      if (!target) this.targetId = 0;
    } else {
      target = this.targetId ? this.room.players.get(this.targetId) ?? null : null;
      if (target && !target.alive) target = null;
    }

    let desiredYaw = this.yaw;
    let desiredPitch = 0;
    if (target) {
      const dx = target.state.x - s.x;
      const dz = target.state.z - s.z;
      const dy = target.state.y + 0.9 - eye[1];
      desiredYaw = Math.atan2(-dx, -dz) + this.aimError;
      desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
      this.aimError *= 0.985;
      this.reaction -= dt;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafe = -this.strafe; this.strafeTimer = 0.4 + Math.random() * 0.8; }
      buttons |= this.strafe > 0 ? Buttons.Right : Buttons.Left;
      if (targetDist > 10) buttons |= Buttons.Forward;
      if (targetDist < 4) buttons |= Buttons.Back;
      const yawErr = Math.abs(wrapAngle(desiredYaw - this.yaw));
      if (this.reaction <= 0 && yawErr < 0.2) buttons |= Buttons.Fire;
    } else {
      const dx = this.goal[0] - s.x;
      const dz = this.goal[2] - s.z;
      if (Math.hypot(dx, dz) < 1.5) this.goal = this.pickGoal();
      desiredYaw = Math.atan2(-dx, -dz);
      buttons |= Buttons.Forward;
      if (Math.random() < 0.002) buttons |= Buttons.Sprint;
    }

    // Turn toward the desired yaw at a human-ish rate.
    const maxTurn = 5 * dt;
    this.yaw += Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(desiredYaw - this.yaw)));
    this.yaw = wrapAngle(this.yaw);
    this.pitch += (desiredPitch - this.pitch) * 0.2;

    // Hop when stuck against clutter.
    const moved = Math.hypot(s.x - this.last[0], s.z - this.last[2]);
    this.last = [s.x, s.y, s.z];
    if ((buttons & (Buttons.Forward | Buttons.Left | Buttons.Right)) && moved < 0.01) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 0.15) {
      // Pulse the button: jumps are edge-triggered.
      if (this.seq % 16 < 8) buttons |= Buttons.Jump;
      if (this.stuckTimer > 1.2) { this.goal = this.pickGoal(); this.stuckTimer = 0; }
    }
    if (s.ammo === 0 && s.reload === 0) buttons |= Buttons.Reload;

    this.seq += 1;
    return {
      seq: this.seq,
      buttons,
      yaw: Math.fround(this.yaw),
      pitch: Math.fround(this.pitch),
      renderTick: this.room.tick,
    };
  }
}
