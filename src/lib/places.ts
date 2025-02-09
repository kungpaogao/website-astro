import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";
import fs from "fs/promises";

// Function to parse the array into a JSON object
function parseArrayToJson(data: any[]): any {
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

    console.log("Navigating to", url);
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("Loaded");

    // Wait a bit for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the page content
    const appInitializationState = await page.evaluate(() => {
      return (window as any).APP_INITIALIZATION_STATE;
    });

    console.log("Parsing");
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
    const parsedData = rawData.map((arr: any) => parseArrayToJson(arr));

    // Save parsed data
    await fs.writeFile(
      "src/content/places.json",
      JSON.stringify(parsedData, null, 2)
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

getData();
