declare global {
  interface Window {
    APP_INITIALIZATION_STATE?: unknown;
  }
}

export interface Place {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  notes: string;
  timestampMs: number;
  graphId: string;
}

/**
 * Pulls the saved-places list out of Google Maps' `window.APP_INITIALIZATION_STATE`.
 *
 * This function is deliberately self-contained: no imports, no references to
 * module scope, no TypeScript-only runtime constructs. That lets it be
 * stringified with `extractPlaces.toString()` and injected into a remote browser
 * (see `evaluateOnPage` in `browser-run.ts`), while still being importable and
 * unit-testable in Node.
 */
export function extractPlaces(appState: unknown): Place[] {
  if (!Array.isArray(appState)) {
    throw new Error(
      "APP_INITIALIZATION_STATE is missing or not an array (got " +
        typeof appState +
        ")",
    );
  }

  // find longest non-null array
  const reduceLongest = (longest: any, current: any) =>
    current && current.length > longest.length ? current : longest;

  const rawJsonString: string = appState
    .reduce(reduceLongest, [])
    .reduce(reduceLongest, "");

  const cleanJsonString = rawJsonString
    // remove the security stuff
    .slice(rawJsonString.indexOf("\n") + 1)
    // replace escaped quotes
    .replace(/\\"/g, "'");

  const rawData = JSON.parse(cleanJsonString)[0].reduce(reduceLongest, []);

  return rawData.map((data: any) => ({
    name: data[2],
    address: data[1][4],
    latitude: data[1][5][2],
    longitude: data[1][5][3],
    notes: data[3],
    timestampMs: data[9][0] * 1000,
    graphId: data[1][7],
  }));
}
