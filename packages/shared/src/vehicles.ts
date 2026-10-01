import type { Vec3 } from './world.ts';

/**
 * Drivable toys. A knitted safari jeep (fast, rams invaders flat) and a
 * wind-up tank (slow, lobs yarn-ball shells from its turret where you aim).
 * Walk up and press Use to climb in; Use again to hop out. Driving runs in
 * the shared deterministic step, so prediction works exactly as on foot.
 */

export const VehicleKind = { None: 0, Jeep: 1, Tank: 2 } as const;

export interface VehicleDef {
  name: string;
  /** Top speed forward (reverse is half). */
  maxSpeed: number;
  accel: number;
  /** Turn rate at full speed, radians per second. */
  turnRate: number;
  /** Collision radius while driving. */
  radius: number;
  /** Driver eye height above the ground while seated. */
  seatHeight: number;
  /** Damage dealt by ramming at top speed. */
  ram: number;
  /** Shells per second (tanks only). */
  cannonRate?: number;
}

export const VEHICLES: VehicleDef[] = [
  { name: 'On foot', maxSpeed: 0, accel: 0, turnRate: 0, radius: 0.4, seatHeight: 1.2, ram: 0 },
  { name: 'Toy Safari Jeep', maxSpeed: 17, accel: 16, turnRate: 2.4, radius: 1.2, seatHeight: 2.2, ram: 70 },
  { name: 'Wind-up Tank', maxSpeed: 7.5, accel: 9, turnRate: 1.5, radius: 1.5, seatHeight: 2.8, ram: 45, cannonRate: 0.9 },
];

/** How close you must be to climb in. */
export const ENTER_RANGE = 3;
/** Minimum speed for a ram to hurt, and the per-target cooldown between ram hits. */
export const RAM_MIN_SPEED = 4;
export const RAM_COOLDOWN = 0.6;

/** A vehicle parked on a map at the start of a match. */
export interface VehicleSpot { kind: number; pos: Vec3; yaw: number }

/** A parked vehicle in a snapshot (driven ones travel with their driver). */
export interface NetVehicle { kind: number; x: number; y: number; z: number; yaw: number }
