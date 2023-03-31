import * as dotenv from "dotenv";
import { downloadPostsAsMdx } from "../src/lib/notion-download";

dotenv.config();

downloadPostsAsMdx("blog");
downloadPostsAsMdx("projects");

console.log("Finished downloading content.");
