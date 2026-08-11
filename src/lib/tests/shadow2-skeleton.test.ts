import { describe, expect, it } from "vitest";
import {
  generateSkeleton,
  NODE_COUNT,
  nodeVisibility,
  visibleCount,
} from "../shadow2/skeleton";
import { flattenPose, createPose } from "../shadow2/wind";

describe("generateSkeleton", () => {
  it("is deterministic with the full fixed node count", () => {
    const a = generateSkeleton(7);
    const b = generateSkeleton(7);
    expect(a).toEqual(b);
    expect(a.length).toBe(NODE_COUNT);
    expect(NODE_COUNT).toBe(517);
  });

  it("orders parents before children", () => {
    const sk = generateSkeleton(1);
    for (let g = 0; g < sk.length; g++) {
      expect(sk[g].parent).toBeLessThan(g);
    }
  });

  it("gives children thresholds strictly above their parent", () => {
    const sk = generateSkeleton(1);
    for (const node of sk) {
      if (node.parent >= 0) {
        expect(node.visThreshold).toBeGreaterThanOrEqual(
          sk[node.parent].visThreshold + 0.01 - 1e-9,
        );
      }
    }
  });

  it("scales visible structure with the branches slider", () => {
    const sk = generateSkeleton(1);
    const low = visibleCount(sk, 0.1);
    const mid = visibleCount(sk, 0.5);
    const high = visibleCount(sk, 1.0);
    expect(low).toBeGreaterThanOrEqual(7); // trunk + limbs at least
    expect(mid).toBeGreaterThan(low);
    expect(high).toBe(NODE_COUNT);
  });

  it("keeps every branch tip inside the UV margin at rest", () => {
    const sk = generateSkeleton(1);
    const pose = flattenPose(sk, 0, 0, createPose(sk.length));
    for (let g = 0; g < sk.length; g++) {
      const tipX = pose.baseX[g] + pose.cos[g] * sk[g].length;
      const tipZ = pose.baseZ[g] + pose.sin[g] * sk[g].length;
      const r = Math.hypot(tipX - 0.5, tipZ - 0.5);
      expect(r).toBeLessThanOrEqual(0.5 - 0.05);
    }
  });

  it("visibility grows smoothly from 0 to 1", () => {
    const sk = generateSkeleton(1);
    const node = sk[100];
    expect(nodeVisibility(node, node.visThreshold - 0.01)).toBe(0);
    expect(nodeVisibility(node, node.visThreshold + 0.03)).toBeGreaterThan(0);
    expect(nodeVisibility(node, node.visThreshold + 0.03)).toBeLessThan(1);
    expect(nodeVisibility(node, node.visThreshold + 0.07)).toBe(1);
  });

  it("distributes limbs around the full circle (lobed, no dead half)", () => {
    const sk = generateSkeleton(1);
    const bins = new Array(6).fill(0);
    for (const node of sk) {
      if (node.depth === 1) {
        const a =
          ((node.restAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        bins[Math.min(5, Math.floor((a / (2 * Math.PI)) * 6))]++;
      }
    }
    expect(Math.max(...bins)).toBeLessThanOrEqual(2);
  });
});
