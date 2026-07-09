import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import {
  canopyAspect,
  generateLeaves,
  generateLimbStrokes,
  sliderToLeafCount,
  UV_MARGIN,
  type Leaf,
} from "../lib/shadow/canopy";
import { drawCanopy } from "../lib/shadow/draw-canopy";
import {
  elevSliderToRad,
  layerHeights,
  sunLightColor,
} from "../lib/shadow/projection";
import { buildFragSrc, VERT_SRC } from "../lib/shadow/shaders";

const SEED = 20260702;
const TEX_SIZE = 512;
/** fixed sun azimuth, slightly diagonal (radians from screen-up) */
const SUN_AZIMUTH = (35 * Math.PI) / 180;

type Mood = "warm" | "neutral";

const MOODS: Record<
  Mood,
  { shadow: [number, number, number]; light?: [number, number, number] }
> = {
  // warm light comes from sunLightColor(elev); shadow is deep cool stone
  // (real shade on pavement is darker and bluer than you'd guess)
  warm: { shadow: [0.44, 0.43, 0.51] },
  // concrete: near-white light, deep neutral-gray shadow
  neutral: { light: [0.97, 0.97, 0.96], shadow: [0.42, 0.415, 0.42] },
};

const SHAPE_NAMES = ["columnar", "oval", "spreading", "weeping"];

const ShadowSim: Component = () => {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // all sliders are normalized 0..1
  const [height, setHeight] = createSignal(13 / 27); // 16 m
  const [leaves, setLeaves] = createSignal(0.63); // ~4,800 leaves
  const [shape, setShape] = createSignal(0.4);
  const [sun, setSun] = createSignal(0.75); // 55°
  const [wind, setWind] = createSignal(reducedMotion ? 0 : 0.5);
  const [zoom, setZoom] = createSignal(0.25); // 0.5×–2.5×, 0.25 → 1×
  const [mood, setMood] = createSignal<Mood>("warm");
  const [panelOpen, setPanelOpen] = createSignal(true);

  const zoomFactor = () => 0.5 + 2 * zoom();
  const [failed, setFailed] = createSignal(false);

  let container!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;

  // assigned in onMount; slider handlers call them
  let invalidate = () => {};
  let markCanopyDirty = () => {};

  onMount(() => {
    const gl = canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    // quality tier, fixed for the session
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const K = coarse ? 8 : 24;
    const dprCap = coarse ? 1.5 : 2;

    const texCanvas = document.createElement("canvas");
    texCanvas.width = texCanvas.height = TEX_SIZE;
    const texCtx = texCanvas.getContext("2d")!;

    let program: WebGLProgram | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let texture: WebGLTexture | null = null;
    let contextLost = false;
    let canopyDirty = true;
    let cachedLeaves: Leaf[] = [];
    let cachedLeafKey = "";
    let rafId = 0;

    function compile(type: number, src: string): WebGLShader {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        throw new Error(gl!.getShaderInfoLog(shader) ?? "shader error");
      }
      return shader;
    }

    function initGL() {
      program = gl!.createProgram()!;
      gl!.attachShader(program, compile(gl!.VERTEX_SHADER, VERT_SRC));
      gl!.attachShader(program, compile(gl!.FRAGMENT_SHADER, buildFragSrc(K)));
      gl!.linkProgram(program);
      if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
        throw new Error(gl!.getProgramInfoLog(program) ?? "link error");
      }
      gl!.useProgram(program);

      // fullscreen triangle
      const buf = gl!.createBuffer();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl!.STATIC_DRAW,
      );
      const aPos = gl!.getAttribLocation(program, "a_pos");
      gl!.enableVertexAttribArray(aPos);
      gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);

      uniforms = {};
      for (const name of [
        "u_resolution",
        "u_metersPerPixel",
        "u_time",
        "u_canopy",
        "u_layerHeights",
        "u_sinElev",
        "u_cosElev",
        "u_rhoMax",
        "u_penumbraBoost",
        "u_spanPar",
        "u_azDir",
        "u_uvPerMeter",
        "u_windAmp",
        "u_lightColor",
        "u_shadowColor",
      ]) {
        uniforms[name] = gl!.getUniformLocation(program, name);
      }

      texture = gl!.createTexture();
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.uniform1i(uniforms.u_canopy, 0);
      canopyDirty = true;
      cachedLeafKey = ""; // force redraw of the texture canvas upload
    }

    function regenCanopyIfDirty() {
      if (!canopyDirty) return;
      canopyDirty = false;
      const count = sliderToLeafCount(leaves());
      const key = `${count}:${shape().toFixed(3)}`;
      if (key !== cachedLeafKey) {
        cachedLeafKey = key;
        cachedLeaves = generateLeaves(SEED, count, shape());
        drawCanopy(
          texCtx,
          cachedLeaves.concat(generateLimbStrokes(SEED, shape())),
        );
      }
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        texCanvas,
      );
    }

    function render(timeS: number) {
      if (contextLost || !program) return;
      regenCanopyIfDirty();

      const treeHeight = 3 + 27 * height();
      const [hLow, hMid, hHigh] = layerHeights(treeHeight);
      const elev = elevSliderToRad(sun());
      const canopyHalfW = (canopyAspect(shape()) * 0.6 * treeHeight) / 2;
      const moodColors = MOODS[mood()];
      const light = moodColors.light ?? sunLightColor(elev);

      // The window is fixed to a reference tree height (16 m) per shape, so
      // the height slider genuinely grows/shrinks the shadow and its light
      // discs on screen instead of being cancelled by an auto-zoom. The
      // zoom slider is a debug view control on top.
      const refHalfW = (canopyAspect(shape()) * 0.6 * 16) / 2;
      const windowM =
        Math.min(10, Math.max(4.5, 1.2 * refHalfW)) / zoomFactor();

      gl!.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
      gl!.uniform1f(
        uniforms.u_metersPerPixel,
        windowM / Math.min(canvas.width, canvas.height),
      );
      gl!.uniform1f(uniforms.u_time, timeS);
      gl!.uniform3f(uniforms.u_layerHeights, hLow, hMid, hHigh);
      gl!.uniform1f(uniforms.u_sinElev, Math.sin(elev));
      gl!.uniform1f(uniforms.u_cosElev, Math.cos(elev));
      gl!.uniform1f(uniforms.u_rhoMax, Math.min(0.14 * canopyHalfW, 0.6));
      // tall trees cast disproportionately softer, dimmer dapples; short
      // trees crisp sharp ones (leaves don't scale with the tree). Capped —
      // the physical rho already grows with height, and past ~1.15x the
      // extra blur reads as haze rather than shade.
      gl!.uniform1f(
        uniforms.u_penumbraBoost,
        Math.min(1.15, Math.sqrt(treeHeight / 16)),
      );
      // Layers sit 0.2·treeH apart; when their plan-space offset exceeds
      // the canopy's effective footprint (limb reach shrinks it for narrow
      // trees) the three layer images separate into discrete blobs. Smear
      // each layer along the azimuth only by the excess, so wide trees
      // keep crisp pinhole discs while narrow trees stay one connected
      // shadow.
      const layerGap = 0.2 * treeHeight * Math.cos(elev);
      const reachFrac = Math.min(
        1,
        Math.max(0.3, canopyAspect(shape()) / 1.5),
      );
      gl!.uniform1f(
        uniforms.u_spanPar,
        1.4 * Math.max(0, layerGap - 0.9 * canopyHalfW * reachFrac),
      );
      gl!.uniform2f(
        uniforms.u_azDir,
        Math.sin(SUN_AZIMUTH),
        Math.cos(SUN_AZIMUTH),
      );
      gl!.uniform1f(uniforms.u_uvPerMeter, (0.5 - UV_MARGIN) / canopyHalfW);
      gl!.uniform1f(uniforms.u_windAmp, 0.5 * wind());
      gl!.uniform3f(uniforms.u_lightColor, ...light);
      gl!.uniform3f(uniforms.u_shadowColor, ...moodColors.shadow);

      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function shouldAnimate() {
      return (
        wind() > 0 && document.visibilityState === "visible" && !contextLost
      );
    }

    function frame(timeMs: number) {
      rafId = 0;
      render(timeMs / 1000);
      if (shouldAnimate()) rafId = requestAnimationFrame(frame);
    }

    invalidate = () => {
      if (!rafId && !contextLost) rafId = requestAnimationFrame(frame);
    };
    markCanopyDirty = () => {
      canopyDirty = true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.round(container.clientWidth * dpr);
      const h = Math.round(container.clientHeight * dpr);
      if (w === canvas.width && h === canvas.height) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      invalidate();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onContextRestored = () => {
      contextLost = false;
      initGL();
      resize();
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    onCleanup(() => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    });

    try {
      initGL();
    } catch (err) {
      console.error("shadow: WebGL init failed", err);
      setFailed(true);
      return;
    }
    resize();
    invalidate();
  });

  const Slider: Component<{
    label: string;
    value: () => number;
    display: string;
    onInput: (v: number) => void;
  }> = (props) => (
    <label class="flex items-center gap-3">
      <span class="w-16 shrink-0 text-stone-700">{props.label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={props.value()}
        class="min-w-0 flex-1 accent-stone-600"
        onInput={(e) => props.onInput(parseFloat(e.currentTarget.value))}
      />
      <span class="w-16 shrink-0 text-right text-stone-500">
        {props.display}
      </span>
    </label>
  );

  return (
    <div ref={container} class="relative isolate flex-1 overflow-hidden">
      <noscript>
        Unfortunately, you need JavaScript to see the shadows :^(
      </noscript>
      <Show
        when={!failed()}
        fallback={
          <p class="p-8 text-center text-stone-500">
            Your browser can't render this simulation (WebGL unavailable).
          </p>
        }
      >
        <canvas
          ref={canvas}
          class="block h-full w-full"
          role="img"
          aria-label="Animated simulation of dappled tree shadows on the ground"
        />
      </Show>
      <Show
        when={panelOpen()}
        fallback={
          <button
            type="button"
            aria-expanded="false"
            class="absolute bottom-3 left-3 rounded-md bg-stone-100/85 px-3 py-1.5 font-mono text-sm text-stone-700 shadow-md backdrop-blur hover:bg-stone-200/85 sm:bottom-4 sm:left-4"
            onClick={() => setPanelOpen(true)}
          >
            controls
          </button>
        }
      >
      <div class="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-md bg-stone-100/85 p-4 font-mono text-sm shadow-md backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-80">
        <button
          type="button"
          aria-label="hide controls"
          aria-expanded="true"
          class="absolute top-1.5 right-2.5 px-1 text-stone-400 hover:text-stone-700"
          onClick={() => setPanelOpen(false)}
        >
          ×
        </button>
        <Slider
          label="height"
          value={height}
          display={`${Math.round(3 + 27 * height())} m`}
          onInput={(v) => {
            setHeight(v);
            invalidate();
          }}
        />
        <Slider
          label="leaves"
          value={leaves}
          display={sliderToLeafCount(leaves()).toLocaleString("en-US")}
          onInput={(v) => {
            setLeaves(v);
            markCanopyDirty();
            invalidate();
          }}
        />
        <Slider
          label="shape"
          value={shape}
          display={SHAPE_NAMES[Math.round(shape() * 3)]}
          onInput={(v) => {
            setShape(v);
            markCanopyDirty();
            invalidate();
          }}
        />
        <Slider
          label="sun"
          value={sun}
          display={`${Math.round(10 + 80 * sun() * sun())}°`}
          onInput={(v) => {
            setSun(v);
            invalidate();
          }}
        />
        <Slider
          label="wind"
          value={wind}
          display={`${Math.round(100 * wind())}%`}
          onInput={(v) => {
            setWind(v);
            invalidate();
          }}
        />
        <Slider
          label="zoom"
          value={zoom}
          display={`${zoomFactor().toFixed(1)}×`}
          onInput={(v) => {
            setZoom(v);
            invalidate();
          }}
        />
        <div class="mt-1 flex items-center gap-3">
          <span class="w-16 shrink-0 text-stone-700">mood</span>
          <div class="flex gap-1" role="radiogroup" aria-label="color mood">
            {(["warm", "neutral"] as const).map((m) => (
              <button
                type="button"
                role="radio"
                aria-checked={mood() === m}
                class={
                  mood() === m
                    ? "rounded-sm bg-stone-600 px-2 py-0.5 text-stone-100"
                    : "rounded-sm px-2 py-0.5 text-stone-500 hover:bg-stone-200"
                }
                onClick={() => {
                  setMood(m);
                  invalidate();
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      </Show>
    </div>
  );
};

export default ShadowSim;
