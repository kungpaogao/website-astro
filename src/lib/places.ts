import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
import fs from "fs/promises";
import notion from "./notion-client";
import { queryNotionDatabase } from "./notion-cms";
import type { CreatePageResponse } from "@notionhq/client/build/src/api-endpoints";

const PLACES_SAVE_PATH = "public/places.json";

interface Place {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string;
  timestampMs: number;
  graphId: string;
}

// Function to parse the array into a JSON object
function parseArrayToJson(data: any[]): Place {
  return {
    name: data[2],
    address: data[1][4],
    latitude: data[1][5][2],
    longitude: data[1][5][3],
    notes: data[3],
    timestampMs: data[9][0] * 1000,
    graphId: data[1][7],
  };
}

async function getData() {
  const placeId = "hie8OZlTQ5613oEw5K-wWg";
  const url = `https://www.google.com/maps/place/data=!3m1!4b1!4m3!11m2!2s${placeId}!3e3`;

  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [...chromium.args, "--disable-web-security", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage();

    console.log("getData:", "Navigating to", url);
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("getData:", "Loaded url");

    // Wait a bit for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the page content
    const appInitializationState = await page.evaluate(() => {
      return (window as any).APP_INITIALIZATION_STATE;
    });

    console.log("getData:", "Parsing response");
    const reduceLongest = (longest: any, current: any) => {
      // find longest non-null array
      if (current && current.length > longest.length) {
        return current;
      }
      return longest;
    };

    const rawJsonString = appInitializationState
      .reduce(reduceLongest, [])
      .reduce(reduceLongest, "");

    const cleanJsonString = rawJsonString
      // remove the security stuff
      .slice(rawJsonString.indexOf("\n") + 1)
      // replace escaped quotes
      .replace(/\\"/g, "'");

    const rawData = JSON.parse(cleanJsonString)[0].reduce(reduceLongest, []);
    const parsedData: Place[] = rawData.map((arr: any) =>
      parseArrayToJson(arr),
    );

    // Save parsed data
    await fs.writeFile(PLACES_SAVE_PATH, JSON.stringify(parsedData, null, 2));
  } catch (error) {
    console.error("getData:", "Error:", error);
  } finally {
    await browser.close();
  }
}

async function getExistingPages(): Promise<Map<string, string>> {
  const placesDbId = import.meta.env.NOTION_DB_ID_PLACES;
  // call helper so that we can handle paginated results
  const response = await queryNotionDatabase({
    database_id: placesDbId,
  });
  // create map
  const pages = new Map<string, string>();
  // save each existing page to map
  response.forEach((page) => {
    const coords =
      page.properties.latitude["number"] +
      "," +
      page.properties.longitude["number"];
    pages.set(coords, page.properties.name["title"][0].text.content);
  });
  return pages;
}

async function createPlacePage(place: Place): Promise<CreatePageResponse> {
  const placesDbId = import.meta.env.NOTION_DB_ID_PLACES;

  return await notion.pages.create({
    parent: { database_id: placesDbId, type: "database_id" },
    properties: {
      name: {
        title: [
          {
            text: {
              content: place.name,
            },
          },
        ],
      },
      address: {
        type: "rich_text",
        rich_text: [
          {
            text: {
              content: place.address,
            },
          },
        ],
      },
      latitude: {
        type: "number",
        number: place.latitude,
      },
      longitude: {
        type: "number",
        number: place.longitude,
      },
      notes: {
        type: "rich_text",
        rich_text: [
          {
            text: {
              content: place.notes,
            },
          },
        ],
      },
      timestampMs: {
        type: "number",
        number: place.timestampMs,
      },
      graphId: {
        type: "rich_text",
        rich_text: [
          {
            text: {
              content: place.graphId || "",
            },
          },
        ],
      },
    },
  });
}

async function writeToNotion() {
  // get data from file
  const data = await fs.readFile(PLACES_SAVE_PATH);
  const parsedData: Place[] = JSON.parse(data.toString());

  const existingPages = await getExistingPages();
  let skippedPages = [];
  let newPages = [];

  parsedData.forEach(async (place) => {
    const coords = place.latitude + "," + place.longitude;
    // check if page already exists
    if (existingPages.has(coords)) {
      skippedPages.push({ name: place.name, coords: coords });
      return;
    }
    // attempt to create page
    const response = await createPlacePage(place);
    newPages.push({ id: response.id, ...place });
  });

  console.log("writeToNotion:", "Created pages", newPages);
  console.log("writeToNotion:", "Skipped pages", skippedPages.length);
}

getData();
writeToNotion();
