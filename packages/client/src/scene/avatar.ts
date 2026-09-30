import * as THREE from 'three';
import { PLAYER } from '@stitchstrike/shared';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { bead, wood } from './materials.ts';

/**
 * Networked toy figure: a cheap version of the hero build (no shells, shared
 * geometry) in the player's yarn colour. Heights match the shared collision
 * capsule (1.5 u) so hits line up with what you see.
 */

const TAU = Math.PI * 2;
const geo = {
  body: new THREE.CapsuleGeometry(0.34, 0.3, 8, 18),
  head: new THREE.SphereGeometry(0.34, 28, 20),
  eye: new THREE.SphereGeometry(0.045, 12, 10),
  leg: new THREE.CapsuleGeometry(0.11, 0.18, 6, 12),
  arm: new THREE.CapsuleGeometry(0.08, 0.26, 6, 12),
  gun: new THREE.CylinderGeometry(0.07, 0.07, 0.4, 14),
};
const headMat = createWoolMaterial({ color: 0xefe3c8, pattern: 'crochet', uvSize: [TAU * 0.34, Math.PI * 0.34] });
const eyeMat = bead();
const gunMat = wood();
const bodyMats = new Map<number, THREE.Material>();

function bodyMat(color: number): THREE.Material {
  let m = bodyMats.get(color);
  if (!m) {
    m = createWoolMaterial({ color, pattern: 'stocking', uvSize: [TAU * 0.34, 0.3 + Math.PI * 0.34] });
    bodyMats.set(color, m);
  }
  return m;
}

export interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  setPose(pitch: number, moving: number, t: number, crouch: boolean): void;
  setDowned(downed: boolean): void;
}

export function createAvatar(color: number): Avatar {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = bodyMat(color);
  const torso = new THREE.Mesh(geo.body, mat);
  torso.position.y = 0.64;
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Mesh(geo.leg, mat);
    l.position.set(s * 0.14, 0.2, 0);
    return l;
  });
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Mesh(geo.arm, mat);
    a.position.set(s * 0.38, 0.72, 0.05);
    a.rotation.z = s * 0.3;
    return a;
  });
  body.add(torso, ...legs, ...arms);

  const head = new THREE.Group();
  head.position.y = 1.16;
  const skull = new THREE.Mesh(geo.head, headMat);
  head.add(skull);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(geo.eye, eyeMat);
    e.position.set(s * 0.12, 0.05, -0.31);
    head.add(e);
  }
  const gun = new THREE.Mesh(geo.gun, gunMat);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0.3, -0.35, -0.35);
  head.add(gun);
  body.add(head);
  root.traverse((o) => { o.castShadow = true; });

  return {
    root,
    head,
    setPose(pitch, moving, t, crouch) {
      head.rotation.x = pitch * 0.6;
      const swing = Math.sin(t * 12) * 0.5 * moving;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      body.position.y = Math.abs(Math.sin(t * 12)) * 0.05 * moving;
      body.scale.y = crouch ? 0.75 : 1;
    },
    setDowned(downed) {
      // Unravelled: slump into a heap.
      body.rotation.x = downed ? -Math.PI / 2.2 : 0;
      body.position.z = downed ? 0.5 : 0;
    },
  };
}

export const AVATAR_HEIGHT = PLAYER.height;
