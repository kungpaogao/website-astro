import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SatoriOptions } from "satori";

/**
 * Fonts for build-time image rendering.
 *
 * Satori reads `ttf`, `otf` and `woff` only, so these are separate files from
 * the variable `woff2` fonts the site itself serves:
 *
 * - `Inter-Medium.woff` — the sans the site uses for body copy and chrome.
 * - `Newsreader-Medium.woff` — the serif the site uses for headings, pinned to
 *   `wght` 500 / `opsz` 36 out of `src/assets/fonts/Newsreader-Variable-Latin.woff2`.
 * - `NotoSansSC-Medium-Subset.ttf` — Latin fonts carry no CJK, and the banner is
 *   a 高. Subset to the three characters the site actually sets (高崧柏), from
 *   Google Fonts' Noto Sans SC; see `NotoSansSC-OFL.txt`.
 */
const FONT_FILES = [
  { name: "Inter", file: "Inter-Medium.woff" },
  { name: "Newsreader", file: "Newsreader-Medium.woff" },
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
