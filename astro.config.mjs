import { defineConfig } from "astro/config";
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
