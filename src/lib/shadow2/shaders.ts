/**
 * GLSL ES 1.00 shaders for the staged simulator, diverged from v1:
 * - "hard" mode: single centered sun ray — the step-2 view of raw
 *   projective geometry (sharp silhouette, stretch, layer parallax).
 * - "aperture" mode: the step-3 area-light view. The K sample offsets
 *   over the light source come from JS as a uniform vec4 array (two
 *   vec2 samples per vec4 — GLSL ES 1.00 requires constant-index array
 *   access, so we consume both halves inside a canonical loop), which
 *   lets the aperture be any shape: disk, ellipse, eclipse crescent.
 *   Samples are decorrelated per pixel by small positional jitter,
 *   never rotation (rotation would spin the crescent per pixel).
 */

export const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export interface Frag2Options {
  mode: "hard" | "aperture";
  /** sample count; must be even (packed two per vec4) */
  k?: number;
}

export function buildFragSrc2({ mode, k = 32 }: Frag2Options): string {
  const K = Math.max(2, 2 * Math.round(k / 2));
  const K2 = K / 2;
  const jitterR = (0.12 / Math.sqrt(K)).toFixed(5);

  const common = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;      // device pixels
uniform float u_metersPerPixel;
uniform sampler2D u_canopy;     // R/G/B = low/mid/high layer opacity
uniform vec3 u_layerHeights;    // meters
uniform float u_sinElev;
uniform float u_cosElev;
uniform vec2 u_azDir;           // sun azimuth unit vector (ground plane)
uniform float u_uvPerMeter;     // canopy texture UV units per world meter
uniform vec3 u_lightColor;
uniform vec3 u_shadowColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 planeBase(vec2 world, float par) {
  float wPar = dot(world, u_azDir) * u_sinElev;
  float wPerp = dot(world, vec2(-u_azDir.y, u_azDir.x));
  return vec2(wPar + par, wPerp);
}

vec2 toCanopy(vec2 plan) {
  vec2 perpDir = vec2(-u_azDir.y, u_azDir.x);
  vec2 p = plan.x * u_azDir + plan.y * perpDir;
  return p * u_uvPerMeter + 0.5;
}
`;

  if (mode === "hard") {
    return `${common}
void main() {
  vec2 world = (gl_FragCoord.xy - 0.5 * u_resolution) * u_metersPerPixel;
  // the texture is already the 3D-projected scene: one lookup, three
  // channels (they only encode height bins for the dappled stage)
  vec4 texel = texture2D(u_canopy, toCanopy(planeBase(world, 0.0)));
  float vis = (1.0 - texel.r) * (1.0 - texel.g) * (1.0 - texel.b);

  // near-binary: this view shows raw projective geometry
  float light = smoothstep(0.25, 0.55, vis);
  vec3 color = mix(u_shadowColor, u_lightColor, light);
  gl_FragColor = vec4(color, 1.0);
}
`;
  }

  return `${common}
const int K2 = ${K2};
const float K_F = ${K.toFixed(1)};
const float JR = ${jitterR};

uniform vec4 u_ap[${K2}];       // two unit-aperture samples per vec4
uniform float u_tanSun;         // tan of the light's angular half-size
uniform float u_apertureGain;   // relative irradiance (eclipse dimming)
uniform float u_exposure;       // compensation for large light sources
uniform float u_rhoMax;         // meters, caps low-sun penumbra blur

float sampleRay(vec2 base, vec2 s, vec3 rho) {
  float vis = 1.0;
  vis *= 1.0 - texture2D(u_canopy, toCanopy(base + s * rho.x)).r;
  vis *= 1.0 - texture2D(u_canopy, toCanopy(base + s * rho.y)).g;
  vis *= 1.0 - texture2D(u_canopy, toCanopy(base + s * rho.z)).b;
  return vis;
}

void main() {
  vec2 world = (gl_FragCoord.xy - 0.5 * u_resolution) * u_metersPerPixel;
  // the texture is already the 3D-projected scene; channels only pick
  // the penumbra radius (higher occluders cast softer light)
  vec2 base = planeBase(world, 0.0);

  vec3 rho = min(
    u_layerHeights * (u_tanSun / max(u_sinElev, 0.15)),
    vec3(u_rhoMax)
  );

  float ign = fract(52.9829189 *
    fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

  float light = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < K2; i++) {
    float fi = float(2 * i);
    // per-sample positional jitter (decorrelates pixels, keeps the
    // aperture's shape — never rotate)
    float ja = fract(ign + fi * 0.618) * 6.2831853;
    float jb = fract(ign + (fi + 1.0) * 0.618) * 6.2831853;

    // solar limb darkening: the sun's edge is ~40% dimmer than its
    // center, which turns every projected ball of light into a smooth
    // radial gradient instead of a hard noisy disk
    float wa = 1.0 - 0.6 * (1.0 - sqrt(max(0.0, 1.0 - dot(u_ap[i].xy, u_ap[i].xy))));
    float wb = 1.0 - 0.6 * (1.0 - sqrt(max(0.0, 1.0 - dot(u_ap[i].zw, u_ap[i].zw))));

    vec2 sa = u_ap[i].xy + JR * vec2(cos(ja), sin(ja));
    vec2 sb = u_ap[i].zw + JR * vec2(cos(jb), sin(jb));
    light += wa * sampleRay(base, sa, rho);
    light += wb * sampleRay(base, sb, rho);
    wsum += wa + wb;
  }
  light = (light / wsum) * u_apertureGain * u_exposure;

  // bimodal tone with a hard lift for small pinholes: even a hole that
  // passes a quarter of the sun's disk should read as a prominent bright
  // circle, as in reference photos of overhead-sun dapple
  light = smoothstep(0.05, 0.6, pow(light, 0.5));

  vec3 color = mix(u_shadowColor, u_lightColor, light);
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.008;
  gl_FragColor = vec4(color, 1.0);
}
`;
}
