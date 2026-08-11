import { describe, expect, it } from "vitest";
import {
  elevSliderToRad,
  layerHeights,
  layerParallax,
  penumbraRadii,
  sunLightColor,
} from "../shadow/projection";

const deg = (d: number) => (d * Math.PI) / 180;

describe("penumbraRadii", () => {
  it("matches hand-computed values at zenith", () => {
    const { rPar, rPerp } = penumbraRadii(10, deg(90));
    expect(rPerp).toBeCloseTo(0.0466, 3);
    expect(rPar).toBeCloseTo(0.0466, 3);
  });

  it("matches hand-computed values at 30° elevation", () => {
    const { rPar, rPerp } = penumbraRadii(10, deg(30));
    expect(rPerp).toBeCloseTo(0.0932, 3);
    expect(rPar).toBeCloseTo(0.1864, 3);
  });

  it("is always elongated along the sun azimuth", () => {
    for (let e = 10; e <= 90; e += 5) {
      const { rPar, rPerp } = penumbraRadii(15, deg(e));
      expect(rPar).toBeGreaterThanOrEqual(rPerp);
      expect(rPerp).toBeGreaterThan(0);
    }
  });

  it("scales linearly with occluder height", () => {
    const a = penumbraRadii(5, deg(45));
    const b = penumbraRadii(10, deg(45));
    expect(b.rPerp).toBeCloseTo(2 * a.rPerp, 10);
    expect(b.rPar).toBeCloseTo(2 * a.rPar, 10);
  });
});

describe("layerHeights", () => {
  it("returns ordered canopy-third midpoints above the trunk", () => {
    const [low, mid, high] = layerHeights(10);
    expect(low).toBeCloseTo(5);
    expect(mid).toBeCloseTo(7);
    expect(high).toBeCloseTo(9);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe("layerParallax", () => {
  it("is zero for the mid layer and signed for the others", () => {
    expect(layerParallax(7, 7, deg(45))).toBe(0);
    expect(layerParallax(9, 7, deg(45))).toBeCloseTo(2);
    expect(layerParallax(5, 7, deg(45))).toBeCloseTo(-2);
  });

  it("grows as the sun drops", () => {
    expect(Math.abs(layerParallax(9, 7, deg(20)))).toBeGreaterThan(
      Math.abs(layerParallax(9, 7, deg(60))),
    );
  });
});

describe("sunLightColor", () => {
  it("is near-white at high sun and warm at low sun", () => {
    const high = sunLightColor(deg(80));
    const low = sunLightColor(deg(10));
    expect(high[2]).toBeGreaterThan(low[2]); // blue drops as it warms
    expect(low[0]).toBeGreaterThan(low[2]); // orange: r >> b
  });

  it("warms monotonically as elevation drops", () => {
    let prevBlue = Infinity;
    for (let e = 90; e >= 10; e -= 5) {
      const [, , b] = sunLightColor(deg(e));
      expect(b).toBeLessThanOrEqual(prevBlue);
      prevBlue = b;
    }
  });
});

describe("elevSliderToRad", () => {
  it("maps [0,1] to 10°–90° monotonically", () => {
    expect(elevSliderToRad(0)).toBeCloseTo(deg(10));
    expect(elevSliderToRad(1)).toBeCloseTo(deg(90));
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const e = elevSliderToRad(t);
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
  });
});
