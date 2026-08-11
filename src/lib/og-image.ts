import satori from "satori";
import sharp from "sharp";
import { loadSatoriFonts } from "./satori-fonts";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME } from "./og";

export interface OgImageContent {
  /** The page's own title, without the site name. */
  title: string;
  description: string;
}

/** The site's palette, as flat hex so nothing depends on the Tailwind runtime. */
const BLACK = "#000000";
const STONE_100 = "#f5f5f4";
const STONE_600 = "#57534e";
const STONE_900 = "#1c1917";

const PADDING = 56;
const BANNER_HEIGHT = 104;

const MAX_TITLE_LENGTH = 90;
const MAX_DESCRIPTION_LENGTH = 160;

type Node = { type: string; props: Record<string, unknown> };

/** Satori takes React-shaped nodes; this builds them without pulling in React. */
function el(
  type: string,
  style: Record<string, unknown>,
  children?: Node | Node[] | string,
): Node {
  return { type, props: { style, children } };
}

/** Trims to a whole word where it can, so titles do not end mid-syllable. */
function truncate(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;

  const clipped = collapsed.slice(0, limit - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > limit / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/** Long titles step down so three lines still clear the description. */
function titleFontSize(title: string): number {
  if (title.length <= 24) return 76;
  if (title.length <= 44) return 60;
  return 48;
}

/**
 * The preview card: a black banner in the shape of the site's navigation, then
 * the page's title and description on the site's usual stone background.
 */
function card({ title, description }: OgImageContent): Node {
  const heading = truncate(title || SITE_NAME, MAX_TITLE_LENGTH);
  const standfirst = truncate(description ?? "", MAX_DESCRIPTION_LENGTH);

  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      padding: PADDING,
      backgroundColor: STONE_100,
      fontFamily: "Inter",
    },
    [
      el(
        "div",
        {
          display: "flex",
          alignItems: "center",
          height: BANNER_HEIGHT,
          paddingLeft: 24,
          paddingRight: 24,
          backgroundColor: BLACK,
        },
        el(
          "div",
          {
            fontFamily: "Inter, Noto Sans SC",
            fontSize: 60,
            lineHeight: 1,
            color: STONE_100,
          },
          "高",
        ),
      ),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: 32,
          paddingBottom: 32,
        },
        [
          el(
            "div",
            {
              fontSize: titleFontSize(heading),
              lineHeight: 1.3,
              color: STONE_900,
            },
            heading,
          ),
          ...(standfirst
            ? [
                el(
                  "div",
                  {
                    marginTop: 24,
                    fontSize: 32,
                    lineHeight: 1.5,
                    color: STONE_600,
                  },
                  standfirst,
                ),
              ]
            : []),
        ],
      ),
    ],
  );
}

/** Renders the preview card as SVG. Useful on its own for previewing in dev. */
export async function renderOgSvg(content: OgImageContent): Promise<string> {
  return satori(card(content) as never, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: await loadSatoriFonts(),
  });
}

/**
 * Renders the preview card as PNG, which is what the social crawlers want —
 * neither X nor Facebook will fetch an SVG `og:image`.
 */
export async function renderOgPng(content: OgImageContent): Promise<Buffer> {
  // sharp is imported eagerly rather than on demand: this runs from the
  // `astro:build:done` hook, by which point Vite's module runner is closed and
  // a dynamic import can no longer be resolved.
  return sharp(Buffer.from(await renderOgSvg(content)))
    .png()
    .toBuffer();
}
