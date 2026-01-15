import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  PartialDatabaseObjectResponse,
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

// Cache for database_id -> data_source_id mapping
const dataSourceIdCache = new Map<string, string>();

/**
 * Gets the primary data_source_id for a database.
 * In the new Notion API (2025-09-03), databases contain one or more data sources.
 * This function retrieves the database and returns the first data source's ID.
 *
 * @param {string} databaseId - The database ID
 * @returns The data_source_id for the primary data source
 */
export async function getDataSourceId(databaseId: string): Promise<string> {
  // Check cache first
  if (dataSourceIdCache.has(databaseId)) {
    return dataSourceIdCache.get(databaseId)!;
  }

  console.log("Fetching data_source_id for database:", databaseId);
  const response = await notion.databases.retrieve({ database_id: databaseId });

  const database = ensureFullResponse<
    DatabaseObjectResponse,
    PartialDatabaseObjectResponse
  >(response);

  if (!database.data_sources || database.data_sources.length === 0) {
    throw new Error(`No data sources found for database: ${databaseId}`);
  }

  const dataSourceId = database.data_sources[0].id;
  console.log("Resolved data_source_id:", dataSourceId, "for database:", databaseId);

  // Cache the result
  dataSourceIdCache.set(databaseId, dataSourceId);

  return dataSourceId;
}

/**
 * It takes a Notion database query and returns an unpaginated list of all the
 * pages. This function automatically resolves the data_source_id from the database_id.
 *
 * @param options - Query options with database_id
 * @returns An array of pages
 */
export async function queryNotionDatabase(
  options: Omit<QueryDataSourceParameters, 'data_source_id'> & { database_id: string },
): Promise<PageObjectResponse[]> {
  const { database_id, ...queryOptions } = options;

  // Resolve database_id to data_source_id
  const dataSourceId = await getDataSourceId(database_id);

  console.log("Fetching pages from Notion data source:", dataSourceId);
  const pages: PageObjectResponse[] = [];
  let cursor = undefined;
  while (true) {
    const { results, next_cursor } = await notion.dataSources.query({
      ...queryOptions,
      data_source_id: dataSourceId,
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
      console.log("Finished fetching pages from Notion data source:", dataSourceId);
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
