import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SatoriOptions } from "satori";

/**
 * Fonts for build-time image rendering.
 *
 * - `Inter-Medium.woff` — the site's sans, already here for `satori.tsx`.
 * - `NotoSansSC-Medium-Subset.ttf` — 1.5 kB holding one glyph, 高. In a browser
 *   the site sets that character in Arial and lets the reader's OS supply a CJK
 *   fallback; Satori has no OS to fall back to, and neither Inter nor Newsreader
 *   carries CJK, so the banner would render as an empty black bar without it.
 *   From Google Fonts' Noto Sans SC; see `NotoSansSC-OFL.txt`.
 *
 * Adding more here is a real cost, and rarely the answer: Satori reads `ttf`,
 * `otf` and `woff` but not the variable `woff2` the site serves, so every family
 * needs its own converted copy.
 */
const FONT_FILES = [
  { name: "Inter", file: "Inter-Medium.woff" },
  { name: "Noto Sans SC", file: "NotoSansSC-Medium-Subset.ttf" },
];

let fonts: Promise<SatoriOptions["fonts"]> | undefined;

/** Loads the fonts once per process and hands the same array to every render. */
export function loadSatoriFonts(): Promise<SatoriOptions["fonts"]> {
  fonts ??= Promise.all(
    FONT_FILES.map(async ({ name, file }) => ({
      name,
      data: await readFile(join(process.cwd(), "public", "fonts", file)),
      weight: 500 as const,
      style: "normal" as const,
    })),
  );

  return fonts;
}
