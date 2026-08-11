/** @jsxImportSource react */
import satori from "satori";
import { loadSatoriFonts } from "./satori-fonts";

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
      width: width,
      height: height,
      fonts: await loadSatoriFonts(),
    },
  );

  return svg;
}
