import { describe, expect, it } from "vitest";
import {
  buildAperture,
  luneFraction,
  MAX_COVERAGE,
  sampleCrescent,
  sampleDisk,
  sampleEllipse,
} from "../shadow2/aperture";

describe("sampleDisk", () => {
  it("returns K samples inside the unit disk, centered", () => {
    const pts = sampleDisk(32);
    expect(pts.length).toBe(32);
    let mx = 0;
    let my = 0;
    for (const [x, y] of pts) {
      expect(x * x + y * y).toBeLessThanOrEqual(1 + 1e-9);
      mx += x;
      my += y;
    }
    expect(Math.abs(mx / 32)).toBeLessThan(0.1);
    expect(Math.abs(my / 32)).toBeLessThan(0.1);
  });
});

describe("sampleEllipse", () => {
  it("squashes the disk along y", () => {
    for (const [x, y] of sampleEllipse(32, 0.35)) {
      expect(x * x + (y / 0.35) * (y / 0.35)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("sampleCrescent", () => {
  it("returns exactly K samples, all outside the moon disk", () => {
    for (const c of [0.3, 0.6, 0.9, MAX_COVERAGE]) {
      const pts = sampleCrescent(24, c);
      expect(pts.length).toBe(24);
      const d = 2 * (1 - c);
      for (const [x, y] of pts) {
        expect(x * x + y * y).toBeLessThanOrEqual(1 + 1e-9);
        expect(x * x + (y - d) * (y - d)).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });

  it("is deterministic", () => {
    expect(sampleCrescent(16, 0.7)).toEqual(sampleCrescent(16, 0.7));
  });

  it("degenerates to the full disk at zero coverage", () => {
    expect(sampleCrescent(16, 0)).toEqual(sampleDisk(16));
  });
});

describe("luneFraction", () => {
  it("matches closed-form anchor values", () => {
    expect(luneFraction(0)).toBeCloseTo(1, 6);
    // c = 0.5 → moon center at 1R: overlap = 2π/3 − √3/2 per unit circles
    const expected = 1 - (2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI;
    expect(luneFraction(0.5)).toBeCloseTo(expected, 6);
  });

  it("decreases monotonically with coverage", () => {
    let prev = 1.1;
    for (let c = 0; c <= MAX_COVERAGE; c += 0.05) {
      const f = luneFraction(c);
      expect(f).toBeLessThan(prev);
      prev = f;
    }
  });
});

describe("buildAperture", () => {
  it("packs K samples and sets gain", () => {
    const a = buildAperture(16, "crescent", 0.5);
    expect(a.samples.length).toBe(32);
    expect(a.gain).toBeCloseTo(luneFraction(0.5), 9);
    const disk = buildAperture(16, "disk", 0);
    expect(disk.gain).toBe(1);
  });
});
