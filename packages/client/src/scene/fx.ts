import * as THREE from 'three';

/**
 * Visual feedback, pooled: pom-pom / button projectiles, impact puffs and
 * bursts of yarn fluff when a knitted enemy unravels.
 */

interface Projectile { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; spin: number }
interface Puff { mesh: THREE.Mesh; t: number; life: number }

const FLUFF = 1500;

export class Fx {
  private projectiles: Projectile[] = [];
  private puffs: Puff[] = [];
  private pomGeo = new THREE.SphereGeometry(0.07, 10, 8);
  private buttonGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12);
  private puffGeo = new THREE.SphereGeometry(0.12, 8, 6);
  private mats = new Map<string, THREE.Material>();
  private fluffPos = new Float32Array(FLUFF * 3);
  private fluffVel = new Float32Array(FLUFF * 3);
  private fluffCol = new Float32Array(FLUFF * 3);
  private fluffLife = new Float32Array(FLUFF);
  private fluffNext = 0;
  private fluff: THREE.Points;

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fluffPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.fluffCol, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    // A little curl of yarn fibre.
    g.strokeStyle = 'white';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(6, 20);
    g.bezierCurveTo(10, 4, 22, 28, 26, 10);
    g.stroke();
    const mat = new THREE.PointsMaterial({ size: 0.075, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.1 });
    this.fluff = new THREE.Points(geo, mat);
    this.fluff.frustumCulled = false;
    this.fluffPos.fill(-999);
    scene.add(this.fluff);
  }

  private mat(kind: 'pom' | 'button' | 'puff', color: number): THREE.Material {
    const key = `${kind}-${color}`;
    let m = this.mats.get(key);
    if (!m) {
      m = kind === 'puff'
        ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })
        : kind === 'button'
          ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1 })
          : new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: color, emissiveIntensity: 0.35 });
      this.mats.set(key, m);
    }
    return m;
  }

  /** A pom-pom (or a sewing button for the Button Buster) flying to where the hitscan landed. */
  projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, button = false): void {
    const mesh = new THREE.Mesh(button ? this.buttonGeo : this.pomGeo, this.mat(button ? 'button' : 'pom', color));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.03, from.distanceTo(to) / (button ? 55 : 70)), spin: Math.random() * 20 });
  }

  puff(at: THREE.Vector3, color: number, size = 1): void {
    const mesh = new THREE.Mesh(this.puffGeo, (this.mat('puff', color) as THREE.MeshBasicMaterial).clone());
    mesh.position.copy(at);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    this.puffs.push({ mesh, t: 0, life: 0.22 });
  }

  /** Burst of fibres in the enemy's yarn colour. */
  fluffBurst(at: THREE.Vector3, color: number, count = 40, speed = 3): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const k = this.fluffNext;
      this.fluffNext = (this.fluffNext + 1) % FLUFF;
      this.fluffPos[k * 3] = at.x; this.fluffPos[k * 3 + 1] = at.y; this.fluffPos[k * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = speed * (0.4 + Math.random());
      this.fluffVel[k * 3] = Math.cos(a) * s * (1 - up * 0.5);
      this.fluffVel[k * 3 + 1] = up * s * 1.2 + 1;
      this.fluffVel[k * 3 + 2] = Math.sin(a) * s * (1 - up * 0.5);
      const shade = 0.8 + Math.random() * 0.4;
      this.fluffCol[k * 3] = c.r * shade; this.fluffCol[k * 3 + 1] = c.g * shade; this.fluffCol[k * 3 + 2] = c.b * shade;
      this.fluffLife[k] = 1 + Math.random() * 0.8;
    }
  }

  update(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.rotation.x += p.spin * dt;
      if (k >= 1) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.mesh.scale.multiplyScalar(1 + dt * 4);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 * (1 - p.t / p.life));
      if (p.t > p.life) { this.scene.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); this.puffs.splice(i, 1); }
    }
    // Fibres drift down like lint: strong drag, gentle gravity, settle on the floor.
    const drag = Math.exp(-dt * 3.5);
    for (let k = 0; k < FLUFF; k++) {
      if (this.fluffLife[k] <= 0) continue;
      this.fluffLife[k] -= dt;
      this.fluffVel[k * 3] *= drag;
      this.fluffVel[k * 3 + 2] *= drag;
      this.fluffVel[k * 3 + 1] = this.fluffVel[k * 3 + 1] * drag - 2.5 * dt;
      this.fluffPos[k * 3] += this.fluffVel[k * 3] * dt;
      this.fluffPos[k * 3 + 1] = Math.max(0.03, this.fluffPos[k * 3 + 1] + this.fluffVel[k * 3 + 1] * dt);
      this.fluffPos[k * 3 + 2] += this.fluffVel[k * 3 + 2] * dt;
      if (this.fluffLife[k] <= 0) this.fluffPos[k * 3 + 1] = -999;
    }
    this.fluff.geometry.attributes.position.needsUpdate = true;
    this.fluff.geometry.attributes.color.needsUpdate = true;
  }
}
