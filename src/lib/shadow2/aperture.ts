/**
 * Light-source aperture sampling for the dappled-light stage.
 *
 * The K sample offsets over the light source's angular disk are computed
 * in JS (so the aperture can be any shape — disk, ellipse, eclipse
 * crescent) and uploaded to the shader as a uniform vec4 array, two vec2
 * samples per vec4. Every gap in the canopy projects an image of this
 * aperture onto the ground: a crescent aperture yields crescent dapples,
 * exactly as happens during a real solar eclipse.
 */

export type ApertureShape = "disk" | "ellipse" | "crescent";

const GOLDEN = 2.39996323;

/** Vogel spiral point i of a well-distributed unit-disk sequence. */
function vogel(i: number, k: number): [number, number] {
  const r = Math.sqrt((i + 0.5) / k);
  const th = i * GOLDEN;
  return [r * Math.cos(th), r * Math.sin(th)];
}

/** K well-distributed samples on the unit disk. */
export function sampleDisk(k: number): Array<[number, number]> {
  const out: Array<[number, number]> = new Array(k);
  for (let i = 0; i < k; i++) out[i] = vogel(i, k);
  return out;
}

/**
 * K samples on an ellipse: unit disk squashed to `e` along y (e ∈ (0, 1]).
 */
export function sampleEllipse(k: number, e: number): Array<[number, number]> {
  return sampleDisk(k).map(([x, y]) => [x, y * e]);
}

/**
 * Maximum eclipse coverage. Beyond this the remaining lune is so thin
 * that K samples can't represent it.
 */
export const MAX_COVERAGE = 0.96;

/** Moon-center distance (in sun radii) for coverage c: d = 2(1 − c). */
function moonDistance(c: number): number {
  return 2 * (1 - Math.min(MAX_COVERAGE, Math.max(0, c)));
}

/** van der Corput radical inverse — every prefix is well-distributed. */
function vdc(i: number, base: number): number {
  let r = 0;
  let f = 1 / base;
  let n = i + 1;
  while (n > 0) {
    r += f * (n % base);
    n = Math.floor(n / base);
    f /= base;
  }
  return r;
}

/**
 * K samples on the crescent left when a same-size moon disk covers
 * fraction c of the sun's diameter. Deterministic: walk a Halton
 * (base 2/3) disk sequence — whose every prefix is uniform, unlike a
 * Vogel prefix — and keep the first K survivors of moon-disk rejection,
 * so the survivors cover the lune evenly.
 */
export function sampleCrescent(
  k: number,
  coverage: number,
): Array<[number, number]> {
  const d = moonDistance(coverage);
  if (d >= 2) return sampleDisk(k);
  const out: Array<[number, number]> = [];
  for (let i = 0; out.length < k && i < 20000; i++) {
    const r = Math.sqrt(vdc(i, 2));
    const th = 2 * Math.PI * vdc(i, 3);
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    const dy = y - d; // moon center offset along +y in aperture space
    if (x * x + dy * dy >= 1) out.push([x, y]);
  }
  while (out.length < k) out.push([0, -1]); // unreachable below MAX_COVERAGE
  return out;
}

/**
 * Fraction of the sun's disk area left uncovered at coverage c
 * (drives the real eclipse dimming of the whole scene).
 */
export function luneFraction(coverage: number): number {
  const d = moonDistance(coverage);
  if (d >= 2) return 1;
  if (d <= 0) return 0;
  // area of intersection of two unit circles at center distance d
  const overlap = 2 * Math.acos(d / 2) - (d / 2) * Math.sqrt(4 - d * d);
  return 1 - overlap / Math.PI;
}

export interface Aperture {
  /** flat [x0,y0,x1,y1,...] of K unit-aperture sample offsets */
  samples: Float32Array;
  /** irradiance relative to the full disk (eclipse dimming) */
  gain: number;
}

/** Build the K-sample aperture for the given shape controls. */
export function buildAperture(
  k: number,
  shape: ApertureShape,
  control: number,
): Aperture {
  let pts: Array<[number, number]>;
  let gain = 1;
  if (shape === "ellipse") {
    const e = 1 - 0.65 * Math.min(1, Math.max(0, control)); // 1 → 0.35
    pts = sampleEllipse(k, e);
    gain = e;
  } else if (shape === "crescent") {
    pts = sampleCrescent(k, control);
    gain = luneFraction(control);
  } else {
    pts = sampleDisk(k);
  }
  const samples = new Float32Array(k * 2);
  for (let i = 0; i < k; i++) {
    samples[2 * i] = pts[i][0];
    samples[2 * i + 1] = pts[i][1];
  }
  return { samples, gain };
}
