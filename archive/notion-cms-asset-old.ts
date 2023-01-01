export async function getAssetUrl(
  blockId: string,
  blockType: "image" | "video" | "audio" | "pdf",
  url: string
): Promise<string> {
  try {
    // look for file in assets folder
    const files = await fs.promises.readdir(ASSET_DOWNLOAD_PATH);
    const filename = files.find((file) => file.includes(blockId));

    if (!filename) {
      // local file doesn't exist
      if (blockType === "image") {
        // fetch image and probe image data in parallel
        const [res, probeResult] = await Promise.all([fetch(url), probe(url)]);
        // construct filename
        // const ext = probeResult.type; // TODO: use optimized format (webp)
        const filename = `file.${blockId}`;
        // download
        return;
      } else {
        const res = await fetch(url);
        const ext =
          mime.extension(res.headers.get("content-type")) || "unknown";
        const filename = `file.${blockId}.${ext}`;

        const dest = path.join(ASSET_DOWNLOAD_PATH, filename);
        const file = fs.createWriteStream(dest);
        await once(res.body.pipe(file), "finish");
        return path.join("/assets", filename);
      }
    } else {
      // local file already exists
      if (blockType === "image") {
        // if image, return path with dimension as params
        // probe local file
        const probeResult = await probe(
          fs.createReadStream(path.join(ASSET_DOWNLOAD_PATH, filename))
        );
        // put dimensions into url params
        const dimensions = new URLSearchParams({
          w: probeResult.width.toString(),
          h: probeResult.height.toString(),
        });
        return path.join("/assets", filename).concat(`?${dimensions}`);
      } else {
        return path.join("/assets", filename);
      }
    }
  } catch (e) {
    // on error, just return Notion URL
    return url;
  }
}
