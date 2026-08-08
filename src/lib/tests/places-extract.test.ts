import { describe, it, expect } from "vitest";
import { extractPlaces } from "../places-extract";
import type { Place } from "../places-extract";
import { buildPayloadScript, decodePayload } from "../browser-run";

/**
 * Rebuilds the shape Google Maps ships in `window.APP_INITIALIZATION_STATE`:
 * an array of arrays, one of which holds a long string whose first line is a
 * anti-JSON-hijacking prefix and whose remainder is the encoded place list.
 */
function buildAppInitializationState(places: Place[]): unknown[] {
  const entries = places.map((place) => [
    null,
    [
      null,
      null,
      null,
      null,
      place.address,
      [null, null, place.latitude, place.longitude],
      null,
      place.graphId,
    ],
    place.name,
    place.notes,
    null,
    null,
    null,
    null,
    null,
    [place.timestampMs / 1000],
  ]);

  const payload = `)]}'\n${JSON.stringify([[[], entries]])}`;

  return [["short"], [null, "x", payload], []];
}

const places: Place[] = [
  {
    name: "Jeffrey's Grocery",
    address: "172 Waverly Pl, New York, NY 10014",
    latitude: 40.733959399999996,
    longitude: -74.00136429999999,
    notes: "caesar salad foodnyc",
    timestampMs: 1742856919000,
    graphId: "/g/1tfbjn1p",
  },
  {
    name: "Shuya",
    address: "517 3rd Ave, New York, NY 10016",
    latitude: 40.746083399999996,
    longitude: -73.9775784,
    notes: "foodnyc",
    timestampMs: 1742826630000,
    graphId: "/g/11vx4bwpl8",
  },
];

describe("extractPlaces", () => {
  it("parses places out of APP_INITIALIZATION_STATE", () => {
    expect(extractPlaces(buildAppInitializationState(places))).toEqual(places);
  });

  it("throws a useful error when the window variable is missing", () => {
    expect(() => extractPlaces(undefined)).toThrow(
      /APP_INITIALIZATION_STATE is missing/,
    );
  });
});

/**
 * Executes an injected script the way Browser Run would, against a stub
 * document, and returns the HTML the /content endpoint would have sent back.
 */
function runInFakePage(
  script: string,
  window: Record<string, unknown>,
): string {
  const document = { documentElement: { innerHTML: "" } };
  new Function("window", "document", script)(window, document);
  return `<!DOCTYPE html><html>${document.documentElement.innerHTML}</html>`;
}

describe("browser-run payload round trip", () => {
  it("ships extractPlaces into the page and decodes its result", () => {
    const script = buildPayloadScript(
      (extract: typeof extractPlaces) =>
        extract(window.APP_INITIALIZATION_STATE),
      [extractPlaces],
    );

    const html = runInFakePage(script, {
      APP_INITIALIZATION_STATE: buildAppInitializationState(places),
    });

    expect(decodePayload<Place[]>(html)).toEqual(places);
  });

  it("surfaces errors thrown inside the page", () => {
    const script = buildPayloadScript(
      (extract: typeof extractPlaces) =>
        extract(window.APP_INITIALIZATION_STATE),
      [extractPlaces],
    );

    const html = runInFakePage(script, { APP_INITIALIZATION_STATE: undefined });

    expect(() => decodePayload(html)).toThrow(
      /Page script threw:.*APP_INITIALIZATION_STATE is missing/s,
    );
  });

  it("rejects a page function that closes over an import", () => {
    // What the bundler produces when the arrow references `extractPlaces`
    // directly instead of taking it as an argument.
    expect(() =>
      buildPayloadScript(() =>
        (globalThis as any).__vite_ssr_import_1__.extractPlaces(),
      ),
    ).toThrow(/references an imported binding/);
  });

  it("explains itself when the payload never appeared", () => {
    expect(() => decodePayload("<html><body>nope</body></html>")).toThrow(
      /without the injected payload/,
    );
  });
});
