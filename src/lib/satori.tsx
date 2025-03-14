/** @jsxImportSource react */
import satori from "satori";
import fs from "fs/promises";
import { join } from "path";

async function loadFont(filename: string) {
  const fontPath = join(process.cwd(), "public", "fonts", filename);
  return fs.readFile(fontPath);
}

const interMedium = await loadFont("Inter-Medium.woff");

export async function generateImage(text: string, width = 200, height = 200) {
  const svg = await satori(
    {
      type: "div",
      props: {
        children: [
          {
            type: "span",
            props: {
              children: text,
              tw: "text-black text-xl p-1",
            },
          },
        ],
        style: { display: "flex", backgroundColor: "white" },
      },
    },
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
      ],
    },
  );

  return svg;
}
