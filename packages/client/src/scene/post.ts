import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Post chain from plan §14.2: AO -> depth of field (tilt-shift macro feel) ->
 * bloom -> AgX tonemap -> light vignette + grain. MSAA on the render target
 * stands in for FXAA/SMAA.
 */

const VignetteGrain = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.025 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float rand( vec2 co ) { return fract( sin( dot( co, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep( 0.2, 0.8, dot( d, d ) * 2.2 );
      c.rgb += ( rand( vUv * 731.0 + fract( uTime ) ) - 0.5 ) * uGrain;
      gl_FragColor = c;
    }`,
};

export interface PostSettings {
  ao: boolean;
  dof: boolean;
  bloom: boolean;
  bloomStrength: number;
  focus: number;
  aperture: number;
  maxBlur: number;
  vignette: number;
  grain: number;
}

export interface Post {
  composer: EffectComposer;
  settings: PostSettings;
  apply(): void;
  setSize(w: number, h: number): void;
  render(t: number): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, initial: Partial<PostSettings> = {}): Post {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const settings: PostSettings = {
    ao: true, dof: true, bloom: true, bloomStrength: 0.45, focus: 3, aperture: 0.0022, maxBlur: 0.005,
    vignette: 0.28, grain: 0.025, ...initial,
  };

  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.blendIntensity = 0.45;
  composer.addPass(gtao);
  const bokeh = new BokehPass(scene, camera, { focus: settings.focus, aperture: settings.aperture, maxblur: settings.maxBlur });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), settings.bloomStrength, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vg = new ShaderPass(VignetteGrain);
  composer.addPass(vg);

  const bokehUniforms = bokeh.uniforms as Record<string, THREE.IUniform>;

  const post: Post = {
    composer,
    settings,
    apply() {
      gtao.enabled = settings.ao;
      bokeh.enabled = settings.dof;
      bloom.enabled = settings.bloom;
      bloom.strength = settings.bloomStrength;
      bokehUniforms.focus.value = settings.focus;
      bokehUniforms.aperture.value = settings.aperture;
      bokehUniforms.maxblur.value = settings.maxBlur;
      vg.uniforms.uVignette.value = settings.vignette;
      vg.uniforms.uGrain.value = settings.grain;
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
    render(t) {
      vg.uniforms.uTime.value = t;
      composer.render();
    },
  };
  post.apply();
  return post;
}
