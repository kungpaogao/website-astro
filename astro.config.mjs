import { defineConfig, fontProviders } from "astro/config";
import solid from "@astrojs/solid-js";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

import { rehypeAccessibleEmojis } from "rehype-accessible-emojis";
import { accessibleListItem } from "./src/lib/remark-rehype-accessible-list-item";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://www.andrewgao.org/",

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
