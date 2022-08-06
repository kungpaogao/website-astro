import {
  Asset,
  AssetRequest,
  CMS,
  CMSPage,
  getAssetKey,
  getAssetRequestKey,
  inferDatabaseSchema,
  NotionClient,
  parseAssetRequestUrl,
  richTextAsPlainText,
} from "@jitl/notion-api";
import path from "path";

const { NOTION_TOKEN, NOTION_PROJECTS_DATABASE, NOTION_PAGES_DATABASE } =
  import.meta.env;

const notion = new NotionClient({
  auth: NOTION_TOKEN,
});

export const Projects = new CMS({
  database_id: NOTION_PROJECTS_DATABASE,
  notion,
  schema: inferDatabaseSchema({
    title: { type: "title" },
    slug: { type: "rich_text" },
    public: { type: "checkbox" },
    dates: { type: "rich_text" },
    published: { type: "date" },
    preview: { type: "files" },
    tags: { type: "multi_select" },
  }),
  slug: "slug",
  visible: "public",
  getFrontmatter: ({ properties, defaultFrontmatter: { slug } }) => {
    const props = {
      title: richTextAsPlainText(properties.title),
      tags: properties.tags,
      dates: richTextAsPlainText(properties.dates),
    };
    return {
      ...props,
      httpRoute: `/projects/${slug}`,
    };
  },
  cache: {
    directory: path.resolve(".notion-cache"),
  },
  assets: {
    directory: path.resolve("public/assets"),
    downloadExternalAssets: true,
  },
});

const pagesSchema = {
  title: { type: "title" },
  path: { type: "rich_text" },
  public: { type: "checkbox" },
};

export const Pages = new CMS({
  database_id: NOTION_PAGES_DATABASE,
  notion,
  schema: inferDatabaseSchema({
    title: { type: "title" },
    path: { type: "rich_text" },
    public: { type: "checkbox" },
  }),
  slug: "path",
  visible: "public",
  getFrontmatter: ({ properties, defaultFrontmatter: { slug } }) => {
    const props = {
      title: richTextAsPlainText(properties.title),
    };
    return {
      ...props,
      httpRoute: `/projects/${slug}`,
    };
  },
  cache: {
    directory: path.resolve(".notion-cache"),
  },
  assets: {
    directory: path.resolve("public/assets"),
    downloadExternalAssets: true,
  },
});

export async function getAssetPathCMS(cms: CMS<any, any>, asset: Asset) {
  // e461ce21-5ebb-4e71-a2a4-264a221735ef
  const assets = cms.assets;
  if (!assets) throw new Error("Assets not configured");
  if (asset.type === "file") {
    const parsedAssetRequest = parseAssetRequestUrl(
      asset.file.url,
      new URL("localhost:3000/")
    );
    const filename = await assets.getCachedAsset(
      parsedAssetRequest.assetRequest
    );
    // if (!filename) return undefined;
    return `/assets/${filename}`;
  }
  return "";
}

export function getAssetPath(asset: Asset) {
  const filename = getAssetKey(asset);
  return `/assets/${filename}`;
}

export function remapAssetPath(cmsPage: CMSPage<any>) {
  console.log(cmsPage);
}
