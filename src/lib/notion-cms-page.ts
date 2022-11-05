import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { notion, ensureFullResponse } from "./notion-cms";
import { parseProperty } from "./notion-parse";

/**
 * It takes a Notion URL and returns the properly formatted page id. This is
 * important because it allows the human-readable/accessible URL to be placed
 * in the corresponding file.
 *
 * For example, any of the following:
 *
 * - https://www.notion.so/kungpaogao/about-bd0d4055c64d47f0bb0c01160ce7239e
 * - about-bd0d4055c64d47f0bb0c01160ce7239e
 * - bd0d4055c64d47f0bb0c01160ce7239e
 *
 * should become: `bd0d4055-c64d-47f0-bb0c-01160ce7239e`
 *
 * @param {string} url - The URL of the page you want to get the ID of
 * @returns A string
 */
export function parsePageUrl(url: string): string {
  const cleanSlash = url.split("/");
  const cleanDash = cleanSlash[cleanSlash.length - 1].split("-");
  const sl = (start?: number, end?: number) =>
    cleanDash[cleanDash.length - 1].slice(start, end);
  return `${sl(0, 8)}-${sl(8, 12)}-${sl(12, 16)}-${sl(16, 20)}-${sl(20)}`;
}

export async function getPageProperties(pageId: string): Promise<any> {
  const response = await notion.pages.retrieve({ page_id: pageId });
  const fullResponse = ensureFullResponse<
    PageObjectResponse,
    PartialPageObjectResponse
  >(response);

  const properties = fullResponse.properties;
  const result = {};

  Object.keys(properties).forEach((key) => {
    const property = properties[key];
    result[key] = parseProperty(property);
  });

  return result;
}
