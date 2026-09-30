import * as THREE from 'three';
import { createWoolMaterial } from '../wool/woolMaterial.ts';
import { matte, plastic } from './materials.ts';

/**
 * Grey-box bedroom corner at toy scale (1 u = 10 cm) lit by a sunbeam through
 * window blinds, as in the reference screenshot (plan §3.2, §14.1).
 */

export const WINDOW = { x0: -3.5, x1: 3.5, y0: 8, y1: 16, z: -7 };
const SLAT_SPACING = 0.8;
const SLAT_DEPTH = 0.42;
const SLAT_TILT = 0.55;

export interface Sun {
  light: THREE.DirectionalLight;
  /** Unit vector pointing toward the sun. */
  dir: THREE.Vector3;
}

function carpetTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 512;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const colorC = mk();
  const bumpC = mk();
  const g = colorC.getContext('2d')!;
  const b = bumpC.getContext('2d')!;
  const img = g.createImageData(size, size);
  const bimg = b.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = Math.random();
    const tuft = 0.85 + 0.15 * n;
    img.data[i * 4] = 128 * tuft;
    img.data[i * 4 + 1] = 138 * tuft;
    img.data[i * 4 + 2] = 160 * tuft;
    img.data[i * 4 + 3] = 255;
    const v = 90 + n * 165;
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = v;
    bimg.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  b.putImageData(bimg, 0, 0);
  const map = new THREE.CanvasTexture(colorC);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpC);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    t.anisotropy = 8;
  }
  return { map, bump };
}

function boxMesh(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createBedroomCorner(scene: THREE.Scene): { sun: Sun; update(t: number): void } {
  const wallMat = matte(0x5e6b86, 0.9);
  const trimMat = matte(0xe9e4da, 0.6);

  // Floor: short-pile carpet.
  const { map, bump } = carpetTextures();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.5, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall with a window opening, built from four blocks around the hole.
  const W = WINDOW;
  const z = W.z - 0.5;
  scene.add(boxMesh(30, W.y0, 1, wallMat, 0, W.y0 / 2, z));
  scene.add(boxMesh(30, 28 - W.y1, 1, wallMat, 0, (28 + W.y1) / 2, z));
  scene.add(boxMesh(15 + W.x0, W.y1 - W.y0, 1, wallMat, (-15 + W.x0) / 2, (W.y0 + W.y1) / 2, z));
  scene.add(boxMesh(15 - W.x1, W.y1 - W.y0, 1, wallMat, (15 + W.x1) / 2, (W.y0 + W.y1) / 2, z));
  // Left wall.
  scene.add(boxMesh(1, 28, 30, matte(0x66728c, 0.9), -12, 14, 7.5));
  // Skirting boards.
  scene.add(boxMesh(30, 0.9, 0.15, trimMat, 0, 0.45, W.z + 0.07));
  scene.add(boxMesh(0.15, 0.9, 30, trimMat, -11.43, 0.45, 7.5));

  // Window frame and sill.
  const frame = 0.3;
  scene.add(boxMesh(W.x1 - W.x0 + 2 * frame, frame, 1.2, trimMat, 0, W.y0 - frame / 2, W.z - 0.3));
  scene.add(boxMesh(W.x1 - W.x0 + 2 * frame, frame, 1.2, trimMat, 0, W.y1 + frame / 2, W.z - 0.3));
  scene.add(boxMesh(frame, W.y1 - W.y0, 1.2, trimMat, W.x0 - frame / 2, (W.y0 + W.y1) / 2, W.z - 0.3));
  scene.add(boxMesh(frame, W.y1 - W.y0, 1.2, trimMat, W.x1 + frame / 2, (W.y0 + W.y1) / 2, W.z - 0.3));
  scene.add(boxMesh(W.x1 - W.x0 + 1.6, 0.25, 1.6, trimMat, 0, W.y0 - 0.1, W.z + 0.3));

  // Bright sky behind the glass so the window blooms.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcecff).multiplyScalar(3.2) }));
  sky.position.set(0, 12, W.z - 6);
  scene.add(sky);

  // Blinds: tilted slats that cut the sunlight into stripes.
  const slatMat = matte(0xf1ede4, 0.55);
  const slats: THREE.Mesh[] = [];
  for (let y = W.y0 + 0.35; y < W.y1 - 0.2; y += SLAT_SPACING) {
    const slat = boxMesh(W.x1 - W.x0 - 0.2, 0.04, SLAT_DEPTH, slatMat, 0, y, W.z + 0.25);
    slat.rotation.x = SLAT_TILT;
    scene.add(slat);
    slats.push(slat);
  }
  scene.add(boxMesh(W.x1 - W.x0, 0.35, 0.6, slatMat, 0, W.y1 - 0.2, W.z + 0.25));
  for (const x of [-2, 2]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, W.y1 - W.y0, 6), matte(0xdddddd));
    cord.position.set(x, (W.y0 + W.y1) / 2, W.z + 0.47);
    scene.add(cord);
  }

  // Sun: one real-time shadowed directional light.
  const dir = new THREE.Vector3(-0.35, 1.55, -1).normalize();
  const light = new THREE.DirectionalLight(0xffd9a0, 5.5);
  light.position.copy(dir).multiplyScalar(35);
  light.target.position.set(0, 0, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  const cam = light.shadow.camera;
  cam.left = -13; cam.right = 13; cam.top = 13; cam.bottom = -13; cam.near = 5; cam.far = 70;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  scene.add(light, light.target);

  // Cool sky fill + warm floor bounce, and a faint key from the room side.
  scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x6a5a48, 0.55));
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.35);
  fill.position.set(6, 5, 8);
  scene.add(fill);

  // Background scale props: a huge knitted bean bag and a plastic toy box.
  const beanMat = createWoolMaterial({ color: 0x8bcb3a, pattern: 'garter', uvSize: [2 * Math.PI * 4, Math.PI * 4] });
  const bean = new THREE.Mesh(new THREE.SphereGeometry(4, 48, 32), beanMat);
  bean.scale.set(1, 0.55, 1.1);
  bean.position.set(-8.5, 1.6, 2.5);
  bean.castShadow = bean.receiveShadow = true;
  scene.add(bean);
  scene.add(boxMesh(5, 4, 4, plastic(0xd8262e, 0.35), 9, 2, -4.5));

  const shafts = createLightShafts(dir, slats.map((s) => s.position.y));
  scene.add(shafts.group);
  const dust = createDust(dir, slats.map((s) => s.position.y));
  scene.add(dust.points);

  return {
    sun: { light, dir },
    update(t: number) {
      shafts.update(t);
      dust.update(t);
    },
  };
}

/** Cheap volumetric look: one additive prism per gap between slats, extruded along the sun. */
function createLightShafts(sunDir: THREE.Vector3, slatYs: number[]): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uIntensity: { value: 0.014 }, uColor: { value: new THREE.Color(0xffd9a0) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float along;
      varying float vAlong;
      varying vec3 vWorld;
      void main() {
        vAlong = along;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying float vAlong;
      varying vec3 vWorld;
      void main() {
        float fade = smoothstep( 0.0, 0.12, vAlong ) * ( 1.0 - smoothstep( 0.55, 1.0, vAlong ) );
        float shimmer = 0.8 + 0.2 * sin( vWorld.x * 2.7 + uTime * 0.4 ) * sin( vWorld.y * 1.9 - uTime * 0.3 );
        // Fade out near the lens so standing inside a beam doesn't wash out the frame.
        fade *= smoothstep( 1.0, 5.0, distance( vWorld, cameraPosition ) );
        gl_FragColor = vec4( uColor * uIntensity * fade * shimmer, 1.0 );
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const inward = sunDir.clone().negate();
  const zFace = WINDOW.z + 0.3;
  const x0 = WINDOW.x0 + 0.1;
  const x1 = WINDOW.x1 - 0.1;
  for (let i = 0; i < slatYs.length - 1; i++) {
    const y0 = slatYs[i] + 0.2;
    const y1 = slatYs[i + 1] - 0.2;
    const top = [
      new THREE.Vector3(x0, y0, zFace), new THREE.Vector3(x1, y0, zFace),
      new THREE.Vector3(x1, y1, zFace), new THREE.Vector3(x0, y1, zFace),
    ];
    // Extrude each corner until it reaches the floor.
    const bottom = top.map((p) => p.clone().addScaledVector(inward, p.y / -inward.y));
    const verts = [...top, ...bottom];
    const positions = verts.flatMap((v) => [v.x, v.y, v.z]);
    const along = [0, 0, 0, 0, 1, 1, 1, 1];
    const index = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setIndex(index);
    group.add(new THREE.Mesh(geo, mat));
  }
  group.renderOrder = 10;
  return { group, update: (t) => { uniforms.uTime.value = t; } };
}

function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Dust motes that only sparkle while inside a sunbeam. */
function createDust(sunDir: THREE.Vector3, slatYs: number[]): { points: THREE.Points; update(t: number): void } {
  const N = 700;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -7 + Math.random() * 14;
    pos[i * 3 + 1] = Math.random() * 15;
    pos[i * 3 + 2] = -6.5 + Math.random() * 11;
    seed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.06, map: softDot(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const warm = new THREE.Color(0xffe2b0);

  const inBeam = (x: number, y: number, zz: number): boolean => {
    const t = (WINDOW.z + 0.3 - zz) / sunDir.z;
    if (t < 0) return false;
    const qx = x + sunDir.x * t;
    const qy = y + sunDir.y * t;
    if (qx < WINDOW.x0 || qx > WINDOW.x1 || qy < WINDOW.y0 || qy > WINDOW.y1) return false;
    for (const sy of slatYs) if (Math.abs(qy - sy) < 0.2) return false;
    return true;
  };

  return {
    points,
    update(t: number) {
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        let x = pos[i * 3] + Math.sin(t * 0.21 + s) * 0.0016;
        let y = pos[i * 3 + 1] + Math.sin(t * 0.13 + s * 1.7) * 0.0012 - 0.0007;
        const zz = pos[i * 3 + 2] + Math.cos(t * 0.17 + s) * 0.0016;
        if (y < 0) y += 15;
        if (x < -7) x += 14;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = zz;
        const twinkle = 0.6 + 0.4 * Math.sin(t * 1.3 + s * 5);
        const k = inBeam(x, y, zz) ? 2.2 * twinkle : 0.04;
        col[i * 3] = warm.r * k; col[i * 3 + 1] = warm.g * k; col[i * 3 + 2] = warm.b * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
