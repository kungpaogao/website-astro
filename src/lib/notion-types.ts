import type {
  BlockObjectResponse,
  PageObjectResponse,
  ParagraphBlockObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";

export type BlockObjectResponseWithChildren = BlockObjectResponse & {
  children?: BlockObjectResponse[];
};

export type RichText = RichTextItemResponse[];

export type RichTextBlock = { rich_text: RichText; color?: ApiColor };

export type ApiColor = ParagraphBlockObjectResponse["paragraph"]["color"];

export type PagePropertyResponse = PageObjectResponse["properties"]["key"];
