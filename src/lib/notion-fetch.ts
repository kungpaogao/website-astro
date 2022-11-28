import fsPromises from "fs/promises";
import fs from "fs";
import readline from "readline";
import path from "path";
import { once } from "events";
import { getBlock, queryNotionDatabase } from "./notion-cms";
import { parseBlocks } from "./notion-parse";
import { EOL } from "./constants";
import { getPageProperties } from "./notion-cms-page";

const { NOTION_PROJECTS_DATABASE } = import.meta.env;

function pagePropertiesToFrontmatter(
  pageProperties: any,
  lastEditedTime?: string
) {
  return "---".concat(
    EOL,
    lastEditedTime ? `lastEditedTime: '${lastEditedTime}'${EOL}` : "",
    ...Object.keys(pageProperties).map(
      (key) => `${key}: '${pageProperties[key]}'${EOL}`
    ),
    "---",
    EOL
  );
}

/**
 * Fetches Notion posts, checks if the local file needs to be updated, and if
 * so, writes the file to disk as MDX file
 * @param {string} databaseId - The ID of the Notion database you want to query
 * @param {string} [srcContentPath=projects] - The path to the directory where the
 * MDX files will be written
 */
export async function fetchPostsAsMdx(
  databaseId: string = NOTION_PROJECTS_DATABASE,
  srcContentPath: string = "projects"
) {
  const posts = await queryNotionDatabase({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: "public",
          checkbox: {
            equals: true,
          },
        },
      ],
    },
    sorts: [
      {
        property: "published",
        direction: "descending",
      },
    ],
  });

  posts.forEach(async (post) => {
    const shouldUpdate = await shouldUpdateLocalFile(
      post.last_edited_time,
      srcContentPath,
      post.id
    );

    if (shouldUpdate) {
      const postBlocks = await getBlock(post.id);
      const pageProperties = await getPageProperties(post.id);
      const postFrontmatter = pagePropertiesToFrontmatter(
        pageProperties,
        post.last_edited_time
      );

      const postMdx = postFrontmatter.concat(parseBlocks(postBlocks));

      const dest = path
        .join("src", "content", srcContentPath, post.id)
        .concat(".mdx");

      console.log("Writing to file:", dest);

      return fsPromises.writeFile(dest, postMdx);
    }
  });
}

async function shouldUpdateLocalFile(
  serverLastEditedTime: string,
  srcContentPath: string,
  postId: string
): Promise<boolean> {
  try {
    const dest = path
      .join(process.cwd(), "src", "content", srcContentPath, postId)
      .concat(".mdx");

    const readStream = fs.createReadStream(dest);

    const rl = readline.createInterface({
      input: readStream,
    });

    let lastEditedTime: string;

    // TODO: optimize this for better build times
    const lineListener = (line) => {
      if (line.includes("lastEditedTime")) {
        lastEditedTime = line.substring(line.indexOf(": ") + 2);
        rl.close();
        rl.removeListener("line", lineListener);
        readStream.destroy();
      }
    };

    rl.on("line", lineListener);

    await once(rl, "close");
    return `'${serverLastEditedTime}'` > lastEditedTime;
  } catch (err) {
    // file probably doesn't exist, so we should fetch it
    return true;
  }
}
