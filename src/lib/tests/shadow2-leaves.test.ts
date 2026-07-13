import { describe, expect, it } from "vitest";
import { generateSkeleton } from "../shadow2/skeleton";
import {
  attachLeaves,
  leafSites,
  MAX_LEAVES_PER_SITE,
  sliderToLeavesPerSite,
} from "../shadow2/leaves";

describe("leaves", () => {
  const sk = generateSkeleton(5);

  it("anchors on all depth ≥ 3 nodes", () => {
    expect(leafSites(sk).length).toBe(120 + 360);
  });

  it("maps the density slider to 2..18 leaves per site", () => {
    expect(sliderToLeavesPerSite(0)).toBe(2);
    expect(sliderToLeavesPerSite(1)).toBe(MAX_LEAVES_PER_SITE);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.2) {
      const n = sliderToLeavesPerSite(t);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it("is deterministic and has a stable prefix per site", () => {
    const few = attachLeaves(9, sk, 4);
    const many = attachLeaves(9, sk, 9);
    expect(attachLeaves(9, sk, 4)).toEqual(few);
    // group by site and compare prefixes
    const bySite = new Map<number, typeof many>();
    for (const leaf of many) {
      const arr = bySite.get(leaf.site) ?? [];
      arr.push(leaf);
      bySite.set(leaf.site, arr);
    }
    for (const leaf of few) {
      const arr = bySite.get(leaf.site)!;
      const match = arr.find(
        (l) => l.t === leaf.t && l.fan === leaf.fan && l.size === leaf.size,
      );
      expect(match).toBeTruthy();
    }
  });

  it("uses all three layers", () => {
    const leaves = attachLeaves(9, sk, 10);
    const seen = new Set(leaves.map((l) => l.layer));
    expect(seen.size).toBe(3);
    for (const leaf of leaves) expect([0, 1, 2]).toContain(leaf.layer);
  });
});
