import * as THREE from 'three';
import { CollectibleKind, type Collectible, type World } from '@stitchstrike/shared';
import { addShellFuzz, createWoolMaterial } from '../wool/woolMaterial.ts';
import { metal } from './materials.ts';

/**
 * Traversal and secrets: spring-toy jump pads, and the collectibles hidden on
 * high shelves and in dark corners (golden thimbles, weapon parts, credit
 * buttons). Collection is per player and checked on the client.
 */

function springToy(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 70; i++) { const a = i * 0.45; pts.push(new THREE.Vector3(Math.cos(a) * 0.75, 0.05 + i * 0.006, Math.sin(a) * 0.75)); }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.07, 8), metal(0xd9dde2, 0.25));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 32), createWoolMaterial({ color: 0x8bcb3a, pattern: 'crochet', uvSize: [3, 0.5], gauge: 1.4 }));
  top.position.y = 0.48;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc94a).multiplyScalar(1.6) }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.56;
  const chevrons = new THREE.Group();
  const cm = createWoolMaterial({ color: 0xffc94a, pattern: 'felt', uvSize: [0.5, 0.5] });
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 3), cm);
    c.position.y = 0.9 + k * 0.4;
    chevrons.add(c);
  }
  g.add(coil, top, ring, chevrons);
  g.userData.top = top;
  g.userData.chevrons = chevrons;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function goldenThimble(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.2 - 0.05 * t, t * 0.38)); }
  pts.push(new THREE.Vector2(0, 0.42));
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.18, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), gold);
  g.add(shell);
  return g;
}

function weaponPart(): THREE.Group {
  // A little knitted cog: weapon part.
  const g = new THREE.Group();
  const cog = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 10, 20), metal(0x9aa0aa, 0.3));
  for (let k = 0; k < 8; k++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), cog.material);
    const a = (k / 8) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    tooth.rotation.z = a;
    cog.add(tooth);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), createWoolMaterial({ color: 0xb46fd6, pattern: 'wound', uvSize: [0.3, 0.3] }));
  g.add(cog, hub);
  g.position.y = 0.3;
  return g;
}

function creditStack(): THREE.Group {
  // A stack of big sewing buttons: credits.
  const g = new THREE.Group();
  const mats = [0xe8742a, 0x8bcb3a, 0x6fd6ff].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1 }));
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 20), mats[k]);
    b.position.set((k - 1) * 0.03, 0.05 + k * 0.08, 0);
    b.rotation.z = (k - 1) * 0.1;
    g.add(b);
  }
  return g;
}

export class TraversalView {
  private pads: THREE.Group[] = [];
  private items = new Map<string, { c: Collectible; group: THREE.Group; glow: THREE.PointLight }>();

  constructor(private scene: THREE.Scene, world: World, collected: Set<string>) {
    for (const j of world.jumpPads) {
      const g = springToy();
      g.position.set(j.x, j.y, j.z);
      scene.add(g);
      this.pads.push(g);
    }
    for (const c of world.collectibles) {
      if (collected.has(c.id)) continue;
      const group = new THREE.Group();
      const model = c.kind === CollectibleKind.Thimble ? goldenThimble() : c.kind === CollectibleKind.Part ? weaponPart() : creditStack();
      group.add(model);
      const glow = new THREE.PointLight(c.kind === CollectibleKind.Thimble ? 0xffd24a : 0xb46fd6, 1.2, 3, 2);
      glow.position.y = 0.4;
      group.add(glow);
      // A sparkly fuzz halo so secrets read from a distance.
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), createWoolMaterial({ color: 0xffe9a0, pattern: 'felt', uvSize: [0.5, 0.5], fuzz: 3 }));
      halo.position.y = 0.2;
      (halo.material as THREE.MeshPhysicalMaterial).transparent = true;
      (halo.material as THREE.MeshPhysicalMaterial).opacity = 0.25;
      addShellFuzz(halo);
      group.add(halo);
      group.position.set(...c.pos);
      this.scene.add(group);
      this.items.set(c.id, { c, group, glow });
    }
  }

  /** Returns the collectibles the toy just touched (and removes them). */
  update(t: number, me: { x: number; y: number; z: number } | null): Collectible[] {
    this.pads.forEach((g, i) => {
      const chev = g.userData.chevrons as THREE.Group;
      chev.children.forEach((c, k) => { (c as THREE.Mesh).position.y = 0.9 + k * 0.4 + ((t * 1.5 + k * 0.33 + i) % 1) * 0.3; });
    });
    const got: Collectible[] = [];
    for (const [id, it] of this.items) {
      it.group.rotation.y = t * 1.6;
      it.group.children[0].position.y = 0.25 + Math.sin(t * 2.5 + it.c.pos[0]) * 0.1;
      it.glow.intensity = 1 + Math.sin(t * 4) * 0.4;
      if (me && Math.hypot(me.x - it.c.pos[0], me.z - it.c.pos[2]) < 1.2 && Math.abs(me.y - it.c.pos[1]) < 1.6) {
        this.scene.remove(it.group);
        this.items.delete(id);
        got.push(it.c);
      }
    }
    return got;
  }

  remaining(): number {
    return this.items.size;
  }
}
