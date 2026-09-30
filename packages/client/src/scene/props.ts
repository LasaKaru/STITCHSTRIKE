import * as THREE from 'three';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { matte, metal, plastic, wood } from './materials.ts';

/** The objective: a glowing ball of wound yarn wrapped in blue shield thread (plan §4, §9.3). */
export function createHeartspool(radius = 0.5): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  group.name = 'Heartspool';
  const mat = createWoolMaterial({ color: 0xffc94a, pattern: 'wound', uvSize: [Math.PI * 2 * radius, Math.PI * radius], gauge: 1.6 });
  mat.emissive = new THREE.Color(0xffb020);
  mat.emissiveIntensity = 0.55;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
  ball.castShadow = true;
  addShellFuzz(ball);
  group.add(ball);

  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x6fd6ff, transparent: true, opacity: 0.85 });
  shieldMat.color.multiplyScalar(2.2);
  const loops: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(radius * (1.12 + i * 0.03), 0.006, 6, 96), shieldMat);
    loop.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    group.add(loop);
    loops.push(loop);
  }
  const light = new THREE.PointLight(0xffb84a, 2.2, 6, 1.6);
  group.add(light);

  // Wooden spool stand.
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.7, radius * 0.5, 32), wood());
  stand.position.y = -radius * 1.0;
  stand.castShadow = stand.receiveShadow = true;
  group.add(stand);

  return {
    group,
    update(t: number) {
      ball.rotation.y = t * 0.25;
      loops.forEach((l, i) => { l.rotation.x += 0.004 * (i + 1); l.rotation.y += 0.003 * (5 - i); });
      mat.emissiveIntensity = 0.5 + Math.sin(t * 2.4) * 0.08;
      light.intensity = 2.0 + Math.sin(t * 2.4) * 0.3;
    },
  };
}

/** Mass-Made enemy: a glossy wind-up walker with visible mould seams and a metal key (plan §10). */
export function createWindUpWalker(color = 0xd8262e): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  group.name = 'WindUpWalker';
  const body = plastic(color);
  const dark = plastic(new THREE.Color(color).multiplyScalar(0.55));
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.5, 2, 2, 2), body);
  torso.position.y = 0.72;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.635, 0.012, 0.515), dark);
  seam.position.y = 0.72;
  const headM = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.4), body);
  headM.position.y = 1.2;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
  visor.material.color.multiplyScalar(2);
  visor.position.set(0, 1.22, 0.205);
  group.add(torso, seam, headM, visor);
  for (const s of [-1, 1]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), metal());
    screw.rotation.x = Math.PI / 2;
    screw.position.set(s * 0.22, 0.9, 0.255);
    group.add(screw);
  }
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.26), dark);
    leg.geometry.translate(0, -0.21, 0);
    leg.position.set(s * 0.17, 0.42, 0);
    group.add(leg);
    legs.push(leg);
  }
  const key = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 10), metal());
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.09;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 24), metal(0xd8c070, 0.25));
  bow.position.z = -0.2;
  key.add(shaft, bow);
  key.position.set(0, 0.78, -0.25);
  group.add(key);
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group,
    update(t: number) {
      key.rotation.z = t * 3;
      legs[0].rotation.x = Math.sin(t * 6) * 0.35;
      legs[1].rotation.x = -Math.sin(t * 6) * 0.35;
      torso.rotation.z = Math.sin(t * 6) * 0.03;
    },
  };
}

export function createSpinningTop(color = 0x2f7fe0): THREE.Group {
  const pts = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.08, 0.1), new THREE.Vector2(0.45, 0.35),
    new THREE.Vector2(0.5, 0.42), new THREE.Vector2(0.2, 0.55), new THREE.Vector2(0.06, 0.6),
    new THREE.Vector2(0.06, 0.8), new THREE.Vector2(0, 0.82),
  ];
  const top = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), plastic(color, 0.2));
  top.castShadow = top.receiveShadow = true;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.02, 8, 48), plastic(0xffc94a, 0.2));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.39;
  const g = new THREE.Group();
  g.add(top, stripe);
  return g;
}

export function createBookStack(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xd8262e, 0x3a5da8, 0xe8742a, 0x8bcb3a];
  let y = 0;
  colors.forEach((c, i) => {
    const h = 0.35 + (i % 2) * 0.12;
    const book = new THREE.Mesh(new THREE.BoxGeometry(3.2 - i * 0.2, h, 2.3 - i * 0.1), matte(c, 0.7));
    book.position.set((i % 2) * 0.15, y + h / 2, (i % 3) * 0.08);
    book.rotation.y = (i - 1.5) * 0.06;
    book.castShadow = book.receiveShadow = true;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(3.1 - i * 0.2, h * 0.8, 0.02), matte(0xf2ecdc, 0.9));
    pages.position.set(0, 0, (2.3 - i * 0.1) / 2 + 0.005);
    book.add(pages);
    g.add(book);
    y += h;
  });
  return g;
}

export function createPencil(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), plastic(0xffc94a, 0.45));
  body.castShadow = body.receiveShadow = true;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), wood());
  cone.position.y = 1.775;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), matte(0x222222, 0.5));
  tip.position.y = 1.9;
  const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 12), matte(0xe87a8a, 0.9));
  eraser.position.y = -1.72;
  g.add(body, cone, tip, eraser);
  g.rotation.z = Math.PI / 2;
  return g;
}

/** A loose sewing button: the in-match currency. */
export function createButtonCoin(color = 0xe8742a): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 32), plastic(color, 0.3));
  m.castShadow = true;
  for (const [hx, hz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    hole.position.set(hx * 0.045, 0, hz * 0.045);
    m.add(hole);
  }
  return m;
}

/** A crocheted yarn skein prop (ammo pickup look). */
export function createSkein(color = 0x8bcb3a): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.22, 0.12, 16, 40);
  const mesh = new THREE.Mesh(geo, createWoolMaterial({ color, pattern: 'wound', uvSize: [Math.PI * 2 * 0.22, Math.PI * 2 * 0.12], gauge: 2 }));
  mesh.castShadow = mesh.receiveShadow = true;
  addShellFuzz(mesh);
  return mesh;
}
