import type { Leaf } from "./canopy";

/**
 * Colors that write into exactly one channel; with "lighter" (additive)
 * compositing the three canopy layers accumulate independently in R/G/B.
 * 230 (not 255) so a single leaf is ~90% opaque and overlaps saturate.
 */
const LAYER_COLORS = ["rgb(230,0,0)", "rgb(0,230,0)", "rgb(0,0,230)"];

/** Per-leaf wind animation for a raster pass. */
export interface Sway {
  /** seconds */
  time: number;
  /** displacement amplitude at the canopy top, in canvas pixels */
  ampPx: number;
}

/**
 * Rasterize sprites into the canopy texture canvas: black background
 * (no occlusion), one color channel per canopy layer. When `sway` is
 * given, every leaf moves individually — its own frequency, phase,
 * elliptical path and rotation wobble — which is what makes windy
 * dapples twinkle instead of the whole pattern warping as a sheet.
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D,
  leaves: Leaf[],
  sway?: Sway,
): void {
  const size = ctx.canvas.width;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";

  const t = sway?.time ?? 0;
  const amp = sway?.ampPx ?? 0;

  for (let layer = 0; layer < 3; layer++) {
    // higher foliage sways more
    const layerAmp = amp * (0.55 + 0.45 * (layer / 2));
    ctx.fillStyle = LAYER_COLORS[layer];
    ctx.beginPath();
    for (const leaf of leaves) {
      if (leaf.layer !== layer) continue;
      let cx = leaf.x * size;
      let cy = leaf.y * size;
      let rot = leaf.rot;
      if (amp > 0 && leaf.swayFreq) {
        const ph = leaf.swayPhase ?? 0;
        cx += layerAmp * Math.sin(leaf.swayFreq * t + ph);
        cy += 0.8 * layerAmp * Math.sin(0.83 * leaf.swayFreq * t + 1.7 * ph);
        rot += 0.4 * Math.sin(0.9 * leaf.swayFreq * t + 2.1 * ph);
      }
      const a = leaf.size * size;
      const b = a * (leaf.aspect ?? 0.45);
      // start point of ellipse(θ=0) so subpaths don't get connecting lines
      ctx.moveTo(cx + a * Math.cos(rot), cy + a * Math.sin(rot));
      ctx.ellipse(cx, cy, a, b, rot, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
