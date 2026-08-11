import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SatoriOptions } from "satori";

/**
 * Satori reads `ttf`, `otf` and `woff` but not the variable `woff2` the site
 * serves, so each family needs its own converted copy checked in. Adding a
 * fourth is a real cost.
 *
 * `Newsreader-Medium.woff` is not a new typeface: it is the repo's own
 * `src/assets/fonts/Newsreader-Variable-Latin.woff2`, pinned to `wght` 500 and
 * `opsz` 36 with fontTools' instancer.
 *
 * The Noto subset is 1.5 kB holding one glyph, 高. The site sets that character
 * in Arial and lets the reader's OS supply a CJK fallback, which Satori has no
 * equivalent of, so the banner renders as an empty black bar without it. From
 * Google Fonts; see `NotoSansSC-OFL.txt`.
 */
const FONT_FILES = [
  { name: "Inter", file: "Inter-Medium.woff" },
  { name: "Newsreader", file: "Newsreader-Medium.woff" },
  { name: "Noto Sans SC", file: "NotoSansSC-Medium-Subset.ttf" },
];

let fonts: Promise<SatoriOptions["fonts"]> | undefined;

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
