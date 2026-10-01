import * as THREE from 'three';
import { CTY, TEAM_COLORS, YarnState, type CtyState, type Vec3 } from '@stitchstrike/shared';
import { mesh, wool, yarnTube } from './woolKit.ts';

/**
 * Capture the Yarn: each team's giant wound ball of yarn on a knitted base
 * pad, with a tall beam of light so you can find it across the map. Carried
 * balls bob above the carrier's head with a trailing strand; dropped ones sit
 * on the floor with a shrinking countdown ring.
 */
export class YarnBalls {
  private balls: THREE.Group[] = [];
  private rings: THREE.Mesh[] = [];
  private beams: THREE.Mesh[] = [];
  private shown: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, private bases: [Vec3, Vec3], teams: readonly number[] = TEAM_COLORS) {
    bases.forEach((b, team) => {
      const color = teams[team];
      // Base: a knitted round pad with a braided rim and the team's yarn colour.
      const pad = mesh(new THREE.CylinderGeometry(CTY.radius + 0.4, CTY.radius + 0.6, 0.25, 40), wool('garter', color, 1.2), false);
      pad.position.set(b[0], b[1] + 0.12, b[2]);
      scene.add(pad);
      const rim = mesh(new THREE.TorusGeometry(CTY.radius + 0.5, 0.18, 8, 48).rotateX(Math.PI / 2), wool('rib', 0xefe3c8, 2), false);
      rim.position.set(b[0], b[1] + 0.26, b[2]);
      scene.add(rim);
      const ball = new THREE.Group();
      const core = mesh(new THREE.SphereGeometry(1.1, 28, 20), wool('wound', color, 1.6));
      ball.add(core);
      // A few wraps of yarn round the outside and a loose end.
      for (let k = 0; k < 3; k++) {
        const wrap = mesh(new THREE.TorusGeometry(1.13, 0.07, 6, 40), wool('rib', color, 3));
        wrap.rotation.set(k * 1.1, k * 0.7, k * 0.4);
        ball.add(wrap);
      }
      ball.add(yarnTube([new THREE.Vector3(0.9, -0.6, 0.4), new THREE.Vector3(1.6, -1.0, 0.8), new THREE.Vector3(2.0, -1.1, 1.6)], 0.07, wool('rib', color, 3), 12));
      scene.add(ball);
      this.balls.push(ball);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.visible = false;
      scene.add(ring);
      this.rings.push(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      scene.add(beam);
      this.beams.push(beam);
      this.shown.push(new THREE.Vector3(b[0], b[1] + 1.4, b[2]));
    });
  }

  update(state: CtyState | null, t: number, dt: number): void {
    this.balls.forEach((ball, team) => {
      const s = state?.balls[team];
      const b = this.bases[team];
      const target = s ? new THREE.Vector3(s.x, s.y, s.z) : new THREE.Vector3(b[0], b[1], b[2]);
      const carried = s?.state === YarnState.Carried;
      const dropped = s?.state === YarnState.Dropped;
      // Sit on the pad / floor (the ball's centre is a radius up); carried balls already ride high.
      if (!carried) target.y += 1.3;
      target.y += Math.sin(t * 2 + team) * (carried ? 0.15 : 0.08);
      const shown = this.shown[team];
      shown.lerp(target, carried ? Math.min(1, dt * 14) : Math.min(1, dt * 8));
      ball.position.copy(shown);
      ball.rotation.y += dt * (carried ? 3 : 0.6);
      ball.scale.setScalar(carried ? 0.75 : 1);
      const ring = this.rings[team];
      ring.visible = dropped;
      if (dropped && s) {
        ring.position.set(shown.x, s.y + 0.08, shown.z);
        ring.scale.setScalar(0.4 + 0.6 * Math.min(1, s.timer / CTY.returnSeconds));
      }
      const beam = this.beams[team];
      beam.position.set(shown.x, shown.y + 20, shown.z);
      (beam.material as THREE.MeshBasicMaterial).opacity = (carried ? 0.32 : 0.16) + Math.sin(t * 4) * 0.04;
    });
  }
}
