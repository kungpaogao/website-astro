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

export type ApiColor = ParagraphBlockObjectResponse["paragraph"]["color"];

export type PagePropertyResponse = PageObjectResponse["properties"]["key"];

const INDENT = "  ";
const EOL = "\n";

// see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#raw_strings
const html = (strings, ...values) =>
  String.raw({ raw: strings }, ...values).trim();

export function parseColor(color: ApiColor, text: string): string {
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

export function richTextToPlainText(richText: RichText): string {
  return richText.map((token) => token.plain_text).join("");
}

export function parseRichTextBlock(richText: RichText): string {
  return richText
    .map((token) => {
      let markdown = token.plain_text;

      if (token.href) markdown = `[${markdown}](${token.href})`;

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
  children: string[],
  renderRichText: (parsed: string) => string = (parsed) => parsed
): string {
  return symbol.concat(
    renderRichText(parseRichTextBlock(richText)),
    EOL,
    ...children
  );
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
      let paragraphRichText = parseRichTextBlock(block.paragraph.rich_text);
      if (paragraphRichText === "") {
        paragraphRichText = "<br>".concat(EOL);
      }
      return EOL.concat(paragraphRichText, EOL, ...children);
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
      const toDoIsChecked = block.to_do.checked;
      return parseListItem(
        block.to_do.rich_text,
        toDoIsChecked ? "- [x] " : "- [ ] ",
        children,
        (parsed) =>
          toDoIsChecked
            ? html`<label><span class="todo-done">${parsed}</span></label>`
            : html`<label>${parsed}</label>`
      );
    case "toggle":
      return html`
        <details>
          <summary>${parseRichTextBlock(block.toggle.rich_text)}</summary>
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
      return "___".concat(EOL, ...children);
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
      const imgAlt = parseRichTextBlock(block.image.caption) || "image";
      const imgSrc = block.image[block.image.type].url;
      return html`<img src="${imgSrc}" alt="${imgAlt}" />`;
    case "video":
      return html`
        <video controls>
          <source src="${block.video[block.video.type].url}" />
        </video>
      `;
    case "pdf":
      // https://stackoverflow.com/questions/291813/recommended-way-to-embed-pdf-in-html/23681394#23681394
      const src = block.pdf[block.pdf.type].url;
      const labelId = `label-${block.id}`;
      const pdfLabel = parseRichTextBlock(block.pdf.caption) || "pdf file";
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
      // TODO: don't support files because we don't want to download and serve
      // from website
      /*
      return EOL.concat(
        `[${parseRichTextBlock(block.file.caption) || "link to file"}](${
          block.file[block.file.type].url
        })
      `,
        EOL
      );
      */
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
        `[${block[block.type].url}](${block[block.type].url})`,
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
    case "formula":
      if (property.formula.type === "string") {
        return property.formula.string;
      }
    default:
      return "unsupported";
  }
}
