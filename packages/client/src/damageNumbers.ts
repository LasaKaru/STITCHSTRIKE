import * as THREE from 'three';

/**
 * Floating damage numbers: little stitched labels that pop up where your
 * shots land and drift upwards. Pellets landing together add up into one
 * number; headshots are gold. Drawn as DOM labels over the canvas.
 */

interface Num { el: HTMLDivElement; pos: THREE.Vector3; value: number; age: number; head: boolean; drift: number }

const LIFE = 0.9;
const MERGE_TIME = 0.15;
const MERGE_DIST = 1.6;

export class DamageNumbers {
  private live: Num[] = [];
  private free: HTMLDivElement[] = [];
  private readonly v = new THREE.Vector3();

  constructor(private root: HTMLElement) {}

  add(at: THREE.Vector3, value: number, head: boolean): void {
    if (value <= 0) return;
    const near = this.live.find((n) => n.age < MERGE_TIME && n.pos.distanceTo(at) < MERGE_DIST);
    if (near) {
      near.value += value;
      near.head ||= head;
      near.age = Math.min(near.age, 0.05);
      this.paint(near);
      return;
    }
    const el = this.free.pop() ?? Object.assign(document.createElement('div'), { className: 'dmgnum' });
    this.root.appendChild(el);
    const n: Num = { el, pos: at.clone().add(new THREE.Vector3(0, 0.3, 0)), value, age: 0, head, drift: (Math.random() - 0.5) * 0.6 };
    this.paint(n);
    this.live.push(n);
  }

  private paint(n: Num): void {
    n.el.textContent = String(Math.round(n.value));
    n.el.classList.toggle('head', n.head);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, w: number, h: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.age += dt;
      if (n.age >= LIFE) {
        n.el.remove();
        this.free.push(n.el);
        this.live.splice(i, 1);
        continue;
      }
      this.v.copy(n.pos).add(new THREE.Vector3(n.drift * n.age, n.age * 1.1, 0)).project(camera);
      if (this.v.z > 1) { n.el.style.opacity = '0'; continue; }
      const pop = n.age < 0.12 ? 1 + (0.12 - n.age) * 4 : 1;
      n.el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%) scale(${pop})`;
      n.el.style.opacity = String(Math.min(1, (LIFE - n.age) * 4));
    }
  }
}
