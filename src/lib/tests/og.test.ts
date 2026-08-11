import { describe, expect, it } from "vitest";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  composeTitle,
  decomposeTitle,
  ogImagePath,
} from "../og";
import { readMetaTags, decodeEntities } from "../og-meta";
import { renderOgPng, renderOgSvg } from "../og-image";

describe("ogImagePath", () => {
  it("names the home page image index", () => {
    expect(ogImagePath("/")).toBe("og/index.png");
    expect(ogImagePath("")).toBe("og/index.png");
  });

  it("mirrors the route", () => {
    expect(ogImagePath("/blog/my-post")).toBe("og/blog/my-post.png");
  });

  it("ignores trailing slashes, so the page and the build agree", () => {
    // `Astro.url.pathname` and the build's page pathnames punctuate differently.
    expect(ogImagePath("/blog/my-post/")).toBe(ogImagePath("blog/my-post"));
  });
});

describe("titles", () => {
  it("suffixes the site name", () => {
    expect(composeTitle("Blog", "/blog")).toBe(`Blog | ${SITE_NAME}`);
  });

  it("leaves the home page as the site name alone", () => {
    expect(composeTitle("Andrew Gao", "/")).toBe(SITE_NAME);
  });

  it("recovers the page's own title", () => {
    for (const [title, path] of [
      ["Blog", "/blog"],
      ["Andrew Gao", "/"],
      ["A title with | a pipe in it", "/pipe"],
      ["", "/unconfigured"],
    ]) {
      expect(decomposeTitle(composeTitle(title, path))).toBe(
        path === "/" ? SITE_NAME : title,
      );
    }
  });
});

describe("readMetaTags", () => {
  const html = `<!doctype html><html><head>
    <meta charset="UTF-8">
    <title>Blog | Andrew Gao</title>
    <meta name="description" content="Plain description">
    <meta property="og:title" content="Blog &#38; more | Andrew Gao">
    <meta property="og:description" content="Notes on &quot;things&quot;">
    <meta property="og:image" content="https://www.andrewgao.org/og/blog.png">
    <meta property="og:image:alt" content="Blog | Andrew Gao">
  </head><body></body></html>`;

  it("keys tags by property or name", () => {
    const tags = readMetaTags(html);
    expect(tags.get("og:image")).toBe("https://www.andrewgao.org/og/blog.png");
    expect(tags.get("description")).toBe("Plain description");
  });

  it("does not confuse og:image with its sub-properties", () => {
    expect(readMetaTags(html).get("og:image:alt")).toBe("Blog | Andrew Gao");
  });

  it("undoes attribute escaping", () => {
    const tags = readMetaTags(html);
    expect(tags.get("og:title")).toBe("Blog & more | Andrew Gao");
    expect(tags.get("og:description")).toBe('Notes on "things"');
  });

  it("skips tags without a key or content", () => {
    expect(readMetaTags(html).has("charset")).toBe(false);
  });

  it("decodes hex and decimal references, and leaves unknowns alone", () => {
    expect(decodeEntities("&#x2014;&#8212;&notanentity;")).toBe(
      "——&notanentity;",
    );
  });
});

describe("renderOgSvg", () => {
  it("renders at the size the meta tags advertise", async () => {
    const svg = await renderOgSvg({
      title: "Bridge",
      description: "Play a hand of contract bridge against three robots.",
    });

    expect(svg).toContain(`width="${OG_IMAGE_WIDTH}"`);
    expect(svg).toContain(`height="${OG_IMAGE_HEIGHT}"`);
  });

  it("draws the 高 in the banner", async () => {
    // Satori drops glyphs it has no font for, so a card without the CJK subset
    // would render the banner empty. The banner is the only black fill.
    const svg = await renderOgSvg({ title: "Blog", description: "" });
    const banner = svg.slice(svg.indexOf('fill="#000000"'));

    expect(banner).toContain("<path");
  });

  it("survives a page with no title or description", async () => {
    await expect(
      renderOgSvg({ title: "", description: "" }),
    ).resolves.toContain(`width="${OG_IMAGE_WIDTH}"`);
  });

  it("renders a long title without overflowing the card", async () => {
    const svg = await renderOgSvg({
      title: "A very long title ".repeat(20),
      description: "And a description that keeps going on and on. ".repeat(20),
    });

    const ys = [...svg.matchAll(/\sy="(-?[\d.]+)"/g)].map(([, y]) => Number(y));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(OG_IMAGE_HEIGHT);
  });
});

describe("renderOgPng", () => {
  it("rasterizes at the advertised size", async () => {
    const { default: sharp } = await import("sharp");
    const png = await renderOgPng({ title: "Blog", description: "Notes." });
    const { width, height, format } = await sharp(png).metadata();

    expect({ width, height, format }).toEqual({
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      format: "png",
    });
  });
});
