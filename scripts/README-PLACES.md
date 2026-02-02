# Google Maps Places Sync

This directory contains scripts to fetch and sync your saved Google Maps places to `public/places.json`.

## Available Methods

### Method 1: Direct Scraping (Local Only) ⚡

**Script:** `scripts/places.ts`
**Command:** `pnpm places`

Uses Puppeteer to scrape your saved places directly from Google Maps. This is the fastest method but requires:

- Browser automation support (Chromium)
- Local execution (won't work in sandboxed/CI environments)

```bash
pnpm places
```

### Method 2: Google Takeout (Recommended for CI/Restricted Environments) 📦

**Script:** `scripts/places-from-takeout.ts`
**Command:** `pnpm places-from-takeout [path-to-file]`

Converts Google Takeout export data to the format used by this site.

**Steps:**

1. Go to [Google Takeout](https://takeout.google.com)
2. Click "Deselect all"
3. Select only "Maps (your places)"
4. Click "Next step" → "Create export"
5. Download and extract the archive
6. Find `Saved Places.json` in the extracted files
7. Run one of:

```bash
# If you place the file in public/Saved Places.json
pnpm places-from-takeout

# Or specify custom path
pnpm places-from-takeout /path/to/Saved\ Places.json
```

### Method 3: Manual Scraping (Fallback) 🛠️

**Script:** `src/lib/places.ts`

The original implementation that also syncs to Notion. Has the same requirements as Method 1.

```bash
pnpm exec jiti src/lib/places.ts
```

## Output Format

All scripts generate `public/places.json` with this structure:

```json
[
  {
    "name": "Place Name",
    "address": "123 Main St, City, State 12345",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "notes": "Optional notes or tags",
    "timestampMs": 1234567890000,
    "graphId": "/g/123abc"
  }
]
```

## Troubleshooting

### Browser won't launch (Puppeteer errors)

This is expected in sandboxed environments. Use Method 2 (Google Takeout) instead.

### Network errors (EAI_AGAIN, fetch failed)

The environment has network restrictions. Use Method 2 (Google Takeout) instead.

### Empty or no output

- Check that you have saved places in Google Maps
- Verify the place list ID in the script (currently: `hie8OZlTQ5613oEw5K-wWg`)
- For Method 2, ensure the Takeout file is in the correct format

## Updating the Place List ID

If you want to scrape a different saved list, update the `placeId` in the scripts:

```typescript
const placeId = "your-list-id-here";
```

To find your list ID:
1. Open Google Maps
2. Go to "Saved" → Your list
3. Click "Share"
4. The ID is in the share URL: `...maps/place/...!2s[THIS-IS-THE-ID]!3e3`

## Current Status

- **Last updated:** March 24, 2025
- **Current count:** Check `public/places.json`
- **Update frequency:** Manual (run script when needed)

## Future Improvements

- [ ] Automated scheduled updates via GitHub Actions
- [ ] Google Places API integration with proper auth
- [ ] Incremental updates (only fetch new/changed places)
- [ ] Notion sync improvements
