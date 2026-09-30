import * as THREE from 'three';
import { KOTH, TEAM_COLORS, type KothState, type World } from '@stitchstrike/shared';
import { metal } from './materials.ts';
import { wool } from './woolKit.ts';

/**
 * King of the Spool: a giant golden cotton reel that sits on the current
 * hill spot, spinning, with a knitted ring on the floor showing the scoring
 * zone in the colour of whoever holds it (flashing when contested).
 */
export class SpoolHill {
  private group = new THREE.Group();
  private reel = new THREE.Group();
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private beam: THREE.Mesh;
  private target = new THREE.Vector3();

  constructor(scene: THREE.Scene, private world: World) {
    const gold = metal(0xd9b24a, 0.3);
    const flangeGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.18, 32);
    const top = new THREE.Mesh(flangeGeo, gold);
    top.position.y = 1.2;
    const bottom = new THREE.Mesh(flangeGeo, gold);
    bottom.position.y = 0.09;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.0, 28), wool('wound', 0xffd24a, 2.2));
    core.position.y = 0.65;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16), new THREE.MeshBasicMaterial({ color: 0x1a1208 }));
    hole.position.y = 0.65;
    for (const m of [top, bottom, core]) m.castShadow = true;
    this.reel.add(top, bottom, core, hole);
    this.reel.position.y = 1.2;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(KOTH.radius - 0.35, KOTH.radius, 64).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.04;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 30, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.position.y = 15;
    this.group.add(this.reel, this.ring, this.beam);
    const h = world.coop.cores[0];
    this.group.position.set(h[0], h[1], h[2]);
    this.target.copy(this.group.position);
    scene.add(this.group);
  }

  update(k: KothState | null, t: number, dt: number): void {
    this.group.visible = !!k;
    if (!k) return;
    const h = this.world.coop.cores[k.hill] ?? this.world.coop.cores[0];
    this.target.set(h[0], h[1], h[2]);
    // Glide to a new spot rather than teleporting.
    this.group.position.lerp(this.target, Math.min(1, dt * 3));
    this.reel.rotation.y = t * 0.8;
    this.reel.position.y = 1.2 + Math.sin(t * 2) * 0.15;
    const col = k.holder === 2 ? (Math.floor(t * 4) % 2 ? TEAM_COLORS[0] : TEAM_COLORS[1]) : k.holder >= 0 ? TEAM_COLORS[k.holder] : 0xffe08a;
    this.ringMat.color.setHex(col);
    this.ringMat.opacity = 0.45 + Math.sin(t * 5) * 0.12;
  }
}
