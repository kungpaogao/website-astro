/** @jsxImportSource react */
import satori from "satori";
import fs from "fs/promises";
import { join } from "path";

async function loadFont(filename) {
  const fontPath = join(process.cwd(), "public", "fonts", filename);
  return fs.readFile(fontPath);
}

const interMedium = await loadFont("Inter-Medium.woff");
const maShanZhengRegular = await loadFont("MaShanZheng-Regular.woff");

export async function generateImage(text: string, width = 200, height = 200) {
  const svg = await satori(
    <div
      style={{
        display: "flex",
        backgroundColor: "white",
      }}
    >
      <span tw="text-black text-xl p-1">{text}</span>
    </div>,
    {
      // width: 1200,
      // height: 630,
      width: width,
      height: height,
      fonts: [
        {
          name: "Inter",
          data: interMedium,
          style: "normal",
          weight: 500,
        },
        {
          name: "MaShanZheng",
          data: maShanZhengRegular,
          style: "normal",
          weight: 400,
        },
      ],
    }
  );

  return svg;
}
