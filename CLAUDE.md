# CLAUDE.md - AI Assistant Guide

This document provides comprehensive guidance for AI assistants working with this Astro-based personal website codebase.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Development Workflows](#development-workflows)
4. [Content Management](#content-management)
5. [Architecture Patterns](#architecture-patterns)
6. [Component Guidelines](#component-guidelines)
7. [Styling Conventions](#styling-conventions)
8. [Common Tasks](#common-tasks)
9. [Environment Setup](#environment-setup)
10. [Git Workflow](#git-workflow)

---

## Project Overview

**Website:** https://www.andrewgao.org/
**Framework:** Astro 5.5.4
**Package Manager:** pnpm (with shamefully-hoist=true)
**Node Version:** Uses modern ES modules (type: "module")
**Deployment:** Vercel

### Tech Stack

- **Frontend Framework:** Astro (SSG)
- **UI Libraries:** React 19.0.0 (for Image), Solid.js 1.9.5 (for interactivity)
- **Content:** MDX with Notion CMS integration
- **Styling:** Tailwind CSS 4.0.15 (via Vite plugin)
- **Typography:** Custom variable fonts (Inter, Newsreader)
- **Maps:** Leaflet with Solid.js wrapper
- **Testing:** Vitest with coverage support
- **Build Tools:** Jiti (TypeScript execution), Prettier, Sharp

### Key Features

- Notion-powered CMS for blog posts, projects, and knowledge entries
- Interactive map visualization of places
- Dynamic navigation from Notion database
- Pre-build content synchronization
- SEO-optimized with sitemap generation
- Custom MDX content collections

---

## Directory Structure

```
/home/user/website-astro/
├── src/
│   ├── components/          # UI components (Astro, React, Solid.js)
│   │   ├── Navigation.astro # Header navigation (Notion-powered)
│   │   ├── Navigation.tsx   # React/Solid.js navigation wrapper
│   │   ├── Head.astro      # SEO meta tags component
│   │   ├── Map.tsx         # Solid.js Leaflet map
│   │   ├── Icon.tsx        # Icon library component
│   │   ├── ReadingEntry.astro # Knowledge entry display
│   │   └── BottomNavigation.tsx # Mobile navigation
│   ├── content/            # MDX content collections (auto-generated)
│   │   ├── blog/           # Blog posts from Notion
│   │   └── projects/       # Project entries from Notion
│   ├── layouts/
│   │   └── Layout.astro    # Main layout wrapper
│   ├── lib/                # Core utilities and integrations
│   │   ├── notion-client.ts      # Notion API client singleton
│   │   ├── notion-cms.ts         # Database/block querying
│   │   ├── notion-parse.ts       # Notion → Markdown converter
│   │   ├── notion-cms-page.ts    # Page property retrieval
│   │   ├── notion-cms-asset.ts   # Media file downloads
│   │   ├── notion-download.ts    # Pre-build sync script
│   │   ├── breakpoints.ts        # Responsive breakpoint values
│   │   └── tests/               # Vitest test files
│   ├── pages/              # File-based routing
│   │   ├── index.astro     # Home page
│   │   ├── blog/           # Blog listing and posts
│   │   ├── projects/       # Projects listing and pages
│   │   ├── read.astro      # Knowledge/reading log
│   │   ├── places.astro    # Interactive places map
│   │   ├── design.astro    # Design/style guide
│   │   └── 404.astro       # Custom 404 page
│   ├── styles/             # CSS configuration
│   │   ├── global.css      # Global imports and utilities
│   │   ├── prose.css       # Typography overrides
│   │   ├── fonts.css       # Variable font imports
│   │   ├── animations.css  # Custom animations
│   │   └── leaflet.css     # Map library overrides
│   ├── assets/             # Local image assets
│   ├── content.config.ts   # Content collections configuration
│   └── env.d.ts           # TypeScript environment types
├── scripts/
│   └── index.ts           # Build-time Notion sync script
├── public/                # Static assets (fonts, icons, data)
│   ├── tests/            # Test fixtures
│   └── places.json       # Places data (generated)
├── astro.config.mjs      # Astro configuration
├── tsconfig.json         # TypeScript configuration
├── prettier.config.cjs   # Code formatting rules
├── vercel.json          # Deployment configuration
└── package.json         # Dependencies and scripts
```

---

## Development Workflows

### Getting Started

```bash
# Install dependencies
pnpm install

# Start development server (syncs Notion content first)
pnpm dev

# Build for production (syncs Notion content first)
pnpm build

# Preview production build
pnpm preview

# Run tests
pnpm test

# Generate coverage report
pnpm coverage
```

### Pre-Build Hooks

Both `pnpm dev` and `pnpm build` run `jiti scripts/index.ts` first, which:
1. Syncs blog posts from Notion (`NOTION_BLOG_DB_ID`)
2. Syncs project entries from Notion (`NOTION_PROJECTS_DB_ID`)
3. Downloads assets locally
4. Generates MDX files with YAML frontmatter in `src/content/`

### Build Output

- **Development:** `astro dev` starts local server on port 4321 (default)
- **Production:** `astro build` outputs to `dist/` directory
- **Static:** All pages are statically generated at build time

---

## Content Management

### Notion as CMS

This project uses **Notion databases as a headless CMS**. Content is synced at build time and converted to local MDX files.

#### Notion Databases

Required environment variables for database IDs:

```env
NOTION_TOKEN              # Notion API integration token
NOTION_BLOG_DB_ID        # Blog database ID
NOTION_PROJECTS_DB_ID    # Projects database ID
NOTION_PAGE_ID_HOME      # Home page content
NOTION_PAGE_ID_BLOG      # Blog overview page
NOTION_PAGE_ID_READ      # Reading/knowledge page
NOTION_PAGE_ID_PLACES    # Places page content
NOTION_DB_ID_PAGES       # Navigation pages database
NOTION_DB_ID_PLACES      # Places/map entries database
NOTION_DB_ID_KNOWLEDGE_2024 # 2024 knowledge entries
NOTION_DB_ID_KNOWLEDGE_2025 # 2025 knowledge entries
NOTION_DB_ID_KNOWLEDGE_2026 # 2026 knowledge entries
```

#### Database Schema

Both blog and projects databases use this schema (defined in `src/content.config.ts`):

```typescript
{
  lastEditedTime: Date,     // Modification timestamp
  published: string,        // Publication date
  description: string,      // SEO description
  path: string,            // URL slug
  dates: string,           // Optional date range
  tags: string,            // Comma-separated tags
  public: boolean,         // Visibility toggle
  title: string            // Post/project title
}
```

#### Content Sync Process

1. **Query:** `queryNotionDatabase()` fetches all pages where `public: true`
2. **Parse:** `getBlock()` recursively fetches blocks and converts to Markdown
3. **Assets:** Images/files downloaded to `public/` directory
4. **Write:** MDX file created at `src/content/[collection]/[id].mdx`
5. **Incremental:** Only updates if `lastEditedTime` changed

**Code Reference:** `src/lib/notion-download.ts:downloadPostsAsMdx()`

### Content Collections

Defined in `src/content.config.ts`:

```typescript
import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/blog' }),
  schema: z.object({ /* ... */ })
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({ /* ... */ })
});
```

Access in pages:

```typescript
import { getCollection } from 'astro:content';

const posts = await getCollection('blog');
const projects = await getCollection('projects');
```

### Notion Block Conversion

**Supported Notion Block Types:**
- Paragraphs, Headings (H1-H3)
- Bulleted/Numbered/To-do lists
- Quotes, Code blocks
- Tables (with headers)
- Images, Videos, PDFs, Audio
- Embeds (YouTube, etc.)
- Callouts, Toggles

**Rich Text Annotations:**
- Bold, Italic, Strikethrough, Underline
- Inline code
- Links (internal and external)
- Colors (converted to Tailwind classes)

**Code Reference:** `src/lib/notion-parse.ts:parseBlocks()`

---

## Architecture Patterns

### 1. Notion-as-CMS Pattern

```
Notion Databases → Pre-build Sync → Local MDX Files → Astro Build → Static HTML
```

**Why this approach?**
- **Performance:** Static generation is faster than runtime API calls
- **Reliability:** Site works even if Notion API is down
- **Cost:** No API rate limit concerns in production
- **Incremental:** Only syncs changed content

### 2. Multi-Framework Strategy

- **Astro:** Server-side rendering, layouts, routing
- **React:** Image optimization (`<Image />` component)
- **Solid.js:** Interactive components (Map, Navigation)

**When to use each:**
- Astro: Static content, layouts, SEO
- React: When you need Astro's Image component
- Solid.js: Interactive UI with client-side hydration (`client:only="solid-js"`)

### 3. Type-Safe Content

All Notion responses are typed:

```typescript
import type { BlockObjectResponse, PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';

// Type guards ensure runtime safety
if ('type' in block && block.type === 'paragraph') {
  // TypeScript knows this is a paragraph block
}
```

### 4. Build-Time Data Fetching

Pages fetch Notion data at build time:

```astro
---
// src/pages/index.astro
import { getPage } from '@lib/notion-cms-page';
import { getBlock } from '@lib/notion-cms';

const page = await getPage(import.meta.env.NOTION_PAGE_ID_HOME);
const blocks = await getBlock(page.id);
---
```

This runs **once per build**, not on every request.

---

## Component Guidelines

### Layout.astro Props

```typescript
interface Props {
  title: string;            // Page title (appears in <title> and OG tags)
  description: string;      // Meta description for SEO
  path: string;            // Current page path (for canonical URL)
  imageUrl?: string;       // Open Graph image URL
  className?: string;      // Additional classes for <html>
  bodyClassName?: string;  // Additional classes for <body>
  mainClassName?: string;  // Additional classes for <main>
  isNavigationFixed?: boolean; // Whether navigation is sticky (default: true)
}
```

**Usage:**

```astro
---
import Layout from '@layouts/Layout.astro';
---

<Layout
  title="Page Title"
  description="Page description for SEO"
  path="/page-slug"
  imageUrl="https://example.com/og-image.png"
>
  <Fragment slot="content">
    <!-- Page content here -->
  </Fragment>
</Layout>
```

### Head.astro (SEO Component)

Automatically generates:
- `<title>` tag
- Meta description
- Open Graph tags (og:title, og:description, og:image, og:url)
- Twitter Card tags
- Canonical URL
- Viewport meta tag

**Exported by Layout.astro**, so use Layout instead of calling directly.

### Navigation Component

Navigation menu is **dynamically generated from Notion database** (`NOTION_DB_ID_PAGES`).

**Code Reference:** `src/components/Navigation.astro:15-28`

To add/edit navigation items, update the Notion database.

### Icon Component (Solid.js)

```tsx
import { Icon } from '@components/Icon';

<Icon type="home" class="w-6 h-6" />
<Icon type="project" class="w-6 h-6" />
<Icon type="about" class="w-6 h-6" />
<Icon type="menu" class="w-6 h-6" />
```

**Available icons:** `home`, `project`, `about`, `menu`

### Map Component (Solid.js)

Interactive Leaflet map for places visualization:

```tsx
import Map from '@components/Map';

<Map client:only="solid-js" />
```

**Data source:** `public/places.json` (generated from Notion or Google Maps scraping)

**Features:**
- Stadia Maps tile provider
- Dynamic marker visibility based on zoom level
- Custom bounds and min zoom
- Pins become dots when zoomed out

**Code Reference:** `src/components/Map.tsx`

---

## Styling Conventions

### Tailwind CSS 4.0

**Configuration:**
- Vite plugin integration (`@tailwindcss/vite`)
- Typography plugin for prose styling (`@tailwindcss/typography`)
- Custom fonts via `@theme` directive

**Common Patterns:**

```html
<!-- Layout containers -->
<div class="mx-auto max-w-2xl px-4">

<!-- Typography -->
<h1 class="text-4xl font-bold">
<p class="prose prose-stone">

<!-- Responsive -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

<!-- Interactive states -->
<button class="hover:bg-stone-200 active:bg-stone-300">
```

### Typography System

**Custom Variable Fonts:**
- `font-sans`: Inter (weight 100-900)
- `font-serif`: Newsreader (weight 100-900)

**Defined in:** `src/styles/fonts.css`

**Prose Styling:**
Custom overrides in `src/styles/prose.css` for:
- Heading line heights and margins
- Paragraph spacing
- List styling
- Code block appearance
- Link colors

**Usage:**

```html
<article class="prose prose-stone prose-lg">
  <!-- Markdown/MDX content here -->
</article>
```

### Color System

**Background:** `bg-stone-100` (default body background)

**Notion Block Colors:**
Converted to Tailwind classes in `src/lib/notion-parse.ts`:

```typescript
gray → text-stone-600
orange → text-orange-600
yellow → text-yellow-600
green → text-green-600
blue → text-blue-600
purple → text-purple-600
pink → text-pink-600
red → text-red-600
```

Background variants use `-50` suffix (e.g., `bg-orange-50`).

### Responsive Breakpoints

TypeScript values in `src/lib/breakpoints.ts`:

```typescript
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};
```

Use in JavaScript/TypeScript for media query logic.

### Custom Animations

Defined in `src/styles/animations.css`:

```css
--animate-slide-down: animate-slide-down 0.3s ease-out;
--animate-slide-up: animate-slide-up 0.3s ease-out;
```

**Usage:**

```html
<div class="animate-slide-down">
```

---

## Common Tasks

### Adding a New Blog Post

**Option 1: Via Notion (Recommended)**
1. Add entry to Notion blog database (`NOTION_BLOG_DB_ID`)
2. Set `public` checkbox to true
3. Run `pnpm dev` or `pnpm build`
4. MDX file auto-generated in `src/content/blog/`

**Option 2: Manual MDX**
1. Create `src/content/blog/[slug].mdx`
2. Add frontmatter matching schema
3. Write content in MDX

### Adding a New Project

Same process as blog posts, but use `NOTION_PROJECTS_DB_ID` and `src/content/projects/`.

### Creating a New Page

1. Create `src/pages/[name].astro`
2. Import and use `Layout.astro`
3. Fetch Notion data at top of component (if needed)
4. Add content in `<Fragment slot="content">`

**Example:**

```astro
---
import Layout from '@layouts/Layout.astro';

const title = 'New Page';
const description = 'Description for SEO';
---

<Layout title={title} description={description} path="/new-page">
  <Fragment slot="content">
    <h1>{title}</h1>
    <p>Page content here</p>
  </Fragment>
</Layout>
```

### Querying Notion Database

```typescript
import { queryNotionDatabase } from '@lib/notion-cms';

const results = await queryNotionDatabase(databaseId, {
  filter: {
    property: 'public',
    checkbox: { equals: true }
  },
  sorts: [
    { property: 'published', direction: 'descending' }
  ]
});
```

**Code Reference:** `src/lib/notion-cms.ts:queryNotionDatabase()`

### Fetching Notion Page Content

```typescript
import { getPage } from '@lib/notion-cms-page';
import { getBlock } from '@lib/notion-cms';
import { parseBlocks } from '@lib/notion-parse';

const page = await getPage(pageId);
const blocks = await getBlock(pageId);
const markdown = parseBlocks(blocks);
```

**Code Reference:** `src/lib/notion-cms.ts:getBlock()`, `src/lib/notion-parse.ts:parseBlocks()`

### Converting Markdown to HTML

```typescript
import { marked } from 'marked';

const html = marked.parse(markdown, {
  renderer: customRenderer // optional
});
```

**Example in:** `src/pages/index.astro:35-72` (custom task list renderer)

### Adding a New Navigation Item

Update the Notion database (`NOTION_DB_ID_PAGES`) with:
- **Name:** Display text
- **Path:** URL path (e.g., `/about`)
- **Order:** Numeric sort order

Navigation auto-updates on next build.

### Styling a Component

**Prefer Tailwind utility classes:**

```astro
---
const { title, class: className } = Astro.props;
---

<div class:list={['prose prose-stone', className]}>
  <h1 class="text-4xl font-bold">{title}</h1>
</div>
```

**Use `class:list`** for conditional classes:

```astro
<div class:list={[
  'base-class',
  isActive && 'active-class',
  { 'conditional-class': someCondition }
]}>
```

### Adding Tests

Create test file in `src/lib/tests/`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature name', () => {
  it('should do something', () => {
    // Test code
    expect(result).toBe(expected);
  });
});
```

Run with `pnpm test` or `pnpm coverage`.

---

## Environment Setup

### Required Environment Variables

Create `.env` file in project root:

```env
# Notion API
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Notion Databases
NOTION_BLOG_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PROJECTS_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Notion Pages
NOTION_PAGE_ID_HOME=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID_HOME_INGR=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID_HOME_ALLE=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID_BLOG=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID_READ=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PAGE_ID_PLACES=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Additional Databases
NOTION_DB_ID_PAGES=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_ID_PLACES=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_ID_KNOWLEDGE_2024=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_ID_KNOWLEDGE_2025=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_ID_KNOWLEDGE_2026=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**How to get Notion IDs:**
- Database ID: Last part of database URL (32 chars)
- Page ID: From "Copy link" → extract ID from URL
- Token: Create integration at https://www.notion.so/my-integrations

**Access in code:**

```typescript
const token = import.meta.env.NOTION_TOKEN;
const dbId = import.meta.env.NOTION_BLOG_DB_ID;
```

### Local Development Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd website-astro

# 2. Install dependencies
pnpm install

# 3. Create .env file (see above)
touch .env

# 4. Start development server
pnpm dev
```

### Vercel Deployment

**Auto-deploys on:**
- Push to main branch
- Pull request preview deployments

**Environment variables:**
Configure in Vercel dashboard → Project Settings → Environment Variables

**Build settings:**
- Framework: Astro
- Build command: `pnpm build` (default)
- Output directory: `dist` (default)

---

## Git Workflow

### Branch Naming

When working on GitHub issues or features, use descriptive branch names:

```bash
# Feature branches
git checkout -b feature/add-search-functionality

# Bug fixes
git checkout -b fix/navigation-mobile-issue

# Claude Code branches (auto-generated)
git checkout -b claude/add-feature-ABC123
```

### Commit Messages

**Format:** Imperative mood, concise, descriptive

```bash
# Good
git commit -m "Add reading log page with Notion integration"
git commit -m "Fix mobile navigation z-index issue"
git commit -m "Update prose styling for better readability"

# Avoid
git commit -m "Updated stuff"
git commit -m "Fixed bugs"
git commit -m "WIP"
```

### Pre-commit Checks

Before committing:

1. **Format code:** Prettier auto-formats on save (if configured)
2. **Run tests:** `pnpm test` (if applicable)
3. **Check build:** `pnpm build` (for major changes)

### Creating Pull Requests

**Template:**

```markdown
## Summary
Brief description of changes

## Changes
- Added X feature
- Fixed Y bug
- Updated Z component

## Test Plan
- [ ] Tested locally
- [ ] Verified on preview deployment
- [ ] Checked mobile responsiveness
- [ ] Validated SEO metadata
```

### Deployment Process

1. **Development:** Work on feature branch
2. **Test:** Verify locally with `pnpm dev`
3. **Build:** Check production build with `pnpm build && pnpm preview`
4. **Commit:** Push changes to branch
5. **Preview:** Vercel creates preview deployment
6. **Merge:** PR merged to main triggers production deployment

---

## Important Conventions

### File Naming

- **Components:** PascalCase (e.g., `Navigation.tsx`, `Map.tsx`)
- **Pages:** kebab-case (e.g., `index.astro`, `404.astro`)
- **Utilities:** kebab-case (e.g., `notion-client.ts`, `notion-parse.ts`)
- **Styles:** kebab-case (e.g., `global.css`, `prose.css`)

### Import Aliases

Configured in `tsconfig.json`:

```typescript
import Component from '@components/Component.astro';
import image from '@assets/image.png';
```

**Available aliases:**
- `@components/*` → `src/components/*`
- `@assets/*` → `src/assets/*`
- `@lib/*` → `src/lib/*` (not configured, use relative paths)

### TypeScript Patterns

**Type Imports:**

```typescript
import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
```

**Type Guards:**

```typescript
if ('type' in block && block.type === 'paragraph') {
  // block is narrowed to ParagraphBlockObjectResponse
}
```

**Environment Variables:**

```typescript
const envVar = import.meta.env.NOTION_TOKEN;
// Typed via env.d.ts
```

### Code Organization

**Within a file:**

1. Imports (external, then internal)
2. Type definitions
3. Constants
4. Main logic/component
5. Helper functions (if needed)

**Example:**

```typescript
// External imports
import { marked } from 'marked';
import type { Block } from '@notionhq/client/build/src/api-endpoints';

// Internal imports
import { parseRichText } from './notion-parse';

// Types
interface ParseOptions {
  format: 'markdown' | 'html';
}

// Constants
const DEFAULT_OPTIONS: ParseOptions = { format: 'markdown' };

// Main function
export function parseBlocks(blocks: Block[], options = DEFAULT_OPTIONS) {
  // Implementation
}

// Helpers
function isHeading(block: Block): boolean {
  return block.type.startsWith('heading');
}
```

### Performance Considerations

1. **Static Generation:** Leverage Astro's static site generation
2. **Image Optimization:** Use Astro's `<Image />` component
3. **Bundle Size:** Avoid large dependencies, use Solid.js over React when possible
4. **Font Loading:** Preload variable fonts with `crossorigin`
5. **Incremental Sync:** Notion sync checks `lastEditedTime` to skip unchanged content

### Accessibility

- **Semantic HTML:** Use appropriate tags (`<nav>`, `<main>`, `<article>`)
- **Alt Text:** Always provide for images
- **Keyboard Navigation:** Ensure interactive elements are keyboard-accessible
- **Emoji Accessibility:** Uses `rehype-accessible-emojis` plugin
- **Color Contrast:** Follow WCAG guidelines for text/background contrast

---

## Troubleshooting

### Content Not Syncing from Notion

**Check:**
1. `.env` file has correct `NOTION_TOKEN` and database IDs
2. Notion integration has access to databases/pages
3. `public` checkbox is enabled on posts
4. Run `pnpm dev` again (pre-hook syncs content)

**Debug:**
```bash
# Check Notion API connection
node --loader jiti scripts/index.ts
```

### Build Errors

**Common issues:**
- Missing environment variables → Add to `.env`
- TypeScript errors → Check imports and types
- Tailwind classes not working → Verify Vite plugin config
- MDX parsing errors → Check frontmatter schema matches content.config.ts

**Check build logs:**
```bash
pnpm build --verbose
```

### Styling Not Applied

**Check:**
1. Tailwind class syntax is correct
2. Custom styles in `src/styles/` are imported in `global.css`
3. Component uses `class:list` for conditional classes
4. Purge/content configuration includes relevant files

### Map Not Loading

**Check:**
1. `public/places.json` exists and has valid data
2. Leaflet CSS is imported (`src/styles/leaflet.css`)
3. Component uses `client:only="solid-js"` directive
4. Browser console for JavaScript errors

---

## Additional Resources

### Official Documentation

- **Astro:** https://docs.astro.build/
- **Notion API:** https://developers.notion.com/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Solid.js:** https://www.solidjs.com/docs

### Project-Specific Files

- **Content Schema:** `src/content.config.ts`
- **Notion Integration:** `src/lib/notion-*.ts`
- **Component Library:** `src/components/`
- **Test Examples:** `src/lib/tests/`

### Code References

When making changes, consult these key files:

- **Layout System:** `src/layouts/Layout.astro`
- **Notion Sync:** `src/lib/notion-download.ts`
- **Block Parsing:** `src/lib/notion-parse.ts`
- **Styling Base:** `src/styles/global.css`
- **Type Definitions:** `src/env.d.ts`

---

## Version Information

**Last Updated:** 2026-01-04
**Astro Version:** 5.5.4
**Project Version:** 2025.3.0

---

This guide is maintained as the project evolves. When making significant architectural changes, update this document to reflect the new patterns and conventions.
