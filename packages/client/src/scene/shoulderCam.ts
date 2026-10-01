import * as THREE from 'three';
import { lookDirection, MAX_PITCH, rayWorld, type Box, type Vec3 } from '@stitchstrike/shared';

/**
 * The third-person camera: over the shoulder, a few toy-lengths back, eased
 * in and out of first person, pulled in when a wall or shelf gets between it
 * and the toy, and closer in while aiming. It looks exactly where the player
 * looks; `aim()` then bends the toy's actual aim so shots land under the
 * crosshair (the camera sits off to the side, so the two rays differ).
 */
export const SHOULDER = {
  distance: 3.0,
  shoulder: 0.8,
  height: 0.32,
  /** Closer and tighter while aiming (holding the yarn-swing button or zoomed). */
  aimDistance: 1.9,
  aimShoulder: 0.62,
  /** Keep this far off any surface. */
  clearance: 0.3,
};

const smooth = (x: number) => x * x * (3 - 2 * x);

export class ShoulderCam {
  /** 0 = first person, 1 = third person (eased). */
  blend = 0;
  /** +1 right shoulder, -1 left. */
  side = 1;
  readonly position = new THREE.Vector3();
  private sideBlend = 1;
  private zoom = 0;
  private dist = 0;
  private readonly off = new THREE.Vector3();

  /** Snap straight to a view (on spawn, or when a setting changes). */
  snap(third: boolean): void {
    this.blend = third ? 1 : 0;
    this.sideBlend = this.side;
  }

  get third(): boolean {
    return this.blend > 0.5;
  }

  /** Where the camera goes this frame, looking along (yaw, pitch) from behind `eye`. */
  update(dt: number, third: boolean, aiming: boolean, eye: THREE.Vector3, yaw: number, pitch: number, boxes: Box[]): THREE.Vector3 {
    const k = Math.min(1, dt * 7);
    this.blend += ((third ? 1 : 0) - this.blend) * k;
    if (Math.abs(this.blend - (third ? 1 : 0)) < 0.002) this.blend = third ? 1 : 0;
    this.sideBlend += (this.side - this.sideBlend) * Math.min(1, dt * 9);
    this.zoom += ((aiming ? 1 : 0) - this.zoom) * Math.min(1, dt * 10);
    const e = smooth(this.blend);
    if (e <= 0) {
      this.dist = 0;
      return this.position.copy(eye);
    }
    const f = lookDirection(yaw, pitch);
    const back = (SHOULDER.distance + (SHOULDER.aimDistance - SHOULDER.distance) * this.zoom) * e;
    const side = (SHOULDER.shoulder + (SHOULDER.aimShoulder - SHOULDER.shoulder) * this.zoom) * this.sideBlend * e;
    // Right of the view, flat (so looking straight up or down doesn't spin the shoulder).
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.off.set(-f[0] * back + rx * side, -f[1] * back + SHOULDER.height * e, -f[2] * back + rz * side);
    const len = this.off.length();
    if (len < 1e-4) return this.position.copy(eye);
    this.off.divideScalar(len);
    // Pull in to stay on this side of walls; ease back out so it doesn't pop.
    const hit = rayWorld([eye.x, eye.y, eye.z], [this.off.x, this.off.y, this.off.z], boxes, len + SHOULDER.clearance);
    const target = Math.max(0, Math.min(len, hit - SHOULDER.clearance));
    this.dist = target < this.dist ? target : this.dist + (target - this.dist) * Math.min(1, dt * 4);
    return this.position.copy(eye).addScaledVector(this.off, this.dist);
  }

  /**
   * The toy's real aim in third person: from its eye towards whatever is
   * under the crosshair. `hit` returns the distance along a ray to the first
   * thing it meets (world, toys, invaders).
   */
  aim(eye: THREE.Vector3, yaw: number, pitch: number, hit: (o: Vec3, d: Vec3, range: number) => number): { yaw: number; pitch: number } {
    if (this.blend < 0.5) return { yaw, pitch };
    const f = lookDirection(yaw, pitch);
    const cam = this.position;
    // Never converge on something between the camera and the toy.
    const behind = (eye.x - cam.x) * f[0] + (eye.y - cam.y) * f[1] + (eye.z - cam.z) * f[2];
    const t = Math.max(hit([cam.x, cam.y, cam.z], f, 160), behind + 2.5);
    const dx = cam.x + f[0] * t - eye.x, dy = cam.y + f[1] * t - eye.y, dz = cam.z + f[2] * t - eye.z;
    const p = Math.atan2(dy, Math.hypot(dx, dz));
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)) };
  }
}
