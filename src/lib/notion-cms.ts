import type {
  BlockObjectResponse,
  DataSourceObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialDataSourceObjectResponse,
  PartialPageObjectResponse,
  QueryDataSourceParameters,
} from "@notionhq/client/build/src/api-endpoints";
import { getAssetUrl } from "./notion-cms-asset";
import notion from "./notion-client";

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
 * It takes a Notion data source query and returns an unpaginated list of all the
 * pages
 * @param {QueryDataSourceParameters} options - QueryDataSourceParameters
 * @returns An array of pages
 */
export async function queryNotionDatabase(
  options: QueryDataSourceParameters,
): Promise<PageObjectResponse[]> {
  console.log("Fetching pages from Notion data source:", options);
  const pages: PageObjectResponse[] = [];
  let cursor = undefined;
  while (true) {
    const { results, next_cursor } = await notion.dataSources.query({
      ...options,
      start_cursor: cursor,
    });

    for (const result of results) {
      // Filter for page objects only (results can also include data sources)
      if ('object' in result && result.object === 'page') {
        // extract to make sure it is not partial response:
        // https://github.com/makenotion/notion-sdk-js/issues/219#issuecomment-1016095615
        const page = ensureFullResponse<
          PageObjectResponse,
          PartialPageObjectResponse
        >(result as PageObjectResponse | PartialPageObjectResponse);
        pages.push(page);
      }
    }

    if (!next_cursor) {
      console.log("Finished fetching pages from Notion database:", options);
      break;
    }

    cursor = next_cursor;
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

      const blockType = block.type;
      if (
        // only download these supported file types (excludes "file")
        blockType === "image" ||
        blockType === "video" ||
        blockType === "audio" ||
        blockType === "pdf"
      ) {
        if (block[blockType].type === "file") {
          // if local file, download the file and remap the url to local path
          block[blockType].file.url = await getAssetUrl(
            block.id,
            block[blockType].file.url,
            blockType === "image",
          );
        }
      }

      // if block has children, recursively call getBlockChildren
      if (block.has_children) {
        (block as any).children = await getBlockChildren(block.id);
      }

      return block;
    }),
  );
}
