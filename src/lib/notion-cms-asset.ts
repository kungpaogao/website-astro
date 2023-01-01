import probe from "probe-image-size";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { once } from "events";
import mime from "mime-types";
import { ASSET_PUBLIC_PATH, ASSET_SRC_PATH } from "./constants";

/**
 * It downloads the asset from Notion, saves it to the `/assets` folder, and
 * returns the path to the asset
 * @param {string} blockId - the id of the block
 * @param {string} url - The URL of the asset to download
 * @returns path to asset
 */
export async function getAssetUrl(
  blockId: string,
  url: string,
  isImage: boolean = false
): Promise<string> {
  try {
    const downloadPath = isImage ? ASSET_SRC_PATH : ASSET_PUBLIC_PATH;

    const files = await fs.promises.readdir(downloadPath);
    let filename = files.find((file) => file.includes(blockId));

    if (!filename) {
      // if file doesn't exist, fetch and overwrite
      // see: https://github.com/justjake/monorepo/blob/d1e87174827005fa7fd6d158a0a1d7e86dd2a396/packages/notion-api/src/lib/assets.ts#L460
      const res = await fetch(url);
      const ext = mime.extension(res.headers.get("content-type")) || "unknown";
      filename = `file.${blockId}.${ext}`;
      console.log("Downloading new asset:", filename);

      const dest = path.join(downloadPath, filename);
      const file = fs.createWriteStream(dest);
      await once(res.body.pipe(file), "finish");
    }

    if (isImage) {
      // special handling for images
      const { width, height } = await getImageDimensions(filename, true);
      const params = new URLSearchParams({
        w: width.toString(),
        h: height.toString(),
      });
      const src = path.join("@assets", filename);
      return `{import("${src}")}`.concat(`?${params}`);
    }

    const assetUrl = path.join("/assets", filename);
    return assetUrl;
  } catch (e) {
    // on error, just return Notion URL
    console.error(e);
    return url;
  }
}

async function getImageDimensions(
  src: string,
  isFile: boolean
): Promise<{
  width: number;
  height: number;
}> {
  let result: probe.ProbeResult;

  if (isFile) {
    // if it's a file, src should be a filename
    result = await probe(fs.createReadStream(path.join(ASSET_SRC_PATH, src)));
  } else {
    result = await probe(src);
  }

  return { width: result.width, height: result.height };
}
