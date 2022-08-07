import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
  RichTextPropertyItemObjectResponse,
  TitlePropertyItemObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import * as fs from "fs";
import fetch from "node-fetch";
import * as mime from "mime-types";
import * as path from "path";

const { NOTION_TOKEN, NOTION_PROJECTS_DATABASE, NOTION_PAGES_DATABASE } =
  import.meta.env;

// TODO: parametrize base path
const ASSET_BASE_PATH = "public/assets/";

const notion = new Client({
  auth: NOTION_TOKEN,
});

/**
 * It takes a page ID and a property ID, and returns the value of the property
 * see: https://github.com/makenotion/notion-sdk-js/blob/6ce697f29de208b4c6d4cad23d4ab7b28862c93f/examples/database-email-update/index.js#L168
 * @param {string} pageId - the id of the page you want to get the property value
 * from
 * @param {string} propertyId - the id of the property you want to get the value of
 * @returns An array of property items.
 */
async function getPropertyValue(pageId: string, propertyId: string) {
  let propertyItem = await notion.pages.properties.retrieve({
    page_id: pageId,
    property_id: propertyId,
  });
  if (propertyItem.object === "property_item") {
    return propertyItem;
  }

  let nextCursor = propertyItem.next_cursor;
  const results = propertyItem.results;

  while (nextCursor !== null) {
    propertyItem = await notion.pages.properties.retrieve({
      page_id: pageId,
      property_id: propertyId,
      start_cursor: nextCursor,
    });

    // this should never happen, but this just makes sure the type is correct
    // below
    if (propertyItem.object === "property_item") {
      break;
    }

    nextCursor = propertyItem.next_cursor;
    results.push(...propertyItem.results);
  }

  return results;
}

/**
 * If the result is a partial response, return the full response.
 *
 * The function is generic, so it can be used with any type of response. The first
 * generic type parameter, T, is the type of the full response. The second generic
 * type parameter, PT, is the type of the partial response
 * @param {T | PT} result - T | PT
 * @returns The function ensureFullResponse is returning the result as an extract
 * of T and { parent: {} }.
 */
function ensureFullResponse<T, PT>(result: T | PT): T {
  return result as Extract<T, { parent: {} }>;
}

async function queryNotionDatabase(
  options: QueryDatabaseParameters
): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor = undefined;

  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      ...options,
      start_cursor: cursor,
    });

    for (const result of results) {
      // extract to make sure it is not partial response:
      // https://github.com/makenotion/notion-sdk-js/issues/219#issuecomment-1016095615
      const page = ensureFullResponse<
        PageObjectResponse,
        PartialPageObjectResponse
      >(result);
      pages.push(page);
    }

    if (!next_cursor) {
      break;
    }
  }

  return pages;
}

/**
 * It takes a block ID and returns a list of all the children of that block
 * @param {string} blockId - The ID of the block you want to get the children of.
 * @returns An array of blocks
 */
async function getBlockChildren(blockId: string) {
  const query = {
    block_id: blockId,
    page_size: 100,
  };

  let block = await notion.blocks.children.list(query);
  let children = [...block.results];

  while (block.has_more) {
    block = await notion.blocks.children.list({
      ...query,
      start_cursor: block.next_cursor ?? undefined,
    });
    children.push(...block.results);
  }

  return children;
}

/**
 * It downloads the asset from Notion, saves it to the `/assets` folder, and
 * returns the path to the asset
 * @param {string} blockId - the id of the block
 * @param {string} url - The URL of the asset to download
 * @returns path to asset
 */
export async function downloadAsset(
  blockId: string,
  url: string
): Promise<string> {
  try {
    const res = await fetch(url);
    const ext = mime.extension(res.headers.get("content-type")) || "unknown";
    const filename = `file.${blockId}.${ext}`;

    //if file already exists, do not rewrite
    // see: https://github.com/justjake/monorepo/blob/d1e87174827005fa7fd6d158a0a1d7e86dd2a396/packages/notion-api/src/lib/assets.ts#L460
    const files = await fs.promises.readdir(ASSET_BASE_PATH);
    if (!files.find((file) => file === filename)) {
      const dest = path.join(ASSET_BASE_PATH, filename);
      const file = fs.createWriteStream(dest);
      res.body.pipe(file);
    }

    return `/assets/${filename}`;
  } catch (e) {
    // on error, just return Notion URL
    return url;
  }
}

/**
 * It takes a block ID, gets the children of that block, and then gets the children
 * of each of those children
 * @param {string} blockId - The ID of the block you want to get the children of.
 * @returns An array of block objects.
 */
export async function getPostContent(blockId: string) {
  let content = await getBlockChildren(blockId);

  return await Promise.all(
    content.map(async (blockResponse) => {
      const block = ensureFullResponse<
        BlockObjectResponse,
        PartialBlockObjectResponse
      >(blockResponse);

      // if local file, download the file and remap the url to local path
      const blockType = block.type;
      if (
        blockType === "image" ||
        blockType === "video" ||
        blockType === "audio" ||
        blockType === "pdf"
        // ignore file because we don't want all file types
        // || blockType === "file"
      ) {
        if (block[blockType].type === "file") {
          block[blockType].file.url = await downloadAsset(
            block.id,
            block[blockType].file.url
          );
        }
      }

      // if block has children, recursively call getBlockChildren
      if (block.has_children) {
        block[block.type].children = await getBlockChildren(block.id);
      }

      return block;
    })
  );
}

export async function getProjectPaths() {
  const projects = await queryNotionDatabase({
    database_id: NOTION_PROJECTS_DATABASE,
    filter: {
      and: [
        {
          property: "public",
          checkbox: {
            equals: true,
          },
        },
      ],
    },
    sorts: [
      {
        property: "published",
        direction: "descending",
      },
    ],
  });

  const params = projects.map(async (project) => {
    const slugResponse = (await getPropertyValue(
      project.id,
      project.properties.slug.id
    )) as RichTextPropertyItemObjectResponse[];
    const titleResponse = (await getPropertyValue(
      project.id,
      project.properties.title.id
    )) as TitlePropertyItemObjectResponse[];

    return {
      params: {
        slug: slugResponse.map((text) => text.rich_text.plain_text).join(""),
      },
      props: {
        title: titleResponse.map((text) => text.title.plain_text).join(""),
        post: await getPostContent(project.id),
      },
    };
  });

  return await Promise.all(params);
}
