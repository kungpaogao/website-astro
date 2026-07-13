import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import {
  elevSliderToRad,
  layerHeights,
  sunLightColor,
} from "../lib/shadow/projection";
import { TAN_SUN_HALF_ANGLE } from "../lib/shadow/projection";
import {
  buildAperture,
  MAX_COVERAGE,
  type ApertureShape,
} from "../lib/shadow2/aperture";
import { drawScene } from "../lib/shadow2/draw";
import {
  attachLeaves,
  sliderToLeavesPerSite,
} from "../lib/shadow2/leaves";
import { generateSkeleton, visibleCount } from "../lib/shadow2/skeleton";
import { buildFragSrc2, VERT_SRC } from "../lib/shadow2/shaders";
import { createPose, flattenPose } from "../lib/shadow2/wind";
import { mulberry32 } from "../lib/shadow/prng";

const TEX_SIZE = 512;
const SUN_AZIMUTH = (35 * Math.PI) / 180;
type Tab = "canopy" | "shadow" | "light";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "canopy", label: "1 canopy" },
  { id: "shadow", label: "2 shadow" },
  { id: "light", label: "3 light" },
];

const SHAPES: ApertureShape[] = ["disk", "ellipse", "crescent"];

const Shadow2Sim: Component = () => {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const [tab, setTab] = createSignal<Tab>("canopy");
  // step 1
  const [branches, setBranches] = createSignal(0.7);
  const [density, setDensity] = createSignal(0.85);
  const [wind, setWind] = createSignal(reducedMotion ? 0 : 0.5);
  const [seedIdx, setSeedIdx] = createSignal(0);
  // step 2
  const [height, setHeight] = createSignal(13 / 27); // 16 m
  const [sun, setSun] = createSignal(0.75); // 55°
  // step 3
  const [lightSize, setLightSize] = createSignal(0.375); // 0.6–3×, → 1.5×
  const [shape, setShape] = createSignal<ApertureShape>("disk");
  const [shapeAmt, setShapeAmt] = createSignal(0.5);

  const [panelOpen, setPanelOpen] = createSignal(true);
  const [failed, setFailed] = createSignal(false);

  const seed = createMemo(() => {
    // deterministic regrow chain
    const rng = mulberry32(20260713 + seedIdx() * 0x9e3779b9);
    return Math.floor(rng() * 4294967296);
  });
  const skeleton = createMemo(() => generateSkeleton(seed()));
  const perSite = () => sliderToLeavesPerSite(density());
  const leaves = createMemo(() => attachLeaves(seed(), skeleton(), perSite()));

  let container!: HTMLDivElement;
  let canvas2d!: HTMLCanvasElement;
  let canvasGl!: HTMLCanvasElement;

  let invalidate = () => {};

  onMount(() => {
    const gl = canvasGl.getContext("webgl", {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
    });
    const ctx2d = canvas2d.getContext("2d");
    if (!gl || !ctx2d) {
      setFailed(true);
      return;
    }

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let K = coarse ? 16 : 32;
    const maxUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    if (typeof maxUniforms === "number" && maxUniforms < 48) K = 16;
    const dprCap = coarse ? 1.5 : 2;

    const texCanvas = document.createElement("canvas");
    texCanvas.width = texCanvas.height = TEX_SIZE;
    const texCtx = texCanvas.getContext("2d")!;

    const pose = createPose(skeleton().length);
    interface Prog {
      program: WebGLProgram;
      u: Record<string, WebGLUniformLocation | null>;
    }
    let hard: Prog | null = null;
    let aperture: Prog | null = null;
    let texture: WebGLTexture | null = null;
    let contextLost = false;
    let occlusionDirty = true;
    let apertureDirty = true;
    let lastRasterKey = "";
    let lastSwayed = false;
    let rafId = 0;
    let frameIndex = 0;
    let rasterEvery = 1;

    function compile(type: number, src: string): WebGLShader {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        throw new Error(gl!.getShaderInfoLog(shader) ?? "shader error");
      }
      return shader;
    }

    const UNIFORMS = [
      "u_resolution",
      "u_metersPerPixel",
      "u_canopy",
      "u_layerHeights",
      "u_sinElev",
      "u_cosElev",
      "u_azDir",
      "u_uvPerMeter",
      "u_lightColor",
      "u_shadowColor",
      "u_ap",
      "u_tanSun",
      "u_apertureGain",
      "u_rhoMax",
      "u_spanPar",
    ];

    function link(frag: string): Prog {
      const program = gl!.createProgram()!;
      gl!.attachShader(program, compile(gl!.VERTEX_SHADER, VERT_SRC));
      gl!.attachShader(program, compile(gl!.FRAGMENT_SHADER, frag));
      gl!.linkProgram(program);
      if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
        throw new Error(gl!.getProgramInfoLog(program) ?? "link error");
      }
      const u: Prog["u"] = {};
      for (const name of UNIFORMS) {
        u[name] = gl!.getUniformLocation(program, name);
      }
      return { program, u };
    }

    function initGL() {
      hard = link(buildFragSrc2({ mode: "hard" }));
      aperture = link(buildFragSrc2({ mode: "aperture", k: K }));

      const buf = gl!.createBuffer();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl!.STATIC_DRAW,
      );
      for (const prog of [hard, aperture]) {
        gl!.useProgram(prog.program);
        const aPos = gl!.getAttribLocation(prog.program, "a_pos");
        gl!.enableVertexAttribArray(aPos);
        gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);
        gl!.uniform1i(prog.u.u_canopy, 0);
      }

      texture = gl!.createTexture();
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      occlusionDirty = true;
      apertureDirty = true;
      lastRasterKey = "";
    }

    function sceneParams(timeS: number) {
      return {
        branches: branches(),
        wind: wind(),
        time: timeS,
        branchStrength: Math.max(
          140,
          Math.min(230, 140 + ((perSite() - 2) / 16) * 90),
        ),
      };
    }

    function updateOcclusion(timeS: number) {
      const swaying = wind() > 0;
      const animTick = swaying && frameIndex % rasterEvery === 0;
      const key = `${seed()}:${branches().toFixed(3)}:${perSite()}`;
      if (key !== lastRasterKey) occlusionDirty = true;
      if (!occlusionDirty && !animTick && lastSwayed === swaying) return;

      const t0 = performance.now();
      flattenPose(skeleton(), timeS, swaying ? wind() : 0, pose);
      drawScene(texCtx, skeleton(), pose, leaves(), sceneParams(timeS), "occlusion");
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        texCanvas,
      );
      occlusionDirty = false;
      lastRasterKey = key;
      lastSwayed = swaying;
      const ms = performance.now() - t0;
      if (ms > 7 && rasterEvery < 3) rasterEvery++;
    }

    function renderGl(timeS: number, mode: "hard" | "aperture") {
      updateOcclusion(timeS);

      const treeHeight = 3 + 27 * height();
      const [hLow, hMid, hHigh] = layerHeights(treeHeight);
      const elev = elevSliderToRad(sun());
      const canopyHalfW = 0.32 * treeHeight;
      const uvPerMeter = (0.5 - 0.07) / canopyHalfW;
      const refWindow = Math.min(10, Math.max(4.5, 1.2 * 0.32 * 16));
      const light = sunLightColor(elev);
      const shadow: [number, number, number] = [0.44, 0.43, 0.51];

      const prog = mode === "hard" ? hard! : aperture!;
      gl!.useProgram(prog.program);
      gl!.uniform2f(prog.u.u_resolution, canvasGl.width, canvasGl.height);
      gl!.uniform1f(
        prog.u.u_metersPerPixel,
        refWindow / Math.min(canvasGl.width, canvasGl.height),
      );
      gl!.uniform3f(prog.u.u_layerHeights, hLow, hMid, hHigh);
      gl!.uniform1f(prog.u.u_sinElev, Math.sin(elev));
      gl!.uniform1f(prog.u.u_cosElev, Math.cos(elev));
      gl!.uniform2f(prog.u.u_azDir, Math.sin(SUN_AZIMUTH), Math.cos(SUN_AZIMUTH));
      gl!.uniform1f(prog.u.u_uvPerMeter, uvPerMeter);
      gl!.uniform3f(prog.u.u_lightColor, ...light);
      gl!.uniform3f(prog.u.u_shadowColor, ...shadow);

      if (mode === "aperture") {
        if (apertureDirty) {
          const ap = buildAperture(
            K,
            shape(),
            shape() === "crescent" ? shapeAmt() * MAX_COVERAGE : shapeAmt(),
          );
          gl!.uniform4fv(prog.u.u_ap, ap.samples);
          gl!.uniform1f(prog.u.u_apertureGain, ap.gain);
          apertureDirty = false;
        }
        const tanSun = TAN_SUN_HALF_ANGLE * (0.6 + 2.4 * lightSize());
        gl!.uniform1f(prog.u.u_tanSun, tanSun);
        gl!.uniform1f(prog.u.u_rhoMax, Math.min(0.14 * canopyHalfW, 0.9));
        const layerGap = 0.2 * treeHeight * Math.cos(elev);
        gl!.uniform1f(
          prog.u.u_spanPar,
          1.4 * Math.max(0, layerGap - 0.55 * canopyHalfW),
        );
      }

      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function render2d(timeS: number) {
      flattenPose(skeleton(), timeS, wind(), pose);
      drawScene(
        ctx2d!,
        skeleton(),
        pose,
        leaves(),
        sceneParams(timeS),
        "canopy",
      );
    }

    function render(timeS: number) {
      if (contextLost) return;
      frameIndex++;
      if (tab() === "canopy") {
        render2d(timeS);
      } else {
        renderGl(timeS, tab() === "shadow" ? "hard" : "aperture");
      }
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

    const markAperture = () => {
      apertureDirty = true;
    };
    apertureInvalidate = () => {
      markAperture();
      invalidate();
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const w = Math.round(container.clientWidth * dpr);
      const h = Math.round(container.clientHeight * dpr);
      if (w !== canvasGl.width || h !== canvasGl.height) {
        canvasGl.width = w;
        canvasGl.height = h;
        gl.viewport(0, 0, w, h);
      }
      if (w !== canvas2d.width || h !== canvas2d.height) {
        canvas2d.width = w;
        canvas2d.height = h;
      }
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
    canvasGl.addEventListener("webglcontextlost", onContextLost);
    canvasGl.addEventListener("webglcontextrestored", onContextRestored);

    onCleanup(() => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvasGl.removeEventListener("webglcontextlost", onContextLost);
      canvasGl.removeEventListener("webglcontextrestored", onContextRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    });

    try {
      initGL();
    } catch (err) {
      console.error("shadow2: WebGL init failed", err);
      setFailed(true);
      return;
    }
    resize();
    invalidate();
  });

  let apertureInvalidate = () => {};

  const Slider: Component<{
    label: string;
    value: () => number;
    display: string;
    onInput: (v: number) => void;
  }> = (props) => (
    <label class="flex items-center gap-3">
      <span class="w-18 shrink-0 text-stone-700">{props.label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={props.value()}
        class="min-w-0 flex-1 accent-stone-600"
        onInput={(e) => props.onInput(parseFloat(e.currentTarget.value))}
      />
      <span class="w-14 shrink-0 text-right text-stone-500">
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
          ref={canvas2d}
          class="block h-full w-full"
          classList={{ hidden: tab() !== "canopy" }}
          role="img"
          aria-label="Schematic view of the generated tree canopy"
        />
        <canvas
          ref={canvasGl}
          class="block h-full w-full"
          classList={{ hidden: tab() === "canopy" }}
          role="img"
          aria-label="Simulated tree shadow on the ground"
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
        <div class="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-md bg-stone-100/85 p-4 font-mono text-sm shadow-md backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-88">
          <button
            type="button"
            aria-label="hide controls"
            aria-expanded="true"
            class="absolute top-1.5 right-2.5 px-1 text-stone-400 hover:text-stone-700"
            onClick={() => setPanelOpen(false)}
          >
            ×
          </button>
          <div class="flex gap-1" role="radiogroup" aria-label="pipeline step">
            {TABS.map((t) => (
              <button
                type="button"
                role="radio"
                aria-checked={tab() === t.id}
                class={
                  tab() === t.id
                    ? "rounded-sm bg-stone-600 px-2 py-0.5 text-stone-100"
                    : "rounded-sm px-2 py-0.5 text-stone-500 hover:bg-stone-200"
                }
                onClick={() => {
                  setTab(t.id);
                  invalidate();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <Show when={tab() === "canopy"}>
            <Slider
              label="branches"
              value={branches}
              display={`${visibleCount(skeleton(), branches())}`}
              onInput={(v) => {
                setBranches(v);
                invalidate();
              }}
            />
            <Slider
              label="leaves"
              value={density}
              display={`${perSite()}/twig`}
              onInput={(v) => {
                setDensity(v);
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
            <button
              type="button"
              class="self-start rounded-sm px-2 py-0.5 text-stone-500 hover:bg-stone-200"
              onClick={() => {
                setSeedIdx(seedIdx() + 1);
                invalidate();
              }}
            >
              regrow ⟳
            </button>
          </Show>

          <Show when={tab() === "shadow"}>
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
          </Show>

          <Show when={tab() === "light"}>
            <Slider
              label="light size"
              value={lightSize}
              display={`${(0.6 + 2.4 * lightSize()).toFixed(1)}×`}
              onInput={(v) => {
                setLightSize(v);
                invalidate();
              }}
            />
            <div class="flex items-center gap-3">
              <span class="w-18 shrink-0 text-stone-700">source</span>
              <div class="flex gap-1" role="radiogroup" aria-label="light source shape">
                {SHAPES.map((s) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={shape() === s}
                    class={
                      shape() === s
                        ? "rounded-sm bg-stone-600 px-2 py-0.5 text-stone-100"
                        : "rounded-sm px-2 py-0.5 text-stone-500 hover:bg-stone-200"
                    }
                    onClick={() => {
                      setShape(s);
                      apertureInvalidate();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Show when={shape() !== "disk"}>
              <Slider
                label={shape() === "crescent" ? "eclipse" : "squash"}
                value={shapeAmt}
                display={`${Math.round(100 * shapeAmt())}%`}
                onInput={(v) => {
                  setShapeAmt(v);
                  apertureInvalidate();
                }}
              />
            </Show>
            <Slider
              label="sun"
              value={sun}
              display={`${Math.round(10 + 80 * sun() * sun())}°`}
              onInput={(v) => {
                setSun(v);
                invalidate();
              }}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default Shadow2Sim;
