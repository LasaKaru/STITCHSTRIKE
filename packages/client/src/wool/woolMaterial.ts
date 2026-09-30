import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { getFibreTexture, getStitchMaps, type StitchPattern } from './stitches.ts';

/**
 * The layered wool shader from plan §13.3, built on MeshPhysicalMaterial:
 *  1 stitch normal + cavity AO        (all presets)
 *  2 per-stitch / hand-dyed tint      (all presets)
 *  3 sheen                            (all presets)
 *  4 fibre fuzz rim, strongest backlit (Medium+)
 *  5 shell fuzz                       (High+, heroes near the camera)
 *  6 stray fibres                     (Ultra)
 *  7 wrap lighting (fake subsurface)  (all presets)
 */

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface WoolLayers {
  stitch: boolean;
  tint: boolean;
  sheen: boolean;
  rim: boolean;
  shells: boolean;
  fibres: boolean;
  wrap: boolean;
}

export const QUALITY_LAYERS: Record<Quality, WoolLayers> = {
  low: { stitch: true, tint: true, sheen: true, rim: false, shells: false, fibres: false, wrap: true },
  medium: { stitch: true, tint: true, sheen: true, rim: true, shells: false, fibres: false, wrap: true },
  high: { stitch: true, tint: true, sheen: true, rim: true, shells: true, fibres: false, wrap: true },
  ultra: { stitch: true, tint: true, sheen: true, rim: true, shells: true, fibres: true, wrap: true },
};

/** Shared by every wool material so a debug panel can tune all of them live without recompiling. */
export const woolUniforms = {
  uWoolWrap: { value: 0.4 },
  uWoolTint: { value: 0.07 },
  uWoolAO: { value: 0.75 },
  uWoolRim: { value: 0.9 },
  uWoolShellLength: { value: 0.028 },
  uWoolShellCount: { value: 12 },
  uWoolFibreScale: { value: 7 },
  uWoolFibre: { value: null as THREE.Texture | null },
};

export const woolParams = {
  normalScale: 1.15,
  /** Stitches per world unit. Plan §13.3 suggests 6-8; the reference photos read closer to 10-12 on a 15 cm toy. */
  density: 11,
  sheenRoughness: 0.55,
  shellMaxDistance: 8,
  maxShells: 16,
};

export interface WoolOptions {
  color: THREE.ColorRepresentation;
  pattern: StitchPattern;
  /** Approximate surface size in world units along the U and V directions of the mesh UVs. */
  uvSize: [number, number];
  /**
   * World-space planar mapping picked by the dominant normal axis, for big
   * static geometry without meaningful UVs (walls, furniture). uvSize is ignored.
   */
  triplanar?: boolean;
  /** UVs are already in stitch units (sculpted figures with knit-flow UVs); uvSize is ignored. */
  stitchUv?: boolean;
  /** Skinned shell layer (1..N): pushed out along the normal like instanced shells, but per draw. */
  shellLayer?: number;
  /** Multiplier on the global stitch density (e.g. 1.4 for finer yarn). */
  gauge?: number;
  /** Multiplier on fuzz length (felt and mohair are fuzzier). */
  fuzz?: number;
  roughness?: number;
}

interface WoolData {
  options: WoolOptions;
  normalMap: THREE.Texture;
  repeat: THREE.Vector2;
  shell: boolean;
}

const all = new Set<THREE.MeshPhysicalMaterial>();

const VERT_DECL = /* glsl */ `
uniform vec2 uWoolRepeat;
uniform float uWoolShellLength;
uniform float uWoolShellCount;
uniform float uWoolFuzz;
varying vec2 vWoolUv;
varying vec3 vWoolWorldPos;
varying float vWoolShellT;
`;

const FRAG_DECL = /* glsl */ `
uniform sampler2D uWoolDetail;
uniform sampler2D uWoolFibre;
uniform float uWoolTint;
uniform float uWoolAO;
uniform float uWoolRim;
uniform float uWoolWrap;
uniform float uWoolFibreScale;
uniform vec3 uWoolRimColor;
varying vec2 vWoolUv;
varying vec3 vWoolWorldPos;
varying float vWoolShellT;

float woolHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}

float woolNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( woolHash( i ), woolHash( i + vec3( 1, 0, 0 ) ), f.x ),
                   mix( woolHash( i + vec3( 0, 1, 0 ) ), woolHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( woolHash( i + vec3( 0, 0, 1 ) ), woolHash( i + vec3( 1, 0, 1 ) ), f.x ),
                   mix( woolHash( i + vec3( 0, 1, 1 ) ), woolHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, data: WoolData, mat: THREE.MeshPhysicalMaterial): void {
  const { options } = data;
  const detail = getStitchMaps(options.pattern).detail;
  Object.assign(shader.uniforms, woolUniforms, {
    uWoolRepeat: { value: data.repeat },
    uWoolDetail: { value: detail },
    uWoolFuzz: { value: options.fuzz ?? 1 },
    uWoolRimColor: { value: new THREE.Color(options.color).lerp(new THREE.Color(0xffffff), 0.45) },
  });
  woolUniforms.uWoolFibre.value = getFibreTexture();
  mat.userData.shader = shader;

  let vs = shader.vertexShader;
  vs = vs.replace('#include <common>', `#include <common>\n${VERT_DECL}`);
  vs = vs.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvWoolUv = uv * uWoolRepeat;');
  if (data.shell) {
    const layer = options.shellLayer !== undefined ? `${options.shellLayer.toFixed(1)}` : '( float( gl_InstanceID ) + 1.0 )';
    vs = vs.replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
	vWoolShellT = ${layer} / uWoolShellCount;
	float woolLen = uWoolShellLength * uWoolFuzz;
	transformed += objectNormal * woolLen * vWoolShellT;
	transformed.y -= woolLen * 0.35 * vWoolShellT * vWoolShellT;`);
  } else {
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWoolShellT = 0.0;');
  }
  if (options.triplanar) {
    vs = vs.replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
	{
		vec3 woolWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
		vec3 woolWn = abs( normalize( mat3( modelMatrix ) * objectNormal ) );
		vec2 woolPlane = woolWn.x > woolWn.y && woolWn.x > woolWn.z ? woolWp.zy : ( woolWn.y > woolWn.z ? woolWp.xz : woolWp.xy );
		vWoolUv = woolPlane * uWoolRepeat;
		#ifdef USE_NORMALMAP
			// Derivative-based tangent frames follow this UV, so stitches stay upright on every face.
			vNormalMapUv = vWoolUv;
		#endif
	}`);
  }
  vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWoolWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  shader.vertexShader = vs;

  let fs = shader.fragmentShader;
  fs = fs.replace('#include <common>', `#include <common>\n${FRAG_DECL}`);
  // Wrap lighting (fake subsurface) on the diffuse term only. Specular and sheen keep the
  // plain N.L irradiance: their visibility terms explode where N.L and N.V are both ~0.
  const lights = THREE.ShaderChunk.lights_physical_pars_fragment;
  const diffuseLine = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  if (!lights.includes(diffuseLine)) console.warn('wool: three.js lighting chunk changed; wrap lighting disabled');
  fs = fs.replace(
    '#include <lights_physical_pars_fragment>',
    lights.replace(
      diffuseLine,
      /* glsl */ `float woolNL = dot( geometryNormal, directLight.direction );
	vec3 woolWrapExtra = ( saturate( ( woolNL + uWoolWrap ) / ( 1.0 + uWoolWrap ) ) - saturate( woolNL ) ) * directLight.color;
	reflectedLight.directDiffuse += ( irradiance + woolWrapExtra ) * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`,
    ),
  );
  fs = fs.replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
	vec4 woolDetail = texture2D( uWoolDetail, vWoolUv );
	float woolDye = woolNoise( vWoolWorldPos * 2.3 ) - 0.5;
	float woolStitchTint = ( woolDetail.g - 0.5 ) * 2.0;
	diffuseColor.rgb *= 1.0 + uWoolTint * ( woolStitchTint + woolDye );
	diffuseColor.rgb *= vec3( 1.0 + uWoolTint * 0.3 * woolStitchTint, 1.0, 1.0 - uWoolTint * 0.3 * woolStitchTint );
	diffuseColor.rgb *= mix( 1.0, woolDetail.r, uWoolAO );`);
  if (data.shell) {
    fs = fs.replace('#include <alphatest_fragment>', /* glsl */ `#include <alphatest_fragment>
	float woolStrand = texture2D( uWoolFibre, vWoolUv * uWoolFibreScale ).r;
	woolStrand *= mix( 0.55, 1.0, woolDetail.a );
	if ( woolStrand < mix( 0.45, 1.0, vWoolShellT ) ) discard;
	diffuseColor.rgb *= mix( 0.6, 1.12, vWoolShellT );`);
  }
  if (!data.shell) {
    fs = fs.replace('#include <opaque_fragment>', /* glsl */ `
	{
		// Fibre fuzz at silhouettes, strongest when backlit: the halo seen in macro toy photos.
		vec3 woolV = normalize( vViewPosition );
		float woolFres = pow( 1.0 - saturate( abs( dot( normal, woolV ) ) ), 3.0 );
		vec3 woolRim = ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) * 0.6;
		#if NUM_DIR_LIGHTS > 0
			float woolBack = pow( saturate( dot( directionalLights[ 0 ].direction, -woolV ) ), 3.0 );
			woolRim += directionalLights[ 0 ].color * diffuseColor.rgb * woolBack * 0.06;
		#endif
		outgoingLight += uWoolRim * woolFres * ( 0.7 + 0.6 * woolDetail.b ) * woolRim * uWoolRimColor;
	}
	#include <opaque_fragment>`);
  }
  shader.fragmentShader = fs;
}

function applyLayers(mat: THREE.MeshPhysicalMaterial, layers: WoolLayers): void {
  const data = mat.userData.wool as WoolData;
  const wantNormal = layers.stitch ? data.normalMap : null;
  if (mat.normalMap !== wantNormal) {
    mat.normalMap = wantNormal;
    mat.needsUpdate = true;
  }
  // Shell strands already read as fibres; sheen at their grazing normals just sparkles.
  mat.sheen = layers.sheen && !data.shell ? 1 : 0;
  const shader = mat.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
  // Per-material overrides of shared uniforms for layer toggles.
  mat.userData.layerScale = {
    tint: layers.tint ? 1 : 0,
    rim: layers.rim ? 1 : 0,
    wrap: layers.wrap ? 1 : 0,
  };
  if (shader) syncLayerUniforms(mat);
}

function syncLayerUniforms(mat: THREE.MeshPhysicalMaterial): void {
  const shader = mat.userData.shader as THREE.WebGLProgramParametersWithUniforms | undefined;
  const scale = mat.userData.layerScale as { tint: number; rim: number; wrap: number } | undefined;
  if (!shader || !scale) return;
  // Replace shared uniform refs with per-material ones only when a layer is off.
  shader.uniforms.uWoolTint = scale.tint ? woolUniforms.uWoolTint : { value: 0 };
  shader.uniforms.uWoolRim = scale.rim ? woolUniforms.uWoolRim : { value: 0 };
  shader.uniforms.uWoolWrap = scale.wrap ? woolUniforms.uWoolWrap : { value: 0 };
}

let currentLayers: WoolLayers = { ...QUALITY_LAYERS.high };

export function createWoolMaterial(options: WoolOptions, shell = false): THREE.MeshPhysicalMaterial {
  const maps = getStitchMaps(options.pattern);
  const gauge = (options.gauge ?? 1) * woolParams.density;
  // Triplanar: repeat is tiles per world unit. UV-mapped: whole tiles across the part so seams wrap.
  const repeat = options.stitchUv
    ? new THREE.Vector2(1 / maps.cols, 1 / maps.rows)
    : options.triplanar
    ? new THREE.Vector2(gauge / maps.cols, gauge / maps.rows)
    : new THREE.Vector2(
      Math.max(1, Math.round((options.uvSize[0] * gauge) / maps.cols)),
      Math.max(1, Math.round((options.uvSize[1] * gauge) / maps.rows)),
    );
  const normalMap = maps.normal.clone();
  normalMap.repeat.copy(repeat);
  const color = new THREE.Color(options.color);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: woolParams.sheenRoughness,
    sheenColor: color.clone().lerp(new THREE.Color(0xffffff), 0.2).multiplyScalar(0.7),
    normalMap,
    normalScale: new THREE.Vector2(woolParams.normalScale, woolParams.normalScale),
  });
  const data: WoolData = { options, normalMap, repeat, shell };
  mat.userData.wool = data;
  mat.onBeforeCompile = (shader) => {
    patchShader(shader, data, mat);
    syncLayerUniforms(mat);
  };
  mat.customProgramCacheKey = () => `wool${shell ? '-shell' : ''}${options.triplanar ? '-tri' : ''}${options.shellLayer !== undefined ? `-L${options.shellLayer}` : ''}`;
  all.add(mat);
  applyLayers(mat, currentLayers);
  return mat;
}

/** Applies a layer set (e.g. from a quality preset) to every wool material and fuzz object. */
export function setWoolLayers(layers: WoolLayers): void {
  currentLayers = { ...layers };
  for (const m of all) applyLayers(m, layers);
  for (const s of shellMeshes) s.visible = layers.shells;
  for (const f of fibreObjects) f.visible = layers.fibres;
}

export function getWoolLayers(): WoolLayers {
  return { ...currentLayers };
}

export function setWoolNormalScale(v: number): void {
  woolParams.normalScale = v;
  for (const m of all) m.normalScale.set(v, v);
}

export function setWoolSheenRoughness(v: number): void {
  woolParams.sheenRoughness = v;
  for (const m of all) m.sheenRoughness = v;
}

// ---------------------------------------------------------------- shells + fibres

const shellMeshes = new Set<THREE.InstancedMesh>();
const fibreObjects = new Set<THREE.Object3D>();

/**
 * Adds shell fuzz to a wool mesh: the same geometry drawn N more times in one
 * instanced draw call, each pushed out along the normal and alpha-tested.
 */
export function addShellFuzz(mesh: THREE.Mesh): THREE.InstancedMesh {
  const base = mesh.material as THREE.MeshPhysicalMaterial;
  const data = base.userData.wool as WoolData;
  const shellMat = createWoolMaterial(data.options, true);
  const shells = new THREE.InstancedMesh(mesh.geometry, shellMat, woolParams.maxShells);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < woolParams.maxShells; i++) shells.setMatrixAt(i, identity);
  shells.count = woolUniforms.uWoolShellCount.value;
  shells.castShadow = false;
  shells.receiveShadow = true;
  shells.frustumCulled = false;
  shells.visible = currentLayers.shells;
  shells.name = `${mesh.name}-shells`;
  shells.userData.isShell = true;
  mesh.add(shells);
  shellMeshes.add(shells);
  return shells;
}

/** Plan §13.3: shells only near the camera; beyond that the fuzz rim carries the look. */
export function updateShellLod(camera: THREE.Camera): void {
  const tmp = new THREE.Vector3();
  const count = Math.round(woolUniforms.uWoolShellCount.value);
  for (const s of shellMeshes) {
    s.getWorldPosition(tmp);
    s.count = tmp.distanceTo(camera.position) < woolParams.shellMaxDistance ? count : 0;
  }
}

/** A few hundred loose curved strands on the surface (Ultra). */
export function addStrayFibres(mesh: THREE.Mesh, count: number, length = 0.035): THREE.LineSegments {
  const data = (mesh.material as THREE.MeshPhysicalMaterial).userData.wool as WoolData;
  const sampler = new MeshSurfaceSampler(mesh).build();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const positions: number[] = [];
  const SEGMENTS = 4;
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n);
    t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(n).normalize();
    const len = length * (0.4 + Math.random() * 0.9) * (data.options.fuzz ?? 1);
    let prev = p.clone();
    for (let s = 1; s <= SEGMENTS; s++) {
      const k = s / SEGMENTS;
      const q = p.clone()
        .addScaledVector(n, len * k)
        .addScaledVector(t, len * 0.6 * k * k)
        .add(new THREE.Vector3(0, -len * 0.3 * k * k, 0));
      positions.push(prev.x, prev.y, prev.z, q.x, q.y, q.z);
      prev = q;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const color = new THREE.Color(data.options.color).lerp(new THREE.Color(0xffffff), 0.25);
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  lines.visible = currentLayers.fibres;
  lines.name = `${mesh.name}-fibres`;
  mesh.add(lines);
  fibreObjects.add(lines);
  return lines;
}
