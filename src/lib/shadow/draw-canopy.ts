import type { Leaf } from "./canopy";

/**
 * Colors that write into exactly one channel; with "lighter" (additive)
 * compositing the three canopy layers accumulate independently in R/G/B.
 * 230 (not 255) so a single leaf is ~90% opaque and overlaps saturate.
 */
const LAYER_COLORS = ["rgb(230,0,0)", "rgb(0,230,0)", "rgb(0,0,230)"];

/**
 * Rasterize leaf sprites into the canopy texture canvas: black background
 * (no occlusion), one color channel per canopy layer.
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D,
  leaves: Leaf[],
): void {
  const size = ctx.canvas.width;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";

  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = LAYER_COLORS[layer];
    ctx.beginPath();
    for (const leaf of leaves) {
      if (leaf.layer !== layer) continue;
      const a = leaf.size * size;
      const b = a * (leaf.aspect ?? 0.45);
      // start point of ellipse(θ=0) so subpaths don't get connecting lines
      ctx.moveTo(
        leaf.x * size + a * Math.cos(leaf.rot),
        leaf.y * size + a * Math.sin(leaf.rot),
      );
      ctx.ellipse(
        leaf.x * size,
        leaf.y * size,
        a,
        b,
        leaf.rot,
        0,
        Math.PI * 2,
      );
    }
    ctx.fill();
  }
}
