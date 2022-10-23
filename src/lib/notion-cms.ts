import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints";
import * as fs from "fs";
import fetch from "node-fetch";
import * as mime from "mime-types";
import * as path from "path";
import { getPageProperties } from "./notion-cms-page";

const { NOTION_TOKEN, NOTION_PROJECTS_DATABASE } = import.meta.env;

// TODO: parametrize base path
const ASSET_BASE_PATH = "public/assets/";

export const notion = new Client({
  auth: NOTION_TOKEN,
});

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
export function ensureFullResponse<T, PT>(result: T | PT): T {
  return result as Extract<T, { parent: {} }>;
}

/**
 * It takes a Notion database query and returns an unpaginated list of all the
 * pages
 * @param {QueryDatabaseParameters} options - QueryDatabaseParameters
 * @returns An array of pages
 */
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

    // if file already exists, do not rewrite
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
 * Gets full content of a block
 * @param {string} blockId - The ID of the block you want to get the content of
 * @returns An array of block objects
 */
export async function getBlock(blockId: string) {
  // TODO: add check to see if page is public

  let content = await getBlockChildren(blockId);

  return Promise.all(
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
        (block as any).children = await getBlockChildren(block.id);
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
    const pageProperties = await getPageProperties(project.id);

    return {
      params: {
        slug: pageProperties.slug,
      },
      props: {
        post: await getBlock(project.id),
        properties: pageProperties,
      },
    };
  });

  return Promise.all(params);
}
