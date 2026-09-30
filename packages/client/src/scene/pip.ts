import * as THREE from 'three';
import { addShellFuzz, addStrayFibres, createWoolMaterial, type WoolOptions } from '../wool/woolMaterial.ts';
import { bead, wood } from './materials.ts';

/**
 * Pip (plan §12.1): a small cheerful seal in a blue jumper and denim-yarn trousers.
 * Built from primitives for Phase 0: big round crochet head (~45% of height),
 * tube limbs, mitten hands, a hard wooden button, and a Pom-Pom Popper.
 */

const COLORS = {
  cream: 0xefe3c8,
  muzzle: 0xf6eedc,
  jumper: 0x3a5da8,
  rib: 0x2f4f93,
  denim: 0x5877a6,
  denimCuff: 0x7d98c2,
  boot: 0x7a4a2a,
  nose: 0x3b2a22,
  lime: 0x8bcb3a,
  pompom: 0xe8742a,
};

interface PartOptions extends WoolOptions {
  shells?: boolean;
  fibres?: number;
}

function part(name: string, geometry: THREE.BufferGeometry, opts: PartOptions): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createWoolMaterial(opts));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.shells !== false) addShellFuzz(mesh);
  if (opts.fibres) addStrayFibres(mesh, opts.fibres);
  return mesh;
}

const TAU = Math.PI * 2;

function capsule(r: number, len: number): [THREE.BufferGeometry, [number, number]] {
  return [new THREE.CapsuleGeometry(r, len, 10, 24), [TAU * r, len + Math.PI * r]];
}

function sphere(r: number): [THREE.BufferGeometry, [number, number]] {
  return [new THREE.SphereGeometry(r, 48, 32), [TAU * r, Math.PI * r]];
}

function torus(R: number, r: number): [THREE.BufferGeometry, [number, number]] {
  return [new THREE.TorusGeometry(R, r, 14, 40), [TAU * R, TAU * r]];
}

export interface PipRig {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  update(t: number): void;
}

export function createPip(): PipRig {
  const root = new THREE.Group();
  root.name = 'Pip';

  // Legs + boots.
  for (const side of [-1, 1]) {
    const [lg, lu] = capsule(0.1, 0.16);
    const leg = part(`leg${side}`, lg, { color: COLORS.denim, pattern: 'stocking', uvSize: lu, gauge: 1.3 });
    leg.position.set(side * 0.11, 0.26, 0);
    root.add(leg);
    const [cg, cu] = torus(0.1, 0.035);
    const cuff = part(`legCuff${side}`, cg, { color: COLORS.denimCuff, pattern: 'rib', uvSize: cu, gauge: 1.3 });
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(side * 0.11, 0.15, 0);
    root.add(cuff);
    const [bg, bu] = sphere(0.1);
    const boot = part(`boot${side}`, bg, { color: COLORS.boot, pattern: 'felt', uvSize: bu, fuzz: 1.4 });
    boot.scale.set(1.15, 0.7, 1.55);
    boot.position.set(side * 0.11, 0.07, 0.04);
    root.add(boot);
  }

  // Jumper body with ribbed hem and collar.
  const [bodyG, bodyU] = capsule(0.27, 0.2);
  const body = part('body', bodyG, { color: COLORS.jumper, pattern: 'stocking', uvSize: bodyU, fibres: 220 });
  body.position.y = 0.64;
  body.scale.z = 0.88;
  root.add(body);
  const [hemG, hemU] = torus(0.255, 0.055);
  const hem = part('hem', hemG, { color: COLORS.rib, pattern: 'rib', uvSize: hemU });
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.88, 1);
  hem.position.y = 0.4;
  root.add(hem);
  const [colG, colU] = torus(0.15, 0.065);
  const collar = part('collar', colG, { color: COLORS.rib, pattern: 'rib', uvSize: colU });
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.92;
  root.add(collar);

  // Hard wooden 4-hole button on the chest: the "one hard thing" from the reference photos.
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.022, 32), wood(0xd9b38a));
  button.rotation.x = Math.PI / 2;
  button.position.set(0.0, 0.7, 0.245);
  button.castShadow = true;
  for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 10), new THREE.MeshBasicMaterial({ color: 0x2a1a10 }));
    hole.position.set(hx * 0.015, 0, hy * 0.015);
    button.add(hole);
  }
  root.add(button);

  // Arms pivot at the shoulders so the idle animation can swing them.
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0.84, 0);
    const [ag, au] = capsule(0.078, 0.22);
    const arm = part(`arm${side}`, ag, { color: COLORS.jumper, pattern: 'stocking', uvSize: au, gauge: 1.2 });
    arm.position.y = -0.17;
    pivot.add(arm);
    const [cg, cu] = torus(0.075, 0.03);
    const cuff = part(`armCuff${side}`, cg, { color: COLORS.rib, pattern: 'rib', uvSize: cu, gauge: 1.2 });
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.33;
    pivot.add(cuff);
    const [mg, mu] = sphere(0.088);
    const mitten = part(`mitten${side}`, mg, { color: COLORS.cream, pattern: 'crochet', uvSize: mu, gauge: 1.2 });
    mitten.position.y = -0.4;
    pivot.add(mitten);
    pivot.rotation.z = side * 0.35;
    root.add(pivot);
    arms.push(pivot);
  }

  // Head: crochet sphere, felt muzzle, bead eyes, stitched nose and smile.
  const head = new THREE.Group();
  head.position.y = 1.15;
  const [hg, hu] = sphere(0.34);
  const skull = part('head', hg, { color: COLORS.cream, pattern: 'crochet', uvSize: hu, fibres: 260 });
  head.add(skull);
  const [mzg, mzu] = sphere(0.13);
  const muzzle = part('muzzle', mzg, { color: COLORS.muzzle, pattern: 'felt', uvSize: mzu, fuzz: 1.6 });
  const muzzleRadii = new THREE.Vector3(1.25, 0.8, 0.8).multiplyScalar(0.13);
  const muzzleCentre = new THREE.Vector3(0, -0.09, 0.27);
  muzzle.scale.set(1.25, 0.8, 0.8);
  muzzle.position.copy(muzzleCentre);
  head.add(muzzle);

  for (const side of [-1, 1]) {
    const dir = new THREE.Vector3(side * 0.13, 0.06, 0.3).normalize();
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 24, 16), bead());
    eye.position.copy(dir.multiplyScalar(0.33));
    eye.castShadow = true;
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(0.012, 0.016, 0.036);
    eye.add(glint);
  }

  const [ng, nu] = sphere(0.045);
  const nose = part('nose', ng, { color: COLORS.nose, pattern: 'felt', uvSize: nu, shells: false });
  nose.scale.set(1.35, 0.85, 0.8);
  nose.position.set(0, -0.045, 0.37);
  head.add(nose);

  // Stitched smile + philtrum: dark yarn laid on the muzzle surface.
  const onMuzzle = (x: number, y: number): THREE.Vector3 => {
    const nx = x / muzzleRadii.x;
    const ny = (y - muzzleCentre.y) / muzzleRadii.y;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return new THREE.Vector3(x, y, muzzleCentre.z + muzzleRadii.z * nz + 0.004);
  };
  const smilePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = -0.075 + (0.15 * i) / 16;
    smilePts.push(onMuzzle(x, -0.135 + 0.028 * (x / 0.075) ** 2));
  }
  const yarnMat = createWoolMaterial({ color: COLORS.nose, pattern: 'stocking', uvSize: [0.05, 0.3], gauge: 3 });
  const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smilePts), 32, 0.011, 8), yarnMat);
  head.add(smile);
  const philtrum = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([onMuzzle(0, -0.075), onMuzzle(0, -0.105), onMuzzle(0, -0.134)]), 8, 0.01, 8),
    yarnMat,
  );
  head.add(philtrum);
  root.add(head);

  // Pom-Pom Popper in the right mitten: lime knit barrel, wooden spool drum, orange pom-pom.
  const popper = createPopper();
  // The arm pivot is pitched forward; counter-rotate so the barrel points ahead of Pip.
  popper.position.set(0, -0.42, 0.02);
  popper.rotation.set(0.35, -1.0, 0);
  arms[1].add(popper);

  const baseBodyY = body.position.y;
  return {
    root, head, body, armL: arms[0], armR: arms[1],
    update(t: number) {
      // Soft idle: breathing squash, head bob and a lazy arm sway.
      const breath = Math.sin(t * 2.1);
      body.scale.set(1 + breath * 0.012, 1 - breath * 0.015, 0.88 + breath * 0.01);
      body.position.y = baseBodyY - breath * 0.004;
      head.position.y = 1.15 + Math.sin(t * 2.1 - 0.5) * 0.008;
      head.rotation.z = Math.sin(t * 0.7) * 0.06;
      head.rotation.y = Math.sin(t * 0.45) * 0.18;
      arms[0].rotation.z = -0.35 - Math.sin(t * 1.3) * 0.04;
      arms[1].rotation.x = -0.55 + Math.sin(t * 1.1) * 0.03;
      arms[1].rotation.z = 0.2;
    },
  };
}

/** The starter weapon, reused as the first-person view model in the arena. */
export function createPopper(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'PomPomPopper';
  const [bg, bu] = capsule(0.055, 0.3);
  const barrel = part('popperBarrel', bg, { color: COLORS.lime, pattern: 'rib', uvSize: bu, gauge: 1.4 });
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.1;
  g.add(barrel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 32), wood());
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 0.03, 0.02);
  drum.castShadow = true;
  g.add(drum);
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.014, 32), wood(0xc89a68));
    rim.rotation.z = Math.PI / 2;
    rim.position.set(side * 0.052, 0.03, 0.02);
    rim.castShadow = true;
    g.add(rim);
  }
  const [pg, pu] = sphere(0.06);
  const pompom = part('pompom', pg, { color: COLORS.pompom, pattern: 'felt', uvSize: pu, fuzz: 2.4 });
  pompom.position.z = 0.3;
  g.add(pompom);
  return g;
}
