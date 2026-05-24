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

  const [spotSize, setSpotSize] = createSignal(0.55);
  const [gap, setGap] = createSignal(0.4);
  const [detail, setDetail] = createSignal(0.4);
  const [eclipse, setEclipse] = createSignal(0);
  const [wind, setWind] = createSignal(0.3);
  const [playing, setPlaying] = createSignal(true);

  let seed = Math.floor(Math.random() * 1e6);
  let windOffset = 0;
  let raf = 0;
  let lastTime = 0;

  // Buffers allocated once.
  const mask = new Float32Array(SIM_W * SIM_H);
  const prefix = new Float32Array(SIM_H * (SIM_W + 1));
  let ctx: CanvasRenderingContext2D | null = null;
  let image: ImageData | null = null;

  const draw = () => {
    if (!ctx || !image) return;

    const radius = Math.round(lerp(3, 30, spotSize()));
    const threshold = lerp(0.78, 0.46, gap());
    const freq = lerp(6, 26, detail());
    const kernel = buildKernel(radius, eclipse());

    // 1. Canopy occlusion mask: transmission in [0,1] (1 = open gap).
    const aspect = SIM_H / SIM_W;
    for (let py = 0; py < SIM_H; py++) {
      const v = (py / SIM_H) * freq * aspect;
      for (let px = 0; px < SIM_W; px++) {
        const u = (px / SIM_W) * freq + windOffset;
        const n =
          valueNoise(u, v, seed) * 0.65 +
          valueNoise(u * 2.3 + 11.3, v * 2.3 + 5.7, seed ^ 0x9e37) * 0.35;
        mask[py * SIM_W + px] = smoothstep(threshold, threshold + 0.05, n);
      }
    }

    // 2. Per-row prefix sums for O(1) span lookups.
    const stride = SIM_W + 1;
    for (let py = 0; py < SIM_H; py++) {
      const pBase = py * stride;
      const mBase = py * SIM_W;
      prefix[pBase] = 0;
      let acc = 0;
      for (let px = 0; px < SIM_W; px++) {
        acc += mask[mBase + px];
        prefix[pBase + px + 1] = acc;
      }
    }

    // 3. Convolve canopy with the sun-shaped kernel.
    const { spans, area, radius: r } = kernel;
    const data = image.data;
    for (let py = 0; py < SIM_H; py++) {
      for (let px = 0; px < SIM_W; px++) {
        let sum = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = clamp(py + dy, 0, SIM_H - 1);
          const row = spans[dy + r];
          const pBase = yy * stride;
          for (let i = 0; i < row.length; i += 2) {
            let lo = px + row[i];
            let hi = px + row[i + 1];
            if (hi < 0 || lo > SIM_W - 1) continue;
            if (lo < 0) lo = 0;
            if (hi > SIM_W - 1) hi = SIM_W - 1;
            sum += prefix[pBase + hi + 1] - prefix[pBase + lo];
          }
        }
        const b = Math.pow(sum / area, 0.75);
        const idx = (py * SIM_W + px) * 4;
        data[idx] = lerp(30, 255, b);
        data[idx + 1] = lerp(44, 248, b);
        data[idx + 2] = lerp(28, 222, b * 0.95);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  };

  const loop = (time: number) => {
    const dt = lastTime ? (time - lastTime) / 1000 : 0;
    lastTime = time;
    windOffset += wind() * dt * 1.2;
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
    if (!playing()) draw();
  };

  // When a control changes while paused, redraw immediately.
  const onControl = (setter: (v: number) => void) => (v: number) => {
    setter(v);
    if (!playing()) draw();
  };

  onMount(() => {
    canvasRef.width = SIM_W;
    canvasRef.height = SIM_H;
    ctx = canvasRef.getContext("2d");
    if (ctx) image = ctx.createImageData(SIM_W, SIM_H);
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
        onInput={onControl(setSpotSize)}
      />
      <Slider
        label="Gap size"
        hint="leaf openness"
        value={gap()}
        min={0}
        max={1}
        step={0.01}
        onInput={onControl(setGap)}
      />
      <Slider
        label="Leaf detail"
        hint="texture density"
        value={detail()}
        min={0}
        max={1}
        step={0.01}
        onInput={onControl(setDetail)}
      />
      <Slider
        label="Eclipse"
        hint="round → crescent"
        value={eclipse()}
        min={0}
        max={1}
        step={0.01}
        onInput={onControl(setEclipse)}
      />
      <Slider
        label="Wind"
        hint="sway speed"
        value={wind()}
        min={0}
        max={1}
        step={0.01}
        onInput={onControl(setWind)}
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
      <div class="overflow-hidden rounded-xl shadow-lg ring-1 ring-stone-900/10">
        <canvas
          ref={canvasRef}
          class="block h-auto w-full"
          style={{ "image-rendering": "auto" }}
          aria-label="Simulated dappled light from leaf shadows"
        />
      </div>
      {controls}
    </div>
  );
};

export default LeafShadowSimulator;
