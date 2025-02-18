import { glob } from "astro/loaders";
import { z, defineCollection } from "astro:content";

const projectSchema = z.object({
  lastEditedTime: z.string().transform((str) => new Date(str)),
  published: z.string(),
  description: z.string(),
  path: z.string(),
  dates: z.string(),
  tags: z.string(),
  public: z.string(),
  title: z.string(),
});

const blogSchema = z.object({
  lastEditedTime: z.string().transform((str) => new Date(str)),
  published: z.string(),
  description: z.string(),
  path: z.string(),
  tags: z.string(),
  public: z.string(),
  title: z.string(),
});

const projects = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/projects",
  }),
  schema: projectSchema,
});

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/blog",
  }),
  schema: blogSchema,
});

export const collections = {
  projects: projects,
  blog: blog,
};
