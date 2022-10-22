/** @jsxImportSource react */
import satori from "satori";
import fs from "fs/promises";
import { join } from "path";

async function loadFont(filename) {
  const fontPath = join(process.cwd(), "public", "fonts", filename);
  return fs.readFile(fontPath);
}

const manropeMedium = await loadFont("Manrope-Medium.ttf");
const manropeBold = await loadFont("Manrope-Bold.ttf");

export async function generateImage(text) {
  const svg = await satori(
    <div style={{ display: "flex" }}>
      <h2 tw="text-sky-500">{text}</h2>
    </div>,
    {
      // width: 1200,
      // height: 630,
      width: 200,
      height: 200,
      fonts: [
        {
          name: "Manrope",
          data: manropeMedium,
          style: "normal",
          weight: 500,
        },
        {
          name: "Manrope",
          data: manropeBold,
          style: "normal",
          weight: 800,
        },
      ],
    }
  );

  return svg;
}
