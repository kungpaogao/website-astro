import type {
  BlockWithChildren,
  RichText,
  RichTextToken,
} from "@jitl/notion-api";
import { expect, test } from "vitest";
import * as sample from "../../public/tests/sample.json";
import { parse, parseRichTextBlock } from "./notion-parse";

const RICH_TEXT_BASE: RichText = [
  {
    type: "text",
    text: { content: "paragraph text", link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: "default",
    },
    plain_text: "hello world",
    href: null,
  },
];

function annotateAll(richText: RichText, annotations: any): RichText {
  return richText.map(
    (token) =>
      ({
        ...token,
        annotations: { ...token.annotations, ...annotations },
      } as RichTextToken)
  );
}

test("parse rich text simple", () => {
  const expected = `hello world`;

  const output = parseRichTextBlock(RICH_TEXT_BASE);

  expect(output).toBe(expected);
});

test("parse rich text single annotations", () => {
  const annotate = (annotations: any) =>
    annotateAll(RICH_TEXT_BASE, annotations);

  const expectedBold = `<b>hello world</b>`;
  const richTextBold = annotate({ bold: true });
  const outputBold = parseRichTextBlock(richTextBold);

  const expectedItalic = `<i>hello world</i>`;
  const richTextItalic = annotate({ italic: true });
  const outputItalic = parseRichTextBlock(richTextItalic);

  const expectedStrike = `<s>hello world</s>`;
  const richTextStrike = annotate({ strikethrough: true });
  const outputStrike = parseRichTextBlock(richTextStrike);

  const expectedUnderline = `<u>hello world</u>`;
  const richTextUnderline = annotate({ underline: true });
  const outputUnderline = parseRichTextBlock(richTextUnderline);

  const expectedCode = `\`hello world\``;
  const richTextCode = annotate({ code: true });
  const outputCode = parseRichTextBlock(richTextCode);

  expect(outputBold).toBe(expectedBold);
  expect(outputItalic).toBe(expectedItalic);
  expect(outputStrike).toBe(expectedStrike);
  expect(outputUnderline).toBe(expectedUnderline);
  expect(outputCode).toBe(expectedCode);
});

test("parse rich text combined annotations", () => {
  const expectedStack = `<s><i><b>hello world</b></i></s>`;
  const richTextStack = annotateAll(RICH_TEXT_BASE, {
    bold: true,
    italic: true,
    strikethrough: true,
  });
  const outputStack = parseRichTextBlock(richTextStack);

  const expectedStackMore = `<u><s><i><b>\`hello world\`</b></i></s></u>`;
  const richTextStackMore = annotateAll(richTextStack, {
    underline: true,
    code: true,
  });
  const outputStackMore = parseRichTextBlock(richTextStackMore);

  expect(outputStack).toBe(expectedStack);
  expect(outputStackMore).toBe(expectedStackMore);
});

// TODO: clean up this test - this should be more predictable
// added a bunch of newlines and spaces to make this pass
// maybe look into some markdown.trim function
test("notion parse json", () => {
  const expected = `
# heading 1


## heading 2


### heading 3


paragraph text
- unorganized list
- another item
- another item
    - nested item
        - nested nested item
1. organized list
1. another item
    1. nested item
        1. nested nested item

> quote
>    - nested item in quote

`;

  const output = sample.children
    .map((block) => parse(block as BlockWithChildren))
    .join("");

  expect(output).toBe(expected);
});
