import type { Leaf2 } from "./leaves";
import { nodeVisibility, type Skeleton } from "./skeleton";
import type { Pose } from "./wind";

/**
 * One geometry walk, two paints:
 * - "occlusion": the 512² texture consumed by the shadow shader — black
 *   background, additive channel packing, R/G/B = low/mid/high layer
 *   opacity (v1's scheme).
 * - "canopy": the step-1 schematic view at display resolution — dark
 *   stone branches and leaves on a light ground, the honest occluder.
 */

export interface SceneParams {
  /** branches slider 0..1 (visibility gating) */
  branches: number;
  /** wind slider 0..1 (leaf flutter amplitude; joint sway is in the pose) */
  wind: number;
  /** seconds (leaf flutter phase) */
  time: number;
  /** channel value for branch occlusion (140 sparse → 230 dense foliage) */
  branchStrength: number;
}

const LAYER_COLORS_OCC = (v: number) => [
  `rgb(${v},0,0)`,
  `rgb(0,${v},0)`,
  `rgb(0,0,${v})`,
];

/** canopy height band occupied by the tree (see leaves.ts) */
function layerOf(h: number): 0 | 1 | 2 {
  const hNorm = Math.min(1, Math.max(0, (h - 0.35) / 0.65));
  return Math.min(2, Math.floor(3 * hNorm)) as 0 | 1 | 2;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  sk: Skeleton,
  pose: Pose,
  leaves: Leaf2[],
  params: SceneParams,
  paint: "occlusion" | "canopy",
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;

  if (paint === "occlusion") {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#f5f5f4"; // stone-100
    ctx.fillRect(0, 0, w, h);
  }

  const branchColors =
    paint === "occlusion"
      ? LAYER_COLORS_OCC(Math.round(params.branchStrength))
      : ["#57534e", "#57534e", "#57534e"]; // stone-600
  const leafColors =
    paint === "occlusion"
      ? LAYER_COLORS_OCC(230)
      : ["#6b6661", "#57534e", "#44403c"]; // deeper stone higher up

  // --- branches: tapered 2-segment bent polylines, split by layer ------
  ctx.lineCap = "round";
  for (let g = 0; g < sk.length; g++) {
    const node = sk[g];
    const vis = nodeVisibility(node, params.branches);
    if (vis <= 0) continue;
    const len = node.length * vis * size;
    const bx = ox + pose.baseX[g] * size;
    const by = oy + pose.baseZ[g] * size;
    const dx = pose.cos[g];
    const dy = pose.sin[g];
    const px = -dy;
    const py = dx;
    const mx = bx + dx * len * 0.5 + px * node.bend * len;
    const my = by + dy * len * 0.5 + py * node.bend * len;
    const tx = bx + dx * len;
    const ty = by + dy * len;

    const baseLayer = layerOf(node.baseH);
    const tipLayer = layerOf(node.baseH + node.rise);
    const width = Math.max(0.5, 2 * node.thickness * vis * size);

    ctx.strokeStyle = branchColors[baseLayer];
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(mx, my);
    ctx.stroke();

    ctx.strokeStyle = branchColors[tipLayer];
    ctx.lineWidth = Math.max(0.5, width * 0.6);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  // --- leaves: batched ellipse fills per layer -------------------------
  const flutterAmp = params.wind * 0.004 * size; // UV 0.004 ≈ 2 px at 512
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = leafColors[layer];
    if (paint === "canopy") ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const leaf of leaves) {
      if (leaf.layer !== layer) continue;
      const node = sk[leaf.site];
      const vis = nodeVisibility(node, params.branches);
      if (vis <= 0) continue;
      const g = leaf.site;
      const len = node.length * vis;
      const dx = pose.cos[g];
      const dy = pose.sin[g];
      let x = pose.baseX[g] + dx * (leaf.t * len + leaf.offAlong) - dy * leaf.offAcross;
      let z = pose.baseZ[g] + dy * (leaf.t * len + leaf.offAlong) + dx * leaf.offAcross;
      let rot = leaf.rot + pose.angle[g];
      if (flutterAmp > 0) {
        x += (flutterAmp / size) * Math.sin(leaf.flutterFreq * params.time + leaf.flutterPhase);
        z += (0.8 * flutterAmp / size) * Math.sin(0.83 * leaf.flutterFreq * params.time + 1.7 * leaf.flutterPhase);
        rot += 0.35 * Math.sin(0.9 * leaf.flutterFreq * params.time + 2.1 * leaf.flutterPhase) * params.wind;
      }
      const a = leaf.size * vis * size;
      const b = a * 0.45;
      const cx = ox + x * size;
      const cy = oy + z * size;
      ctx.moveTo(cx + a * Math.cos(rot), cy + a * Math.sin(rot));
      ctx.ellipse(cx, cy, a, b, rot, 0, Math.PI * 2);
    }
    ctx.fill();
    if (paint === "canopy") ctx.globalAlpha = 1;
  }
}
