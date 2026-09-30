import * as THREE from 'three';

/**
 * Visual feedback, pooled: pom-pom / button projectiles, impact puffs and
 * bursts of yarn fluff when a knitted enemy unravels.
 */

interface Projectile { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; spin: number }
interface Puff { mesh: THREE.Mesh; t: number; life: number }
interface Arc { line: THREE.Line; t: number; life: number }
interface Piece { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; t: number; life: number }
interface Ring { mesh: THREE.Mesh; t: number; life: number; size: number }

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
  private arcs: Arc[] = [];
  private pieces: Piece[] = [];
  private pieceGeos = [new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), new THREE.SphereGeometry(0.09, 8, 6), new THREE.BoxGeometry(0.14, 0.1, 0.1)];
  private rings: Ring[] = [];
  private ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  /** Camera shake amount (decays); read by the arena. */
  shake = 0;

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

  /**
   * Toy physics: an unravelled invader pops apart into knitted limbs and
   * tufts that bounce like soft toys and settle, not ragdolls.
   */
  burstPieces(at: THREE.Vector3, color: number, count = 6, scale = 1): void {
    const mat = this.mat('pom', color);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.pieceGeos[i % this.pieceGeos.length], mat);
      mesh.scale.setScalar(scale * (0.8 + Math.random() * 0.6));
      mesh.position.copy(at);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      this.pieces.push({
        mesh, t: 0, life: 2.5 + Math.random(),
        v: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      });
    }
    while (this.pieces.length > 160) { const p = this.pieces.shift()!; this.scene.remove(p.mesh); }
  }

  /** A jagged electric arc (battery zapper). */
  zap(from: THREE.Vector3, to: THREE.Vector3, color = 0x9ad8ff): void {
    const pts: THREE.Vector3[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true }));
    this.scene.add(line);
    this.arcs.push({ line, t: 0, life: 0.14 });
  }

  /** A yarn-ball burst: a big fluff cloud and a shockwave ring on the ground. */
  blast(at: THREE.Vector3, color: number, radius = 3.2): void {
    this.fluffBurst(at, color, 120, 5);
    this.fluffBurst(at, 0xfff2e0, 40, 3);
    this.puff(at, 0xfff2e0, 4);
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, Math.max(0.05, at.y - 0.5), at.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, life: 0.4, size: radius });
  }

  /** A shockwave from a boss stomp. */
  stomp(at: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.08, at.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, life: 0.6, size: 5 });
    this.fluffBurst(new THREE.Vector3(at.x, 0.3, at.z), 0xb89878, 80, 6);
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.t += dt;
      p.v.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.08) {
        // Soft bounce: wool squashes and loses most of its energy.
        p.mesh.position.y = 0.08;
        p.v.y = Math.abs(p.v.y) * 0.35;
        p.v.x *= 0.6; p.v.z *= 0.6;
        p.spin.multiplyScalar(0.5);
      }
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      if (p.t > p.life) {
        const k = Math.max(0, 1 - (p.t - p.life) * 3);
        p.mesh.scale.multiplyScalar(k > 0 ? 0.92 : 0);
        if (k <= 0) { this.scene.remove(p.mesh); this.pieces.splice(i, 1); }
      }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      (a.line.material as THREE.LineBasicMaterial).opacity = 1 - a.t / a.life;
      if (a.t > a.life) { this.scene.remove(a.line); a.line.geometry.dispose(); (a.line.material as THREE.Material).dispose(); this.arcs.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      r.mesh.scale.setScalar(0.2 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) { this.scene.remove(r.mesh); (r.mesh.material as THREE.Material).dispose(); this.rings.splice(i, 1); }
    }
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
