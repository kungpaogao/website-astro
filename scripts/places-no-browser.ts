import "dotenv/config";
import fs from "fs/promises";

const PLACES_SAVE_PATH = "public/places.json";

export interface Place {
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

async function getDataViaFetch() {
  const placeId = "hie8OZlTQ5613oEw5K-wWg";
  const url = `https://www.google.com/maps/place/data=!3m1!4b1!4m3!11m2!2s${placeId}!3e3`;

  console.log("Attempting direct fetch from:", url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log("Received HTML, length:", html.length);

    // Try to find APP_INITIALIZATION_STATE in the HTML
    const scriptRegex = /window\.APP_INITIALIZATION_STATE\s*=\s*(\[[\s\S]*?\]);/;
    const match = html.match(scriptRegex);

    if (!match) {
      console.log("Could not find APP_INITIALIZATION_STATE in HTML");
      console.log("First 1000 chars:", html.substring(0, 1000));

      // Try alternative pattern
      const altRegex = /AF_initDataCallback\(\{[^}]*key:\s*'ds:(\d+)'[^}]*data:([\s\S]*?)\}\);/g;
      let altMatches = [];
      let altMatch;
      while ((altMatch = altRegex.exec(html)) !== null) {
        altMatches.push(altMatch);
      }

      if (altMatches.length > 0) {
        console.log(`Found ${altMatches.length} AF_initDataCallback entries`);
        // Try to parse the largest one
        let largestData = '';
        for (const m of altMatches) {
          if (m[2].length > largestData.length) {
            largestData = m[2];
          }
        }
        console.log("Attempting to parse largest data chunk...");
        const rawData = JSON.parse(largestData);
        console.log("Parsed data structure:", typeof rawData, Array.isArray(rawData));
        return rawData;
      }

      throw new Error("Could not extract places data from HTML");
    }

    console.log("Found APP_INITIALIZATION_STATE, parsing...");
    const stateData = JSON.parse(match[1]);

    const reduceLongest = (longest: any, current: any) => {
      if (current && current.length > longest.length) {
        return current;
      }
      return longest;
    };

    const rawJsonString = stateData
      .reduce(reduceLongest, [])
      .reduce(reduceLongest, "");

    const cleanJsonString = rawJsonString
      .slice(rawJsonString.indexOf("\n") + 1)
      .replace(/\\"/g, "'");

    const rawData = JSON.parse(cleanJsonString)[0].reduce(reduceLongest, []);
    const parsedData: Place[] = rawData.map((arr: any) =>
      parseArrayToJson(arr),
    );

    console.log(`Found ${parsedData.length} places`);
    await fs.writeFile(PLACES_SAVE_PATH, JSON.stringify(parsedData, null, 2));
    console.log(`Saved to ${PLACES_SAVE_PATH}`);

    return parsedData;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
}

// Run the script
(async () => {
  try {
    await getDataViaFetch();
    console.log("\n✅ Successfully fetched and saved Google Maps places!");
  } catch (error) {
    console.error("\n❌ Failed to fetch places:", error);

    console.log("\n📝 Alternative options:");
    console.log("1. Run this script locally where browser automation works");
    console.log("2. Export your places from Google Takeout (https://takeout.google.com)");
    console.log("3. Use the Google Places API with proper credentials");
    console.log("4. Manually export via Google Maps > Saved places > Export");

    process.exit(1);
  }
})();
