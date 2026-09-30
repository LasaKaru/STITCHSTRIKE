import * as THREE from 'three';
import { COSMETICS, type Look } from '@stitchstrike/shared';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { metal } from './materials.ts';

/**
 * Weapon parts (cosmetic only): a little knitted charm hanging off every
 * weapon on a loop of yarn, and a band of yarn wrapped round the grip.
 * Built at a unit size and scaled per weapon.
 */

const knit = (color: number, pattern: 'rib' | 'garter' | 'crochet' | 'felt' | 'wound' = 'crochet') =>
  createWoolMaterial({ color, pattern, uvSize: [0.08, 0.08], gauge: 2.4 });

function charmMesh(index: number, color: number): THREE.Object3D {
  const g = new THREE.Group();
  switch (index) {
    case 1: { // pom-pom
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 2), knit(color, 'wound')));
      break;
    }
    case 2: { // brass bell
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), metal(color, 0.2));
      (bell.material as THREE.Material).side = THREE.DoubleSide;
      bell.rotation.x = Math.PI;
      bell.position.y = -0.004;
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), metal(0x5a4a2a, 0.4));
      clapper.position.y = -0.018;
      g.add(bell, clapper);
      break;
    }
    case 3: { // coat button
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 20), new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.6 }));
      b.rotation.x = Math.PI / 2;
      g.add(b);
      break;
    }
    case 4: { // felt star
      const shape = new THREE.Shape();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 0.01 : 0.024;
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }).center(), knit(color, 'felt')));
      break;
    }
    case 5: { // tiny heart
      const heart = new THREE.Group();
      for (const sx of [-1, 1]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), knit(color));
        lobe.position.set(0.009 * sx, 0.004, 0);
        heart.add(lobe);
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.026, 12), knit(color));
      tip.rotation.z = Math.PI;
      tip.position.y = -0.012;
      heart.add(tip);
      g.add(heart);
      break;
    }
    case 6: { // mini thimble
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.026, 16), metal(color, 0.25));
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.013, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), t.material);
      top.position.y = 0.013;
      g.add(t, top);
      break;
    }
    case 7: { // golden spool
      const m = metal(color, 0.25);
      for (const y of [-0.012, 0.012]) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 16), m);
        f.position.y = y;
        g.add(f);
      }
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 14), knit(0xd8262e, 'wound')));
      break;
    }
    default: { // Baron's monocle
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 8, 20), metal(color, 0.2));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.015, 18), new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, transparent: true, opacity: 0.4 }));
      g.add(ring, lens);
    }
  }
  return g;
}

/**
 * Dresses a weapon model with the look's charm and grip wrap (replacing any
 * earlier ones). `grip` is where the wrap sits and `charmAt` where the charm
 * loop hangs from (default: under the grip), in the gun's own space; `scale`
 * sizes both to the weapon.
 */
export function dressGun(gun: THREE.Object3D, look: Look | undefined, grip = new THREE.Vector3(0, -0.06, -0.06), scale = 1, charmAt?: THREE.Vector3): void {
  for (const name of ['charm', 'wrap']) {
    const old = gun.getObjectByName(name);
    if (old) old.removeFromParent();
  }
  if (!look) return;
  const wrap = COSMETICS.wrap[look.wrap];
  if (look.wrap > 0 && wrap?.color !== undefined) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.032 * scale, 0.011 * scale, 8, 20), knit(wrap.color, 'rib'));
    band.name = 'wrap';
    band.rotation.x = Math.PI / 2;
    band.scale.z = 2.2;
    band.position.copy(grip);
    gun.add(band);
  }
  const charm = COSMETICS.charm[look.charm];
  if (look.charm > 0 && charm) {
    // A pivot at the loop so the charm can swing.
    const pivot = new THREE.Group();
    pivot.name = 'charm';
    pivot.position.copy(charmAt ?? grip.clone().add(new THREE.Vector3(0, -0.035 * scale, 0)));
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0025 * scale, 0.0025 * scale, 0.05 * scale, 6), knit(0xefe3c8, 'rib'));
    string.position.y = -0.025 * scale;
    const body = charmMesh(look.charm, charm.color ?? 0xe8742a);
    body.scale.setScalar(scale * 1.4);
    body.position.y = -0.065 * scale;
    pivot.add(string, body);
    gun.add(pivot);
  }
}

/** Swing a dressed gun's charm (call per frame with the gun's motion). */
export function swingCharm(gun: THREE.Object3D, t: number, energy: number): void {
  const pivot = gun.getObjectByName('charm');
  if (!pivot) return;
  pivot.rotation.x = Math.sin(t * 5.3) * (0.12 + energy * 0.4);
  pivot.rotation.z = Math.sin(t * 3.7 + 1) * (0.08 + energy * 0.3);
}
