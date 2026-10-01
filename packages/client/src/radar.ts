import type { World } from '@stitchstrike/shared';

/**
 * The HUD radar: a little round knitted patch in the corner showing the map
 * around you, rotated so straight ahead is up. Teammates, nearby invaders and
 * rivals, the Heartspools, the spool, the yarn balls and parked vehicles are
 * marked; objectives beyond the edge stick to the rim as arrows.
 */

export type BlipKind = 'ally' | 'foe' | 'boss' | 'core' | 'objective' | 'vehicle' | 'ball';

export interface Blip { x: number; z: number; kind: BlipKind; color: string; label?: string; dim?: boolean }

interface Rect { x0: number; z0: number; x1: number; z1: number; tall: boolean }

export class Radar {
  private ctx: CanvasRenderingContext2D;
  private rects: Rect[];
  private readonly size: number;
  /** World units from the centre to the rim. */
  readonly range: number;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.size = canvas.width;
    this.ctx = canvas.getContext('2d')!;
    this.range = world.outdoor ? 38 : 20;
    // Anything you'd bump into at ankle height: walls, furniture, trunks. Not floors or high shelves.
    this.rects = world.boxes
      .filter((b) => b.kind !== 'floor' && b.min[1] < 2.5 && b.max[1] > 0.4)
      .map((b) => ({ x0: b.min[0], z0: b.min[2], x1: b.max[0], z1: b.max[2], tall: b.max[1] - b.min[1] > 4 }));
  }

  draw(meX: number, meZ: number, yaw: number, blips: Blip[]): void {
    const g = this.ctx, S = this.size, R = S / 2, k = (R - 6) / this.range;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 3, 0, Math.PI * 2);
    g.fillStyle = 'rgba(246, 234, 210, 0.78)';
    g.fill();
    g.clip();
    // Knit texture: faint rows of little Vs.
    g.strokeStyle = 'rgba(120, 90, 60, 0.12)';
    g.lineWidth = 1;
    for (let y = 4; y < S; y += 7) for (let x = (y / 7) % 2 ? 3 : 0; x < S; x += 7) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 4); g.lineTo(x + 6, y); g.stroke();
    }
    // World to radar: centred on you, forward up. Forward is -Z rotated by yaw.
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const toR = (x: number, z: number): [number, number] => {
      const dx = x - meX, dz = z - meZ;
      // Rotate so the view direction (-sin yaw, -cos yaw) points up the canvas.
      const rx = dx * c - dz * s;
      const rz = dx * s + dz * c;
      return [R + rx * k, R + rz * k];
    };
    g.save();
    g.translate(R, R);
    g.rotate(yaw);
    g.scale(k, k);
    g.translate(-meX, -meZ);
    for (const r of this.rects) {
      if (r.x1 < meX - this.range * 1.5 || r.x0 > meX + this.range * 1.5 || r.z1 < meZ - this.range * 1.5 || r.z0 > meZ + this.range * 1.5) continue;
      g.fillStyle = r.tall ? 'rgba(110, 78, 52, 0.55)' : 'rgba(150, 118, 84, 0.35)';
      g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    g.restore();

    const edge = R - 9;
    for (const b of blips) {
      let [px, py] = toR(b.x, b.z);
      const dx = px - R, dy = py - R;
      const d = Math.hypot(dx, dy);
      const outside = d > edge;
      // Only objectives stick to the rim; everything else simply leaves the radar.
      const sticky = b.kind === 'core' || b.kind === 'objective' || b.kind === 'ball';
      if (outside && !sticky) continue;
      if (outside) { px = R + (dx / d) * edge; py = R + (dy / d) * edge; }
      g.globalAlpha = b.dim ? 0.45 : 1;
      g.fillStyle = b.color;
      g.strokeStyle = 'rgba(40, 28, 20, 0.85)';
      g.lineWidth = 1.5;
      if (outside) {
        // A little arrow on the rim pointing at it.
        const a = Math.atan2(dy, dx);
        g.beginPath();
        g.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6);
        g.lineTo(px + Math.cos(a + 2.4) * 5, py + Math.sin(a + 2.4) * 5);
        g.lineTo(px + Math.cos(a - 2.4) * 5, py + Math.sin(a - 2.4) * 5);
        g.closePath();
        g.fill(); g.stroke();
      } else if (b.kind === 'core' || b.kind === 'ball') {
        g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); g.stroke();
        if (b.label) {
          g.fillStyle = '#2a1c14';
          g.font = 'bold 9px system-ui, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(b.label, px, py + 0.5);
        }
      } else if (b.kind === 'objective') {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 3.5 : 8;
          g.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
        }
        g.closePath(); g.fill(); g.stroke();
      } else if (b.kind === 'vehicle') {
        g.fillRect(px - 4, py - 3, 8, 6); g.strokeRect(px - 4, py - 3, 8, 6);
      } else {
        g.beginPath(); g.arc(px, py, b.kind === 'boss' ? 7 : b.kind === 'ally' ? 4.5 : 3.2, 0, Math.PI * 2); g.fill();
        if (b.kind !== 'foe') g.stroke();
      }
      g.globalAlpha = 1;
    }
    // You: an arrow at the centre pointing up.
    g.fillStyle = '#ffd36a';
    g.strokeStyle = '#2a1c14';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(R, R - 8); g.lineTo(R + 5.5, R + 6); g.lineTo(R, R + 3); g.lineTo(R - 5.5, R + 6); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // A braided rim.
    g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2);
    g.lineWidth = 4; g.strokeStyle = '#8a5a3a'; g.stroke();
    g.setLineDash([3, 3]); g.lineWidth = 2; g.strokeStyle = '#e8c890'; g.stroke(); g.setLineDash([]);
  }
}
