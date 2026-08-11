/**
 * `Head.astro` points the `og:image` meta tags at these paths and the
 * `og-images` integration writes the files there after the build, so both sides
 * derive the location from the same function and cannot drift apart.
 */

export const SITE_NAME = "Andrew Gao";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

const TITLE_SEPARATOR = " | ";

/** `/blog/my-post` becomes `og/blog/my-post.png`; the home page, `og/index.png`. */
export function ogImagePath(pathname: string): string {
  const route = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return `og/${route || "index"}.png`;
}

export function composeTitle(title: string, path: string): string {
  return path === "/" ? SITE_NAME : `${title}${TITLE_SEPARATOR}${SITE_NAME}`;
}

/**
 * The inverse of {@link composeTitle}: the preview image carries the site name
 * in its banner already, so it wants the page's bare title.
 */
export function decomposeTitle(fullTitle: string): string {
  const suffix = `${TITLE_SEPARATOR}${SITE_NAME}`;
  return fullTitle.endsWith(suffix)
    ? fullTitle.slice(0, -suffix.length)
    : fullTitle;
}
