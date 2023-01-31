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
  slug: ({ data }) => data.slug,
  schema: projectSchema,
});

const blog = defineCollection({
  slug: ({ data }) => data.slug,
  schema: blogSchema,
});

export const collections = {
  projects: projects,
  blog: blog,
};
