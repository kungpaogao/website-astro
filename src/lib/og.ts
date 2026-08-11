/**
 * Shared vocabulary for the social preview images.
 *
 * `Head.astro` points the `og:image` meta tags at these paths and the
 * `og-images` integration writes the files there after the build, so both sides
 * derive the location from the same function and cannot drift apart.
 *
 * Kept free of heavy imports: `Head.astro` renders on every page.
 */

export const SITE_NAME = "Andrew Gao";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const TITLE_SEPARATOR = " | ";

/**
 * Where a route's preview image lives, relative to the site root.
 *
 * @param pathname the rendered route, e.g. `/blog/my-post`
 * @returns e.g. `og/blog/my-post.png`; the home page becomes `og/index.png`
 */
export function ogImagePath(pathname: string): string {
  const route = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return `og/${route || "index"}.png`;
}

/**
 * The `<title>` and `og:title` text for a page. The home page is just the site
 * name; everything else is suffixed with it.
 */
export function composeTitle(title: string, path: string): string {
  return path === "/" ? SITE_NAME : `${title}${TITLE_SEPARATOR}${SITE_NAME}`;
}

/**
 * The inverse of {@link composeTitle}, for recovering the page's own title from
 * a rendered `og:title`. The preview image already carries the site name in its
 * banner, so it wants the bare title.
 */
export function decomposeTitle(fullTitle: string): string {
  const suffix = `${TITLE_SEPARATOR}${SITE_NAME}`;
  return fullTitle.endsWith(suffix)
    ? fullTitle.slice(0, -suffix.length)
    : fullTitle;
}
