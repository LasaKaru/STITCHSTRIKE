/**
 * Gamepad aim assist: a little help for thumbsticks, never for mice.
 *   - Slowdown: the look speed drops while the crosshair is near a target.
 *   - Pull: while you're actively looking, the aim drifts gently towards it.
 * Only targets inside a small cone and within range count; the pull never
 * acts when the stick is still, so it can't aim for you.
 */

export interface AimTarget { x: number; y: number; z: number }

const CONE = 0.11; // radians either side of the crosshair
const RANGE = 45;
const SLOWDOWN = 0.45;
const PULL = 0.14;

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** Adjusts this frame's stick look (dYaw, dPitch radians) for aim assist at `strength` 0..1. */
export function assistAim(eye: [number, number, number], yaw: number, pitch: number, dYaw: number, dPitch: number, targets: AimTarget[], strength = 1): { dYaw: number; dPitch: number } {
  if (strength <= 0 || targets.length === 0) return { dYaw, dPitch };
  let best: { ey: number; ep: number; err: number } | null = null;
  for (const t of targets) {
    const dx = t.x - eye[0], dy = t.y - eye[1], dz = t.z - eye[2];
    const d = Math.hypot(dx, dy, dz);
    if (d > RANGE || d < 0.5) continue;
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
    const ey = wrap(ty - yaw), ep = tp - pitch;
    // Closer targets get a slightly wider cone (they're bigger on screen).
    const cone = CONE * (1 + Math.max(0, 10 - d) / 10);
    const err = Math.hypot(ey, ep) / cone;
    if (err < 1 && (!best || err < best.err)) best = { ey, ep, err };
  }
  if (!best) return { dYaw, dPitch };
  const near = 1 - best.err; // 1 dead on, 0 at the edge of the cone
  const slow = 1 - SLOWDOWN * strength * near;
  let y = dYaw * slow, p = dPitch * slow;
  const looking = Math.hypot(dYaw, dPitch);
  if (looking > 1e-5) {
    // Pull towards the target, in proportion to how much you're already turning.
    const k = Math.min(1, PULL * strength * near * (looking / 0.02));
    y += best.ey * k * 0.25;
    p += best.ep * k * 0.25;
  }
  return { dYaw: y, dPitch: p };
}
