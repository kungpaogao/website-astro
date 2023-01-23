declare module 'astro:content' {
	export { z } from 'astro/zod';
	export type CollectionEntry<C extends keyof typeof entryMap> =
		typeof entryMap[C][keyof typeof entryMap[C]] & Render;

	type BaseCollectionConfig<S extends import('astro/zod').ZodRawShape> = {
		schema?: S;
		slug?: (entry: {
			id: CollectionEntry<keyof typeof entryMap>['id'];
			defaultSlug: string;
			collection: string;
			body: string;
			data: import('astro/zod').infer<import('astro/zod').ZodObject<S>>;
		}) => string | Promise<string>;
	};
	export function defineCollection<S extends import('astro/zod').ZodRawShape>(
		input: BaseCollectionConfig<S>
	): BaseCollectionConfig<S>;

	export function getEntry<C extends keyof typeof entryMap, E extends keyof typeof entryMap[C]>(
		collection: C,
		entryKey: E
	): Promise<typeof entryMap[C][E] & Render>;
	export function getCollection<
		C extends keyof typeof entryMap,
		E extends keyof typeof entryMap[C]
	>(
		collection: C,
		filter?: (data: typeof entryMap[C][E]) => boolean
	): Promise<(typeof entryMap[C][E] & Render)[]>;

	type InferEntrySchema<C extends keyof typeof entryMap> = import('astro/zod').infer<
		import('astro/zod').ZodObject<Required<ContentConfig['collections'][C]>['schema']>
	>;

	type Render = {
		render(): Promise<{
			Content: import('astro').MarkdownInstance<{}>['Content'];
			headings: import('astro').MarkdownHeading[];
			injectedFrontmatter: Record<string, any>;
		}>;
	};

	const entryMap: {
		"blog": {
"84b088e8-7039-4acb-aae4-0074933f3d74.mdx": {
  id: "84b088e8-7039-4acb-aae4-0074933f3d74.mdx",
  slug: string,
  body: string,
  collection: "blog",
  data: InferEntrySchema<"blog">
},
},
"projects": {
"2a790f2c-d301-450b-bb4d-929153003de8.mdx": {
  id: "2a790f2c-d301-450b-bb4d-929153003de8.mdx",
  slug: string,
  body: string,
  collection: "projects",
  data: InferEntrySchema<"projects">
},
"a8a556c5-17cd-42e7-a3f7-0fe42e48538b.mdx": {
  id: "a8a556c5-17cd-42e7-a3f7-0fe42e48538b.mdx",
  slug: string,
  body: string,
  collection: "projects",
  data: InferEntrySchema<"projects">
},
"f277f1c5-34e0-4191-8ba6-b3910415cc48.mdx": {
  id: "f277f1c5-34e0-4191-8ba6-b3910415cc48.mdx",
  slug: string,
  body: string,
  collection: "projects",
  data: InferEntrySchema<"projects">
},
},

	};

	type ContentConfig = typeof import("./config");
}
