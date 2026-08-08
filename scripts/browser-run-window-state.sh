#!/usr/bin/env bash
#
# Live test: read `window.APP_INITIALIZATION_STATE` out of a Google Maps page
# using Cloudflare Browser Run, with nothing but curl.
#
# The REST API has no page.evaluate(), so this uses the /content endpoint's
# `addScriptTag` hook. The injected script runs after navigation, reads the
# window variable, and rewrites the document to a single base64 blob that we
# decode here. See https://developers.cloudflare.com/browser-run/quick-actions/content-endpoint/
#
# Usage:
#   export CLOUDFLARE_ACCOUNT_ID=...
#   export CLOUDFLARE_API_TOKEN=...   # needs "Browser Rendering - Edit"
#   ./scripts/browser-run-window-state.sh [url]
#
set -euo pipefail

PLACE_ID="hie8OZlTQ5613oEw5K-wWg"
URL="${1:-https://www.google.com/maps/place/data=!3m1!4b1!4m3!11m2!2s${PLACE_ID}!3e3}"
PAYLOAD_ID="cf-browser-run-payload"

: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Browser Rendering - Edit)}"

# Runs inside the Cloudflare-hosted browser. Reports the shape of the window
# variable rather than dumping it, so the response stays small.
read -r -d '' PAGE_SCRIPT <<JS || true
(function () {
  var out = { href: location.href, title: document.title };
  try {
    var state = window.APP_INITIALIZATION_STATE;
    out.typeofState = typeof state;
    out.isArray = Array.isArray(state);

    if (Array.isArray(state)) {
      var longest = function (a, b) { return b && b.length > a.length ? b : a; };
      var inner = state.reduce(longest, []);
      var raw = inner.reduce(longest, "");
      out.topLevelLength = state.length;
      out.longestInnerArrayLength = inner.length;
      out.longestStringLength = raw.length;
      out.longestStringPreview = String(raw).slice(0, 400);
    }
  } catch (err) {
    out.error = String((err && err.stack) || err);
  }

  var bytes = new TextEncoder().encode(JSON.stringify(out));
  var binary = "";
  for (var i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  document.documentElement.innerHTML =
    '<head></head><body><pre id="${PAYLOAD_ID}">' + btoa(binary) + '</pre></body>';
})();
JS

# node only escapes the script into JSON; curl still makes the request.
BODY="$(URL="$URL" PAGE_SCRIPT="$PAGE_SCRIPT" node -e '
  process.stdout.write(JSON.stringify({
    url: process.env.URL,
    gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
    rejectResourceTypes: ["image", "media", "font"],
    addScriptTag: [{ content: process.env.PAGE_SCRIPT }],
  }));
')"

echo "==> POST /browser-rendering/content"
echo "    url: $URL"

RESPONSE="$(curl -sS --fail-with-body -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/content" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$BODY")"

echo "==> Decoding injected payload"
PAYLOAD_ID="$PAYLOAD_ID" node -e '
  const response = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!response.success) {
    console.error("Cloudflare returned an error:", JSON.stringify(response.errors, null, 2));
    process.exit(1);
  }
  const match = response.result.match(
    new RegExp(`<pre id="${process.env.PAYLOAD_ID}">([A-Za-z0-9+/=]*)</pre>`),
  );
  if (!match) {
    console.error("Payload marker missing — the injected script never ran.");
    console.error(response.result.slice(0, 1000));
    process.exit(1);
  }
  console.log(JSON.stringify(JSON.parse(Buffer.from(match[1], "base64").toString("utf8")), null, 2));
' <<<"$RESPONSE"
