import { describe, expect, it } from "vitest";
import {
  canopyAspect,
  canopyProfile,
  generateLeaves,
  sliderToLeafCount,
  UV_MARGIN,
} from "../shadow/canopy";
import { mulberry32 } from "../shadow/prng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1) with reasonable spread", () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 1000).toBeGreaterThan(0.4);
    expect(sum / 1000).toBeLessThan(0.6);
  });
});

describe("sliderToLeafCount", () => {
  it("maps the slider ends to 500 and 18000", () => {
    expect(sliderToLeafCount(0)).toBe(500);
    expect(sliderToLeafCount(1)).toBe(18000);
  });

  it("is monotonic", () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.1) {
      const n = sliderToLeafCount(t);
      expect(n).toBeGreaterThan(prev);
      prev = n;
    }
  });
});

describe("canopyProfile", () => {
  it("is non-negative and bounded by 1 for all shapes and heights", () => {
    for (let s = 0; s <= 1; s += 0.1) {
      for (let y = 0; y <= 1; y += 0.05) {
        const r = canopyProfile(s, y);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it("pinches to ~0 at top and bottom for the oval shape", () => {
    const oval = 1 / 3; // second anchor
    expect(canopyProfile(oval, 0)).toBeLessThan(0.01);
    expect(canopyProfile(oval, 1)).toBeLessThan(0.01);
    expect(canopyProfile(oval, 0.5)).toBeCloseTo(1);
  });
});

describe("canopyAspect", () => {
  it("morphs from narrow columnar to wide spreading", () => {
    expect(canopyAspect(0)).toBeCloseTo(0.45);
    expect(canopyAspect(2 / 3)).toBeCloseTo(1.5);
  });
});

describe("generateLeaves", () => {
  it("is deterministic for (seed, count, shape)", () => {
    const a = generateLeaves(1, 500, 0.5);
    const b = generateLeaves(1, 500, 0.5);
    expect(a).toEqual(b);
  });

  it("appends without reshuffling when count increases (stable prefix)", () => {
    const small = generateLeaves(1, 200, 0.5);
    const large = generateLeaves(1, 400, 0.5);
    expect(large.slice(0, 200)).toEqual(small);
  });

  it("migrates leaves smoothly as shape changes (continuity)", () => {
    const a = generateLeaves(1, 300, 0.5);
    const b = generateLeaves(1, 300, 0.51);
    for (let i = 0; i < a.length; i++) {
      const d = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
      expect(d).toBeLessThan(0.05);
    }
  });

  it("keeps all leaves inside the UV safe margin", () => {
    for (const shape of [0, 0.33, 0.67, 1]) {
      for (const leaf of generateLeaves(3, 1000, shape)) {
        expect(leaf.x).toBeGreaterThanOrEqual(UV_MARGIN);
        expect(leaf.x).toBeLessThanOrEqual(1 - UV_MARGIN);
        expect(leaf.y).toBeGreaterThanOrEqual(UV_MARGIN);
        expect(leaf.y).toBeLessThanOrEqual(1 - UV_MARGIN);
      }
    }
  });

  it("assigns every leaf to one of the three layers, using all of them", () => {
    const leaves = generateLeaves(2, 2000, 0.5);
    const seen = new Set<number>();
    for (const leaf of leaves) {
      expect([0, 1, 2]).toContain(leaf.layer);
      seen.add(leaf.layer);
    }
    expect(seen.size).toBe(3);
  });

  it("keeps all leaves inside the silhouette radius (soft clamp)", () => {
    for (const shape of [0, 0.33, 0.67, 1]) {
      for (const leaf of generateLeaves(3, 1000, shape)) {
        const r = Math.hypot(leaf.x - 0.5, leaf.y - 0.5);
        expect(r).toBeLessThanOrEqual(0.5 - UV_MARGIN + 1e-9);
      }
    }
  });

  it("produces a lobed (non-uniform) azimuthal distribution", () => {
    const leaves = generateLeaves(1, 4000, 2 / 3); // spreading
    const bins = new Array(24).fill(0);
    for (const leaf of leaves) {
      const a = Math.atan2(leaf.y - 0.5, leaf.x - 0.5) + Math.PI;
      bins[Math.min(23, Math.floor((a / (2 * Math.PI)) * 24))]++;
    }
    const min = Math.min(...bins);
    const max = Math.max(...bins);
    expect(min / max).toBeLessThan(0.5); // wedge gaps between limb lobes
  });
});
