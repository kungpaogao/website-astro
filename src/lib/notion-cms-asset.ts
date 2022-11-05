import probe from "probe-image-size";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { once } from "events";
import mime from "mime-types";
import type { ImageBlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { getImage } from "@astrojs/image";
import { ASSET_BASE_PATH } from "./constants";

/**
 * It downloads the asset from Notion, saves it to the `/assets` folder, and
 * returns the path to the asset
 * @param {string} blockId - the id of the block
 * @param {string} url - The URL of the asset to download
 * @returns path to asset
 */
export async function downloadAsset(
  blockId: string,
  url: string
): Promise<string> {
  try {
    const files = await fs.promises.readdir(ASSET_BASE_PATH);
    let filename = files.find((file) => file.includes(blockId));

    // if file already exists, do not fetch and overwrite
    // see: https://github.com/justjake/monorepo/blob/d1e87174827005fa7fd6d158a0a1d7e86dd2a396/packages/notion-api/src/lib/assets.ts#L460
    if (!filename) {
      // TODO: maybe use probe-image-size here to prevent duplicate requests
      // TODO: cache the image sizes in some directory?
      const res = await fetch(url);
      // probe-image-size also returns mime-type
      const ext = mime.extension(res.headers.get("content-type")) || "unknown";
      filename = `file.${blockId}.${ext}`;

      const dest = path.join(ASSET_BASE_PATH, filename);
      const file = fs.createWriteStream(dest);
      await once(res.body.pipe(file), "finish");
    }

    return `/assets/${filename}`;
  } catch (e) {
    // on error, just return Notion URL
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
    result = await probe(fs.createReadStream(path.join("public", src)));
  } else {
    result = await probe(src);
  }

  return { width: result.width, height: result.height };
}

export async function getImageSrc(
  block: ImageBlockObjectResponse
): Promise<string> {
  const imageType = block.image.type;
  const imageUrl = block.image[imageType].url;
  const isFile = imageType === "file";
  const src = isFile ? await downloadAsset(block.id, imageUrl) : imageUrl;
  // TODO: this seems inefficient but at least it only happens at build time
  const { width, height } = await getImageDimensions(src, isFile);
  const img = await getImage({
    src: src,
    width: width,
    height: height,
    format: "webp",
  });

  return img.src;
}
