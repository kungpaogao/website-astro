import { Client } from "@notionhq/client";
import {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialPageObjectResponse,
  QueryDatabaseParameters,
} from "@notionhq/client/build/src/api-endpoints";
import { getPageProperties } from "./notion-cms-page";
import { downloadAsset, getImageSrc } from "./notion-cms-asset";

const { NOTION_TOKEN, NOTION_PROJECTS_DATABASE } = import.meta.env;

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
      if (blockType === "image") {
        const imageType = block.image.type;
        block.image[imageType].url = await getImageSrc(block);
      } else if (
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
