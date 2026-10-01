import * as THREE from 'three';
import { PLAYER, type Look } from '@stitchstrike/shared';
import { lookOptions } from '../figures/looks.ts';
import { heroOptions, spawnFigure } from '../figures/cast.ts';
import { createPopper } from './pip.ts';
import { createBuster } from './viewModel.ts';
import { createGlueGun, createHook, createLance, createLauncher, createStaticSock } from './weaponModels.ts';
import { dressGun, swingCharm } from './charms.ts';
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
  /** Show the weapon this toy has equipped (0..6). */
  setWeapon(i: number): void;
  /** World position of the held weapon's muzzle (third-person tracers and flashes). */
  muzzle(out?: THREE.Vector3): THREE.Vector3;
}

/** The arsenal, built like the first-person models (along +Z, grip near the origin). */
const MAKERS: (() => THREE.Group)[] = [createPopper, createBuster, createLance, createHook, createLauncher, createGlueGun, createStaticSock];
/** Muzzle distance ahead of the grip for each weapon, in model units (matches the view model). */
const MUZZLE = [-0.3, -0.45, -0.95, -0.4, -0.42, -0.36, -0.42];
/** Toy-sized: the first-person models are drawn for a camera a hand's length away. */
const HELD_SCALE = 0.5;

export function createAvatar(color: number, variant = 0, look?: Look): Avatar {
  const root = new THREE.Group();
  const tip = new THREE.Group();
  root.add(tip);
  const figure: FigureInstance = spawnFigure(look ? lookOptions(look, color) : heroOptions(color, variant));
  tip.add(figure.root);
  // The held weapon: one holder per weapon, knitted on first use, shown one at a time.
  const gun = new THREE.Group();
  figure.root.add(gun);
  const holders: (THREE.Group | null)[] = MAKERS.map(() => null);
  let weapon = -1;
  const holderFor = (i: number): THREE.Group => {
    let h = holders[i];
    if (!h) {
      h = new THREE.Group();
      const model = MAKERS[i]();
      model.rotation.y = Math.PI;
      if (i === 0) model.scale.setScalar(0.9);
      dressGun(model, look, new THREE.Vector3(0, -0.09, -0.05), 1, new THREE.Vector3(0.09, 0, 0.16));
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      h.add(model);
      h.scale.setScalar(HELD_SCALE);
      h.position.set(0, 0.02, 0.04);
      gun.add(h);
      holders[i] = h;
    }
    return h;
  };
  const setWeapon = (i: number) => {
    const w = Math.max(0, Math.min(MAKERS.length - 1, i | 0));
    if (w === weapon) return;
    weapon = w;
    const h = holderFor(w);
    for (const o of holders) if (o) o.visible = o === h;
  };
  setWeapon(0);
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
      swingCharm(holderFor(weapon).children[0], t, Math.min(1, speed));
      // Unravelled: topple onto the back.
      tip.rotation.x = -down * 1.45;
      tip.position.y = down * 0.12;
    },
    setWeapon,
    muzzle(out = new THREE.Vector3()) {
      const h = holderFor(weapon);
      root.updateWorldMatrix(true, true);
      return h.localToWorld(out.set(0, 0, MUZZLE[weapon] ?? -0.3));
    },
  };
}

export const AVATAR_HEIGHT = PLAYER.height;
