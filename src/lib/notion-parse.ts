import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type {
  ApiColor,
  BlockObjectResponseWithChildren,
  PagePropertyResponse,
  RichText,
  RichTextBlock,
} from "./notion-types";
import { html } from "./html";
import { EOL, INDENT } from "./constants";

export function parseColor(color: ApiColor, text: string): string {
  let className = "";
  switch (color) {
    case "gray":
      className = "!text-gray-500";
      break;
    case "brown":
      className = "!text-stone-500";
      break;
    case "orange":
      className = "!text-orange-500";
      break;
    case "yellow":
      className = "!text-yellow-500";
      break;
    case "green":
      className = "!text-green-500";
      break;
    case "blue":
      className = "!text-blue-500";
      break;
    case "purple":
      className = "!text-purple-500";
      break;
    case "pink":
      className = "!text-pink-500";
      break;
    case "red":
      className = "!text-red-500";
      break;
    case "gray_background":
      className = "!bg-gray-200";
      break;
    case "brown_background":
      className = "!bg-stone-200";
      break;
    case "orange_background":
      className = "!bg-orange-200";
      break;
    case "yellow_background":
      className = "!bg-yellow-200";
      break;
    case "green_background":
      className = "!bg-green-200";
      break;
    case "blue_background":
      className = "!bg-blue-200";
      break;
    case "purple_background":
      className = "!bg-purple-200";
      break;
    case "pink_background":
      className = "!bg-pink-200";
      break;
    case "red_background":
      className = "!bg-red-200";
      break;
  }
  return html`<span class="${className}">${text}</span>`;
}

export function richTextToPlainText(richText: RichText): string {
  return richText.map((token) => token.plain_text).join("");
}

export function parseRichTextBlock({
  rich_text,
  color: blockColor = "default",
}: RichTextBlock): string {
  return rich_text
    .map((token) => {
      let markdown = token.plain_text;

      if (token.href) markdown = `[${markdown}](${token.href})`;

      const { bold, italic, strikethrough, underline, code, color } =
        token.annotations;

      if (code) markdown = `<code>${markdown}</code>`;
      if (bold) markdown = `<b>${markdown}</b>`;
      if (italic) markdown = `<i>${markdown}</i>`;
      if (strikethrough) markdown = `<s>${markdown}</s>`;
      if (underline) markdown = `<u>${markdown}</u>`;
      if (color !== "default") markdown = parseColor(color, markdown);

      if (blockColor !== "default") markdown = parseColor(blockColor, markdown);

      return markdown;
    })
    .join("");
}

export function parseHeading(
  richTextBlock: RichTextBlock,
  level: number,
  children: string[]
): string {
  return "#"
    .repeat(level)
    .concat(" ", parseRichTextBlock(richTextBlock), EOL, ...children, EOL);
}

export function parseListItem(
  richTextBlock: RichTextBlock,
  symbol: string,
  children: string[]
): string {
  return symbol.concat(parseRichTextBlock(richTextBlock), EOL, ...children);
}

/**
 * Recursively parse Notion block format to components
 * @param block Notion block to parse
 * @param depth number of spaces before string, used to indent children
 * @returns
 */
export function parse(
  block: BlockObjectResponseWithChildren,
  depth = 0
): string {
  let children: string[] = [];

  if (block.has_children && block.children) {
    children = block.children.map((child) =>
      INDENT.repeat(depth + 2).concat(parse(child, depth + 2))
    );
  }

  // TODO: put EOL before each block?
  switch (block.type) {
    case "paragraph":
      let paragraphRichText = parseRichTextBlock(block.paragraph);
      if (paragraphRichText === "") {
        paragraphRichText = html`<br />`.concat(EOL);
      }
      // else if (
      //   paragraphRichText !== richTextToPlainText(block.paragraph.rich_text)
      // ) {
      //   // extra case to handle when a whole paragraph is formatted
      //   // e.g. <i>this whole paragraph</i>
      //   paragraphRichText = html`<p>${paragraphRichText}</p>`;
      // }
      return EOL.concat(paragraphRichText, EOL, ...children);
    case "heading_1":
      return EOL.concat(parseHeading(block.heading_1, 1, children));
    case "heading_2":
      return EOL.concat(parseHeading(block.heading_2, 2, children));
    case "heading_3":
      return EOL.concat(parseHeading(block.heading_3, 3, children));
    case "bulleted_list_item":
      return parseListItem(block.bulleted_list_item, "- ", children);
    case "numbered_list_item":
      return parseListItem(block.numbered_list_item, "1. ", children);
    case "quote":
      return EOL.concat(
        "> ",
        parseRichTextBlock(block.quote),
        EOL,
        children.map((child) => ">".concat(child)).join(""),
        EOL
      );
    case "to_do":
      const toDoIsChecked = block.to_do.checked;
      return parseListItem(
        block.to_do,
        toDoIsChecked ? "- [x] " : "- [ ] ",
        children
      );
    case "toggle":
      // TODO: fix this because this doesn't work for children :,(
      return html`
        <details>
          <summary>${parseRichTextBlock(block.toggle)}</summary>
          ${children.join("").trim()}
        </details>
      `.concat(EOL);
    case "equation":
      // TODO: use https://www.npmjs.com/package/marked-katex-extension
      return block.equation.expression.concat(EOL, ...children, EOL);
    case "code":
      return "```".concat(
        block.code.language,
        EOL,
        parseRichTextBlock(block.code),
        EOL,
        "```",
        EOL
      );
    case "callout":
      // TODO: custom callout div + style
      return "```".concat(
        EOL,
        parseRichTextBlock(block.callout),
        EOL,
        "```",
        EOL
      );
    case "divider":
      return "___".concat(EOL, ...children);
    case "table_of_contents":
      // TODO: generate TOC from headings?
      // return JSON.stringify(block.table_of_contents);
      return "";
    case "embed":
      // return `<iframe src="${block.embed.url}"></iframe>`;
      const { url, caption } = block.embed;
      const plainTextCaption = parseRichTextBlock({ rich_text: caption });
      return `[${plainTextCaption || url}](${url})`.concat(EOL);
    case "image":
      const imgAlt =
        parseRichTextBlock({ rich_text: block.image.caption }) || "image";
      const imgUrl = block.image[block.image.type].url.split("?");
      const imgSrc = imgUrl[0];
      const imgParams = new URLSearchParams(imgUrl[1]);
      if (!imgParams) {
        return html`<img src="${imgSrc}" alt="${imgAlt}"`.concat(EOL);
      } else {
        return `<Image src=${imgSrc} width="${imgParams.get(
          "w"
        )}" height="${imgParams.get(
          "h"
        )}" format="webp" alt="${imgAlt}" />`.concat(EOL);
      }
    case "video":
      return html`
        <video controls>
          <source src="${block.video[block.video.type].url}" />
        </video>
      `.concat(EOL);
    case "pdf":
      // https://stackoverflow.com/questions/291813/recommended-way-to-embed-pdf-in-html/23681394#23681394
      const src = block.pdf[block.pdf.type].url;
      const labelId = `label-${block.id}`;
      const pdfLabel =
        parseRichTextBlock({ rich_text: block.pdf.caption }) || "pdf file";
      return html`
        <span id="${labelId}">${pdfLabel}</span>
        <object
          data="${src}"
          type="application/pdf"
          width="100%"
          aria-labelledby="${labelId}"
        >
          <embed src="${src}" />
          <p>This browser doesn't support embedded PDFs.</p>
        </object>
      `.concat(EOL);
    case "file":
      return "";
    case "audio":
      return html`
        <audio controls src="${block.audio[block.audio.type].url}">
          Your browser does not support the <code>audio</code> element.
        </audio>
      `.concat(EOL);
    case "bookmark":
    case "link_preview":
      return EOL.concat(
        `> [${block[block.type].url}](${block[block.type].url})`,
        EOL,
        EOL
      );
    case "breadcrumb":
    case "column_list":
    case "column":
    case "link_to_page":
    case "table":
    case "table_row":
    case "template":
    case "synced_block":
    case "child_page":
    case "child_database":
    case "unsupported":
    default:
      return "";
  }
}

export function parseBlocks(blocks: BlockObjectResponse[]): string {
  return blocks.map((block) => parse(block)).join("");
}

export function parseProperty(property: PagePropertyResponse): string {
  switch (property.type) {
    case "title":
      return richTextToPlainText(property.title);
    case "rich_text":
      return richTextToPlainText(property.rich_text);
    case "number":
      return property.number.toString();
    case "url":
      return property.url;
    case "checkbox":
      return property.checkbox ? "true" : "false";
    case "email":
      return property.email;
    case "last_edited_time":
      return property.last_edited_time;
    case "created_time":
      return property.created_time;
    case "date":
      return property.date.start;
    case "multi_select":
      return property.multi_select.map((select) => select.name).join(",");
    case "formula":
      if (property.formula.type === "string") {
        return property.formula.string;
      }
    default:
      return "unsupported";
  }
}
