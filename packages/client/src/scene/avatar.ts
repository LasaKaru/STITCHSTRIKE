import * as THREE from 'three';
import { PLAYER } from '@stitchstrike/shared';
import { heldBlaster, heroOptions, spawnFigure } from '../figures/cast.ts';
import { poseHumanoid } from '../figures/humanoid.ts';
import type { FigureInstance } from '../figures/rig.ts';

/**
 * A networked player: a sculpted, rigged knitted action figure in the player's
 * yarn colour, animated procedurally from its movement. Heights match the
 * shared collision volume (1.5 u), so hits line up with what you see.
 */

export interface Avatar {
  root: THREE.Group;
  update(dt: number, t: number, speed: number, pitch: number, crouch: boolean, airborne: boolean, downed: boolean): void;
}

export function createAvatar(color: number, variant = 0): Avatar {
  const root = new THREE.Group();
  const tip = new THREE.Group();
  root.add(tip);
  const figure: FigureInstance = spawnFigure(heroOptions(color, variant));
  tip.add(figure.root);
  const gun = heldBlaster(variant % 2 ? 0xe8742a : 0x8bcb3a);
  figure.root.add(gun);
  let phase = Math.random() * 6;
  let down = 0;
  let crouchBlend = 0;
  return {
    root,
    update(dt, t, speed, pitch, crouch, airborne, downed) {
      phase += dt * speed * 22;
      down += ((downed ? 1 : 0) - down) * Math.min(1, dt * 6);
      crouchBlend += ((crouch ? 1 : 0) - crouchBlend) * Math.min(1, dt * 10);
      poseHumanoid(figure, { t, speed, phase, pitch, crouch: crouchBlend * 0.6, airborne, aiming: down < 0.5, downed: down }, 1, gun);
      gun.visible = down < 0.5;
      // Unravelled: topple onto the back.
      tip.rotation.x = -down * 1.45;
      tip.position.y = down * 0.12;
    },
  };
}

export const AVATAR_HEIGHT = PLAYER.height;
