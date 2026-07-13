import { mulberry32 } from "../shadow/prng";

/**
 * Branch skeleton for the staged canopy generator: a fixed maximal tree
 * (trunk → limbs → sub-branches → branchlets → twigs) generated once per
 * seed. The "branches" slider never regenerates anything — it only gates
 * node visibility via per-node thresholds, so scrubbing it grows branches
 * out of their parents without reshuffling the tree.
 *
 * Coordinates: plan (top-down) UV space, canopy centered at (0.5, 0.5),
 * everything inside the central 1 − 2·UV_MARGIN. Heights are carried
 * separately (normalized 0..1 of canopy height) for the shadow stage.
 */

export const UV_MARGIN = 0.07;

export const FANOUT = [6, 5, 4, 3] as const; // children per node at depth 0..3
export const MAX_DEPTH = 4;

export interface BranchNode {
  /** parent index; -1 for the trunk. Parents always precede children. */
  parent: number;
  depth: 0 | 1 | 2 | 3 | 4;
  /** station along the parent where this branch attaches, 0..1 */
  attachT: number;
  /** plan azimuth relative to the parent's direction (radians) */
  restAngle: number;
  /** plan-projected length, UV units */
  length: number;
  /** height gained tip-over-base, normalized canopy height */
  rise: number;
  /** normalized height of the base */
  baseH: number;
  /** stroke radius at base, UV units */
  thickness: number;
  /** lateral mid-point bend as a fraction of length (±) */
  bend: number;
  /** branches slider value at which this node becomes visible */
  visThreshold: number;
  /** wind: per-joint oscillation parameters */
  swayFreq: number;
  swayPhase: number;
  ampScale: number;
  /** index of the depth-1 limb subtree this node belongs to (gusts) */
  limb: number;
}

const DEPTH_SALT = [0x1f83d9ab, 0x5be0cd19, 0x9b05688c, 0x510e527f, 0x6a09e667];
/** mean plan length per depth, UV units */
const MEAN_LEN = [0.05, 0.16, 0.1, 0.06, 0.035];
/** base thickness per depth (UV radius) */
const THICKNESS = [0.011, 0.006, 0.0033, 0.0018, 0.001];
/** relative angular spread of the child fan per parent depth */
const SPREAD = [0, 0.9, 0.8, 0.9];
/** slider value from which nodes of this depth start appearing */
const DEPTH_BIAS = [0, 0, 0.1, 0.3, 0.55];
const DEPTH_SPAN = [0, 0.08, 0.3, 0.35, 0.4];
/** wind frequency range per depth (rad/s) */
const FREQ_LO = [0.5, 0.8, 1.4, 2.2, 3.0];
const FREQ_HI = [0.8, 1.4, 2.4, 3.5, 5.0];

export type Skeleton = BranchNode[];

/** Total node count of the maximal skeleton (1 + 6 + 30 + 120 + 360). */
export const NODE_COUNT =
  1 +
  FANOUT[0] * (1 + FANOUT[1] * (1 + FANOUT[2] * (1 + FANOUT[3])));

export function generateSkeleton(seed: number): Skeleton {
  const nodes: BranchNode[] = [];

  // trunk: rises from the ground to the canopy base (its shadow projects
  // as a stretching stroke when the sun lowers)
  nodes.push({
    parent: -1,
    depth: 0,
    attachT: 0,
    restAngle: 0,
    length: MEAN_LEN[0],
    rise: 0.3,
    baseH: 0.05,
    thickness: THICKNESS[0],
    bend: 0,
    visThreshold: 0,
    swayFreq: 0.6,
    swayPhase: 0,
    ampScale: 1,
    limb: -1,
  });

  // BFS by depth so every node's global index is stable
  let g = 1;
  let prevLevel = [0];
  for (let d = 1 as 1 | 2 | 3 | 4; d <= MAX_DEPTH; d++) {
    const level: number[] = [];
    const fan = FANOUT[d - 1];
    for (const p of prevLevel) {
      const parent = nodes[p];
      for (let c = 0; c < fan; c++) {
        const rng = mulberry32(
          (seed ^ DEPTH_SALT[d] ^ Math.imul(g + 1, 0x9e3779b9)) >>> 0,
        );
        const u1 = rng();
        const u2 = rng();
        const u3 = rng();
        const u4 = rng();
        const u5 = rng();
        const u6 = rng();
        const u7 = rng();

        const attachT = d === 1 ? 1 : 0.25 + 0.75 * Math.pow(u1, 0.8);
        // limbs fan around the full circle (6 lobes with wedge gaps);
        // deeper branches fan around their parent's direction
        const restAngle =
          d === 1
            ? ((c + 0.5 + 0.85 * (u2 - 0.5)) * 2 * Math.PI) / FANOUT[0] -
              parentWorldHint(nodes, p)
            : (c - (fan - 1) / 2) * SPREAD[d - 1] +
              0.35 * SPREAD[d - 1] * (u2 - 0.5) * 2;

        const length = MEAN_LEN[d] * (0.7 + 0.6 * u3);
        const rise =
          d === 1 ? 0.1 + 0.25 * u4 : 0.03 + 0.07 * u4;
        const baseH = Math.min(
          0.97,
          parent.baseH + parent.rise * attachT,
        );

        const visThreshold = Math.max(
          DEPTH_BIAS[d] +
            (DEPTH_SPAN[d] * (c + 0.5 * u5)) / fan,
          parent.visThreshold + 0.01,
        );

        nodes.push({
          parent: p,
          depth: d,
          attachT,
          restAngle,
          length,
          rise,
          baseH,
          thickness: THICKNESS[d],
          bend: 0.3 * (u6 - 0.5),
          visThreshold,
          swayFreq: FREQ_LO[d] + (FREQ_HI[d] - FREQ_LO[d]) * u7,
          swayPhase: (u1 + u7) * Math.PI * 2,
          ampScale: 0.7 + 0.6 * u5,
          limb: d === 1 ? c : nodes[p].limb,
        });
        level.push(g);
        g++;
      }
    }
    prevLevel = level;
  }

  return nodes;
}

// the trunk has no meaningful direction; limbs' restAngle is absolute
function parentWorldHint(_nodes: BranchNode[], _p: number): number {
  return 0;
}

/** How visible node g is under the branches slider (0 hidden, 1 full). */
export function nodeVisibility(node: BranchNode, branches: number): number {
  const t = Math.min(
    1,
    Math.max(0, (branches - node.visThreshold) / 0.06),
  );
  return t * t * (3 - 2 * t);
}

/** Convenience: number of nodes visible at a slider value. */
export function visibleCount(sk: Skeleton, branches: number): number {
  let n = 0;
  for (const node of sk) if (branches >= node.visThreshold) n++;
  return n;
}
