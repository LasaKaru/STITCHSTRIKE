import * as THREE from 'three';
import { Buildable, type CoopState, type World } from '@stitchstrike/shared';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { metal, wood } from './materials.ts';
import { createHeartspool } from './props.ts';

/** Colour code per Heartspool: A, B, C (pads and HUD bars match). */
export const CORE_COLORS = [0xe8742a, 0x8bcb3a, 0x6fb4ff];
export const CORE_LETTERS = ['A', 'B', 'C'];

function padTexture(color: number, letter: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  g.fillStyle = '#5a4a3c';
  g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.fillStyle = hex;
  g.globalAlpha = 0.35;
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // Running-stitch ring, like an embroidered patch.
  g.strokeStyle = hex;
  g.lineWidth = 10;
  g.setLineDash([22, 14]);
  g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = hex;
  g.font = 'bold 110px ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 0.55;
  g.fillText(letter, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelSprite(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.setLineDash([12, 8]);
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#20242e';
  g.font = 'bold 72px ui-rounded, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.9, 0.9, 1);
  s.renderOrder = 30;
  return s;
}

function turretModel(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.7, 24), createWoolMaterial({ color: 0x3a5da8, pattern: 'crochet', uvSize: [3.5, 0.9], gauge: 1.3 }));
  base.position.y = 0.35;
  const head = new THREE.Group();
  head.position.y = 1.0;
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 20), wood());
  spool.rotation.z = Math.PI / 2;
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 6, 14), createWoolMaterial({ color: 0x8bcb3a, pattern: 'rib', uvSize: [0.75, 1], gauge: 1.5 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.45;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), createWoolMaterial({ color: 0xe8742a, pattern: 'felt', uvSize: [0.9, 0.45], fuzz: 2.4 }));
  pom.position.z = -0.95;
  addShellFuzz(pom);
  head.add(spool, barrel, pom);
  g.add(base, head);
  g.userData.head = head;
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

function wallModel(): THREE.Group {
  const g = new THREE.Group();
  // A long felt pin-cushion bolster studded with dressmaker pins.
  const cushion = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.4, 8, 20), createWoolMaterial({ color: 0xd8262e, pattern: 'felt', uvSize: [3.5, 2.5], fuzz: 1.3 }));
  cushion.rotation.z = Math.PI / 2;
  cushion.position.y = 0.6;
  cushion.scale.set(1, 1, 0.8);
  g.add(cushion);
  const pinMat = metal(0xd0d4da, 0.2);
  const heads = [0xffc94a, 0x6fd6ff, 0xffffff, 0x8bcb3a].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.15, clearcoat: 1 }));
  for (let i = 0; i < 14; i++) {
    const pin = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6), pinMat);
    shaft.position.y = 0.35;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), heads[i % heads.length]);
    knob.position.y = 0.7;
    pin.add(shaft, knob);
    const a = (i / 14) * Math.PI * 2 * 2.3;
    pin.position.set(-0.9 + (i / 13) * 1.8, 0.6, 0);
    pin.rotation.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.5);
    g.add(pin);
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

function matModel(): THREE.Group {
  const g = new THREE.Group();
  const mat = createWoolMaterial({ color: 0x5aa04a, pattern: 'wound', uvSize: [2, 2], gauge: 1.6 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.08, 32), mat);
  disc.position.y = 0.05;
  g.add(disc);
  // Loose tangled loops on top.
  const loopMat = createWoolMaterial({ color: 0x9ae06a, pattern: 'rib', uvSize: [2, 0.2], gauge: 2 });
  for (let i = 0; i < 7; i++) {
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.28 + (i % 3) * 0.08, 0.035, 48, 6, 2 + (i % 2), 3), loopMat);
    const a = (i / 7) * Math.PI * 2;
    knot.position.set(Math.cos(a) * 0.85, 0.15, Math.sin(a) * 0.85);
    knot.rotation.set(Math.PI / 2 + (i % 2) * 0.4, a, 0);
    knot.scale.y = 0.5;
    g.add(knot);
  }
  g.traverse((o) => { o.receiveShadow = true; });
  return g;
}

function barricadeModel(): THREE.Group {
  // Stacked knitted building bricks with crocheted studs.
  const g = new THREE.Group();
  const colors = [0xd8262e, 0xffc94a, 0x2f7fe0, 0x8bcb3a, 0xefe3c8];
  const studMat = new Map<number, THREE.Material>();
  let k = 0;
  for (let row = 0; row < 3; row++) {
    const n = row === 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const color = colors[(k++ * 3 + row) % colors.length];
      const mat = createWoolMaterial({ color, pattern: 'garter', uvSize: [1.2, 0.5], gauge: 1.6 });
      const brick = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.5), mat);
      const x = (i - (n - 1) / 2) * 0.64 + (row % 2) * 0.16;
      brick.position.set(x, 0.18 + row * 0.37, 0);
      g.add(brick);
      if (!studMat.has(color)) studMat.set(color, createWoolMaterial({ color, pattern: 'crochet', uvSize: [0.4, 0.2], gauge: 2 }));
      for (const sx of [-0.15, 0.15]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 14), studMat.get(color)!);
        stud.position.set(x + sx, 0.39 + row * 0.37, 0);
        g.add(stud);
      }
    }
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

function zapperModel(): THREE.Group {
  // A giant battery in a knitted sleeve, with a yarn coil and a crackling spark on top.
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 28), createWoolMaterial({ color: 0x2a2a30, pattern: 'rib', uvSize: [2.6, 1.1], gauge: 1.3 }));
  body.position.y = 0.55;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.32, 28), createWoolMaterial({ color: 0xe8742a, pattern: 'garter', uvSize: [2.6, 0.32], gauge: 1.5 }));
  band.position.y = 0.95;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), metal(0xc88a4a, 0.25));
  cap.position.y = 1.16;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) { const a = i * 0.55; pts.push(new THREE.Vector3(Math.cos(a) * 0.14, 1.22 + i * 0.012, Math.sin(a) * 0.14)); }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.018, 6), metal(0xd98a4a, 0.3));
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ad8ff).multiplyScalar(2.5) }));
  spark.position.y = 2.0;
  const light = new THREE.PointLight(0x9ad8ff, 1.5, 4, 2);
  light.position.y = 2.0;
  g.add(body, band, cap, coil, spark, light);
  g.userData.spark = spark;
  g.userData.light = light;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== spark) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function mousetrapModel(): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 1.9), wood(0xe0b888));
  board.position.y = 0.05;
  const m = metal(0xcfd4da, 0.25);
  const bar = new THREE.Group();
  bar.position.set(0, 0.12, 0.1);
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 24, Math.PI), m);
  u.rotation.x = -Math.PI / 2;
  bar.add(u);
  bar.rotation.x = -0.02;
  const spring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), m);
  spring.rotation.y = Math.PI / 2;
  spring.position.set(0, 0.15, 0.1);
  const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 3, 1, false, 0, Math.PI / 2), createWoolMaterial({ color: 0xffd24a, pattern: 'felt', uvSize: [0.5, 0.3] }));
  cheese.position.set(0.05, 0.18, -0.55);
  g.add(board, bar, spring, cheese);
  g.userData.bar = bar;
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

function springModel(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) { const a = i * 0.4; pts.push(new THREE.Vector3(Math.cos(a) * 0.6, 0.05 + i * 0.005, Math.sin(a) * 0.6)); }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.06, 8), createWoolMaterial({ color: 0x6fd6ff, pattern: 'rib', uvSize: [6, 0.2], gauge: 2 }));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 28), createWoolMaterial({ color: 0xffc94a, pattern: 'crochet', uvSize: [2.5, 0.5], gauge: 1.4 }));
  top.position.y = 0.5;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.35, 3), createWoolMaterial({ color: 0xd8262e, pattern: 'felt', uvSize: [0.5, 0.5] }));
  arrow.position.y = 0.72;
  g.add(coil, top, arrow);
  g.userData.top = top;
  g.userData.arrow = arrow;
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

/** Upgrade tier: gold felt pom-poms around the base (one per tier). */
function tierBadge(tier: number): THREE.Group {
  const g = new THREE.Group();
  const mat = createWoolMaterial({ color: 0xffc94a, pattern: 'felt', uvSize: [0.3, 0.3], fuzz: 2 });
  for (let i = 0; i < tier; i++) {
    const a = -0.5 + (i - (tier - 1) / 2) * 0.45;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat);
    pom.position.set(Math.sin(a) * 1.05, 0.12, Math.cos(a) * 1.05);
    g.add(pom);
  }
  return g;
}

const MODELS: Record<number, () => THREE.Group> = {
  [Buildable.Turret]: turretModel, [Buildable.Wall]: wallModel, [Buildable.Mat]: matModel,
  [Buildable.Barricade]: barricadeModel, [Buildable.Zapper]: zapperModel, [Buildable.Mousetrap]: mousetrapModel, [Buildable.Spring]: springModel,
};

export class CoopProps {
  private cores: { spool: ReturnType<typeof createHeartspool>; label: THREE.Sprite; group: THREE.Group }[] = [];
  private pads: { base: THREE.Mesh; item: THREE.Group | null; kind: number; tier: number; ring: THREE.Mesh; badge: THREE.Group | null; snap: number }[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene, private world: World) {
    world.coop.cores.forEach((c, i) => {
      const spool = createHeartspool(0.6);
      const g = new THREE.Group();
      g.position.set(c[0], 0.75, c[2]);
      g.add(spool.group);
      const label = labelSprite(CORE_LETTERS[i], CORE_COLORS[i]);
      label.position.set(0, 1.4, 0);
      g.add(label);
      this.group.add(g);
      this.cores.push({ spool, label, group: g });
    });
    const padGeo = new THREE.CircleGeometry(1.15, 40);
    const ringGeo = new THREE.RingGeometry(1.2, 1.35, 48);
    world.coop.pads.forEach((p) => {
      const base = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ map: padTexture(CORE_COLORS[p.core], CORE_LETTERS[p.core]), roughness: 1, transparent: true }));
      base.rotation.x = -Math.PI / 2;
      base.position.set(p.pos[0], 0.035, p.pos[2]);
      base.receiveShadow = true;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.5), transparent: true, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.pos[0], 0.04, p.pos[2]);
      this.group.add(base, ring);
      this.pads.push({ base, item: null, kind: Buildable.None, tier: 0, ring, badge: null, snap: 0 });
    });
    scene.add(this.group);
  }

  /** Nearest pad within range, for the build prompt highlight (-1 when none). */
  nearestPad(x: number, z: number, range: number): number {
    let best = -1;
    let bestD = range;
    this.world.coop.pads.forEach((p, i) => {
      const d = Math.hypot(p.pos[0] - x, p.pos[2] - z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** A mousetrap just went off. */
  snap(pad: number): void {
    const p = this.pads[pad];
    if (p) p.snap = 1;
  }

  update(state: CoopState | null, t: number, highlight: number, aimAt: (x: number, z: number) => [number, number] | null): void {
    this.cores.forEach((c, i) => {
      const k = state?.cores[i];
      const alive = !k || k.health > 0;
      c.spool.update(t);
      c.spool.group.visible = alive;
      c.label.material.opacity = alive ? 1 : 0.35;
    });
    this.pads.forEach((p, i) => {
      const kind = state?.pads[i]?.kind ?? Buildable.None;
      const tier = state?.pads[i]?.tier ?? 0;
      if (kind !== p.kind || tier !== p.tier) {
        const pos = this.world.coop.pads[i].pos;
        if (p.badge) { this.group.remove(p.badge); p.badge = null; }
        if (tier > 0 && kind !== Buildable.None) {
          p.badge = tierBadge(tier);
          p.badge.position.set(pos[0], 0, pos[2]);
          this.group.add(p.badge);
        }
        p.tier = tier;
      }
      if (kind !== p.kind) {
        if (p.item) this.group.remove(p.item);
        p.item = MODELS[kind]?.() ?? null;
        if (p.item) {
          const pos = this.world.coop.pads[i].pos;
          p.item.position.set(pos[0], 0, pos[2]);
          if (kind === Buildable.Wall || kind === Buildable.Barricade) {
            // Face the wall across the line from its Heartspool.
            const c = this.world.coop.cores[this.world.coop.pads[i].core];
            p.item.rotation.y = Math.atan2(pos[0] - c[0], pos[2] - c[2]) + Math.PI / 2;
          }
          p.item.userData.pop = 0;
          this.group.add(p.item);
        }
        p.kind = kind;
      }
      if (p.item) {
        // Pop-in animation when built.
        p.item.userData.pop = Math.min(1, (p.item.userData.pop as number) + 0.05);
        const s = p.item.userData.pop as number;
        const grow = 1 + 0.08 * Math.max(0, p.tier - 1);
        p.item.scale.setScalar(grow * (s < 1 ? 0.2 + 0.8 * (1 - Math.pow(1 - s, 3)) * (1 + Math.sin(s * Math.PI) * 0.15) : 1));
        if (kind === Buildable.Zapper) {
          const flick = 0.6 + Math.random() * 0.8;
          (p.item.userData.spark as THREE.Mesh).scale.setScalar(flick);
          (p.item.userData.light as THREE.PointLight).intensity = flick * 1.6;
        } else if (kind === Buildable.Mousetrap) {
          // Snap shut, hold, then spring back open when re-armed.
          p.snap = Math.max(0, p.snap - 0.01);
          const bar = p.item.userData.bar as THREE.Group;
          const target = p.snap > 0 ? -Math.PI * 0.95 : -0.02;
          bar.rotation.x += (target - bar.rotation.x) * (p.snap > 0 ? 0.6 : 0.08);
        } else if (kind === Buildable.Spring) {
          (p.item.userData.arrow as THREE.Mesh).position.y = 0.72 + Math.abs(Math.sin(t * 3)) * 0.15;
        }
        if (kind === Buildable.Turret) {
          const pos = this.world.coop.pads[i].pos;
          const aim = aimAt(pos[0], pos[2]);
          const head = p.item.userData.head as THREE.Group;
          if (aim) head.rotation.y = Math.atan2(-(aim[0] - pos[0]), -(aim[1] - pos[2]));
        }
      }
      const ringMat = p.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = i === highlight ? 0.55 + Math.sin(t * 6) * 0.25 : 0;
    });
  }
}
