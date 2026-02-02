import "dotenv/config";
import fs from "fs/promises";
import path from "path";

const PLACES_SAVE_PATH = "public/places.json";
const TAKEOUT_INPUT_PATH = "public/Saved Places.json"; // Default Google Takeout location

export interface Place {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string;
  timestampMs: number;
  graphId: string;
}

interface TakeoutPlace {
  title?: string;
  address?: string;
  location?: {
    latitudeE7?: number;
    longitudeE7?: number;
  };
  comment?: string;
  created?: string;
  updated?: string;
  google_maps_url?: string;
}

async function convertTakeoutToPlaces(inputPath: string): Promise<Place[]> {
  console.log(`Reading Google Takeout data from: ${inputPath}`);

  try {
    const data = await fs.readFile(inputPath, "utf-8");
    const takeoutData = JSON.parse(data);

    console.log("Parsing Google Takeout format...");

    // Google Takeout format has a "features" array
    let places: Place[] = [];

    if (takeoutData.features && Array.isArray(takeoutData.features)) {
      // GeoJSON format from Takeout
      places = takeoutData.features.map((feature: any) => {
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [0, 0];

        return {
          name: props.Title || props.name || "Unknown Place",
          address: props.Location?.Address || props.address || "",
          latitude: coords[1] || 0,
          longitude: coords[0] || 0,
          notes: props.Comment || props.description || "",
          timestampMs: props.Updated?.timestamp
            ? new Date(props.Updated.timestamp).getTime()
            : Date.now(),
          graphId: props["Google Maps URL"]?.split("/").pop() || "",
        };
      });
    } else if (Array.isArray(takeoutData)) {
      // Alternative array format
      places = takeoutData.map((item: TakeoutPlace) => ({
        name: item.title || "Unknown Place",
        address: item.address || "",
        latitude: item.location?.latitudeE7
          ? item.location.latitudeE7 / 1e7
          : 0,
        longitude: item.location?.longitudeE7
          ? item.location.longitudeE7 / 1e7
          : 0,
        notes: item.comment || "",
        timestampMs: item.updated
          ? new Date(item.updated).getTime()
          : item.created
            ? new Date(item.created).getTime()
            : Date.now(),
        graphId: item.google_maps_url?.split("/").pop() || "",
      }));
    } else {
      throw new Error("Unknown Google Takeout format");
    }

    console.log(`Converted ${places.length} places`);
    return places;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(
        `File not found: ${inputPath}\n\nPlease export your places from Google Takeout:\n1. Go to https://takeout.google.com\n2. Select only "Maps (your places)"\n3. Download and extract the archive\n4. Copy "Saved Places.json" to ${inputPath}`,
      );
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0] || TAKEOUT_INPUT_PATH;

  try {
    const places = await convertTakeoutToPlaces(inputPath);

    await fs.writeFile(PLACES_SAVE_PATH, JSON.stringify(places, null, 2));
    console.log(`✅ Saved ${places.length} places to ${PLACES_SAVE_PATH}`);

    // Show sample
    if (places.length > 0) {
      console.log("\nSample place:");
      console.log(JSON.stringify(places[0], null, 2));
    }
  } catch (error) {
    console.error("❌ Error:", error);

    console.log("\n📝 How to get your places:");
    console.log("1. Go to https://takeout.google.com");
    console.log('2. Click "Deselect all"');
    console.log('3. Select only "Maps (your places)"');
    console.log('4. Click "Next step" → "Create export"');
    console.log("5. Download and extract the archive");
    console.log(`6. Copy "Saved Places.json" to: ${inputPath}`);
    console.log(`7. Run: pnpm places-from-takeout [path-to-file]`);

    process.exit(1);
  }
}

main();
