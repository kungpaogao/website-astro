import { z, defineCollection } from "astro:content";

const projects = defineCollection({
  slug: ({ data }) => data.slug,
  schema: {
    lastEditedTime: z.string().transform((str) => new Date(str)),
    published: z.string(),
    description: z.string(),
    path: z.string(),
    dates: z.string(),
    tags: z.string(),
    public: z.string(),
    slug: z.string(),
    image: z.string(),
    title: z.string(),
  },
});

export const collections = {
  projects: projects,
};
