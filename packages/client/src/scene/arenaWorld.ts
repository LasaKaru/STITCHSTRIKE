import * as THREE from 'three';
import type { World } from '@stitchstrike/shared';
import { plastic } from './materials.ts';

/** Grey-box renderer for the shared collision world (plan §11.3: grey-box first). */
export function buildArena(scene: THREE.Scene, world: World): { sun: THREE.DirectionalLight } {
  const group = new THREE.Group();
  group.name = 'arena';
  const mats = new Map<string, THREE.Material>();
  const matFor = (kind: string, color: number): THREE.Material => {
    const key = `${kind}-${color}`;
    let m = mats.get(key);
    if (!m) {
      m = kind === 'prop'
        ? plastic(color, 0.4)
        : new THREE.MeshStandardMaterial({ color, roughness: kind === 'floor' ? 1 : 0.8 });
      mats.set(key, m);
    }
    return m;
  };

  for (const b of world.boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), matFor(b.kind, b.color ?? 0x999999));
    mesh.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    mesh.castShadow = b.kind !== 'floor' && b.kind !== 'wall';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Grey-box floor grid at 1 u (10 cm) so scale and speed are readable while testing.
  const grid = new THREE.GridHelper(40, 40, 0x6f7890, 0x7c859c);
  grid.position.y = 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  group.add(grid);
  scene.add(group);

  // Sunbeam through a (virtual) window high on the back wall.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-12, 30, -25);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xb0c4ee, 0x6a5a48, 0.6));
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcecff).multiplyScalar(2.5) }),
  );
  glow.position.set(-4, 14, -17.45);
  scene.add(glow);
  return { sun };
}
