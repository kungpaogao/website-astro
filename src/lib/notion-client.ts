import { Client } from "@notionhq/client";
import "dotenv/config";

// Create the Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

/**
 * Whether Notion is configured. When the token is missing (e.g. running the
 * site without secrets), Notion fetches should be skipped so non-Notion pages
 * can still build instead of failing hard with a 403.
 */
export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

let warned = false;
export function warnNotionNotConfigured(context: string): void {
  if (!warned) {
    console.warn(
      `[notion] NOTION_TOKEN not set — skipping Notion fetches. Notion-backed content will be empty. (first hit: ${context})`,
    );
    warned = true;
  }
}

export default notion;
