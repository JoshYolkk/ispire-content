# Ispire Content

Sanity Studio for managing Ispire Technology press releases with automated RSS import and Webflow CMS sync.

## Architecture

```
PR Newswire RSS → Sanity CMS → Webflow CMS
                    ↓
              Sanity Studio (UI)
```

## Features

- **Sanity Studio** - Content management interface
- **Notte Scraper** - Import from PR Newswire with full article content
- **AI Processing** - Improve article formatting and generate descriptions
- **Webflow Sync** - Sync content to Webflow CMS collection
- **Duplicate Prevention** - Skip already-imported articles by GUID
- **Error Handling** - Track failures and retry automatically
- **Scheduled Jobs** - GitHub Actions runs hourly (configurable)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `SANITY_PROJECT_ID` - Your Sanity project ID
- `SANITY_DATASET` - Dataset name (default: production)
- `SANITY_API_TOKEN` - Sanity API token with read/write access
- `WEBFLOW_API_TOKEN` - Webflow API token
- `WEBFLOW_COLLECTION_ID` - Webflow CMS collection ID
- `RSS_FEED_URL` - RSS feed URL (optional, defaults to PR Newswire)

### 3. Run the Studio Locally

```bash
npm run dev
```

Open http://localhost:3333 to access the Studio.

### 4. Deploy Studio

```bash
npm run deploy
```

The Studio will be available at: https://ispire-content.sanity.studio

## Running Jobs

### Manual Execution

Run full pipeline (import + AI process + sync):
```bash
npm run job all
```

Import from PR Newswire (Notte scraper):
```bash
npm run notte
```

AI processing (improve formatting, add descriptions):
```bash
npm run process
```

Sync to Webflow only:
```bash
npm run sync
```

Test AI processing on a specific article:
```bash
npm run job test-ai <document-id>
```

### AI Processing Details

The AI processing step uses OpenAI's GPT-4o to:

1. **Clean up markdown formatting** - Fix broken links, proper paragraph spacing
2. **Convert tables to HTML** - Finance tables and data lists get proper `<table>` markup
3. **Add heading structure** - `##` and `###` for sections like "About Ispire", "Forward Looking Statements"
4. **Generate short descriptions** - 2-3 sentence summary suitable for preview cards and SEO
5. **Preserve all content** - Never changes facts, numbers, names, or quotes

Articles are only processed if:
- They have no short description, or
- Their description is less than 50 characters

To use AI processing, add `OPENAI_API_KEY` to your `.env` file:
```
OPENAI_API_KEY=sk-your-api-key-here
```

Get your API key from: https://platform.openai.com/api-keys

### Scheduled Execution (GitHub Actions)

The project includes a GitHub Actions workflow that runs hourly:

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `SANITY_PROJECT_ID` - `edocyjic`
   - `SANITY_DATASET` - `production`
   - `SANITY_API_TOKEN` - Your Sanity API token
   - `WEBFLOW_API_TOKEN` - Your Webflow API token
   - `WEBFLOW_COLLECTION_ID` - Your Webflow collection ID
   - `RSS_FEED_URL` - (optional) Custom RSS feed URL

3. Enable GitHub Actions in your repository settings
4. The workflow will run automatically every hour, or you can trigger it manually from the Actions tab

## Project Structure

```
ispire-content/
├── schemas/
│   ├── index.ts           # Schema exports
│   └── pressRelease.ts    # Press release schema
├── src/
│   ├── index.ts           # Main entry point
│   ├── sanity-client.ts   # Sanity CMS client
│   ├── webflow-client.ts  # Webflow API client
│   ├── rss-importer.ts    # RSS feed import logic
│   └── webflow-syncer.ts  # Webflow sync logic
├── .github/
│   └── workflows/
│       └── scheduled-sync.yml  # GitHub Actions workflow
├── sanity.config.ts       # Studio configuration
├── sanity.cli.ts          # CLI configuration
├── .env                   # Environment variables (gitignored)
├── .env.example           # Environment template
└── README.md
```

## Press Release Schema

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Article title (required) |
| `slug` | slug | URL slug from title (required) |
| `shortDescription` | text | Brief summary |
| `bodyText` | array | Rich text content |
| `date` | datetime | Publication date |
| `sourceUrl` | url | Original article URL (required) |
| `sourceGuid` | string | Unique RSS GUID (required) |
| `sourceId` | string | PR Newswire ID |
| `sourceName` | string | Source name (default: PR Newswire) |
| `newsProvidedBy` | string | Company name |
| `importedAt` | datetime | Import timestamp |
| `syncStatus` | string | imported/published/failed/skipped/manual |
| `webflowItemId` | string | Webflow collection item ID |
| `webflowSyncedAt` | datetime | Last sync timestamp |
| `syncError` | text | Last sync error message |

## Sync Flow

1. **RSS Import** (`npm run import`)
   - Fetches PR Newswire RSS feed
   - Parses each item
   - Checks for duplicates by `sourceGuid`
   - Creates new Sanity documents for new items

2. **Webflow Sync** (`npm run sync`)
   - Queries Sanity for items with `syncStatus: 'imported'` and no `webflowItemId`
   - Creates items in Webflow CMS collection
   - Updates Sanity with `webflowItemId` and `syncStatus: 'published'`
   - Tracks failed syncs with error messages

3. **Error Handling**
   - Failed syncs are marked with `syncStatus: 'failed'`
   - Failures are tracked with a counter
   - Items failing 3+ times can trigger alerts (configured in code)

## APIs Used

- **Sanity CMS API** - Content storage and management
- **Webflow CMS API v2** - Webflow collection management
- **RSS Parser** - RSS feed parsing

## URLs

| Resource | URL |
|----------|-----|
| GitHub Repo | https://github.com/JoshYolkk/ispire-content |
| Sanity Studio | https://ispire-content.sanity.studio |
| Sanity Project | https://www.sanity.io/projects/edocyjic |
| RSS Feed | https://www.prnewswire.com/rss/news-releases-list.rss?company=ispire-technology-inc |

## Development

### Local Development

```bash
# Start Studio in development mode
npm run dev

# Build for production
npm run build

# Deploy Studio
npm run deploy
```

### Testing Jobs Locally

```bash
# Make sure environment variables are set in .env
npm run import  # Test RSS import
npm run sync    # Test Webflow sync
```

## Notes

- **Duplicate Prevention**: The `sourceGuid` field ensures articles aren't imported twice
- **Rate Limiting**: Small delays between API calls to respect rate limits
- **Error Recovery**: Failed items can be retried manually or automatically
- **GitHub Actions**: Free tier includes 2000 minutes/month - sufficient for hourly runs

## License

MIT