import { mulberry32 } from "./prng";

/**
 * A leaf sprite in canopy-texture space.
 * x, y are texture UV coords in [0, 1]; size is the ellipse semi-major
 * axis in UV units; layer is the vertical canopy third (0 = low, 2 = high).
 */
export interface Leaf {
  x: number;
  y: number;
  size: number;
  rot: number;
  layer: 0 | 1 | 2;
}

/**
 * Leaves stay inside the central region of the texture so that
 * CLAMP_TO_EDGE samples outside the canopy always read transparent.
 */
export const UV_MARGIN = 0.07;

/**
 * Leaves cluster around branch-end clumps; the holes BETWEEN clumps are
 * what project the round pinhole sun images. Clump count is a fixed
 * constant — deriving it from leaf count would break prefix stability.
 */
const NUM_CLUMPS = 128;
/** gaussian spread of leaves around a clump, as fraction of usable UV width */
const CLUMP_SIGMA = 0.05;
/** vertical spread, in normalized canopy-height units */
const CLUMP_SIGMA_Y = 0.06;
const CLUMP_SALT = 0x5f356495;

interface ShapeParams {
  /** canopy width / canopy height */
  aspect: number;
  /** superellipse exponent of the radius profile */
  exponent: number;
  /** vertical centroid of canopy mass, 0 = bottom, 1 = top */
  centroid: number;
  /** how strongly silhouette-edge leaves hang downward */
  droop: number;
}

// Anchor shapes for the continuous morph: columnar → oval → spreading → weeping
const SHAPE_ANCHORS: ShapeParams[] = [
  { aspect: 0.45, exponent: 4.0, centroid: 0.5, droop: 0 },
  { aspect: 1.0, exponent: 2.0, centroid: 0.5, droop: 0 },
  { aspect: 1.5, exponent: 2.5, centroid: 0.65, droop: 0 },
  { aspect: 1.3, exponent: 2.0, centroid: 0.75, droop: 1 },
];

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Interpolate shape parameters along the morph slider t ∈ [0, 1].
 * Piecewise smoothstep between anchors so every position is a valid tree.
 */
export function shapeParams(t: number): ShapeParams {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (SHAPE_ANCHORS.length - 1);
  const i = Math.min(Math.floor(scaled), SHAPE_ANCHORS.length - 2);
  const f = smoothstep(scaled - i);
  const a = SHAPE_ANCHORS[i];
  const b = SHAPE_ANCHORS[i + 1];
  return {
    aspect: a.aspect + (b.aspect - a.aspect) * f,
    exponent: a.exponent + (b.exponent - a.exponent) * f,
    centroid: a.centroid + (b.centroid - a.centroid) * f,
    droop: a.droop + (b.droop - a.droop) * f,
  };
}

/** Canopy width / height ratio for the shape slider (drives world footprint). */
export function canopyAspect(shape: number): number {
  return shapeParams(shape).aspect;
}

/**
 * Normalized horizontal radius of the canopy at normalized height y ∈ [0, 1]
 * (superellipse solid-of-revolution profile), in [0, 1].
 */
export function canopyProfile(shape: number, y: number): number {
  const { exponent, centroid } = shapeParams(shape);
  const span = Math.max(centroid, 1 - centroid);
  const d = Math.abs(y - centroid) / span;
  if (d >= 1) return 0;
  return Math.pow(1 - Math.pow(d, exponent), 1 / exponent);
}

/** Log mapping of slider t ∈ [0, 1] to leaf count 500 → 18,000. */
export function sliderToLeafCount(t: number): number {
  return Math.round(500 * Math.pow(36, Math.min(1, Math.max(0, t))));
}

interface Clump {
  x: number;
  z: number;
  /** normalized canopy height */
  y: number;
}

/**
 * Clump centers inside the canopy volume. Canonical randoms are mapped
 * through the shape parameters (no rejection sampling) so clumps migrate
 * smoothly as the shape slider scrubs.
 */
function generateClumps(seed: number, shape: number): Clump[] {
  const half = 0.5 - UV_MARGIN;
  const clumps: Clump[] = new Array(NUM_CLUMPS);
  for (let j = 0; j < NUM_CLUMPS; j++) {
    const rng = mulberry32(
      (seed ^ CLUMP_SALT ^ Math.imul(j + 1, 0x9e3779b9)) >>> 0,
    );
    const y = rng();
    const r = canopyProfile(shape, y) * Math.pow(rng(), 0.35); // shell bias
    const theta = rng() * Math.PI * 2;
    clumps[j] = {
      x: 0.5 + r * Math.cos(theta) * half,
      z: 0.5 + r * Math.sin(theta) * half,
      y,
    };
  }
  return clumps;
}

/** Box-Muller pair; 1 - u guards against ln(0). */
function gaussianPair(u: number, v: number): [number, number] {
  const m = Math.sqrt(-2 * Math.log(1 - u));
  return [m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)];
}

/**
 * Generate leaf sprites clustered around branch clumps inside the canopy
 * silhouette. The inter-clump holes are what make the dappled light: they
 * are small enough for the sun's disk footprint to dominate, so they
 * project round sun images instead of gap-shaped light.
 *
 * Stability guarantees:
 * - leaf i depends only on (seed, i) — and clump count is fixed — so
 *   raising `count` appends leaves without moving existing ones;
 * - raw randoms are mapped *through* the shape parameters, so scrubbing
 *   the shape slider migrates leaves smoothly instead of reshuffling.
 */
export function generateLeaves(
  seed: number,
  count: number,
  shape: number,
): Leaf[] {
  const params = shapeParams(shape);
  const clumps = generateClumps(seed, shape);
  const half = 0.5 - UV_MARGIN;
  const sigmaUV = CLUMP_SIGMA * 2 * half;
  const leaves: Leaf[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0);
    const clump = clumps[Math.min(NUM_CLUMPS - 1, Math.floor(rng() * NUM_CLUMPS))];
    const [gx, gz] = gaussianPair(rng(), rng());
    const size = (4.5 + 3.5 * rng()) / 512;
    const rot = rng() * Math.PI * 2;
    const layerJitter = rng();
    const [gy] = gaussianPair(rng(), rng());

    let x = clump.x + gx * sigmaUV;
    let z = clump.z + gz * sigmaUV;
    let y = Math.min(1, Math.max(0, clump.y + gy * CLUMP_SIGMA_Y));

    // clamp into the canopy silhouette at this height (never reject —
    // rejection pops during shape scrub)
    const maxR = canopyProfile(shape, y) * half;
    const dx = x - 0.5;
    const dz = z - 0.5;
    const rUV = Math.hypot(dx, dz);
    if (rUV > maxR && rUV > 0) {
      x = 0.5 + (dx / rUV) * maxR;
      z = 0.5 + (dz / rUV) * maxR;
    }

    // weeping droop: silhouette-edge leaves get pulled down
    const rFrac = maxR > 0 ? Math.min(1, rUV / maxR) : 1;
    y = Math.min(1, Math.max(0, y - params.droop * rFrac * rFrac * 0.35));

    // layer = vertical third of final height, jittered to avoid terracing
    const layer = Math.min(
      2,
      Math.max(0, Math.floor(3 * (y + (layerJitter - 0.5) * 0.15))),
    ) as 0 | 1 | 2;

    leaves[i] = { x, y: z, size, rot, layer };
  }

  return leaves;
}
