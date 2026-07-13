import { mulberry32 } from "../shadow/prng";
import type { Skeleton } from "./skeleton";

/**
 * Foliage: leaves attached in clusters at twig sites (depth-4 nodes and
 * depth-3 tips). Positions are stored in the twig's local frame so wind
 * is inherited from the skeleton pose for free.
 */

export const MAX_LEAVES_PER_SITE = 18;
const LEAF_SALT = 0x85ebca6b;

export interface Leaf2 {
  /** node index of the anchoring twig/branchlet */
  site: number;
  /** station along the twig, 0..1 (clusters toward the tip) */
  t: number;
  /** local offset in the twig frame (UV units): along, across */
  offAlong: number;
  offAcross: number;
  /** ellipse semi-major, UV units */
  size: number;
  rot: number;
  /** normalized height */
  h: number;
  layer: 0 | 1 | 2;
  flutterFreq: number;
  flutterPhase: number;
}

/** node indices that anchor foliage: all depth 3 and 4 nodes */
export function leafSites(sk: Skeleton): number[] {
  const sites: number[] = [];
  for (let g = 0; g < sk.length; g++) {
    if (sk[g].depth >= 3) sites.push(g);
  }
  return sites;
}

/** density slider t ∈ [0,1] → leaves per site (log, 2 → 18) */
export function sliderToLeavesPerSite(t: number): number {
  return Math.round(
    2 * Math.pow(MAX_LEAVES_PER_SITE / 2, Math.min(1, Math.max(0, t))),
  );
}

function gaussianPair(u: number, v: number): [number, number] {
  const m = Math.sqrt(-2 * Math.log(1 - u));
  return [m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v)];
}

/**
 * Generate leaves for every site. Leaf k of site s depends only on
 * (seed, s, k), so raising the density appends leaves at every site
 * without moving existing ones (stable prefix per site).
 */
export function attachLeaves(
  seed: number,
  sk: Skeleton,
  perSite: number,
): Leaf2[] {
  const sites = leafSites(sk);
  const n = Math.min(MAX_LEAVES_PER_SITE, Math.max(0, perSite));
  const leaves: Leaf2[] = [];

  for (const s of sites) {
    const node = sk[s];
    for (let k = 0; k < n; k++) {
      const rng = mulberry32(
        (seed ^
          LEAF_SALT ^
          Math.imul(s * MAX_LEAVES_PER_SITE + k + 1, 0x9e3779b9)) >>>
          0,
      );
      const u1 = rng();
      const [g1, g2] = gaussianPair(rng(), rng());
      const u4 = rng();
      const u5 = rng();
      const u6 = rng();
      const u7 = rng();

      const t = 0.4 + 0.6 * u1;
      const h = Math.min(
        1,
        Math.max(0, node.baseH + node.rise * t + g2 * 0.04),
      );
      // canopy occupies heights ~0.35..1; layer thirds span that band
      const hNorm = Math.min(1, Math.max(0, (h - 0.35) / 0.65));
      leaves.push({
        site: s,
        t,
        offAlong: g1 * 0.5 * node.length,
        offAcross: g2 * 0.55 * node.length,
        size: (3.5 + 8 * u4 * u4 * u4) / 512,
        rot: u5 * Math.PI * 2,
        h,
        layer: Math.min(
          2,
          Math.max(0, Math.floor(3 * (hNorm + (u6 - 0.5) * 0.15))),
        ) as 0 | 1 | 2,
        flutterFreq: 2 + 4 * u7,
        flutterPhase: (u5 + u7) * Math.PI * 2,
      });
    }
  }

  return leaves;
}
