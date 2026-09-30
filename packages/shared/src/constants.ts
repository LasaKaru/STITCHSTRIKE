// Scale: 1 unit = 10 cm. A toy is 1.5 units tall, a bedroom ~40 x 35 x 25 units.

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20;

/** 30 Hz ticks into 20 Hz snapshots: send on ticks where the snapshot counter advances (every 1.5 ticks on average). */
export function isSnapshotTick(tick: number): boolean {
  return Math.floor((tick * SNAPSHOT_RATE) / TICK_RATE) > Math.floor(((tick - 1) * SNAPSHOT_RATE) / TICK_RATE);
}

/** Every input command advances the player by exactly this much time, on client and server. */
export const INPUT_RATE = 60;
export const INPUT_DT = 1 / INPUT_RATE;
/** Inputs bundled per packet (60 Hz inputs -> 30 packets/s). */
export const INPUTS_PER_PACKET = 2;

/** Remote entities are drawn this far in the past, interpolating between snapshots. */
export const INTERP_DELAY_MS = 100;
/** Server keeps this much position history for lag compensation. */
export const HISTORY_MS = 1000;
/** Hitscan rewind is capped at this age. */
export const MAX_REWIND_MS = 200;

export const MAX_PLAYERS = 8;

export const PLAYER = {
  radius: 0.4,
  height: 1.5,
  eyeHeight: 1.2,
  /** Hit volume above this height counts as a headshot (heads are ~40% of a toy). */
  headHeight: 0.95,
  runSpeed: 5,
  sprintSpeed: 7,
  crouchSpeed: 2.5,
  jumpHeight: 2.2,
  gravity: 25,
  stepHeight: 0.45,
  groundResponse: 16,
  airResponse: 3,
  maxHealth: 100,
  respawnSeconds: 3,
} as const;

export const JUMP_VELOCITY = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);

/** Phase 0 has one weapon: the Pom-Pom Popper, simplified to hitscan. */
export const POPPER = {
  damage: 9,
  headshotMultiplier: 1.5,
  fireRate: 12,
  magazine: 40,
  reloadSeconds: 1.4,
  range: 60,
} as const;

export const WORLD_BOUNDS = {
  min: [-32, -4, -32] as const,
  max: [32, 28, 32] as const,
};

export const DEFAULT_PORT = 8787;
