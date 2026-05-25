import {
  createSignal,
  onCleanup,
  onMount,
  type Component,
  type JSX,
} from "solid-js";

// Internal simulation resolution. The output is soft, so this gets stretched
// to fill the container without visible pixelation.
const SIM_W = 360;
const SIM_H = 240;

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Deterministic value noise so wind animation only scrolls the field rather
// than reshuffling it, and "regenerate" is reproducible from a seed.
const hash = (ix: number, iy: number, seed: number) => {
  let h =
    Math.imul(ix | 0, 374761393) ^
    Math.imul(iy | 0, 668265263) ^
    Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

const valueNoise = (x: number, y: number, seed: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const u = smoothstep(0, 1, x - x0);
  const v = smoothstep(0, 1, y - y0);
  const n00 = hash(x0, y0, seed);
  const n10 = hash(x0 + 1, y0, seed);
  const n01 = hash(x0, y0 + 1, seed);
  const n11 = hash(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
};

// Fractal noise: stacking octaves adds the fine, self-similar structure that
// reads as clustered foliage rather than one smooth blob.
const OCTAVES = 5;
const fbm = (x: number, y: number, seed: number) => {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < OCTAVES; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 1013);
    norm += amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum / norm;
};

// Leaf-gap openness in [0,1] (high = a gap that lets a pinhole of sun through).
// Domain-warped fractal noise breaks the foliage into many small, irregular
// gaps; the larger branch structure is supplied separately by the density field.
const canopyOpenness = (u: number, v: number, seed: number) => {
  const wx = valueNoise(u * 0.4 + 3.1, v * 0.4 + 1.7, seed ^ 0x1f3) - 0.5;
  const wy = valueNoise(u * 0.4 + 8.3, v * 0.4 + 5.9, seed ^ 0x2a7) - 0.5;
  return fbm(u + 0.8 * wx, v + 0.8 * wy, seed);
};

// Small deterministic PRNG (mulberry32) for growing a repeatable tree skeleton.
const makeRng = (s: number) => {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The sun's image is the convolution kernel. Default is a filled disk; an
// eclipse subtracts an offset "moon" disk, leaving a crescent. Each row of the
// kernel is stored as up to two integer column spans so the convolution can
// use per-row prefix sums.
type Kernel = { spans: number[][]; area: number; radius: number };

const buildKernel = (radius: number, eclipse: number): Kernel => {
  const spans: number[][] = [];
  let area = 0;
  // Moon center offset: eclipse 0 -> disks fully apart (full sun);
  // eclipse 1 -> nearly concentric (thin crescent).
  const moonOffset = 2 * radius * (1 - eclipse * 0.95);
  const useMoon = eclipse > 0.001;

  for (let dy = -radius; dy <= radius; dy++) {
    const sunHalf = Math.sqrt(radius * radius - dy * dy);
    const a1 = Math.ceil(-sunHalf);
    const a2 = Math.floor(sunHalf);
    const row: number[] = [];
    if (a2 >= a1) {
      if (useMoon && Math.abs(dy) <= radius) {
        const moonHalf = Math.sqrt(radius * radius - dy * dy);
        const mb1 = Math.ceil(moonOffset - moonHalf);
        const mb2 = Math.floor(moonOffset + moonHalf);
        if (mb2 < a1 || mb1 > a2) {
          row.push(a1, a2);
        } else {
          if (a1 <= mb1 - 1) row.push(a1, Math.min(a2, mb1 - 1));
          if (mb2 + 1 <= a2) row.push(Math.max(a1, mb2 + 1), a2);
        }
      } else {
        row.push(a1, a2);
      }
    }
    for (let i = 0; i < row.length; i += 2) area += row[i + 1] - row[i] + 1;
    spans.push(row);
  }
  return { spans, area: Math.max(area, 1), radius };
};

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (v: number) => void;
}

const Slider: Component<SliderProps> = (props) => (
  <label class="flex flex-col gap-1">
    <span class="flex items-baseline justify-between">
      <span class="text-sm font-medium text-stone-700">{props.label}</span>
      <span class="text-xs text-stone-400">{props.hint}</span>
    </span>
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      onInput={(e) => props.onInput(+e.currentTarget.value)}
      class="accent-amber-600"
    />
  </label>
);

const LeafShadowSimulator: Component = () => {
  let canvasRef!: HTMLCanvasElement;

  const [spotSize, setSpotSize] = createSignal(0.26);
  const [gap, setGap] = createSignal(0.5);
  const [detail, setDetail] = createSignal(0.5);
  const [eclipse, setEclipse] = createSignal(0);
  const [wind, setWind] = createSignal(0.3);
  const [skew, setSkew] = createSignal(0);
  const [temp, setTemp] = createSignal(0.5);
  const [playing, setPlaying] = createSignal(true);

  let seed = Math.floor(Math.random() * 1e6);
  let windPhase = 0;
  let raf = 0;
  let lastTime = 0;

  // Cache the kernel so the animation loop doesn't re-allocate its span arrays
  // every frame; it only changes with sun-spot size or eclipse.
  let kernel = buildKernel(8, 0);
  let kRadius = -1;
  let kEclipse = -1;
  const getKernel = (radius: number, ecl: number) => {
    if (radius !== kRadius || ecl !== kEclipse) {
      kernel = buildKernel(radius, ecl);
      kRadius = radius;
      kEclipse = ecl;
    }
    return kernel;
  };

  // Buffers allocated once. `rawCanopy` caches the expensive fractal field so
  // shading tweaks and wind animation never recompute it. The `*ph*` fields
  // hold a per-pixel sway basis: each region's own phase and amplitude, split
  // into cos/sin parts so a frame's offset is a multiply-add, not a per-pixel
  // sine. Displacement = amp * sin(wt + phase) = sin(wt)*amp*cos(phase) +
  // cos(wt)*amp*sin(phase).
  const stride = SIM_W + 1;
  const rawCanopy = new Float32Array(SIM_W * SIM_H);
  const folC = new Float32Array(SIM_W * SIM_H);
  const prefix = new Float32Array(SIM_H * stride);
  const swayCosX = new Float32Array(SIM_W * SIM_H);
  const swaySinX = new Float32Array(SIM_W * SIM_H);
  const swayCosY = new Float32Array(SIM_W * SIM_H);
  const swaySinY = new Float32Array(SIM_W * SIM_H);
  // Crown branch skeleton [x0,y0,x1,y1,infl,...] in unsheared pixel space. The
  // branches are never drawn; they only build a smooth density field that the
  // leaf noise dapples, so the foliage clumps follow the limbs. Cached by seed.
  let treeSegs: number[] = [];
  let ctx: CanvasRenderingContext2D | null = null;
  let image: ImageData | null = null;

  // Grow a crown of branches from the seed. Only the foliage matters, so the
  // structure forks upward and outward to fill a rounded crown; outer (thinner)
  // limbs get a larger foliage influence radius, since leaves bunch toward the
  // branch ends. The segments feed a smooth density field, never drawn directly.
  const buildTree = () => {
    const rng = makeRng(seed);
    const segs: number[] = [];
    const MAXD = 7;
    const grow = (
      x: number,
      y: number,
      ang: number,
      len: number,
      depth: number,
    ) => {
      const x1 = x + Math.cos(ang) * len;
      const y1 = y + Math.sin(ang) * len;
      segs.push(x, y, x1, y1, 11 + (MAXD - depth) * 2.4);
      if (depth <= 0 || len < 5) return;
      const n = rng() < 0.45 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const sign = i === 0 ? -1 : i === 1 ? 1 : rng() < 0.5 ? -1 : 1;
        const da = (0.2 + rng() * 0.32) * sign;
        grow(x1, y1, ang + da, len * (0.72 + rng() * 0.1), depth - 1);
      }
    };
    // A few branches radiating from the base avoid a single trunk-like stub.
    const cx = SIM_W * 0.5;
    const cy = SIM_H * 0.74;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.5 + (rng() - 0.5) * 0.3;
      grow(cx, cy, a, SIM_H * 0.13, MAXD);
    }
    treeSegs = segs;
  };

  // Expensive (detail / seed): the warped fractal leaf texture that dapples the
  // foliage, plus the per-region sway basis (split into cos/sin parts; see
  // buffer notes). Sampled in unsheared space so skew needn't recompute it.
  const computeTexture = () => {
    const freq = lerp(14, 40, detail());
    const aspect = SIM_H / SIM_W;
    const pf = freq * 0.28;
    const TAU = Math.PI * 2;
    for (let py = 0; py < SIM_H; py++) {
      const v = (py / SIM_H) * freq * aspect;
      const pv = (py / SIM_H) * pf * aspect;
      const base = py * SIM_W;
      for (let px = 0; px < SIM_W; px++) {
        const nx = px / SIM_W;
        rawCanopy[base + px] = canopyOpenness(nx * freq, v, seed);
        const pu = nx * pf;
        const phX = valueNoise(pu + 2.7, pv + 8.1, seed ^ 0x6d2) * TAU;
        const phY = valueNoise(pu + 5.3, pv + 1.9, seed ^ 0x3b7) * TAU;
        const aX = 0.5 + 0.5 * valueNoise(pu + 9.4, pv + 4.2, seed ^ 0x91c);
        const aY = 0.3 + 0.4 * valueNoise(pu + 3.1, pv + 7.7, seed ^ 0x55a);
        const idx = base + px;
        swayCosX[idx] = aX * Math.cos(phX);
        swaySinX[idx] = aX * Math.sin(phX);
        swayCosY[idx] = aY * Math.cos(phY);
        swaySinY[idx] = aY * Math.sin(phY);
      }
    }
  };

  // Cheap (skew / seed): accumulate a smooth foliage-density field `folC` from
  // the branch skeleton — each limb contributes a soft falloff, so overlapping
  // limbs build a denser, lumpy crown that follows the branching. The leaf noise
  // later carves the dapples into this field. Skew shears about the crown base
  // to mimic a low sun; a border fade keeps the shadow off the canvas edge.
  const rasterizeFoliage = () => {
    folC.fill(0);
    const slope = skew() * 0.6;
    for (let s = 0; s < treeSegs.length; s += 5) {
      const y0 = treeSegs[s + 1];
      const y1 = treeSegs[s + 3];
      const x0 = treeSegs[s] + slope * (SIM_H - y0);
      const x1 = treeSegs[s + 2] + slope * (SIM_H - y1);
      const infl = treeSegs[s + 4];
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - infl));
      const maxX = Math.min(SIM_W - 1, Math.ceil(Math.max(x0, x1) + infl));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - infl));
      const maxY = Math.min(SIM_H - 1, Math.ceil(Math.max(y0, y1) + infl));
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1;
      const inv = 1 / infl;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          let t = ((px - x0) * dx + (py - y0) * dy) / len2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const dist = Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
          if (dist < infl) {
            const c = 1 - dist * inv;
            folC[py * SIM_W + px] += c * c * 0.6;
          }
        }
      }
    }
    // Saturate the accumulation into [0,1) and fade at the border.
    for (let py = 0; py < SIM_H; py++) {
      const bfY = Math.min(py, SIM_H - 1 - py);
      const base = py * SIM_W;
      for (let px = 0; px < SIM_W; px++) {
        const border = clamp(Math.min(px, SIM_W - 1 - px, bfY) / 16, 0, 1);
        folC[base + px] = (1 - Math.exp(-folC[base + px] * 1.4)) * border;
      }
    }
  };

  const computeCanopy = () => {
    buildTree();
    computeTexture();
    rasterizeFoliage();
    applyThreshold();
  };

  // Cheap (runs on gap change): combine the leaf texture with foliage coverage
  // into a transmission mask (1 = light passes) and accumulate the per-row
  // prefix sums the convolution reads. Foliage admits dappled light through its
  // gaps; open ground outside the canopy passes freely.
  const applyThreshold = () => {
    const threshold = lerp(0.64, 0.4, gap());
    for (let py = 0; py < SIM_H; py++) {
      const rBase = py * SIM_W;
      const pBase = py * stride;
      prefix[pBase] = 0;
      let acc = 0;
      for (let px = 0; px < SIM_W; px++) {
        const i = rBase + px;
        const leaf = smoothstep(threshold, threshold + 0.04, rawCanopy[i]);
        acc += 1 - folC[i] * (1 - leaf);
        prefix[pBase + px + 1] = acc;
      }
    }
  };

  // Per frame: convolve the cached canopy with the sun-shaped kernel. Wind
  // displaces each region of the canopy by its own oscillation, so individual
  // branches sway out of phase with one another instead of the whole field
  // waving as one sheet.
  const draw = () => {
    if (!ctx || !image) return;
    const radius = Math.round(lerp(2, 26, spotSize()));
    const { spans, area } = getKernel(radius, eclipse());

    // Global oscillation; per-region phase lives in the sway basis fields.
    // Gentle and slow, so foliage rustles rather than rippling like water.
    const st = Math.sin(windPhase * 1.3);
    const ct = Math.cos(windPhase * 1.3);
    const gx = wind() * 5;
    const gy = wind() * 2;

    // The page itself is the sunlit ground; we only paint shadow over it, with
    // opacity set by how much light is blocked. Sun-spots are simply where the
    // shadow thins to nothing and the page shows through. Temperature tints the
    // shade: cool/blue under warm low sun, neutral grey at cool midday.
    const tc = temp();
    const shR = lerp(58, 84, tc);
    const shG = lerp(64, 84, tc);
    const shB = lerp(86, 80, tc);
    const STRENGTH = 0.86;

    const data = image.data;
    for (let py = 0; py < SIM_H; py++) {
      for (let px = 0; px < SIM_W; px++) {
        const sidx = py * SIM_W + px;
        const dispX = Math.round(gx * (st * swayCosX[sidx] + ct * swaySinX[sidx]));
        const dispY = Math.round(gy * (st * swayCosY[sidx] + ct * swaySinY[sidx]));
        let sum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          let yy = py + dy - dispY;
          if (yy < 0) yy = 0;
          else if (yy > SIM_H - 1) yy = SIM_H - 1;
          const row = spans[dy + radius];
          const pBase = yy * stride;
          for (let i = 0; i < row.length; i += 2) {
            let lo = px + row[i] - dispX;
            let hi = px + row[i + 1] - dispX;
            if (hi < 0 || lo > SIM_W - 1) continue;
            if (lo < 0) lo = 0;
            if (hi > SIM_W - 1) hi = SIM_W - 1;
            sum += prefix[pBase + hi + 1] - prefix[pBase + lo];
          }
        }
        const shade = Math.pow(1 - sum / area, 0.85);
        const idx = sidx * 4;
        data[idx] = shR;
        data[idx + 1] = shG;
        data[idx + 2] = shB;
        data[idx + 3] = shade * STRENGTH * 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  };

  const loop = (time: number) => {
    const dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    windPhase += dt;
    draw();
    if (playing()) raf = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    cancelAnimationFrame(raf);
    lastTime = 0;
    raf = requestAnimationFrame(loop);
  };

  const togglePlay = () => {
    const next = !playing();
    setPlaying(next);
    if (next) startLoop();
    else cancelAnimationFrame(raf);
  };

  const regenerate = () => {
    seed = Math.floor(Math.random() * 1e6);
    computeCanopy();
    if (!playing()) draw();
  };

  // While paused, redraw immediately. `detail` reshapes the foliage so it
  // rebuilds the cache; `gap` only re-thresholds it; the rest just re-shade.
  const redrawIfPaused = () => {
    if (!playing()) draw();
  };
  const onDetail = (v: number) => {
    setDetail(v);
    computeTexture();
    applyThreshold();
    redrawIfPaused();
  };
  const onGap = (v: number) => {
    setGap(v);
    applyThreshold();
    redrawIfPaused();
  };
  const onSkew = (v: number) => {
    setSkew(v);
    rasterizeFoliage();
    applyThreshold();
    redrawIfPaused();
  };
  const onShade = (setter: (v: number) => void) => (v: number) => {
    setter(v);
    redrawIfPaused();
  };

  onMount(() => {
    canvasRef.width = SIM_W;
    canvasRef.height = SIM_H;
    ctx = canvasRef.getContext("2d");
    if (ctx) image = ctx.createImageData(SIM_W, SIM_H);
    computeCanopy();
    draw();
    if (playing()) startLoop();
  });

  onCleanup(() => cancelAnimationFrame(raf));

  const controls: JSX.Element = (
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Slider
        label="Sun-spot size"
        hint="canopy height"
        value={spotSize()}
        min={0}
        max={1}
        step={0.01}
        onInput={onShade(setSpotSize)}
      />
      <Slider
        label="Gap size"
        hint="leaf openness"
        value={gap()}
        min={0}
        max={1}
        step={0.01}
        onInput={onGap}
      />
      <Slider
        label="Leaf detail"
        hint="texture density"
        value={detail()}
        min={0}
        max={1}
        step={0.01}
        onInput={onDetail}
      />
      <Slider
        label="Eclipse"
        hint="round → crescent"
        value={eclipse()}
        min={0}
        max={1}
        step={0.01}
        onInput={onShade(setEclipse)}
      />
      <Slider
        label="Wind"
        hint="sway speed"
        value={wind()}
        min={0}
        max={1}
        step={0.01}
        onInput={onShade(setWind)}
      />
      <Slider
        label="Skew"
        hint="sun angle"
        value={skew()}
        min={-1}
        max={1}
        step={0.01}
        onInput={onSkew}
      />
      <Slider
        label="Color temperature"
        hint="warm → cool"
        value={temp()}
        min={0}
        max={1}
        step={0.01}
        onInput={onShade(setTemp)}
      />
      <div class="flex items-end gap-2">
        <button
          type="button"
          onClick={togglePlay}
          class="flex-1 rounded-md bg-stone-800 px-3 py-2 text-sm font-medium text-stone-50 transition hover:bg-stone-700"
        >
          {playing() ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={regenerate}
          class="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200"
        >
          New canopy
        </button>
      </div>
    </div>
  );

  return (
    <div class="not-prose flex flex-col gap-5">
      <canvas
        ref={canvasRef}
        class="block h-auto w-full"
        aria-label="Simulated leaf shadow cast on the page"
      />
      {controls}
    </div>
  );
};

export default LeafShadowSimulator;
