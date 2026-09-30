import { INPUT_RATE, TICK_RATE } from './constants.ts';
import { Buildable, BUILDABLES, Phase } from './coop.ts';
import { ENEMIES } from './enemies.ts';
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

interface Target { key: string; x: number; y: number; z: number }

/**
 * Server-side bot that fills empty slots. It sends the same InputCmds a human
 * would, so it obeys exactly the same movement and weapon rules. In PvP it
 * hunts players; in co-op it defends the Heartspools and builds on free pads.
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
  private targetKey = '';
  private target: Target | null = null;
  private buildCooldown = 2 + Math.random() * 4;

  constructor(private room: Room, player: RoomPlayer) {
    this.id = player.id;
    this.goal = this.pickGoal();
  }

  static pickName(room: Room): string {
    const used = new Set([...room.players.values()].map((p) => p.name));
    return BOT_NAMES.find((n) => !used.has(`${n} (bot)`))?.concat(' (bot)') ?? 'Stuffing (bot)';
  }

  private pickGoal(): Vec3 {
    const coop = this.room.coop;
    if (coop) {
      // Patrol near a living Heartspool.
      const cores = this.room.world.coop.cores.filter((_, i) => coop.cores[i].alive);
      const c = cores[Math.floor(Math.random() * cores.length)] ?? this.room.world.coop.cores[0];
      const pads = this.room.world.coop.pads.filter((p) => Math.hypot(p.pos[0] - c[0], p.pos[2] - c[2]) < 5);
      const p = pads[Math.floor(Math.random() * pads.length)];
      return p ? p.pos : c;
    }
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

  private findTarget(me: RoomPlayer, eye: Vec3): Target | null {
    let best: Target | null = null;
    let bestD = this.room.coop ? 22 : 28;
    const consider = (t: Target) => {
      const d = Math.hypot(t.x - me.state.x, t.y - me.state.y, t.z - me.state.z);
      if (d >= bestD || !hasLineOfSight(eye, [t.x, t.y, t.z], this.room.world.boxes)) return;
      best = t;
      bestD = d;
    };
    if (this.room.coop) {
      for (const e of this.room.coop.enemies) {
        if (e.hp > 0) consider({ key: `e${e.id}`, x: e.x, y: e.y + ENEMIES[e.type].height * 0.55, z: e.z });
      }
    } else {
      for (const o of this.room.players.values()) {
        if (o.id !== me.id && o.alive) consider({ key: `p${o.id}`, x: o.state.x, y: o.state.y + 1.0, z: o.state.z });
      }
    }
    return best;
  }

  private refreshTarget(): Target | null {
    const t = this.target;
    if (!t) return null;
    if (t.key.startsWith('e')) {
      const e = this.room.coop?.enemies.find((q) => `e${q.id}` === t.key && q.hp > 0);
      return e ? { key: t.key, x: e.x, y: e.y + ENEMIES[e.type].height * 0.55, z: e.z } : null;
    }
    const p = this.room.players.get(Number(t.key.slice(1)));
    return p && p.alive ? { key: t.key, x: p.state.x, y: p.state.y + 1.0, z: p.state.z } : null;
  }

  private think(me: RoomPlayer, sub: number): InputCmd {
    const s = me.state;
    const dt = 1 / INPUT_RATE;
    let buttons = 0;
    const eye = eyePosition(s, false);

    if (sub === 0) {
      const t = this.findTarget(me, eye);
      if (t && t.key !== this.targetKey) {
        this.reaction = 0.25 + Math.random() * 0.35;
        this.aimError = (Math.random() - 0.5) * 0.2;
      }
      this.target = t;
      this.targetKey = t?.key ?? '';
    } else {
      this.target = this.refreshTarget();
    }
    const target = this.target;

    let desiredYaw = this.yaw;
    let desiredPitch = 0;
    if (target) {
      const dx = target.x - s.x;
      const dz = target.z - s.z;
      const dist = Math.hypot(dx, dz);
      desiredYaw = Math.atan2(-dx, -dz) + this.aimError;
      desiredPitch = Math.atan2(target.y - eye[1], dist);
      this.aimError *= 0.985;
      this.reaction -= dt;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafe = -this.strafe; this.strafeTimer = 0.4 + Math.random() * 0.8; }
      buttons |= this.strafe > 0 ? Buttons.Right : Buttons.Left;
      if (dist > 10) buttons |= Buttons.Forward;
      if (dist < 4) buttons |= Buttons.Back;
      // Shotgun up close, popper at range.
      buttons |= dist < 6 ? Buttons.Weapon2 : Buttons.Weapon1;
      const yawErr = Math.abs(wrapAngle(desiredYaw - this.yaw));
      if (this.reaction <= 0 && yawErr < 0.2) buttons |= Buttons.Fire;
    } else {
      buttons |= this.coopChores(me) ?? 0;
      const dx = this.goal[0] - s.x;
      const dz = this.goal[2] - s.z;
      if (Math.hypot(dx, dz) < 1.2) {
        if (!this.room.coop || Math.random() < 0.01) this.goal = this.pickGoal();
      } else {
        desiredYaw = Math.atan2(-dx, -dz);
        buttons |= Buttons.Forward;
      }
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
    const mag = s.weapon === 0 ? s.ammo : s.ammoB;
    if (mag === 0 && s.reload === 0) buttons |= Buttons.Reload;

    this.seq += 1;
    return {
      seq: this.seq,
      buttons,
      yaw: Math.fround(this.yaw),
      pitch: Math.fround(this.pitch),
      renderTick: this.room.tick,
    };
  }

  /** During the build phase, walk to a free pad and spend some of the team's buttons. */
  private coopChores(me: RoomPlayer): number {
    const coop = this.room.coop;
    if (!coop || coop.phase !== Phase.Build) return 0;
    this.buildCooldown -= 1 / INPUT_RATE;
    if (this.buildCooldown > 0 || coop.buttons < BUILDABLES[Buildable.Turret].cost + 50) return 0;
    const pads = this.room.world.coop.pads;
    let free = -1;
    let best = Infinity;
    pads.forEach((p, i) => {
      if (coop.pads[i].kind !== Buildable.None || !coop.cores[p.core].alive) return;
      const d = Math.hypot(p.pos[0] - me.state.x, p.pos[2] - me.state.z);
      if (d < best) { best = d; free = i; }
    });
    if (free < 0) return 0;
    this.goal = pads[free].pos;
    if (best > 1.5) return 0;
    this.buildCooldown = 4 + Math.random() * 6;
    const roll = Math.random();
    return roll < 0.6 ? Buttons.Build1 : roll < 0.8 ? Buttons.Build2 : Buttons.Build3;
  }
}
