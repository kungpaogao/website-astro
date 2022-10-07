import { expect, test } from "vitest";
import { parsePageUrl } from "./notion-cms-page";

test("parse notion url test", () => {
  const expected = `bd0d4055-c64d-47f0-bb0c-01160ce7239e`;

  const outputFullUrl = parsePageUrl(
    "https://www.notion.so/kungpaogao/about-bd0d4055c64d47f0bb0c01160ce7239e"
  );
  const outputNoHostname = parsePageUrl(
    "/kungpaogao/about-bd0d4055c64d47f0bb0c01160ce7239e"
  );
  const outputParams = parsePageUrl("about-bd0d4055c64d47f0bb0c01160ce7239e");
  const outputId = parsePageUrl("bd0d4055c64d47f0bb0c01160ce7239e");

  expect(outputFullUrl).toBe(expected);
  expect(outputNoHostname).toBe(expected);
  expect(outputParams).toBe(expected);
  expect(outputId).toBe(expected);
});
