import * as THREE from 'three';
import { PickupKind, stepProjectile, WEAPONS, type NetDrop, type NetProjectile, type Projectile, type World } from '@stitchstrike/shared';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { metal } from './materials.ts';
import { projectileMesh } from './weaponModels.ts';

/**
 * Pickups (stuffing, thimble armour, Power Poms) and yarn balls in flight.
 * Static spots come from the map and switch on and off with the snapshot's
 * availability mask; drops and projectiles come straight from snapshots.
 */

function stuffing(): THREE.Group {
  // A fluffy tuft of polyester stuffing with a stitched red cross.
  const g = new THREE.Group();
  const white = createWoolMaterial({ color: 0xf8f4ec, pattern: 'felt', uvSize: [0.6, 0.6], fuzz: 3 });
  for (const [x, y, z, r] of [[0, 0.3, 0, 0.26], [0.2, 0.22, 0.05, 0.18], [-0.18, 0.24, -0.04, 0.2], [0.02, 0.44, 0.02, 0.16]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), white);
    m.position.set(x, y, z);
    g.add(m);
    addShellFuzz(m);
  }
  const red = createWoolMaterial({ color: 0xd8262e, pattern: 'rib', uvSize: [0.3, 0.1], gauge: 2 });
  for (const rot of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.07), red);
    bar.position.set(0, 0.52, 0);
    bar.rotation.y = rot;
    g.add(bar);
  }
  return g;
}

function thimble(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(0.22 - 0.05 * t - (t > 0.85 ? (t - 0.85) * 1.2 : 0), t * 0.42));
  }
  pts.push(new THREE.Vector2(0, 0.44));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), metal(0xc9ced6, 0.22));
  shell.position.y = 0.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 28), metal(0xd9b24a, 0.2));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.11;
  const glow = new THREE.PointLight(0x6fd6ff, 0.8, 2.5, 2);
  glow.position.y = 0.35;
  g.add(shell, rim, glow);
  return g;
}

function powerPom(): THREE.Group {
  const g = new THREE.Group();
  const mat = createWoolMaterial({ color: 0xff5ab4, pattern: 'felt', uvSize: [0.8, 0.8], fuzz: 3.5 });
  mat.emissive = new THREE.Color(0xff3aa0);
  mat.emissiveIntensity = 0.6;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), mat);
  pom.position.y = 0.45;
  addShellFuzz(pom);
  const light = new THREE.PointLight(0xff5ab4, 1.2, 3, 2);
  light.position.y = 0.45;
  g.add(pom, light);
  return g;
}

const MAKERS = [stuffing, thimble, powerPom];

export class PickupsView {
  private spots: THREE.Group[] = [];
  private drops: THREE.Group[] = [];
  private balls: THREE.Mesh[] = [];
  private local: { p: Projectile; mesh: THREE.Mesh }[] = [];

  constructor(private scene: THREE.Scene, private world: World) {
    for (const s of world.pickups) {
      const g = new THREE.Group();
      g.add(MAKERS[s.kind]());
      g.position.set(s.pos[0], s.pos[1], s.pos[2]);
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      scene.add(g);
      this.spots.push(g);
    }
  }

  /** Predicted yarn ball for our own shot, so it leaves the muzzle instantly. */
  launchLocal(p: Projectile): void {
    const mesh = projectileMesh(p.weapon, WEAPONS[p.weapon].color);
    mesh.position.set(p.x, p.y, p.z);
    this.scene.add(mesh);
    this.local.push({ p, mesh });
  }

  /** Our ball burst on the server: drop the prediction. */
  clearLocal(): void {
    for (const l of this.local) this.scene.remove(l.mesh);
    this.local = [];
  }

  update(dt: number, t: number, mask: number, drops: NetDrop[], projectiles: NetProjectile[], me: number): void {
    this.spots.forEach((g, i) => {
      g.visible = (mask & (1 << i)) !== 0;
      g.rotation.y = t * 1.4 + i;
      g.children[0].position.y = 0.1 + Math.sin(t * 2.2 + i) * 0.08;
    });
    // Drops: pooled stuffing tufts.
    while (this.drops.length < drops.length) {
      const g = MAKERS[PickupKind.Stuffing]();
      g.scale.setScalar(0.7);
      this.scene.add(g);
      this.drops.push(g);
    }
    this.drops.forEach((g, i) => {
      const d = drops[i];
      g.visible = !!d;
      if (d) { g.position.set(d.x, d.y + Math.sin(t * 3 + i) * 0.05, d.z); g.rotation.y = t * 2 + i; }
    });
    // Other players' yarn balls glide toward their latest positions.
    const others = projectiles.filter((p) => p.owner !== me);
    while (this.balls.length < others.length) {
      const m = projectileMesh(4, WEAPONS[4].color);
      m.visible = false;
      m.userData.weapon = 4;
      this.scene.add(m);
      this.balls.push(m);
    }
    this.balls.forEach((m0, i) => {
      const p = others[i];
      if (!p) { m0.visible = false; return; }
      let m = m0;
      if (m.userData.weapon !== p.weapon && WEAPONS[p.weapon]?.projectile) {
        // A different kind of shot in this slot: swap the mesh.
        this.scene.remove(m);
        m = projectileMesh(p.weapon, WEAPONS[p.weapon].color);
        m.userData.weapon = p.weapon;
        m.visible = false;
        this.scene.add(m);
        this.balls[i] = m;
      }
      if (!m.visible) m.position.set(p.x, p.y, p.z);
      m.visible = true;
      m.position.lerp(new THREE.Vector3(p.x, p.y, p.z), Math.min(1, dt * 18));
      m.rotation.x += dt * 12;
    });
    // Our own predicted balls fly on the shared ballistic code until they hit the world.
    for (let i = this.local.length - 1; i >= 0; i--) {
      const l = this.local[i];
      const hit = stepProjectile(l.p, dt, this.world.boxes);
      l.mesh.position.set(l.p.x, l.p.y, l.p.z);
      l.mesh.rotation.x += dt * 12;
      if (hit) { this.scene.remove(l.mesh); this.local.splice(i, 1); }
    }
  }
}
