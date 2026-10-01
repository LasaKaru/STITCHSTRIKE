import type { Vec3 } from './world.ts';

/**
 * Pickups: knitted goodies left around the house. Static spots respawn on a
 * timer; unravelled invaders sometimes drop a tuft of stuffing.
 */

export const PickupKind = { Stuffing: 0, Thimble: 1, PowerPom: 2, YarnBasket: 3 } as const;

export interface PickupDef {
  name: string;
  /** Seconds before a static spot refills. */
  respawn: number;
  /** Health (Stuffing), armour (Thimble), boost seconds (Power Pom); Yarn Baskets refill every magazine. */
  amount: number;
}

export const PICKUPS: PickupDef[] = [
  { name: 'Stuffing', respawn: 22, amount: 60 },
  { name: 'Thimble Armour', respawn: 35, amount: 50 },
  { name: 'Power Pom', respawn: 60, amount: 10 },
  { name: 'Yarn Basket', respawn: 18, amount: 0 },
];

/** Power Pom damage multiplier while active. */
export const POWER_MULTIPLIER = 1.5;
export const PICKUP_RADIUS = 1.1;
/** Chance an unravelled invader drops stuffing, and how long the drop lasts. */
export const DROP_CHANCE = 0.07;
export const DROP_SECONDS = 14;
export const MAX_DROPS = 8;

export interface PickupSpot { pos: Vec3; kind: number }

export interface Drop { id: number; kind: number; x: number; y: number; z: number; life: number }
