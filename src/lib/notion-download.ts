import fsPromises from "fs/promises";
import fs from "fs";
import readline from "readline";
import path from "path";
import { once } from "events";
import { getBlock, queryNotionDatabase } from "./notion-cms";
import { parseBlocks } from "./notion-parse";
import { EOL } from "./constants";
import { getPageProperties } from "./notion-cms-page";

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
 */
export async function downloadPostsAsMdx(collection: "projects" | "blog") {
  let databaseId: string;

  if (collection === "projects") {
    databaseId = import.meta.env.NOTION_PROJECTS_DB_ID;
  } else if (collection === "blog") {
    databaseId = import.meta.env.NOTION_BLOG_DB_ID;
  } else {
    throw Error("invalid collection");
  }

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

  return Promise.all(
    posts.map(async (post) => {
      const shouldUpdate = await shouldUpdateLocalFile(
        post.last_edited_time,
        collection,
        post.id
      );

      if (shouldUpdate) {
        const postBlocks = await getBlock(post.id);
        const pageProperties = await getPageProperties(post.id);
        const postFrontmatter = pagePropertiesToFrontmatter(
          pageProperties,
          post.last_edited_time
        );

        const postImports = postFrontmatter.concat(
          "import { Image } from 'astro:assets';\n\n"
        );

        const postMdx = postImports.concat(parseBlocks(postBlocks));

        const dest = path
          .join("src", "content", collection, post.id)
          .concat(".mdx");

        console.log("Writing to file:", dest);

        return fsPromises.writeFile(dest, postMdx);
      }
    })
  );
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

    // TODO: optimize this for better build times - could store in json file every time we update instead of reading from file
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
