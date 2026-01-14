import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  PartialDataSourceObjectResponse,
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

export async function getDataSourceProperties(dataSourceId: string): Promise<any> {
  const response = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const fullResponse = ensureFullResponse<
    DataSourceObjectResponse,
    PartialDataSourceObjectResponse
  >(response);

  const properties = fullResponse.properties;
  const result = {};

  Object.keys(properties).forEach((key) => {
    const property = properties[key];
    result[key] = property;
  });

  return result;
}

// Deprecated: Use getDataSourceProperties instead
export const getDatabaseProperties = getDataSourceProperties;
