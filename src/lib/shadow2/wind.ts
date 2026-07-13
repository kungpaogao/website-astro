import type { Skeleton } from "./skeleton";

/**
 * Structurally coherent wind: every branch oscillates around its attach
 * joint on its parent, so motion compounds down the hierarchy — the
 * trunk barely moves, limbs sway slowly, twigs whip. Leaves ride their
 * twig's frame and add their own flutter at draw time.
 */

/** angular amplitude per depth at wind = 1 (radians) */
export const AMP = [0.004, 0.012, 0.028, 0.05, 0.08];

/** Flattened world transforms of every node, reused across frames. */
export interface Pose {
  baseX: Float32Array;
  baseZ: Float32Array;
  /** cumulative world azimuth of the branch direction */
  angle: Float32Array;
  cos: Float32Array;
  sin: Float32Array;
}

export function createPose(nodeCount: number): Pose {
  return {
    baseX: new Float32Array(nodeCount),
    baseZ: new Float32Array(nodeCount),
    angle: new Float32Array(nodeCount),
    cos: new Float32Array(nodeCount),
    sin: new Float32Array(nodeCount),
  };
}

/** Per-joint wind deflection at time t (radians). */
function deflection(
  sk: Skeleton,
  g: number,
  time: number,
  wind: number,
): number {
  if (wind <= 0) return 0;
  const node = sk[g];
  const gust = 0.65 + 0.35 * Math.sin(0.31 * time + 0.7 * (node.limb + 1));
  return (
    wind *
    node.ampScale *
    AMP[node.depth] *
    gust *
    (Math.sin(node.swayFreq * time + node.swayPhase) +
      0.4 * Math.sin(1.9 * node.swayFreq * time + 2.3 * node.swayPhase))
  );
}

/**
 * One pass in index order (parents precede children): compute world base
 * position and cumulative azimuth for every node.
 */
export function flattenPose(
  sk: Skeleton,
  time: number,
  wind: number,
  out: Pose,
): Pose {
  for (let g = 0; g < sk.length; g++) {
    const node = sk[g];
    if (node.parent < 0) {
      out.baseX[g] = 0.5;
      out.baseZ[g] = 0.5;
      out.angle[g] = deflection(sk, g, time, wind);
    } else {
      const p = node.parent;
      out.baseX[g] = out.baseX[p] + out.cos[p] * sk[p].length * node.attachT;
      out.baseZ[g] = out.baseZ[p] + out.sin[p] * sk[p].length * node.attachT;
      out.angle[g] =
        out.angle[p] + node.restAngle + deflection(sk, g, time, wind);
    }
    out.cos[g] = Math.cos(out.angle[g]);
    out.sin[g] = Math.sin(out.angle[g]);
  }
  return out;
}
