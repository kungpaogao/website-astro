import {
  BlockWithChildren,
  CMS,
  PageWithChildren,
  RichText,
} from "@jitl/notion-api";
import { getAssetPath, getAssetPathCMS } from "./notion-cms";

// https://github.com/nartc/notion-stuff/blob/905af932a1e376997775e0288d5c833f90298260/libs/blocks-markdown-parser/src/lib/blocks-markdown-parser.ts

const INDENT = "  ";
const EOL = "\n";

export function parseColor(color: string, text: string): string {
  let className = "";
  switch (color) {
    case "gray":
      className = "text-gray-500";
    case "brown":
      className = "text-stone-500";
    case "orange":
      className = "text-orange-500";
    case "yellow":
      className = "text-yellow-500";
    case "green":
      className = "text-green-500";
    case "blue":
      className = "text-blue-500";
    case "purple":
      className = "text-purple-500";
    case "pink":
      className = "text-pink-500";
    case "red":
      className = "text-red-500";
    case "gray_background":
      className = "bg-gray-200";
    case "brown_background":
      className = "bg-stone-200";
    case "orange_background":
      className = "bg-orange-200";
    case "yellow_background":
      className = "bg-yellow-200";
    case "green_background":
      className = "bg-green-200";
    case "blue_background":
      className = "bg-blue-200";
    case "purple_background":
      className = "bg-purple-200";
    case "pink_background":
      className = "bg-pink-200";
    case "red_background":
      className = "bg-red-200";
  }
  return `<span class="${className}>${text}</span>`;
}

export function parseRichTextBlock(richText: RichText): string {
  return richText
    .map((token) => {
      let markdown = token.plain_text;

      const { bold, italic, strikethrough, underline, code, color } =
        token.annotations;

      if (code) markdown = `\`${markdown}\``;
      if (bold) markdown = `<b>${markdown}</b>`;
      if (italic) markdown = `<i>${markdown}</i>`;
      if (strikethrough) markdown = `<s>${markdown}</s>`;
      if (underline) markdown = `<u>${markdown}</u>`;
      if (color != "default") markdown = parseColor(color, markdown);

      return markdown;
    })
    .join("");
}

export function parseHeading(
  richText: RichText,
  level: number,
  children: string[]
): string {
  return "#"
    .repeat(level)
    .concat(" ", parseRichTextBlock(richText), EOL, ...children, EOL);
}

export function parseListItem(
  richText: RichText,
  symbol: string,
  children: string[]
): string {
  return symbol.concat(parseRichTextBlock(richText), EOL, ...children);
}

/**
 * Recursively parse Notion block format to components
 * @param block Notion block to parse
 * @param depth number of spaces before string, used to indent children
 * @returns
 */
export function parse(
  cms: CMS<any, any>,
  block: BlockWithChildren,
  depth = 0
): string {
  let children: string[] = [];

  if (block.has_children && block.children) {
    children = block.children.map(
      (child) => INDENT.repeat(depth + 2).concat(parse(cms, child, depth + 2)),
      EOL
    );
  }

  // TODO: put EOL before each block
  switch (block.type) {
    case "paragraph":
      return parseRichTextBlock(block.paragraph.rich_text).concat(
        EOL,
        ...children
      );
    case "heading_1":
      return EOL.concat(parseHeading(block.heading_1.rich_text, 1, children));
    case "heading_2":
      return EOL.concat(parseHeading(block.heading_2.rich_text, 2, children));
    case "heading_3":
      return EOL.concat(parseHeading(block.heading_3.rich_text, 3, children));
    case "bulleted_list_item":
      return parseListItem(block.bulleted_list_item.rich_text, "- ", children);
    case "numbered_list_item":
      return parseListItem(block.numbered_list_item.rich_text, "1. ", children);
    case "quote":
      return EOL.concat(
        "> ",
        parseRichTextBlock(block.quote.rich_text),
        EOL,
        children.map((child) => ">".concat(child)).join(""),
        EOL
      );
    case "to_do":
      return parseListItem(
        block.to_do.rich_text,
        block.to_do.checked ? "- [x] " : "- [ ] ",
        children
      );
    case "toggle":
      // TODO: make this dynamic with html
      return `<details><summary>${parseRichTextBlock(
        block.toggle.rich_text
      )}</summary>`.concat(EOL, ...children, "</details>");
    case "equation":
      return block.equation.expression.concat(EOL, ...children, EOL);
    case "code":
      return "```".concat(
        EOL,
        parseRichTextBlock(block.code.rich_text),
        EOL,
        "```",
        EOL
      );
    case "callout":
      // TODO: custom callout div + style
      return "```".concat(
        EOL,
        parseRichTextBlock(block.callout.rich_text),
        EOL,
        "```",
        EOL
      );
    case "divider":
      return "---".concat(EOL, ...children);
    case "table_of_contents":
      // TODO: generate TOC from headings?
      // return JSON.stringify(block.table_of_contents);
      return "";
    case "embed":
      // return `<iframe src="${block.embed.url}"></iframe>`;
      const { url, caption } = block.embed;
      const plainTextCaption = parseRichTextBlock(caption);
      return `[${plainTextCaption || url}](${url})`.concat(EOL);
    case "image":
      // const path = getAssetPath(cms, block)
      const { type } = block.image;
      if (type === "external") {
        return "";
      }
      if (type === "file") {
        const url = block.image.file.url;
        const filetype = block.image.file.url
          .split("/")
          .pop()
          .split("?")[0]
          .split(".")
          .pop();
        const srcCMS = getAssetPathCMS(cms, block.image).then((v) =>
          console.log(v)
        );

        const src = getAssetPath(block.image);
        return `<Image src="${src}" />`;
      }
      return "";
    case "video":
    case "pdf":
    case "file":
    case "audio":
    case "breadcrumb":
    case "column_list":
    case "column":
    case "link_to_page":
    case "table":
    case "table_row":
    case "bookmark":
    case "link_preview":
    case "template":
    case "synced_block":
    case "child_page":
    case "child_database":
    case "unsupported":
      return "";
  }
}

export function parsePage(cms: CMS<any, any>, page: PageWithChildren): string {
  return page.children.map((block) => parse(cms, block)).join("");
}
