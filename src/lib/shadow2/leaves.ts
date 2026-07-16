import { mulberry32 } from "../shadow/prng";
import type { Skeleton } from "./skeleton";

/**
 * Foliage: leaves attached in clusters at twig sites (depth-4 nodes and
 * depth-3 tips). Positions are stored in the twig's local frame so wind
 * is inherited from the skeleton pose for free.
 */

export const MAX_LEAVES_PER_SITE = 32;
const LEAF_SALT = 0x85ebca6b;

export interface Leaf2 {
  /** node index of the anchoring twig/branchlet */
  site: number;
  /** station along the twig, 0..1 — the leaf's stem sits near the twig */
  t: number;
  /** which side of the twig the blade fans to (±1) */
  side: 1 | -1;
  /** blade angle away from the twig direction (radians, unsigned) */
  fan: number;
  /** small volumetric offsets in the twig frame (UV units) — the site is
   * a leafy puff, not a line, which closes the canopy so light escapes
   * only through small discrete holes (the prominent round dapples) */
  offAlong: number;
  offAcross: number;
  /** blade length, UV units */
  size: number;
  /** normalized height */
  h: number;
  layer: 0 | 1 | 2;
  flutterFreq: number;
  flutterPhase: number;
}

/**
 * Node indices that anchor foliage: twigs and branchlets carry the outer
 * canopy; sub-branches (depth 2) carry a wider-spread understory that
 * fills the gaps between branch groups, so large sky holes are rare —
 * like a real, volumetrically deep crown.
 */
export function leafSites(sk: Skeleton): number[] {
  const sites: number[] = [];
  for (let g = 0; g < sk.length; g++) {
    if (sk[g].depth >= 2) sites.push(g);
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
      const [g3] = gaussianPair(rng(), rng());

      // leaves gather in distinct bunches at stations along the twig
      // (real foliage grows in clusters, not evenly spaced)
      const bunch = Math.min(2, Math.floor(u1 * 3));
      const t = 0.35 + 0.25 * bunch + 0.1 * (u1 * 3 - bunch);
      const h = Math.min(
        1,
        Math.max(0, node.baseH + node.rise * t + g2 * 0.04),
      );
      // canopy occupies heights ~0.35..1; layer thirds span that band
      const hNorm = Math.min(1, Math.max(0, (h - 0.35) / 0.65));
      leaves.push({
        site: s,
        t,
        side: u5 < 0.5 ? 1 : -1,
        fan: 0.35 + 0.85 * u5 + 0.3 * (u6 - 0.5),
        // understory (depth-2) leaves spread wide to fill inter-group
        // gaps; outer-canopy leaves hug their bunch tightly
        offAlong: g1 * (node.depth === 2 ? 0.4 : 0.13) * node.length,
        offAcross: g3 * (node.depth === 2 ? 0.55 : 0.24) * node.length,
        size: (5 + 7 * u4 * u4 * u4) / 512,
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
