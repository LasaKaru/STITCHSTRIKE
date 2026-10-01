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

/**
 * The cozy stop-motion look: warm split-toning (golden highlights, warm brown
 * shadows), a little extra saturation and contrast, and a tilt-shift blur at the
 * top and bottom of the frame so the knitted sets read as a miniature while the
 * middle of the screen (where you aim) stays sharp.
 */
const CozyGrade = {
  uniforms: {
    tDiffuse: { value: null },
    uGrade: { value: 1 },
    uTilt: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uGrade;
    uniform float uTilt;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      // Tilt-shift: blur grows away from a sharp band through the middle.
      float band = smoothstep( 0.2, 0.5, abs( vUv.y - 0.52 ) ) * uTilt;
      vec4 c = texture2D( tDiffuse, vUv );
      if ( band > 0.01 ) {
        vec3 acc = c.rgb;
        float r = band * 7.0;
        for ( int i = 0; i < 12; i++ ) {
          float a = float( i ) * 2.39996;
          float d = sqrt( ( float( i ) + 0.5 ) / 12.0 ) * r;
          acc += texture2D( tDiffuse, vUv + vec2( cos( a ), sin( a ) ) * d * uTexel ).rgb;
        }
        c.rgb = acc / 13.0;
      }
      vec3 col = c.rgb;
      float l = dot( col, vec3( 0.299, 0.587, 0.114 ) );
      // Saturation and a gentle S-curve.
      col = mix( vec3( l ), col, 1.0 + 0.18 * uGrade );
      col = mix( col, col * col * ( 3.0 - 2.0 * col ), 0.25 * uGrade );
      // Split-tone: warm brown shadows, golden highlights.
      vec3 shadowTint = vec3( 1.06, 0.98, 0.9 );
      vec3 highTint = vec3( 1.06, 1.0, 0.86 );
      col *= mix( vec3( 1.0 ), mix( shadowTint, highTint, smoothstep( 0.2, 0.8, l ) ), uGrade );
      gl_FragColor = vec4( col, c.a );
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
  /** 0..1 warm cozy colour grade. */
  grade: number;
  /** 0..1 tilt-shift miniature blur at the top and bottom of the frame. */
  tilt: number;
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
    vignette: 0.28, grain: 0.025, grade: 1, tilt: 0.6, ...initial,
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
  const cozy = new ShaderPass(CozyGrade);
  composer.addPass(cozy);
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
      cozy.uniforms.uGrade.value = settings.grade;
      cozy.uniforms.uTilt.value = settings.tilt;
      cozy.enabled = settings.grade > 0 || settings.tilt > 0;
    },
    setSize(w, h) {
      composer.setSize(w, h);
      (cozy.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    },
    render(t) {
      vg.uniforms.uTime.value = t;
      composer.render();
    },
  };
  (cozy.uniforms.uTexel.value as THREE.Vector2).set(1 / size.x, 1 / size.y);
  post.apply();
  return post;
}
