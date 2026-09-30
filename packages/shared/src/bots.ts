import { INPUT_RATE, TICK_RATE } from './constants.ts';
import { Buildable, BUILDABLES, DECK, MAX_TIER, Phase, upgradeCost } from './coop.ts';
import { ENEMIES } from './enemies.ts';
import { Buttons, eyePosition, type InputCmd } from './movement.ts';
import { PickupKind } from './pickups.ts';
import { PLAYER } from './constants.ts';
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
  private weapon = 0;
  private action = 0;

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
      this.weapon = this.chooseWeapon(target, dist);
      const yawErr = Math.abs(wrapAngle(desiredYaw - this.yaw));
      if (this.reaction <= 0 && yawErr < 0.2) buttons |= Buttons.Fire;
    } else {
      this.coopChores(me);
      this.errands(me);
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
    if ((s.mags[s.weapon] ?? 0) === 0 && s.reload === 0) buttons |= Buttons.Reload;
    // Re-stitch a downed teammate standing right here.
    if (this.reviving(me)) { buttons |= Buttons.Use; buttons &= ~(Buttons.Forward | Buttons.Left | Buttons.Right | Buttons.Back | Buttons.Fire); }

    this.seq += 1;
    const action = this.action;
    this.action = 0;
    return {
      seq: this.seq,
      buttons,
      yaw: Math.fround(this.yaw),
      pitch: Math.fround(this.pitch),
      renderTick: this.room.tick,
      weapon: this.weapon,
      action,
    };
  }

  /** Buster up close, Lance far away, yarn balls into crowds, Popper or Hook in between. */
  private chooseWeapon(target: Target, dist: number): number {
    if (dist < 5) return 1;
    if (this.room.coop) {
      let crowd = 0;
      for (const e of this.room.coop.enemies) if (e.hp > 0 && Math.hypot(e.x - target.x, e.z - target.z) < 3) crowd++;
      if (crowd >= 4 && dist > 8 && dist < 30) return this.seq % 600 < 300 ? 4 : 5;
      if (crowd >= 2 && dist < 24) return 6;
    }
    if (dist > 24) return 2;
    return dist < 12 ? 3 : 0;
  }

  /** Downed teammate within reach, if any. */
  private reviving(me: RoomPlayer): boolean {
    if (!this.room.coop || me.bleed > 0) return false;
    for (const p of this.room.players.values()) {
      if (p !== me && p.alive && p.bleed > 0 && Math.hypot(p.state.x - me.state.x, p.state.z - me.state.z) < PLAYER.reviveRange - 0.4) return true;
    }
    return false;
  }

  /** Between fights: go re-stitch downed teammates, and fetch stuffing when hurt. */
  private errands(me: RoomPlayer): void {
    if (this.room.coop) {
      let best = 30;
      for (const p of this.room.players.values()) {
        if (p === me || !p.alive || p.bleed <= 0) continue;
        const d = Math.hypot(p.state.x - me.state.x, p.state.z - me.state.z);
        if (d < best) { best = d; this.goal = [p.state.x, p.state.y, p.state.z]; }
      }
      if (best < 30) return;
    }
    if (me.health < PLAYER.maxHealth * 0.5) {
      let best = 25;
      for (const spot of this.room.availablePickups()) {
        if (spot.kind !== PickupKind.Stuffing || spot.pos[1] > 0.5) continue;
        const d = Math.hypot(spot.pos[0] - me.state.x, spot.pos[2] - me.state.z);
        if (d < best) { best = d; this.goal = spot.pos; }
      }
    }
  }

  /** During the build phase, walk to a pad and spend some of the team's buttons (building or upgrading). */
  private coopChores(me: RoomPlayer): void {
    const coop = this.room.coop;
    if (!coop || coop.phase !== Phase.Build) return;
    this.buildCooldown -= 1 / INPUT_RATE;
    if (this.buildCooldown > 0 || coop.buttons < 110) return;
    const pads = this.room.world.coop.pads;
    // Prefer an empty pad; with plenty of buttons, upgrade a turret or zapper instead.
    let pick = -1;
    let best = Infinity;
    const rich = coop.buttons > 400;
    pads.forEach((p, i) => {
      const pad = coop.pads[i];
      if (!coop.cores[p.core].alive) return;
      const upgradable = rich && (pad.kind === Buildable.Turret || pad.kind === Buildable.Zapper) && pad.tier < MAX_TIER;
      if (pad.kind !== Buildable.None && !upgradable) return;
      const d = Math.hypot(p.pos[0] - me.state.x, p.pos[2] - me.state.z) + (upgradable ? 6 : 0);
      if (d < best) { best = d; pick = i; }
    });
    if (pick < 0) return;
    this.goal = pads[pick].pos;
    if (Math.hypot(pads[pick].pos[0] - me.state.x, pads[pick].pos[2] - me.state.z) > 1.5) return;
    this.buildCooldown = 4 + Math.random() * 6;
    const pad = coop.pads[pick];
    if (pad.kind !== Buildable.None) {
      if (coop.buttons >= upgradeCost(pad.kind, pad.tier)) this.action = pad.kind;
      return;
    }
    // Mostly turrets and zappers, with blockades, traps and the odd spring pad.
    const weights: [number, number][] = [[Buildable.Turret, 5], [Buildable.Zapper, 3], [Buildable.Wall, 2], [Buildable.Barricade, 2], [Buildable.Mat, 2], [Buildable.Mousetrap, 2], [Buildable.Spring, 0.5]];
    const affordable = weights.filter(([k]) => DECK.includes(k as never) && BUILDABLES[k].cost <= coop.buttons);
    const total = affordable.reduce((a, [, w]) => a + w, 0);
    let roll = Math.random() * total;
    for (const [k, w] of affordable) { roll -= w; if (roll <= 0) { this.action = k; break; } }
  }
}
