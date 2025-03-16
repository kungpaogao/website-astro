import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { ensureFullResponse } from "./notion-cms";
import { parseProperty } from "./notion-parse";
import notion from "./notion-client";

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

export async function getDatabaseProperties(databaseId: string): Promise<any> {
  const response = await notion.databases.retrieve({ database_id: databaseId });
  const fullResponse = ensureFullResponse<
    PageObjectResponse,
    PartialPageObjectResponse
  >(response);

  const properties = fullResponse.properties;
  const result = {};

  Object.keys(properties).forEach((key) => {
    const property = properties[key];
    result[key] = property;
  });

  return result;
}
