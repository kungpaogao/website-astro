import { z, defineCollection } from "astro:content";

const postSchema = z.object({
  lastEditedTime: z.string().transform((str) => new Date(str)),
  published: z.string(),
  description: z.string(),
  path: z.string(),
  dates: z.string(),
  tags: z.string(),
  public: z.string(),
  image: z.string(),
  title: z.string(),
});

const projects = defineCollection({
  slug: ({ data }) => data.slug,
  schema: postSchema,
});

const blog = defineCollection({
  slug: ({ data }) => data.slug,
  schema: postSchema,
});

export const collections = {
  projects: projects,
  blog: blog,
};
