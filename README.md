# Ispire Content - Sanity Studio

A Sanity CMS project for managing Ispire Technology press releases with future Webflow CMS integration.

## Overview

This Sanity Studio instance manages press releases that are:
1. Imported from PR Newswire RSS feeds
2. Edited/enriched in Sanity as needed
3. Synced to a Webflow CMS collection for public display

## Prerequisites

- Node.js 18+ 
- npm or pnpm
- A Sanity account (free tier works)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Sanity Project

If you haven't already created a Sanity project:

```bash
npx sanity init
```

This will:
- Prompt you to log in to Sanity (or create an account)
- Create a new project or link to existing
- Generate a project ID

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:
- `SANITY_PROJECT_ID` - Your Sanity project ID
- `SANITY_DATASET` - Dataset name (default: `production`)
- `SANITY_API_TOKEN` - API token for server operations

### 4. Run Locally (Optional)

```bash
npm run dev
```

Opens the Sanity Studio at `http://localhost:3333`

## Deployment

### Deploy to Sanity Hosting

```bash
npm run deploy
```

This deploys the Studio to `https://your-project-name.sanity.studio`

## Project Structure

```
ispire-content/
├── sanity.config.ts     # Studio configuration
├── schemas/
│   ├── index.ts         # Schema exports
│   └── pressRelease.ts  # Press Release schema
├── package.json
├── tsconfig.json
├── .env.example         # Environment template
└── .env.local           # Your local config (gitignored)
```

## Schema: Press Release

The `pressRelease` schema contains:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | ✅ | Press release headline |
| slug | slug | ✅ | URL-friendly identifier (auto from title) |
| shortDescription | text | | Brief summary |
| bodyText | array (blocks) | | Fullarticle content |
| date | datetime | | Publication date |
| sourceUrl | url | ✅ | Original PR Newswire URL |
| sourceGuid | string | ✅ | Unique RSS GUID (deduplication) |
| sourceId | string | | PR Newswire numeric ID |
| sourceName | string | | Default: "PR Newswire" |
| newsProvidedBy | string | | Default: "Ispire Technology Inc." |
| importedAt | datetime | | Import timestamp |
| syncStatus | string | | imported/published/failed/skipped/manual |
| webflowItemId | string | | Webflow CMS item ID after sync |
| webflowSyncedAt | datetime | | Last sync timestamp |
| syncError | text | | Error message if sync failed |

## Future Integration

### RSS Import (Planned)

The following RSS feed will be used:
```
https://www.prnewswire.com/rss/news-releases-list.rss?company=ispire-technology-inc
```

### Webflow Sync (Planned)

Press releases will be synced to a Webflow CMS collection with matching fields.

## Testing

Sanity provides built-in validation. To test the schema:

```bash
npm run dev
```

Then create/editdocuments in the Studio.

## Missing Configuration

Before RSS/Webflow automation can proceed, you need:

1. **Sanity Project ID** - Create via `npx sanity init` or at https://sanity.io/manage
2. **Sanity API Token** - Generate in project settings
3. **Webflow API Token** - For future CMS sync
4. **Webflow Collection ID** - Target collection for sync

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development studio |
| `npm run start` | Start production build locally |
| `npm run build` | Build the studio |
| `npm run deploy` | Deploy to Sanity hosting |

## License

MIT