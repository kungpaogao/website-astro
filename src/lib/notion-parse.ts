import {
  BlockWithChildren,
  PageWithChildren,
  RichText,
} from "@jitl/notion-api";

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

export function parseHeading(richText: RichText, level: number): string {
  return "#".repeat(level).concat(" ", parseRichTextBlock(richText));
}

/**
 * Recursively parse Notion block format to components
 * @param block Notion block to parse
 * @param depth number of spaces before string, used to indent children
 * @returns
 */
export function parse(block: BlockWithChildren, depth = 0): string {
  let children = [];

  if (block.has_children && block.children) {
    children = block.children.map(
      (child) => INDENT.repeat(depth + 2).concat(parse(child, depth + 2)),
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
      return parseHeading(block.heading_1.rich_text, 1).concat(
        EOL,
        ...children
      );
    case "heading_2":
      return parseHeading(block.heading_2.rich_text, 2).concat(
        EOL,
        ...children
      );
    case "heading_3":
      return parseHeading(block.heading_3.rich_text, 3).concat(
        EOL,
        ...children
      );
    case "bulleted_list_item":
      return "- ".concat(
        parseRichTextBlock(block.bulleted_list_item.rich_text),
        EOL,
        ...children
      );
    case "numbered_list_item":
      return "1. ".concat(
        parseRichTextBlock(block.numbered_list_item.rich_text),
        EOL,
        ...children
      );
    case "quote":
      return EOL.concat(
        "> ",
        parseRichTextBlock(block.quote.rich_text),
        EOL,
        children.map((child) => ">".concat(child)).join(""),
        EOL
      );
    case "to_do":
    case "toggle":
    case "template":
    case "synced_block":
    case "child_page":
    case "child_database":
    case "equation":
    case "code":
    case "callout":
    case "divider":
    case "breadcrumb":
    case "table_of_contents":
    case "column_list":
    case "column":
    case "link_to_page":
    case "table":
    case "table_row":
    case "embed":
    case "bookmark":
    case "image":
    case "video":
    case "pdf":
    case "file":
    case "audio":
    case "link_preview":
    case "unsupported":
      return "";
  }
}

export function parsePage(page: PageWithChildren): string {
  return page.children.map((block) => parse(block)).join("");
}
