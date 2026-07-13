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

/**
 * Sun projection applied at raster time (occlusion paint): every element
 * shifts along the sun azimuth by its OWN height's plan-space parallax
 * `h·treeH·cos(elev)`, so the shadow is a true continuous 3D projection —
 * branches lean, the trunk shadow stretches along the ground — instead of
 * discrete layer sheets. The mean shift is subtracted to keep the shadow
 * anchored in the window.
 */
export interface Projection {
  cosElev: number;
  /** meters */
  treeH: number;
  /** texture UV units per world meter (elevation-aware fit) */
  uvPerMeter: number;
  /** sun azimuth unit vector in texture space */
  azX: number;
  azZ: number;
}

const LAYER_COLORS_OCC = (v: number) => [
  `rgb(${v},0,0)`,
  `rgb(0,${v},0)`,
  `rgb(0,0,${v})`,
];

/** sprite canvas size; the leaf blade spans the full width */
const SPRITE_W = 96;
const SPRITE_H = 48;

const spriteCache = new Map<string, HTMLCanvasElement>();

/**
 * Oak-leaf silhouette sprite: short stem at the left edge, lobed blade
 * pointing +x. Anchor = (0, SPRITE_H/2), the stem base, so a leaf drawn
 * at a twig point visually grows from the branch.
 */
function leafSprite(color: string): HTMLCanvasElement {
  const cached = spriteCache.get(color);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  const mid = SPRITE_H / 2;
  // stem
  ctx.fillRect(0, mid - 1.5, 16, 3);
  // lobed blade: alternating lobe peaks and sinuses, mirrored
  ctx.beginPath();
  ctx.moveTo(14, mid);
  const top: Array<[number, number, number, number]> = [
    // [controlX, controlY, endX, endY] — lobe out, then sinus in
    [20, mid - 16, 30, mid - 13],
    [36, mid - 10, 38, mid - 8],
    [42, mid - 22, 54, mid - 16],
    [60, mid - 12, 62, mid - 9],
    [68, mid - 20, 78, mid - 12],
    [86, mid - 8, 95, mid],
  ];
  for (const [cx, cy, ex, ey] of top) ctx.quadraticCurveTo(cx, cy, ex, ey);
  // mirrored return path from the tip back to the stem
  for (let i = top.length - 1; i >= 0; i--) {
    const [cx, cy] = top[i];
    const endX = i > 0 ? top[i - 1][2] : 14;
    const endY = i > 0 ? 2 * mid - top[i - 1][3] : mid;
    ctx.quadraticCurveTo(cx, 2 * mid - cy, endX, endY);
  }
  ctx.closePath();
  ctx.fill();
  spriteCache.set(color, c);
  return c;
}

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
  projection?: Projection,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;

  // per-height plan-space parallax in texture UV units, mean-centered
  const parPerH = projection
    ? projection.treeH * projection.cosElev * projection.uvPerMeter
    : 0;
  const parMean = 0.5 * parPerH;
  const shiftX = (hn: number) =>
    projection ? (hn * parPerH - parMean) * projection.azX : 0;
  const shiftZ = (hn: number) =>
    projection ? (hn * parPerH - parMean) * projection.azZ : 0;

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
    const hBase = node.baseH;
    const hMid = node.baseH + node.rise * vis * 0.5;
    const hTip = node.baseH + node.rise * vis;
    const bx = ox + (pose.baseX[g] + shiftX(hBase)) * size;
    const by = oy + (pose.baseZ[g] + shiftZ(hBase)) * size;
    const dx = pose.cos[g];
    const dy = pose.sin[g];
    const px = -dy;
    const py = dx;
    const mx =
      ox +
      (pose.baseX[g] + shiftX(hMid)) * size +
      dx * len * 0.5 +
      px * node.bend * len;
    const my =
      oy +
      (pose.baseZ[g] + shiftZ(hMid)) * size +
      dy * len * 0.5 +
      py * node.bend * len;
    const tx = ox + (pose.baseX[g] + shiftX(hTip)) * size + dx * len;
    const ty = oy + (pose.baseZ[g] + shiftZ(hTip)) * size + dy * len;

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

  // --- leaves: oak-leaf sprites, stems anchored on their twig ----------
  const flutterAmp = params.wind * 0.004; // UV; ≈ 2 px at 512
  for (let layer = 0; layer < 3; layer++) {
    const sprite = leafSprite(leafColors[layer]);
    if (paint === "canopy") ctx.globalAlpha = 0.92;
    for (const leaf of leaves) {
      if (leaf.layer !== layer) continue;
      const node = sk[leaf.site];
      const vis = nodeVisibility(node, params.branches);
      if (vis <= 0) continue;
      const g = leaf.site;
      // stem anchor: near the twig, inside the site's leafy puff (plus
      // the leaf's own height parallax)
      const along = leaf.t * node.length * vis + leaf.offAlong * vis;
      const across = leaf.offAcross * vis;
      let x =
        pose.baseX[g] +
        pose.cos[g] * along -
        pose.sin[g] * across +
        shiftX(leaf.h);
      let z =
        pose.baseZ[g] +
        pose.sin[g] * along +
        pose.cos[g] * across +
        shiftZ(leaf.h);
      // blade fans off the twig's side
      let rot = pose.angle[g] + leaf.side * leaf.fan;
      if (flutterAmp > 0) {
        x += flutterAmp * Math.sin(leaf.flutterFreq * params.time + leaf.flutterPhase);
        z += 0.8 * flutterAmp * Math.sin(0.83 * leaf.flutterFreq * params.time + 1.7 * leaf.flutterPhase);
        rot += 0.3 * Math.sin(0.9 * leaf.flutterFreq * params.time + 2.1 * leaf.flutterPhase) * params.wind;
      }
      const s = (leaf.size * vis * size) / SPRITE_W;
      if (s <= 0) continue;
      const cos = Math.cos(rot) * s;
      const sin = Math.sin(rot) * s;
      ctx.setTransform(cos, sin, -sin, cos, ox + x * size, oy + z * size);
      ctx.drawImage(sprite, 0, -SPRITE_H / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (paint === "canopy") ctx.globalAlpha = 1;
  }
}
