import { INPUT_DT, JUMP_VELOCITY, PLAYER } from './constants.ts';
import { SWITCH_SECONDS, WEAPON_COUNT, WEAPONS } from './weapons.ts';
import type { Box, Vec3, World } from './world.ts';

export const Buttons = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Crouch: 1 << 6,
  Fire: 1 << 7,
  Reload: 1 << 8,
  /** Hold to interact: re-stitch (revive) a downed teammate. */
  Use: 1 << 9,
} as const;

/**
 * One-shot actions ride in their own byte of an input command (each command
 * reaches the server exactly once, so an action is applied exactly once).
 * 1..15 build (or upgrade) that buildable kind on the nearest pad.
 */
export const Action = {
  None: 0,
  /** Co-op: recycle the buildable on the nearest pad for half its value. */
  Sell: 20,
  /** Co-op: vote to skip the rest of the build phase. */
  Ready: 21,
} as const;

export interface InputCmd {
  seq: number;
  buttons: number;
  /** Radians, float32-exact so client prediction and server agree bit for bit. */
  yaw: number;
  pitch: number;
  /** Server tick (fractional) the client was rendering remote players at; used for lag compensation. */
  renderTick: number;
  /** Weapon slot the player wants equipped. */
  weapon: number;
  /** One-shot Action (0 = none). */
  action: number;
}

/** Everything the shared step function reads or writes. Client prediction replays this exactly. */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  airJumps: number;
  /** Buttons from the previous command, for edge-triggered actions. */
  buttons: number;
  cooldown: number;
  /** Equipped weapon index into WEAPONS. */
  weapon: number;
  /** Rounds left in each weapon's magazine (index = weapon). */
  mags: number[];
  reload: number;
  /** Co-op: knocked down, waiting for a teammate to re-stitch you (crawl only). */
  downed: boolean;
}

export function createPlayerState(spawn: Vec3, yaw = 0): PlayerState {
  return {
    x: spawn[0], y: spawn[1], z: spawn[2],
    vx: 0, vy: 0, vz: 0,
    yaw, pitch: 0,
    onGround: false,
    airJumps: 1,
    buttons: 0,
    cooldown: 0,
    weapon: 0,
    mags: WEAPONS.map((w) => w.magazine),
    reload: 0,
    downed: false,
  };
}

export function clonePlayerState(s: PlayerState): PlayerState {
  return { ...s, mags: s.mags.slice() };
}

export const MAX_PITCH = Math.PI / 2 - 0.01;
const TERMINAL_VELOCITY = 25;
const EPS = 1e-6;

function overlapsAny(boxes: Box[], x: number, y: number, z: number): Box | null {
  const r = PLAYER.radius;
  const h = PLAYER.height;
  for (const b of boxes) {
    if (
      x + r > b.min[0] + EPS && x - r < b.max[0] - EPS &&
      y + h > b.min[1] + EPS && y < b.max[1] - EPS &&
      z + r > b.min[2] + EPS && z - r < b.max[2] - EPS
    ) return b;
  }
  return null;
}

/** The box that blocked the most recent horizontal move (for climbing). */
let lastBlock: Box | null = null;

/** Moves along one axis and pushes back out of any box hit. Returns true if blocked. */
function moveAxis(s: PlayerState, axis: 0 | 1 | 2, delta: number, boxes: Box[]): boolean {
  if (delta === 0) return false;
  const r = PLAYER.radius;
  const h = PLAYER.height;
  if (axis === 0) s.x += delta;
  else if (axis === 1) s.y += delta;
  else s.z += delta;
  let blocked = false;
  // A few passes in case two boxes meet at a seam.
  for (let pass = 0; pass < 3; pass++) {
    const b = overlapsAny(boxes, s.x, s.y, s.z);
    if (!b) break;
    blocked = true;
    if (axis !== 1) lastBlock = b;
    if (axis === 0) s.x = delta > 0 ? b.min[0] - r : b.max[0] + r;
    else if (axis === 1) s.y = delta > 0 ? b.min[1] - h : b.max[1];
    else s.z = delta > 0 ? b.min[2] - r : b.max[2] + r;
  }
  return blocked;
}

function moveHorizontal(s: PlayerState, dx: number, dz: number, boxes: Box[], canStep: boolean): { bx: boolean; bz: boolean } {
  const sx = s.x, sy = s.y, sz = s.z;
  const bx = moveAxis(s, 0, dx, boxes);
  const bz = moveAxis(s, 2, dz, boxes);
  if (!(bx || bz) || !canStep) return { bx, bz };

  // Step-up: retry the move lifted by stepHeight, then settle back down.
  const flat = { x: s.x, y: s.y, z: s.z };
  s.x = sx; s.y = sy; s.z = sz;
  if (moveAxis(s, 1, PLAYER.stepHeight, boxes)) {
    s.x = flat.x; s.y = flat.y; s.z = flat.z;
    return { bx, bz };
  }
  const sbx = moveAxis(s, 0, dx, boxes);
  const sbz = moveAxis(s, 2, dz, boxes);
  moveAxis(s, 1, -PLAYER.stepHeight, boxes);
  const gainedFlat = Math.hypot(flat.x - sx, flat.z - sz);
  const gainedStep = Math.hypot(s.x - sx, s.z - sz);
  if (gainedStep > gainedFlat + EPS) return { bx: sbx, bz: sbz };
  s.x = flat.x; s.y = flat.y; s.z = flat.z;
  return { bx, bz };
}

export interface StepResult {
  fired: boolean;
  /** Weapon index that fired (valid when fired). */
  weapon: number;
}

/**
 * Advances one player by one input command (INPUT_DT). Pure and deterministic:
 * the server runs it as truth and the client runs it for prediction.
 */
export function stepPlayer(s: PlayerState, cmd: InputCmd, world: World): StepResult {
  const dt = INPUT_DT;
  const b = cmd.buttons;
  const pressed = b & ~s.buttons;
  s.yaw = cmd.yaw;
  s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cmd.pitch));

  // Wish direction on the ground plane. Yaw 0 looks down -Z (three.js camera convention).
  let fwd = 0, side = 0;
  if (b & Buttons.Forward) fwd += 1;
  if (b & Buttons.Back) fwd -= 1;
  if (b & Buttons.Right) side += 1;
  if (b & Buttons.Left) side -= 1;
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  let wx = -sin * fwd + cos * side;
  let wz = -cos * fwd - sin * side;
  const len = Math.hypot(wx, wz);
  if (len > 0) { wx /= len; wz /= len; }

  const crouch = (b & Buttons.Crouch) !== 0;
  const speed = s.downed ? PLAYER.crawlSpeed : crouch ? PLAYER.crouchSpeed : (b & Buttons.Sprint) ? PLAYER.sprintSpeed : PLAYER.runSpeed;
  const response = s.onGround ? PLAYER.groundResponse : PLAYER.airResponse;
  const k = 1 - Math.exp(-response * dt);
  s.vx += (wx * speed - s.vx) * k;
  s.vz += (wz * speed - s.vz) * k;

  if ((pressed & Buttons.Jump) && !s.downed) {
    if (s.onGround) {
      s.vy = JUMP_VELOCITY;
      s.onGround = false;
    } else if (s.airJumps > 0) {
      s.vy = JUMP_VELOCITY * 0.9;
      s.airJumps -= 1;
    }
  }

  s.vy = Math.max(-TERMINAL_VELOCITY, s.vy - PLAYER.gravity * dt);

  const boxes = world.boxes;
  lastBlock = null;
  const wantX = s.vx, wantZ = s.vz;
  const hit = moveHorizontal(s, s.vx * dt, s.vz * dt, boxes, s.onGround);
  if (hit.bx) s.vx = 0;
  if (hit.bz) s.vz = 0;
  // Climbing: walk into fabric or bark and you go up it (a toy's grippy knitted hands).
  const climbing = (hit.bx || hit.bz) && lastBlock !== null && (lastBlock as Box).climb === true && (b & Buttons.Forward) !== 0 && !s.downed;
  if (climbing) {
    s.vy = Math.max(s.vy, PLAYER.climbSpeed);
    s.airJumps = 1;
    // Keep pressing into the surface so we stay on it as we rise.
    if (hit.bx) s.vx = wantX * 0.2;
    if (hit.bz) s.vz = wantZ * 0.2;
  }

  const dy = s.vy * dt;
  const blockedY = moveAxis(s, 1, dy, boxes);
  if (blockedY) {
    if (dy < 0) {
      s.onGround = true;
      s.airJumps = 1;
    }
    s.vy = 0;
  } else {
    // Probe just below the feet so walking off a ledge clears onGround.
    s.onGround = s.vy <= 0 && overlapsAny(boxes, s.x, s.y - 0.02, s.z) !== null;
    if (s.onGround) s.airJumps = 1;
  }

  // Jump pads and built spring pads fire when you land on them.
  if (s.onGround && !s.downed) {
    let launch = 0;
    for (const j of world.jumpPads) {
      if (Math.abs(s.y - j.y) < 0.3 && Math.hypot(s.x - j.x, s.z - j.z) < j.r) launch = j.launch;
    }
    if (world.springs) {
      for (const j of world.springs) {
        if (s.y < 0.3 && Math.hypot(s.x - j.x, s.z - j.z) < j.r) launch = j.launch;
      }
    }
    if (launch > 0) {
      s.vy = launch;
      s.onGround = false;
      s.airJumps = 1;
    }
  }

  // Keep inside the world even if a box has a gap.
  if (s.y < -3) {
    s.y = 0; s.vy = 0;
  }

  const weapon = s.weapon;
  const fired = s.downed ? false : stepWeapon(s, b, pressed, cmd.weapon, dt);
  s.buttons = b;
  return { fired, weapon };
}

function magazine(s: PlayerState): number {
  return s.mags[s.weapon] ?? 0;
}

function setMagazine(s: PlayerState, v: number): void {
  s.mags[s.weapon] = v;
}

function stepWeapon(s: PlayerState, b: number, pressed: number, wanted: number, dt: number): boolean {
  s.cooldown = Math.max(0, s.cooldown - dt);
  const want = Number.isInteger(wanted) && wanted >= 0 && wanted < WEAPON_COUNT ? wanted : s.weapon;
  if (want !== s.weapon) {
    s.weapon = want;
    s.reload = 0;
    s.cooldown = Math.max(s.cooldown, SWITCH_SECONDS);
    return false;
  }
  const w = WEAPONS[s.weapon];
  if (s.reload > 0) {
    s.reload -= dt;
    if (s.reload <= 0) {
      s.reload = 0;
      setMagazine(s, w.magazine);
    }
    return false;
  }
  if ((pressed & Buttons.Reload) && magazine(s) < w.magazine) {
    s.reload = w.reloadSeconds;
    return false;
  }
  if ((b & Buttons.Fire) && s.cooldown <= 1e-9 && magazine(s) > 0) {
    setMagazine(s, magazine(s) - 1);
    s.cooldown = Math.max(0, s.cooldown) + 1 / w.fireRate;
    if (magazine(s) === 0) s.reload = w.reloadSeconds;
    return true;
  }
  return false;
}

export function eyePosition(s: PlayerState, crouching: boolean): Vec3 {
  const h = s.downed ? PLAYER.eyeHeight * 0.3 : crouching ? PLAYER.eyeHeight * 0.7 : PLAYER.eyeHeight;
  return [s.x, s.y + h, s.z];
}

export function lookDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
