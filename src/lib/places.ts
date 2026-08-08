import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
import fs from "fs/promises";
import notion from "./notion-client";
import { getDataSourceId, queryNotionDatabase } from "./notion-cms";
import { evaluateOnPage, isBrowserRunConfigured } from "./browser-run";
import { extractPlaces } from "./places-extract";
import type { Place } from "./places-extract";
import type { CreatePageResponse } from "@notionhq/client/build/src/api-endpoints";

const PLACES_SAVE_PATH = "public/places.json";

const PLACE_ID = "hie8OZlTQ5613oEw5K-wWg";
export const PLACES_URL = `https://www.google.com/maps/place/data=!3m1!4b1!4m3!11m2!2s${PLACE_ID}!3e3`;

export type { Place };

/** Reads the places list in a Cloudflare-hosted browser — no local Chromium. */
async function getPlacesViaBrowserRun(): Promise<Place[]> {
  console.log("getData:", "Using Cloudflare Browser Run for", PLACES_URL);
  // extractPlaces is passed in as an argument rather than referenced directly:
  // this arrow is stringified and shipped to the browser, where module imports
  // do not exist.
  return await evaluateOnPage<Place[], [typeof extractPlaces]>(
    PLACES_URL,
    (extract) => extract(window.APP_INITIALIZATION_STATE),
    { dependencies: [extractPlaces] },
  );
}

/** Reads the places list in a locally launched headless Chromium. */
async function getPlacesViaLocalChromium(): Promise<Place[]> {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [...chromium.args, "--disable-web-security", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage();

    console.log("getData:", "Navigating to", PLACES_URL);
    await page.goto(PLACES_URL, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("getData:", "Loaded url");

    // Wait a bit for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the page content
    const appInitializationState = await page.evaluate(() => {
      return window.APP_INITIALIZATION_STATE;
    });

    console.log("getData:", "Parsing response");
    return extractPlaces(appInitializationState);
  } finally {
    await browser.close();
  }
}

async function getData() {
  const places = isBrowserRunConfigured()
    ? await getPlacesViaBrowserRun()
    : await getPlacesViaLocalChromium();

  console.log("getData:", "Found", places.length, "places");
  await fs.writeFile(PLACES_SAVE_PATH, JSON.stringify(places, null, 2));
}

async function getExistingPages(): Promise<Map<string, string>> {
  const placesDbId = process.env.NOTION_DB_ID_PLACES;
  // call helper so that we can handle paginated results
  const response = await queryNotionDatabase(placesDbId);
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
  const placesDbId = process.env.NOTION_DB_ID_PLACES;
  // Resolve the data_source_id from the database_id
  const dataSourceId = await getDataSourceId(placesDbId);

  return await notion.pages.create({
    parent: { data_source_id: dataSourceId, type: "data_source_id" },
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

// writeToNotion reads the file getData writes, so these have to be sequenced.
await getData();
await writeToNotion();
