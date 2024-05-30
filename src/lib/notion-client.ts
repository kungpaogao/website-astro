import { Client } from "@notionhq/client";
import * as dotenv from "dotenv";

// workaround to provide access to NOTION_TOKEN when running via jiti
dotenv.config();

const notion = Object.freeze(
  new Client({
    auth: import.meta.env.NOTION_TOKEN,
  })
);

export default notion;
