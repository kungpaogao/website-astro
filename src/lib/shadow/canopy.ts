import { mulberry32 } from "./prng";

/**
 * A sprite in canopy-texture space (leaf or limb-stroke segment).
 * x, y are texture UV coords in [0, 1]; size is the ellipse semi-major
 * axis in UV units; layer is the vertical canopy third (0 = low, 2 = high).
 */
export interface Leaf {
  x: number;
  y: number;
  size: number;
  rot: number;
  layer: 0 | 1 | 2;
  /** minor/major axis ratio; defaults to the leaf shape (0.45) */
  aspect?: number;
  /** individual sway phase (radians) — 0 for rigid sprites like strokes */
  swayPhase?: number;
  /** individual sway frequency (rad/s) */
  swayFreq?: number;
}

/**
 * Leaves stay inside the central region of the texture so that
 * CLAMP_TO_EDGE samples outside the canopy always read transparent.
 */
export const UV_MARGIN = 0.07;

/**
 * Canopy structure: NUM_LIMBS primary limbs radiate from the trunk;
 * foliage clumps sit along the limbs; leaves cluster around clumps.
 * The wedge-shaped sky channels BETWEEN limb lobes and the small holes
 * inside lobes are what shape the dappled light. All counts are fixed
 * constants — deriving them from leaf count would break prefix stability.
 */
const NUM_LIMBS = 6;
const NUM_CLUMPS = 128;
/** gaussian spread of leaves around a clump, as fraction of usable UV width */
const CLUMP_SIGMA = 0.05;
/** vertical spread, in normalized canopy-height units */
const CLUMP_SIGMA_Y = 0.06;
const CLUMP_SALT = 0x5f356495;
const LIMB_SALT = 0x1b873593;
const TWIG_SALT = 0x27d4eb2f;
/** outlying twig clusters per clump */
const TWIGS_PER_CLUMP = 5;

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

/** How vertical the tree's limbs are: columnar 1 → spreading 0. */
function verticality(params: ShapeParams): number {
  return Math.min(1, Math.max(0, 1 - (params.aspect - 0.45) / 1.05));
}

interface Limb {
  /** base direction; limb direction at station s is azimuth + curl·s */
  azimuth: number;
  curl: number;
  /** horizontal reach as fraction of usable UV half-width */
  reach: number;
  /** normalized canopy heights of limb base and tip */
  yBase: number;
  yTip: number;
}

/**
 * Primary limb skeleton. Azimuth and curl are shape-independent so limbs
 * never rotate while the shape slider scrubs; reach and rise morph with
 * the shape parameters.
 */
function generateLimbs(seed: number, params: ShapeParams): Limb[] {
  const v = verticality(params);
  const limbs: Limb[] = new Array(NUM_LIMBS);
  for (let l = 0; l < NUM_LIMBS; l++) {
    const rng = mulberry32(
      (seed ^ LIMB_SALT ^ Math.imul(l + 1, 0x9e3779b9)) >>> 0,
    );
    const uAz = rng();
    const uCurl = rng();
    const uReach = rng();
    limbs[l] = {
      azimuth: ((l + 0.5 + 0.85 * (uAz - 0.5)) * 2 * Math.PI) / NUM_LIMBS,
      curl: 0.5 * (uCurl - 0.5),
      reach:
        Math.min(1, Math.max(0.3, params.aspect / 1.5)) *
        (0.75 + 0.35 * uReach),
      yBase: params.centroid - (0.25 + 0.3 * v),
      yTip: params.centroid + (0.12 + 0.28 * v),
    };
  }
  return limbs;
}

/**
 * Smooth-min radial compression into the canopy silhouette at height y:
 * positions well inside are untouched, positions past the profile are
 * pressed against it (never beyond). Softness avoids the artificial dense
 * rim a hard clamp creates, and keeps lobe tips as local maxima.
 */
function softClampRadial(
  x: number,
  z: number,
  shape: number,
  y: number,
): [number, number] {
  const half = 0.5 - UV_MARGIN;
  const maxR = Math.max(canopyProfile(shape, y) * half, 1e-4);
  const dx = x - 0.5;
  const dz = z - 0.5;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return [x, z];
  const rc = r / Math.pow(1 + Math.pow(r / maxR, 4), 0.25);
  return [0.5 + (dx / r) * rc, 0.5 + (dz / r) * rc];
}

interface Clump {
  x: number;
  z: number;
  /** normalized canopy height */
  y: number;
}

/**
 * Foliage clumps distributed along the limb skeleton. Station bias is
 * shape-dependent: spreading trees mass foliage at limb ends, columnar
 * trees fill the near-vertical limbs top to bottom (a pure outward bias
 * would hollow the column into a lollipop).
 */
function generateClumps(seed: number, shape: number): Clump[] {
  const params = shapeParams(shape);
  const limbs = generateLimbs(seed, params);
  const v = verticality(params);
  const half = 0.5 - UV_MARGIN;
  const sMin = 0.35 * (1 - 0.6 * v);
  const p = 0.6 + 0.5 * v;

  const clumps: Clump[] = new Array(NUM_CLUMPS);
  for (let j = 0; j < NUM_CLUMPS; j++) {
    const limb = limbs[j % NUM_LIMBS];
    const rng = mulberry32(
      (seed ^ CLUMP_SALT ^ Math.imul(j + 1, 0x9e3779b9)) >>> 0,
    );
    const s = sMin + (1 - sMin) * Math.pow(rng(), p);
    const [gLat] = gaussianPair(rng(), rng());
    const [gH] = gaussianPair(rng(), rng());

    const theta = limb.azimuth + limb.curl * s;
    const r = limb.reach * s * half;
    const sigmaLat = 0.02 + 0.035 * s;
    const y = Math.min(
      1,
      Math.max(
        0,
        limb.yBase +
          (limb.yTip - limb.yBase) * s -
          0.3 * params.droop * s * s +
          gH * 0.1,
      ),
    );

    const x = 0.5 + r * Math.cos(theta) - gLat * sigmaLat * Math.sin(theta);
    const z = 0.5 + r * Math.sin(theta) + gLat * sigmaLat * Math.cos(theta);
    const [cx, cz] = softClampRadial(x, z, shape, y);
    clumps[j] = { x: cx, z: cz, y };
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
 * silhouette. The inter-lobe wedges give broad bright splashes; the small
 * holes inside lobes are smaller than the sun's disk footprint, so they
 * project round sun images — the pinhole dapples.
 *
 * Stability guarantees:
 * - leaf i depends only on (seed, i) — and limb/clump counts are fixed —
 *   so raising `count` appends leaves without moving existing ones;
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
    const clumpIdx = Math.min(NUM_CLUMPS - 1, Math.floor(rng() * NUM_CLUMPS));
    const clump = clumps[clumpIdx];
    const [gx, gz] = gaussianPair(rng(), rng());
    const u4 = rng();
    const rot = rng() * Math.PI * 2;
    const layerJitter = rng();
    const [gy] = gaussianPair(rng(), rng());
    const isCore = rng() < 0.65;
    const uTwig = rng();

    let cx = clump.x;
    let cz = clump.z;
    let size: number;
    if (isCore) {
      // heavy-tailed size mix in the dense cores: mostly small leaves,
      // occasional big foliage tufts — dapple pools are multi-scale
      size = (3.5 + 8 * u4 * u4 * u4) / 512;
      cx += gx * 0.4 * sigmaUV;
      cz += gz * 0.4 * sigmaUV;
    } else {
      // outlying leaves gather on twig anchors instead of scattering as
      // lone dots — canopy edges read as leaf clusters, not specks
      const twigIdx = Math.min(
        TWIGS_PER_CLUMP - 1,
        Math.floor(uTwig * TWIGS_PER_CLUMP),
      );
      const twigRng = mulberry32(
        (seed ^
          TWIG_SALT ^
          Math.imul(clumpIdx * TWIGS_PER_CLUMP + twigIdx + 1, 0x9e3779b9)) >>>
          0,
      );
      const [tgx, tgz] = gaussianPair(twigRng(), twigRng());
      size = (3 + 2.5 * u4 * u4) / 512; // edge leaves stay small
      cx += tgx * 1.2 * sigmaUV + gx * 0.22 * sigmaUV;
      cz += tgz * 1.2 * sigmaUV + gz * 0.22 * sigmaUV;
    }

    let y = Math.min(1, Math.max(0, clump.y + gy * CLUMP_SIGMA_Y));
    const [x, z] = softClampRadial(cx, cz, shape, y);

    // residual per-leaf droop (limb-path droop carries most of the weeping)
    const maxR = Math.max(canopyProfile(shape, y) * half, 1e-4);
    const rFrac = Math.min(1, Math.hypot(x - 0.5, z - 0.5) / maxR);
    y = Math.min(1, Math.max(0, y - params.droop * rFrac * rFrac * 0.15));

    // layer = vertical third of final height, jittered to avoid terracing
    const layer = Math.min(
      2,
      Math.max(0, Math.floor(3 * (y + (layerJitter - 0.5) * 0.15))),
    ) as 0 | 1 | 2;

    leaves[i] = {
      x,
      y: z,
      size,
      rot,
      layer,
      swayPhase: rng() * Math.PI * 2,
      swayFreq: 2 + 4 * rng(),
    };
  }

  return leaves;
}
