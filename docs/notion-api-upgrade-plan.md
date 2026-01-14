# Notion API Upgrade Plan

This document outlines the plan for upgrading the Notion API client from v4.0.2 to v5.x.

## Current State

- **Package Version:** `@notionhq/client@^4.0.2`
- **API Version:** Pre-2025-09-03 (legacy database model)
- **Files Affected:**
  - `src/lib/notion-client.ts` - Client singleton
  - `src/lib/notion-cms.ts` - Database queries and block fetching
  - `src/lib/notion-cms-page.ts` - Page/database property retrieval
  - `src/lib/notion-parse.ts` - Block-to-Markdown conversion
  - `src/lib/notion-download.ts` - Pre-build content sync
  - `src/lib/notion-types.ts` - Type definitions
  - `src/lib/notion-cms-asset.ts` - Asset downloading

## Benefits of Upgrading to v5.x

### 1. Multi-Source Database Architecture
The new API separates "databases" (containers) from "data sources" (tables):
- **Database:** A container that can hold multiple collections of structured data
- **Data Source:** What was previously called a database (a table with pages and properties)

This enables more flexible organization of content and future-proofs the integration.

### 2. Future Compatibility
- The old API model will eventually be deprecated
- If a user adds another data source to a database in Notion, actions like creating pages, querying databases, and writing relation properties will fail on the old API

### 3. New Endpoints & Features
- `notion.dataSources.*` - Manage databases at the data source level
- `notion.dataSources.listTemplates` - Access database templates
- `Client.pages.move` - Move pages between parents
- `place` property type support
- Templates for page creation

### 4. Improved Error Handling
- New `additional_data` field in API error responses
- Better diagnostics for debugging integration issues

### 5. Security Improvements
- New `ntn_` token prefix for better compatibility with secret scanners
- Enhanced security tooling integration

### 6. TypeScript Improvements
- All examples migrated to TypeScript
- Updated type definitions for new API structures

## Breaking Changes to Address

### 1. Removed: `notion.databases.list()`
**Impact:** None - this endpoint is not used in the codebase.

### 2. Database vs Data Source Terminology
**Impact:** Medium - need to update `queryNotionDatabase()` and `getDatabaseProperties()`:
- `notion.databases.query()` may need migration to `notion.dataSources.query()`
- `notion.databases.retrieve()` may need migration to `notion.dataSources.retrieve()`

### 3. Search Filter Enum Change
**Impact:** Low - if search is used, filter changed from `page | database` to `page | data_source`.

### 4. Type Import Paths
**Impact:** Low - type imports from `@notionhq/client/build/src/api-endpoints` may change.

## Upgrade Plan

### Phase 1: Preparation & Testing

1. **Create feature branch**
   ```bash
   git checkout -b feature/notion-api-v5-upgrade
   ```

2. **Update package dependency**
   ```bash
   pnpm update @notionhq/client@^5.6.0
   ```

3. **Review TypeScript errors**
   - Run `pnpm build` and identify compilation errors
   - Document all type mismatches

### Phase 2: Code Migration

#### Step 2.1: Update Client Configuration
**File:** `src/lib/notion-client.ts`

The client initialization should remain the same, but verify no breaking changes:
```typescript
import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});
```

#### Step 2.2: Migrate Database Queries
**File:** `src/lib/notion-cms.ts`

Evaluate if `notion.databases.query()` needs migration to `notion.dataSources.query()`:
- Check if existing database IDs work with new endpoints
- The SDK should handle backward compatibility, but test thoroughly

Current usage:
```typescript
// Line 38
const { results, next_cursor } = await notion.databases.query({
  ...options,
  start_cursor: cursor,
});
```

#### Step 2.3: Update Type Imports
**File:** `src/lib/notion-types.ts`, `src/lib/notion-cms.ts`, `src/lib/notion-cms-page.ts`, `src/lib/notion-parse.ts`

Update imports if paths change:
```typescript
// Current
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

// May need to become
import type { BlockObjectResponse } from "@notionhq/client/api-endpoints";
```

#### Step 2.4: Handle New Response Structures
Review any changes to:
- `PageObjectResponse` structure
- `BlockObjectResponse` structure
- `QueryDatabaseParameters` type
- Property response types

### Phase 3: Testing & Validation

1. **Run existing tests**
   ```bash
   pnpm test
   ```

2. **Test content sync**
   ```bash
   pnpm predev
   ```

   Verify:
   - Blog posts download correctly
   - Project entries download correctly
   - Assets are fetched and saved
   - MDX files are generated with correct frontmatter

3. **Test full build**
   ```bash
   pnpm build
   ```

4. **Manual verification**
   - Check all pages render correctly
   - Verify navigation loads from Notion
   - Test places page data
   - Verify reading/knowledge entries

### Phase 4: Documentation & Cleanup

1. **Update CLAUDE.md** if any API patterns change

2. **Update environment variable documentation** if needed

3. **Add migration notes** for any behavior changes

## File-by-File Changes

### `src/lib/notion-client.ts`
- Likely no changes needed
- Verify client options haven't changed

### `src/lib/notion-cms.ts`
- Update `queryNotionDatabase()` if API endpoints change
- Verify `getBlockChildren()` works with new API
- Check `getBlock()` asset handling

### `src/lib/notion-cms-page.ts`
- `getPageProperties()` - verify `notion.pages.retrieve()` response
- `getDatabaseProperties()` - may need migration to `notion.dataSources.retrieve()`

### `src/lib/notion-parse.ts`
- Verify all block type handlers still work
- Check if any new block types should be supported
- Verify rich text annotation handling

### `src/lib/notion-types.ts`
- Update type imports if paths change
- Add any new type definitions needed

### `src/lib/notion-download.ts`
- Should work without changes if underlying functions are updated

### `src/lib/notion-cms-asset.ts`
- Review asset URL handling for any changes

## Rollback Plan

If critical issues are discovered:

1. Revert package version:
   ```bash
   pnpm add @notionhq/client@^4.0.2
   ```

2. Restore any code changes via git

3. Document issues encountered for future resolution

## Timeline Considerations

This upgrade should be performed:
- After thorough testing in a development environment
- When there's time to address any unexpected issues
- Before Notion deprecates the old API version

## References

- [Notion API Changelog](https://developers.notion.com/page/changelog)
- [SDK Releases](https://github.com/makenotion/notion-sdk-js/releases)
- [Multi-Source Databases Documentation](https://www.notionapps.com/blog/notion-data-sources-update-2025)

## Sources

- [Notion API Changelog](https://developers.notion.com/page/changelog)
- [Notion SDK-JS GitHub Releases](https://github.com/makenotion/notion-sdk-js/releases)
- [Notion What's New](https://www.notion.com/releases)
- [Notion Data Sources Explained](https://www.notionapps.com/blog/notion-data-sources-update-2025)
