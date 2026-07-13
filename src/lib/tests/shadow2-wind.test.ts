import { describe, expect, it } from "vitest";
import { generateSkeleton } from "../shadow2/skeleton";
import { AMP, createPose, flattenPose } from "../shadow2/wind";

describe("flattenPose", () => {
  const sk = generateSkeleton(3);

  it("returns the rest pose at wind 0 regardless of time", () => {
    const a = flattenPose(sk, 0, 0, createPose(sk.length));
    const b = flattenPose(sk, 123.4, 0, createPose(sk.length));
    expect(Array.from(a.angle)).toEqual(Array.from(b.angle));
    expect(Array.from(a.baseX)).toEqual(Array.from(b.baseX));
  });

  it("places every child's base exactly on its parent's segment", () => {
    const pose = flattenPose(sk, 2.5, 1, createPose(sk.length));
    for (let g = 1; g < sk.length; g++) {
      const p = sk[g].parent;
      const ex = pose.baseX[p] + pose.cos[p] * sk[p].length * sk[g].attachT;
      const ez = pose.baseZ[p] + pose.sin[p] * sk[p].length * sk[g].attachT;
      expect(pose.baseX[g]).toBeCloseTo(ex, 6);
      expect(pose.baseZ[g]).toBeCloseTo(ez, 6);
    }
  });

  it("moves continuously in time", () => {
    const a = flattenPose(sk, 5, 1, createPose(sk.length));
    const b = flattenPose(sk, 5.016, 1, createPose(sk.length));
    for (let g = 0; g < sk.length; g++) {
      expect(
        Math.hypot(a.baseX[g] - b.baseX[g], a.baseZ[g] - b.baseZ[g]),
      ).toBeLessThan(0.01);
    }
  });

  it("deflects deeper joints more than shallow ones (RMS over time)", () => {
    const rest = flattenPose(sk, 0, 0, createPose(sk.length));
    const rms = new Array(5).fill(0);
    const counts = new Array(5).fill(0);
    const pose = createPose(sk.length);
    for (let s = 0; s < 40; s++) {
      flattenPose(sk, s * 0.37, 1, pose);
      for (let g = 0; g < sk.length; g++) {
        // own-joint deflection = world angle change minus parent's change
        const p = sk[g].parent;
        const own =
          pose.angle[g] -
          rest.angle[g] -
          (p >= 0 ? pose.angle[p] - rest.angle[p] : 0);
        rms[sk[g].depth] += own * own;
        counts[sk[g].depth]++;
      }
    }
    const byDepth = rms.map((v, d) => Math.sqrt(v / Math.max(1, counts[d])));
    expect(byDepth[4]).toBeGreaterThan(byDepth[1]);
    expect(byDepth[3]).toBeGreaterThan(byDepth[1]);
    // amplitude table is ordered
    for (let d = 1; d < 5; d++) expect(AMP[d]).toBeGreaterThan(AMP[d - 1]);
  });
});
