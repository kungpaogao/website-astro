import {
  createSignal,
  onCleanup,
  onMount,
  type Component,
  type JSX,
} from "solid-js";

// Internal simulation resolution. The output is soft, so this gets stretched
// to fill the container without visible pixelation.
const SIM_W = 480;
const SIM_H = 320;

const clamp = (x: number, lo: number, hi: number) =>
  x < lo ? lo : x > hi ? hi : x;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Deterministic value noise, used only for the low-frequency wind sway basis.
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

// Small deterministic PRNG (mulberry32) for growing a repeatable tree.
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
  const [leafSize, setLeafSize] = createSignal(0.5);
  const [density, setDensity] = createSignal(0.5);
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

  // Buffers allocated once. `occ` is the rasterized occluder coverage (0 = open
  // sky, 1 = solid wood/leaf); `prefix` holds per-row prefix sums of the
  // transmittance T = 1 - occ for the span convolution. The `sway*` fields are a
  // per-pixel wind basis (each region's phase/amplitude split into cos/sin parts
  // so a frame's offset is a multiply-add, not a per-pixel sine).
  const stride = SIM_W + 1;
  const occ = new Float32Array(SIM_W * SIM_H);
  const prefix = new Float32Array(SIM_H * stride);
  const swayCosX = new Float32Array(SIM_W * SIM_H);
  const swaySinX = new Float32Array(SIM_W * SIM_H);
  const swayCosY = new Float32Array(SIM_W * SIM_H);
  const swaySinY = new Float32Array(SIM_W * SIM_H);

  // Geometry caches (pixel space, unsheared). Branches drive both the visible
  // limb shadow and where leaves bunch.
  let branchSegs: number[] = []; // [x0,y0,x1,y1,w0,w1, ...]
  let twigSegs: number[] = []; // outer limbs that carry leaves: [x0,y0,x1,y1, ...]
  let leaves: number[] = []; // [x,y,r,ang, ...]
  let baseX = 0;
  let baseY = 0;
  let reach = 1;

  let ctx: CanvasRenderingContext2D | null = null;
  let image: ImageData | null = null;

  // --- Geometry generation -------------------------------------------------

  // Grow one coherent tree anchored near the bottom-left and leaning across the
  // frame, so its shadow reads as a directional cast shadow. Natural variation
  // comes from per-step angle jitter, a gentle gravity droop (each limb is two
  // drifting sub-segments), tapering width, and variable child counts.
  const growSkeleton = () => {
    const rng = makeRng(seed);
    const segs: number[] = [];
    const twigs: number[] = [];
    const MAXD = 6;
    baseX = SIM_W * 0.16;
    baseY = SIM_H * 0.99;
    reach = SIM_H * 0.9;
    const lean = -Math.PI / 2 + 0.5; // canopy sweep direction (up-and-right)

    const grow = (
      x: number,
      y: number,
      ang: number,
      len: number,
      w: number,
      depth: number,
    ) => {
      // Two sub-segments with a small drift give limbs a gentle curve/droop.
      const drift = (rng() - 0.5) * 0.22 + 0.05;
      const mx = x + Math.cos(ang) * len * 0.5;
      const my = y + Math.sin(ang) * len * 0.5;
      const a2 = ang + drift;
      const ex = mx + Math.cos(a2) * len * 0.5;
      const ey = my + Math.sin(a2) * len * 0.5;
      const wm = w * 0.85;
      const we = w * 0.72;
      segs.push(x, y, mx, my, w, wm);
      segs.push(mx, my, ex, ey, wm, we);
      if (depth <= 2) twigs.push(x, y, ex, ey);
      if (depth <= 0 || len < 5) return;
      const n = rng() < 0.5 ? 2 : rng() < 0.85 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const sign = i % 2 === 0 ? -1 : 1;
        const da = (0.3 + rng() * 0.45) * sign + (rng() - 0.5) * 0.2;
        // Gently pull each child toward the overall lean so the canopy sweeps
        // up-and-right rather than sprawling back into the far corner.
        let childAng = a2 + da;
        childAng += (lean - childAng) * 0.12;
        grow(ex, ey, childAng, len * (0.7 + rng() * 0.12), we, depth - 1);
      }
    };

    // Trunk leans up and to the right; canopy sweeps across the frame.
    grow(baseX, baseY, lean, SIM_H * 0.24, SIM_W * 0.02, MAXD);
    branchSegs = segs;
    twigSegs = twigs;
  };

  // Scatter discrete leaves in clustered tufts along the outer twigs. Density
  // (control) sets how many; a Gaussian offset bunches them near each twig, and
  // a falloff with distance from the trunk thins the far side into isolated
  // leaf shadows.
  const scatterLeaves = () => {
    const rng = makeRng(seed ^ 0x9e3779b9);
    const out: number[] = [];
    const gauss = () =>
      Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(6.2831853 * rng());
    const dens = lerp(0.35, 1.2, density());
    for (let s = 0; s < twigSegs.length; s += 4) {
      const x0 = twigSegs[s];
      const y0 = twigSegs[s + 1];
      const dx = twigSegs[s + 2] - x0;
      const dy = twigSegs[s + 3] - y0;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;
      const nx = -ty;
      const ny = tx;
      const count = Math.max(1, Math.round(len * dens));
      for (let k = 0; k < count; k++) {
        const t = rng();
        const ax = x0 + dx * t;
        const ay = y0 + dy * t;
        const spread = 5 + rng() * 7;
        const g1 = gauss();
        const g2 = gauss() * 0.6;
        const lx = ax + (nx * g1 + tx * g2) * spread;
        const ly = ay + (ny * g1 + ty * g2) * spread;
        // Thin the canopy toward the far edge (away from the trunk base).
        const dist = Math.hypot(lx - baseX, ly - baseY) / reach;
        if (rng() > lerp(1, 0.3, clamp(dist, 0, 1))) continue;
        const r = 2.4 + rng() * 3;
        const ang = Math.atan2(ty, tx) + (rng() - 0.5) * 1.3;
        out.push(lx, ly, r, ang);
      }
    }
    leaves = out;
  };

  // Low-frequency wind sway basis (screen space, independent of the occluder).
  const computeSwayBasis = () => {
    const aspect = SIM_H / SIM_W;
    const pf = 7;
    const TAU = Math.PI * 2;
    for (let py = 0; py < SIM_H; py++) {
      const pv = (py / SIM_H) * pf * aspect;
      const base = py * SIM_W;
      for (let px = 0; px < SIM_W; px++) {
        const pu = (px / SIM_W) * pf;
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

  // --- Rasterization -------------------------------------------------------

  // Stamp branches (tapered capsules) and leaves (small rotated ellipses) into
  // the occluder coverage buffer using a binary union (max), so an overlapped
  // pixel reads fully occluded and gaps stay fully open — the convolution then
  // turns small gaps into round sun-spots. Skew shears everything about the base
  // to mimic a low sun; a border fade hides the far canvas edges.
  const rasterizeOccluder = () => {
    occ.fill(0);
    const slope = skew() * 0.6;
    const shx = (x: number, y: number) => x + slope * (SIM_H - y);

    for (let s = 0; s < branchSegs.length; s += 6) {
      const y0 = branchSegs[s + 1];
      const y1 = branchSegs[s + 3];
      const x0 = shx(branchSegs[s], y0);
      const x1 = shx(branchSegs[s + 2], y1);
      const w0 = branchSegs[s + 4];
      const w1 = branchSegs[s + 5];
      const maxw = Math.max(w0, w1) * 0.5 + 1;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - maxw));
      const maxX = Math.min(SIM_W - 1, Math.ceil(Math.max(x0, x1) + maxw));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - maxw));
      const maxY = Math.min(SIM_H - 1, Math.ceil(Math.max(y0, y1) + maxw));
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          let t = ((px - x0) * dx + (py - y0) * dy) / len2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const dist = Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
          const halfW = (w0 + (w1 - w0) * t) * 0.5;
          const cov = smoothstep(halfW + 0.8, halfW - 0.8, dist);
          const idx = py * SIM_W + px;
          if (cov > occ[idx]) occ[idx] = cov;
        }
      }
    }

    const scale = lerp(0.8, 1.7, leafSize());
    for (let l = 0; l < leaves.length; l += 4) {
      const ly = leaves[l + 1];
      const lx = shx(leaves[l], ly);
      const r = leaves[l + 2];
      const ang = leaves[l + 3];
      const rl = r * 1.55 * scale; // half-length along the leaf
      const rw = r * 0.8 * scale; // half-width across
      const rad = Math.ceil(Math.max(rl, rw) + 1);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const minX = Math.max(0, Math.floor(lx - rad));
      const maxX = Math.min(SIM_W - 1, Math.ceil(lx + rad));
      const minY = Math.max(0, Math.floor(ly - rad));
      const maxY = Math.min(SIM_H - 1, Math.ceil(ly + rad));
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const ddx = px - lx;
          const ddy = py - ly;
          const u = (ddx * ca + ddy * sa) / rl;
          const v = (-ddx * sa + ddy * ca) / rw;
          const rn = Math.sqrt(u * u + v * v);
          if (rn < 1.05) {
            const cov = smoothstep(1.05, 0.75, rn);
            const idx = py * SIM_W + px;
            if (cov > occ[idx]) occ[idx] = cov;
          }
        }
      }
    }

    // Fade occlusion to nothing near the far edges (left/right/top) — not the
    // bottom, where the trunk is rooted — so the shadow dissolves into the page.
    const FADE = 18;
    for (let py = 0; py < SIM_H; py++) {
      const base = py * SIM_W;
      for (let px = 0; px < SIM_W; px++) {
        const b = clamp(Math.min(px, SIM_W - 1 - px, py) / FADE, 0, 1);
        if (b < 1) occ[base + px] *= b;
      }
    }
  };

  // Per-row prefix sums of transmittance T = 1 - occ, consumed by the convolution.
  const buildPrefix = () => {
    for (let py = 0; py < SIM_H; py++) {
      const oBase = py * SIM_W;
      const pBase = py * stride;
      prefix[pBase] = 0;
      let acc = 0;
      for (let px = 0; px < SIM_W; px++) {
        acc += 1 - occ[oBase + px];
        prefix[pBase + px + 1] = acc;
      }
    }
  };

  const rebuildAll = () => {
    growSkeleton();
    scatterLeaves();
    computeSwayBasis();
    rasterizeOccluder();
    buildPrefix();
  };

  // --- Lighting (per frame) ------------------------------------------------

  // Convolve the occluder transmittance with the sun-shaped kernel. Wind
  // displaces each region of the shadow by its own oscillation; the result is
  // painted as shadow over the page (alpha = how much light is blocked), tinted
  // by colour temperature. Sun-spots are simply where the shadow thins to page.
  const draw = () => {
    if (!ctx || !image) return;
    const radius = Math.round(lerp(0, 32, spotSize()));
    const { spans, area } = getKernel(radius, eclipse());

    const st = Math.sin(windPhase * 1.3);
    const ct = Math.cos(windPhase * 1.3);
    const gx = wind() * 6;
    const gy = wind() * 2.5;

    const tc = temp();
    const shR = lerp(58, 84, tc);
    const shG = lerp(64, 84, tc);
    const shB = lerp(86, 80, tc);
    const STRENGTH = 0.86;

    const data = image.data;
    for (let py = 0; py < SIM_H; py++) {
      for (let px = 0; px < SIM_W; px++) {
        const sidx = py * SIM_W + px;
        const dispX = Math.round(
          gx * (st * swayCosX[sidx] + ct * swaySinX[sidx]),
        );
        const dispY = Math.round(
          gy * (st * swayCosY[sidx] + ct * swaySinY[sidx]),
        );
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
    rebuildAll();
    if (!playing()) draw();
  };

  const redrawIfPaused = () => {
    if (!playing()) draw();
  };
  // `density` re-scatters leaves; `leafSize`/`skew` only re-rasterize; the rest
  // (sun-spot, eclipse, wind, temperature) only re-shade in draw().
  const onDensity = (v: number) => {
    setDensity(v);
    scatterLeaves();
    rasterizeOccluder();
    buildPrefix();
    redrawIfPaused();
  };
  const onLeafSize = (v: number) => {
    setLeafSize(v);
    rasterizeOccluder();
    buildPrefix();
    redrawIfPaused();
  };
  const onSkew = (v: number) => {
    setSkew(v);
    rasterizeOccluder();
    buildPrefix();
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
    rebuildAll();
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
        label="Leaf size"
        hint="leaf scale"
        value={leafSize()}
        min={0}
        max={1}
        step={0.01}
        onInput={onLeafSize}
      />
      <Slider
        label="Leaf density"
        hint="how full"
        value={density()}
        min={0}
        max={1}
        step={0.01}
        onInput={onDensity}
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
          New tree
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
