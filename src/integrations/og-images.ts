import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroConfig, AstroIntegration } from "astro";
import { renderOgPng } from "../lib/og-image";
import { readMetaTags } from "../lib/og-meta";
import { decomposeTitle, ogImagePath } from "../lib/og";

/** Where a route's HTML could have landed, given either build format. */
function pageCandidates(pathname: string): string[] {
  const directory =
    pathname === "" || pathname.endsWith("/") ? pathname : `${pathname}/`;

  return directory === ""
    ? ["index.html"]
    : [`${directory}index.html`, `${directory.slice(0, -1)}.html`];
}

async function readPage(dir: URL, pathname: string): Promise<string | null> {
  for (const candidate of pageCandidates(pathname)) {
    try {
      return await readFile(new URL(candidate, dir), "utf-8");
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Renders a social preview image for every page of the build.
 *
 * Runs after the pages are written so it can take each page's title and
 * description straight from its own `og:` meta tags. A page that was given an
 * explicit `imageUrl` points its `og:image` somewhere else and is left alone.
 */
export default function ogImages(): AstroIntegration {
  let config: AstroConfig;

  return {
    name: "og-images",
    hooks: {
      "astro:config:done": ({ config: resolved }) => {
        config = resolved;
      },

      "astro:build:done": async ({ dir, pages, logger }) => {
        if (!config.site) {
          logger.warn("No `site` configured, skipping social preview images");
          return;
        }

        let generated = 0;

        for (const { pathname } of pages) {
          const html = await readPage(dir, pathname);
          if (html === null) {
            logger.warn(
              `No HTML found for /${pathname}, skipping its preview image`,
            );
            continue;
          }

          const meta = readMetaTags(html);
          const imagePath = ogImagePath(pathname);
          const expected = new URL(imagePath, config.site).href;
          if (meta.get("og:image") !== expected) continue;

          const png = await renderOgPng({
            title: decomposeTitle(meta.get("og:title") ?? ""),
            description: meta.get("og:description") ?? "",
          });

          const file = new URL(imagePath, dir);
          await mkdir(dirname(fileURLToPath(file)), { recursive: true });
          await writeFile(file, png);
          generated++;
        }

        logger.info(`Generated ${generated} social preview images`);
      },
    },
  };
}
