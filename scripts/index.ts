import "dotenv/config";
import { downloadPostsAsMdx } from "../src/lib/notion-download";

downloadPostsAsMdx("blog");
downloadPostsAsMdx("projects");

console.log("Finished downloading content.");
