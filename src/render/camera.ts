// "Underwater camera" post-process: slight barrel distortion, chromatic
// aberration toward the edges, color grade with depth absorption, filmic
// contrast, vignette and animated sensor grain.

import { Filter, GlProgram } from 'pixi.js';

const vertex = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uCA;
uniform float uVignette;
uniform float uGrain;
uniform float uContrast;
uniform float uSaturation;
uniform float uDistort;
uniform vec3 uTint;
uniform vec3 uLift;

void main(void) {
  vec2 maxUv = uOutputFrame.zw * uInputSize.zw;
  vec2 p = vTextureCoord / maxUv;
  vec2 c = p - 0.5;
  float r2 = dot(c, c);
  vec2 d = c * (1.0 - uDistort * r2);
  vec2 puv = clamp((d + 0.5) * maxUv, vec2(0.0), maxUv);
  vec2 off = c * r2 * uCA * maxUv;
  vec4 base = texture(uTexture, puv);
  float rr = texture(uTexture, clamp(puv + off, vec2(0.0), maxUv)).r;
  float bb = texture(uTexture, clamp(puv - off, vec2(0.0), maxUv)).b;
  vec3 col = vec3(rr, base.g, bb);

  // Grade: water absorbs reds first; lift the shadows toward deep blue.
  col = col * uTint + uLift * (1.0 - col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  // Soft filmic shoulder so bioluminescence blooms instead of clipping.
  col = col / (1.0 + max(col - 0.85, 0.0) * 1.5);

  float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.85)) * 1.25);
  col *= mix(1.0, v, uVignette);

  vec2 px = p * uInputSize.xy;
  float n = fract(sin(dot(floor(px) + fract(uTime * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * uGrain;

  finalColor = vec4(clamp(col, 0.0, 1.0), base.a);
}`;

export interface GradeSettings {
  tint: [number, number, number];
  lift: [number, number, number];
  saturation: number;
  contrast: number;
}

export class CameraFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'underwater-camera' }),
      resources: {
        cameraUniforms: {
          uTime: { value: 0, type: 'f32' },
          uCA: { value: 0.012, type: 'f32' },
          uVignette: { value: 0.75, type: 'f32' },
          uGrain: { value: 0.045, type: 'f32' },
          uContrast: { value: 1.08, type: 'f32' },
          uSaturation: { value: 0.92, type: 'f32' },
          uDistort: { value: 0.06, type: 'f32' },
          uTint: { value: new Float32Array([0.95, 1.0, 1.04]), type: 'vec3<f32>' },
          uLift: { value: new Float32Array([0.0, 0.02, 0.05]), type: 'vec3<f32>' },
        },
      },
    });
  }

  private get u() {
    return this.resources.cameraUniforms.uniforms as Record<string, any>;
  }

  set time(t: number) {
    this.u.uTime = t;
  }

  setGrade(g: GradeSettings) {
    const u = this.u;
    u.uTint = new Float32Array(g.tint);
    u.uLift = new Float32Array(g.lift);
    u.uSaturation = g.saturation;
    u.uContrast = g.contrast;
  }

  setStrength(reduced: boolean) {
    const u = this.u;
    u.uCA = reduced ? 0.004 : 0.012;
    u.uGrain = reduced ? 0.02 : 0.045;
    u.uDistort = reduced ? 0.02 : 0.06;
  }
}
