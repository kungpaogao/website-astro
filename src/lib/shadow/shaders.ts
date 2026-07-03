/**
 * GLSL ES 1.00 shaders for the dappled-light simulator.
 *
 * The fragment shader treats the canvas as the ground seen top-down and, for
 * each pixel, estimates how much of the sun's disk is visible through the
 * canopy: K sample directions on the sun's angular disk (Vogel spiral,
 * rotated per-pixel by interleaved gradient noise to avoid banding), each
 * ray multiplied through the three canopy layers stored in the R/G/B
 * channels of the canopy texture. Averaging the per-ray products — rather
 * than multiplying per-layer averages — preserves the pinhole correlation
 * between layers that produces real dappled light.
 */

import { SUN_ANGLE_SCALE, TAN_SUN_HALF_ANGLE } from "./projection";

export const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Build the fragment shader with the sun-disk sample count baked in as a
 * compile-time constant (GLSL ES 1.00 requires constant loop bounds).
 */
export function buildFragSrc(sampleCount: number): string {
  const K = Math.max(1, Math.round(sampleCount));
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

const int K = ${K};
const float K_F = ${K.toFixed(1)};
// sun half-angle tangent, artistically scaled (see SUN_ANGLE_SCALE)
const float TAN_SUN = ${(TAN_SUN_HALF_ANGLE * SUN_ANGLE_SCALE).toFixed(6)};
const float GOLDEN = 2.39996323;

uniform vec2 u_resolution;      // device pixels
uniform float u_metersPerPixel;
uniform float u_time;           // seconds
uniform sampler2D u_canopy;     // R/G/B = low/mid/high layer opacity
uniform vec3 u_layerHeights;    // meters
uniform float u_sinElev;
uniform float u_cosElev;
uniform float u_rhoMax;         // meters, caps low-sun penumbra blur
uniform float u_spanPar;        // plan-space smear of a layer's own height span
uniform vec2 u_azDir;           // sun azimuth unit vector (ground plane)
uniform float u_uvPerMeter;     // canopy texture UV units per world meter
uniform float u_windAmp;        // meters of sway at the canopy top
uniform vec3 u_lightColor;
uniform vec3 u_shadowColor;

vec2 gust(float t) {
  float envelope = 0.65 + 0.35 * sin(0.17 * t);
  return envelope * vec2(
    sin(0.9 * t) + 0.5 * sin(1.7 * t + 1.3),
    sin(0.7 * t + 0.8) + 0.5 * sin(1.3 * t + 2.1)
  );
}

vec2 windOffset(float t, vec2 world, float heightFrac) {
  vec2 flutter = 0.25 * vec2(
    sin(5.3 * t + world.x * 1.9 + world.y * 0.7),
    sin(4.1 * t + world.y * 2.3)
  );
  float sway = pow(heightFrac, 1.5);
  return u_windAmp * sway * (gust(t) + flutter);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 world = (gl_FragCoord.xy - 0.5 * u_resolution) * u_metersPerPixel;
  vec2 perpDir = vec2(-u_azDir.y, u_azDir.x);

  // Work in the plane perpendicular to the sun ray ("plan space"): the
  // ground maps into it compressed by sin(elev) along the azimuth, so the
  // shadow pattern on the ground is stretched 1/sin(elev) — the long
  // shadow of a setting sun. Layer offsets become the tree's side-view
  // displacement (h·cos(elev)) and the penumbra is isotropic here.
  float wPar = dot(world, u_azDir) * u_sinElev;
  float wPerp = dot(world, perpDir);

  // per-layer penumbra radius in plan space (grows as the sun sets),
  // capped so extreme low-sun blur doesn't dissolve all structure
  vec3 rho = min(
    u_layerHeights * (TAN_SUN / max(u_sinElev, 0.15)),
    vec3(u_rhoMax)
  );
  float hTop = u_layerHeights.z;
  float par0 = (u_layerHeights.x - u_layerHeights.y) * u_cosElev;
  float par2 = (u_layerHeights.z - u_layerHeights.y) * u_cosElev;

  // wind: per layer (plan-space meters), phase-shifted so gaps open and
  // close between layers
  vec2 wind0 = windOffset(u_time, world, u_layerHeights.x / hTop);
  vec2 wind1 = windOffset(u_time + 1.7, world, u_layerHeights.y / hTop);
  vec2 wind2 = windOffset(u_time + 3.1, world, 1.0);

  vec2 base0 = vec2(wPar + par0 + wind0.x, wPerp + wind0.y);
  vec2 base1 = vec2(wPar + wind1.x, wPerp + wind1.y);
  vec2 base2 = vec2(wPar + par2 + wind2.x, wPerp + wind2.y);

  // interleaved gradient noise: per-pixel rotation of the Vogel disk
  float ign = fract(52.9829189 *
    fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float rot = ign * 6.2831853;

  float light = 0.0;
  for (int i = 0; i < K; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / K_F);
    float th = fi * GOLDEN + rot;
    vec2 d = r * vec2(cos(th), sin(th));

    // each layer is a flat slice of a continuous volume: jitter the sample
    // along the azimuth by the layer's own height span so consecutive
    // layers' shadows connect instead of separating into discrete blobs
    float hj = (fract(fi * 0.61803399 + ign) - 0.5) * u_spanPar;

    float vis = 1.0;
    vec2 q0 = base0 + d * rho.x + vec2(hj, 0.0);
    vec2 p0 = q0.x * u_azDir + q0.y * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p0 * u_uvPerMeter + 0.5).r;
    vec2 q1 = base1 + d * rho.y + vec2(hj, 0.0);
    vec2 p1 = q1.x * u_azDir + q1.y * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p1 * u_uvPerMeter + 0.5).g;
    vec2 q2 = base2 + d * rho.z + vec2(hj, 0.0);
    vec2 p2 = q2.x * u_azDir + q2.y * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p2 * u_uvPerMeter + 0.5).b;
    light += vis;
  }
  light /= K_F;

  // pow lifts dim pinhole discs (a small gap passes only part of the sun's
  // disk); the smoothstep then pushes the lifted floor back down
  light = smoothstep(0.06, 1.0, pow(light, 0.55));

  vec3 color = mix(u_shadowColor, u_lightColor, light);
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.012; // static film grain
  gl_FragColor = vec4(color, 1.0);
}
`;
}
