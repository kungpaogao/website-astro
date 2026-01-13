import { Client } from "@notionhq/client";
import "dotenv/config";

// Create the Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export default notion;
