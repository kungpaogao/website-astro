import { defineConfig, fontProviders } from "astro/config";
import solid from "@astrojs/solid-js";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

import { rehypeAccessibleEmojis } from "rehype-accessible-emojis";
import { accessibleListItem } from "./src/lib/remark-rehype-accessible-list-item";
import ogImages from "./src/integrations/og-images";

import tailwindcss from "@tailwindcss/vite";

/**
 * The origin this build will be served from, which every absolute URL on the
 * site is resolved against: canonical links, `og:url`, the sitemap, and the
 * social preview images.
 *
 * Vercel serves preview deployments from a generated domain, so a preview built
 * against the production origin advertises a card that lives on
 * www.andrewgao.org — production's image for a page that already exists, and a
 * 404 for one that does not exist there yet. `VERCEL_URL` is the deployment's
 * own domain, and is set for us during the build.
 */
const site =
  process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/`
    : "https://www.andrewgao.org/";

// https://astro.build/config
export default defineConfig({
  site,

  fonts: [
    {
      provider: fontProviders.local(),
      name: "Inter",
      cssVariable: "--font-inter",
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["./src/assets/fonts/Inter-Variable-Latin.woff2"],
            display: "swap",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["./src/assets/fonts/Newsreader-Variable-Latin.woff2"],
            display: "swap",
          },
        ],
      },
    },
  ],

  integrations: [
    solid(),
    react({
      include: ["**/satori.tsx"],
    }),
    sitemap({
      filter: (page) => !page.includes(".json"),
    }),
    mdx(),
    ogImages(),
  ],

  markdown: {
    rehypePlugins: [rehypeAccessibleEmojis],
    remarkRehype: {
      handlers: {
        listItem(state, node, parent) {
          return accessibleListItem(state, node, parent);
        },
      },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
