import * as THREE from 'three';
import { wood } from '../scene/materials.ts';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { humanoidDef, type HumanoidOptions } from './humanoid.ts';
import { buildFigure, instantiate, type FigureInstance, type FigureTemplate } from './rig.ts';

/**
 * The cast. Heroes are realistic knitted action figures; every player gets
 * their yarn colour on the jacket. Enemies are harsh mass-knit acrylic.
 */

const HERO_LOOKS: Omit<HumanoidOptions, 'name' | 'colors'>[] = [
  { headwear: 'hair', beard: 'full', glasses: true, gloves: false, muscle: 0.9 },
  { headwear: 'beanie', beard: 'none', gloves: true },
  { headwear: 'beanie', beard: 'mustache', gloves: true, muscle: 1.1 },
  { headwear: 'hair', beard: 'none', gloves: true, shoulders: 0.95 },
];

const SKIN_TONES = [0xd9b89a, 0xc79a78, 0x9a6b4c, 0xe6ccb0, 0x7a5038];

export function heroOptions(color: number, variant: number, quality: 'game' | 'hero' = 'game'): HumanoidOptions {
  const look = HERO_LOOKS[variant % HERO_LOOKS.length];
  const trim = new THREE.Color(color).multiplyScalar(0.72).getHex();
  return {
    name: `hero-${color.toString(16)}-${variant % HERO_LOOKS.length}-${quality}`,
    ...look,
    merged: quality === 'game',
    cell: quality === 'hero' ? 0.0085 : 0.012,
    colors: {
      skin: SKIN_TONES[variant % SKIN_TONES.length],
      jacket: color,
      trim,
      pants: variant % 2 ? 0x3b5a8a : 0x5a5f6a,
      boots: 0x5a3a26,
      gloves: 0x3b3f4a,
      hat: variant % 3 === 1 ? 0xefe3c8 : trim,
      hair: variant === 0 ? 0x7c7c82 : 0x3a2a20,
      beard: 0x8a8a90,
    },
  };
}

/** "Grumble": the bearded, spectacled knitted figure from the reference photo. */
export function grumbleOptions(quality: 'game' | 'hero' = 'hero'): HumanoidOptions {
  return {
    name: `grumble-${quality}`,
    headwear: 'hair', beard: 'full', glasses: true, gloves: false, muscle: 0.88, shoulders: 0.94,
    cell: quality === 'hero' ? 0.0075 : 0.012,
    colors: { skin: 0xd9c2a0, jacket: 0xe8742a, trim: 0xe8742a, pants: 0x55595f, boots: 0x4a3226, hair: 0x6c6c72, beard: 0x7e7e84, mustache: 0x4a3024 },
    patterns: { jacket: 'stocking' },
  };
}

export function gruntOptions(): HumanoidOptions {
  return {
    name: 'grunt',
    headwear: 'helmet', beard: 'none', gloves: true, eyes: 'glow', eyeColor: 0xff4030,
    jacketButtons: false, muscle: 0.95, cell: 0.016, merged: true,
    colors: { skin: 0xc8bca4, jacket: 0xb3262c, trim: 0x7a1a1e, pants: 0x3b3f4a, boots: 0x1e1e22, gloves: 0x1e1e22, hat: 0x3a4a34, belt: 0x8a7a50 },
    patterns: { skin: 'garter' },
  };
}

export function bruteOptions(): HumanoidOptions {
  return {
    name: 'brute',
    scale: 1.62, shoulders: 1.45, muscle: 1.55, belly: 1.35, armLength: 1.18, headSize: 0.78,
    headwear: 'none', beard: 'none', gloves: false, eyes: 'glow', eyeColor: 0xff8a2a,
    belt: false, jacketButtons: false, cell: 0.016, merged: true,
    colors: { skin: 0x3e5a3a, jacket: 0x3e5a3a, trim: 0x2e4a2c, pants: 0x344d31, boots: 0x2a2a24, belt: 0x6a4a2a },
    patterns: { skin: 'felt', jacket: 'felt', pants: 'felt' },
  };
}

const templates = new Map<string, FigureTemplate>();

export function figureTemplate(o: HumanoidOptions): FigureTemplate {
  let t = templates.get(o.name);
  if (!t) {
    t = buildFigure(humanoidDef(o));
    templates.set(o.name, t);
  }
  return t;
}

export function spawnFigure(o: HumanoidOptions): FigureInstance {
  return instantiate(figureTemplate(o));
}

/** Knitted toy blaster held by figures (and by grunts, a knitted rifle). */
export function heldBlaster(color = 0x8bcb3a, rifle = false, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const knit = createWoolMaterial({ color, pattern: 'rib', uvSize: [0.4, 0.5], gauge: 1.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 * scale, (rifle ? 0.36 : 0.2) * scale, 6, 14), knit);
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.08 * scale;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.05 * scale, 20), wood());
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 0.02 * scale, 0);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03 * scale, 0.07 * scale, 0.035 * scale), wood(0xb88a58));
  grip.position.set(0, -0.04 * scale, 0.03 * scale);
  grip.rotation.x = 0.3;
  g.add(body, drum, grip);
  if (rifle) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035 * scale, 0.06 * scale, 0.12 * scale), wood(0x8a5a3a));
    stock.position.set(0, -0.01 * scale, 0.12 * scale);
    g.add(stock);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}
