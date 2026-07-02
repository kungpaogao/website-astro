/**
 * Sun/shadow projection math for the dappled-light simulator.
 *
 * The key physics: each gap in the canopy acts as a pinhole projecting an
 * image of the sun's disk (half-angle ~0.267°) onto the ground. The penumbra
 * footprint of a leaf at height h is an ellipse — elongated along the sun
 * azimuth by an extra 1/sin(elev) because the ground is tilted relative to
 * the light cone.
 */

/** tan of the sun's angular half-radius (0.267°) */
export const TAN_SUN_HALF_ANGLE = Math.tan((0.267 * Math.PI) / 180);

/**
 * Artistic exaggeration of the sun's angular size used by the renderer:
 * at web scale the physical 0.5° disk yields pinhole images too small to
 * read, so the shader renders a modestly larger sun. penumbraRadii stays
 * physical; consumers apply this scale.
 */
export const SUN_ANGLE_SCALE = 1.75;

export interface PenumbraRadii {
  /** meters, along the sun azimuth (shadow-elongation axis) */
  rPar: number;
  /** meters, perpendicular to the sun azimuth */
  rPerp: number;
}

/** Penumbra ellipse radii on the ground for an occluder at heightM. */
export function penumbraRadii(heightM: number, elevRad: number): PenumbraRadii {
  const invSin = 1 / Math.sin(elevRad);
  const rPerp = heightM * TAN_SUN_HALF_ANGLE * invSin;
  return { rPerp, rPar: rPerp * invSin };
}

/**
 * Representative heights (meters) of the low/mid/high canopy layers.
 * Trunk is the bottom 40% of the tree; the canopy occupies the top 60%,
 * split into thirds sampled at their midpoints.
 */
export function layerHeights(
  treeHeightM: number,
): [number, number, number] {
  return [0.5, 0.7, 0.9].map((f) => f * treeHeightM) as [
    number,
    number,
    number,
  ];
}

/**
 * Horizontal shift (meters, along sun azimuth) of a layer's shadow relative
 * to the mid layer. The mid-layer shift is subtracted so the pattern stays
 * anchored on screen as elevation changes.
 */
export function layerParallax(
  layerHeightM: number,
  midHeightM: number,
  elevRad: number,
): number {
  return (layerHeightM - midHeightM) / Math.tan(elevRad);
}

/**
 * Sunlight color [r, g, b] in 0..1, warming from near-white to orange as
 * elevation drops below ~30°.
 */
export function sunLightColor(elevRad: number): [number, number, number] {
  const high: [number, number, number] = [0.993, 0.965, 0.89]; // #fdf6e3
  const low: [number, number, number] = [0.957, 0.69, 0.376]; // #f4b060
  const elevDeg = (elevRad * 180) / Math.PI;
  // 0 above 30°, 1 at 10°
  const t = Math.min(1, Math.max(0, (30 - elevDeg) / 20));
  const w = t * t * (3 - 2 * t);
  return [
    high[0] + (low[0] - high[0]) * w,
    high[1] + (low[1] - high[1]) * w,
    high[2] + (low[2] - high[2]) * w,
  ];
}

/**
 * Slider t ∈ [0, 1] → sun elevation in radians (10°–90°), eased so the
 * visually interesting low-sun range gets more slider travel.
 */
export function elevSliderToRad(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const deg = 10 + 80 * clamped * clamped;
  return (deg * Math.PI) / 180;
}
