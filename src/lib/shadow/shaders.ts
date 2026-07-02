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
const float TAN_SUN = 0.004661; // tan(0.267 deg), sun half-angle
const float GOLDEN = 2.39996323;

uniform vec2 u_resolution;      // device pixels
uniform float u_metersPerPixel;
uniform float u_time;           // seconds
uniform sampler2D u_canopy;     // R/G/B = low/mid/high layer opacity
uniform vec3 u_layerHeights;    // meters
uniform vec3 u_parallax;        // per-layer shadow shift along u_azDir, meters
uniform float u_invSinElev;
uniform float u_penumbraMax;    // meters, keeps low-sun dapples structured
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

  // per-layer penumbra ellipse radii (meters), capped so extreme low-sun
  // blur doesn't dissolve all structure
  vec3 rPerp = min(u_layerHeights * TAN_SUN * u_invSinElev, vec3(u_penumbraMax));
  // along-azimuth axis gets extra headroom so low-sun elongation survives
  vec3 rPar = min(rPerp * u_invSinElev, vec3(2.5 * u_penumbraMax));
  float hTop = u_layerHeights.z;
  vec2 par0 = u_parallax.x * u_azDir;
  vec2 par2 = u_parallax.z * u_azDir;

  // wind: per layer, phase-shifted so gaps open and close between layers
  vec2 wind0 = windOffset(u_time, world, u_layerHeights.x / hTop);
  vec2 wind1 = windOffset(u_time + 1.7, world, u_layerHeights.y / hTop);
  vec2 wind2 = windOffset(u_time + 3.1, world, 1.0);

  vec2 base0 = world + par0 + wind0;
  vec2 base1 = world + wind1;
  vec2 base2 = world + par2 + wind2;

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

    float vis = 1.0;
    vec2 p0 = base0 + d.x * rPar.x * u_azDir + d.y * rPerp.x * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p0 * u_uvPerMeter + 0.5).r;
    vec2 p1 = base1 + d.x * rPar.y * u_azDir + d.y * rPerp.y * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p1 * u_uvPerMeter + 0.5).g;
    vec2 p2 = base2 + d.x * rPar.z * u_azDir + d.y * rPerp.z * perpDir;
    vis *= 1.0 - texture2D(u_canopy, p2 * u_uvPerMeter + 0.5).b;
    light += vis;
  }
  light /= K_F;

  // slight s-curve for punchier dapple cores
  light = smoothstep(0.0, 1.0, light);

  vec3 color = mix(u_shadowColor, u_lightColor, light);
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.012; // static film grain
  gl_FragColor = vec4(color, 1.0);
}
`;
}
