import "dotenv/config";

/**
 * Minimal client for Cloudflare Browser Run (Browser Rendering) Quick Actions.
 *
 * https://developers.cloudflare.com/browser-run/quick-actions/content-endpoint/
 *
 * The REST API has no `page.evaluate()` equivalent — it only returns rendered
 * HTML, Markdown, screenshots, and so on. `evaluateOnPage` works around that by
 * using the `/content` endpoint's `addScriptTag` hook: the injected script runs
 * after navigation, so it can read anything on `window`, then it replaces the
 * document with a single base64 blob that we decode back on this side. Base64
 * is used because it survives HTML serialization without any escaping, and
 * because collapsing the document keeps the response small.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";
const PAYLOAD_ID = "cf-browser-run-payload";

/**
 * Artifacts a bundler leaves behind when a function body references an imported
 * binding. Such a function cannot survive `toString()` injection, because the
 * namespace object it was rewritten to point at does not exist in the page.
 */
const BUNDLER_ARTIFACT = /__vite_ssr_import_|__toESM\(|_interop_require/;

export interface EvaluateOptions<D extends Function[] = Function[]> {
  /**
   * Functions shipped to the page and handed to `fn` as arguments. They are
   * serialized with `Function.prototype.toString()`, so each must be
   * self-contained: no imports, no references to module scope.
   */
  dependencies?: D;
  /** Passed through to Puppeteer's `page.goto`. */
  gotoOptions?: { waitUntil?: string; timeout?: number };
  /** Resource types Cloudflare should refuse to load, to speed up the render. */
  rejectResourceTypes?: string[];
  /** Timeout for the Cloudflare API call itself, in ms. */
  requestTimeoutMs?: number;
}

export function isBrowserRunConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
  );
}

function requireCredentials(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(
      "Browser Run is not configured: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN " +
        "(the token needs the 'Browser Rendering - Edit' permission).",
    );
  }
  return { accountId, apiToken };
}

/**
 * Wraps `fn` and its `dependencies` in the boilerplate that calls `fn` with the
 * dependencies as arguments and serializes its return value into the document
 * as base64-encoded JSON.
 *
 * Dependencies are passed as arguments rather than referenced by name because
 * an imported identifier inside `fn` would have been rewritten by the bundler
 * to a module-namespace lookup that does not exist in the page.
 */
export function buildPayloadScript(
  fn: Function,
  dependencies: Function[] = [],
): string {
  const sources = [fn, ...dependencies].map((source) => source.toString());

  const offender = sources.find((source) => BUNDLER_ARTIFACT.test(source));
  if (offender) {
    throw new Error(
      "Cannot inject a function that references an imported binding — the bundler " +
        "rewrote it to a module-namespace lookup that does not exist in the page. " +
        "Pass it via `dependencies` and accept it as an argument instead. Source:\n" +
        offender.slice(0, 300),
    );
  }

  const [entry, ...deps] = sources;
  const openTag = JSON.stringify(`<head></head><body><pre id="${PAYLOAD_ID}">`);
  const closeTag = JSON.stringify("</pre></body>");

  return `(function () {
  var __deps = [${deps.join(",\n")}];
  var __payload;
  try {
    __payload = { ok: true, value: (${entry}).apply(null, __deps) };
  } catch (err) {
    __payload = { ok: false, error: String((err && err.stack) || err) };
  }
  var __bytes = new TextEncoder().encode(JSON.stringify(__payload));
  var __binary = "";
  for (var i = 0; i < __bytes.length; i += 0x8000) {
    __binary += String.fromCharCode.apply(null, __bytes.subarray(i, i + 0x8000));
  }
  document.documentElement.innerHTML = ${openTag} + btoa(__binary) + ${closeTag};
})();`;
}

/** Pulls the base64 payload back out of the HTML the /content endpoint returned. */
export function decodePayload<T>(html: string): T {
  const match = html.match(
    new RegExp(`<pre id="${PAYLOAD_ID}">([A-Za-z0-9+/=]*)</pre>`),
  );
  if (!match) {
    throw new Error(
      "Browser Run returned HTML without the injected payload — the page script " +
        `probably never ran. First 500 chars of the response:\n${html.slice(0, 500)}`,
    );
  }

  const decoded = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  if (!decoded.ok) {
    throw new Error(`Page script threw: ${decoded.error}`);
  }
  return decoded.value as T;
}

/**
 * Loads `url` in a Cloudflare-hosted browser, runs `fn` inside the page, and
 * returns its (JSON-serializable) result. The rough equivalent of Puppeteer's
 * `page.evaluate`, but over the stateless REST API.
 */
export async function evaluateOnPage<T, D extends Function[] = Function[]>(
  url: string,
  fn: (...dependencies: D) => T,
  options: EvaluateOptions<D> = {},
): Promise<T> {
  const { accountId, apiToken } = requireCredentials();
  const {
    dependencies = [] as unknown as D,
    gotoOptions = { waitUntil: "networkidle0", timeout: 30000 },
    rejectResourceTypes = ["image", "media", "font"],
    requestTimeoutMs = 120000,
  } = options;

  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/browser-rendering/content`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        gotoOptions,
        rejectResourceTypes,
        addScriptTag: [{ content: buildPayloadScript(fn, dependencies) }],
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    },
  );

  // Proxies and gateways in front of the API answer with HTML or plain text,
  // so don't assume the body parses as JSON.
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Browser Run /content returned a non-JSON response (HTTP ${response.status}). ` +
        `This usually means a proxy or gateway answered instead of the API:\n${text.slice(0, 300)}`,
    );
  }

  if (!response.ok || !body.success) {
    const errors = (body.errors ?? [])
      .map((error: any) => `${error.code}: ${error.message}`)
      .join("; ");
    throw new Error(
      `Browser Run /content failed (HTTP ${response.status})${errors ? `: ${errors}` : ""}`,
    );
  }

  return decodePayload<T>(body.result);
}
