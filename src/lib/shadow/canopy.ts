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

/** Log mapping of slider t ∈ [0, 1] to leaf count 300 → 9000. */
export function sliderToLeafCount(t: number): number {
  return Math.round(300 * Math.pow(30, Math.min(1, Math.max(0, t))));
}

/**
 * Generate leaf sprites inside the canopy silhouette.
 *
 * Stability guarantees:
 * - leaf i depends only on (seed, i), so raising `count` appends leaves
 *   without moving existing ones;
 * - raw randoms are mapped *through* the shape parameters, so scrubbing
 *   the shape slider migrates leaves smoothly instead of reshuffling.
 */
export function generateLeaves(
  seed: number,
  count: number,
  shape: number,
): Leaf[] {
  const params = shapeParams(shape);
  const leaves: Leaf[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0);
    const u1 = rng();
    const u2 = rng();
    const u3 = rng();
    const u4 = rng();
    const u5 = rng();
    const u6 = rng();

    // vertical position in canopy, then radial position biased toward the
    // shell (real canopies are shells — leaves grow at the sunlit exterior)
    let y = u1;
    const R = canopyProfile(shape, y);
    const rNorm = Math.pow(u2, 0.35); // 0..1, shell-biased
    const theta = u3 * Math.PI * 2;

    // weeping droop: silhouette-edge leaves get pulled down
    y -= params.droop * rNorm * rNorm * 0.35;
    y = Math.min(1, Math.max(0, y));

    // top-down projection; normalize by aspect so the footprint always
    // fills the usable texture area (world width applied via uniform)
    const r = R * rNorm;
    const half = 0.5 - UV_MARGIN;
    const x = 0.5 + r * Math.cos(theta) * half;
    const z = 0.5 + r * Math.sin(theta) * half;

    // layer = vertical third, jittered to avoid sharpness terracing
    const layer = Math.min(
      2,
      Math.max(0, Math.floor(3 * (y + (u6 - 0.5) * 0.15))),
    ) as 0 | 1 | 2;

    leaves[i] = {
      x,
      y: z,
      size: (3.5 + 3.5 * u4) / 512,
      rot: u5 * Math.PI * 2,
      layer,
    };
  }

  return leaves;
}
