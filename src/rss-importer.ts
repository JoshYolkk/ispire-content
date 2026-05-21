import RSSParser from 'rss-parser'
import dotenv from 'dotenv'
import {
  sanityClient,
  existsByGuid,
  createPressRelease,
  PressRelease
} from './sanity-client.js'

dotenv.config()

const RSS_FEED_URL = process.env.RSS_FEED_URL || 'https://www.prnewswire.com/rss/news-releases-list.rss?company=ispire-technology-inc'

const parser = new RSSParser({
  customFields: {
    item: [
      'pubDate',
      'guid',
      'link',
      'description',
      'content:encoded',
      'dc:creator',
      'category',
    ],
  },
})

interface RSSItem {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  contentSnippet?: string
  content?: string
  'content:encoded'?: string
  creator?: string
  categories?: string[]
}

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200)
}

/**
 * Extract PR Newswire article ID from URL
 */
function extractSourceId(url: string): string | undefined {
  const match = url.match(/\/news-releases\/[^/]+\/(\d+)/)
  return match ? match[1] : undefined
}

/**
 * Clean HTML to plain text for short description
 */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500)
}

/**
 * Prepare body content for Sanity
 * Store as HTML string - Webflow expects HTML for RichText fields
 */
function prepareBodyContent(html: string): string {
  return html.trim()
}

/**
 * Import RSS feed items to Sanity
 */
export async function importRSSFeed(): Promise<{
  total: number
  imported: number
  skipped: number
  errors: string[]
}> {
  console.log(`Fetching RSS feed: ${RSS_FEED_URL}`)

  const feed = await parser.parseURL(RSS_FEED_URL)
  const results = {
    total: feed.items.length,
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  }

  console.log(`Found ${feed.items.length} items in feed`)

  for (const item of feed.items as RSSItem[]) {
    try {
      // Validate required fields
      if (!item.title || !item.link) {
        console.log(`Skipping item: missing title or link`)
        results.skipped++
        continue
      }

      // Use guid or link as unique identifier
      const sourceGuid = item.guid || item.link || ''

      // Check for duplicates
      const exists = await existsByGuid(sourceGuid)
      if (exists) {
        console.log(`Skipping duplicate: ${item.title}`)
        results.skipped++
        continue
      }

      // Use content field (RSS standard) or content:encoded
      const bodyHtml = item.content || item['content-encoded'] || ''

      // Create press release document
      const release: PressRelease = {
        title: item.title,
        slug: { current: generateSlug(item.title) },
        shortDescription: item.contentSnippet
          ? cleanText(item.contentSnippet)
          : undefined,
        bodyText: prepareBodyContent(bodyHtml),
        date: item.pubDate,
        sourceUrl: item.link || '',
        sourceGuid: sourceGuid,
        sourceId: extractSourceId(item.link || ''),
        sourceName: 'PR Newswire',
        newsProvidedBy: 'Ispire Technology Inc.',
      }

      const docId = await createPressRelease(release)
      console.log(`Imported: ${item.title} (${docId})`)
      results.imported++

      // Rate limiting - respect API limits
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`Error importing "${item.title}": ${errMsg}`)
      results.errors.push(`${item.title}: ${errMsg}`)
      results.skipped++
    }
  }

  return results
}

/**
 * Run RSS import job
 */
export async function runRSSImport(): Promise<void> {
  const startTime = Date.now()
  console.log('=== RSS Import Job Started ===')
  console.log(`Time: ${new Date().toISOString()}`)

  try {
    const results = await importRSSFeed()

    console.log('\n=== RSS Import Results ===')
    console.log(`Total items: ${results.total}`)
    console.log(`Imported: ${results.imported}`)
    console.log(`Skipped: ${results.skipped}`)

    if (results.errors.length > 0) {
      console.log(`\nErrors (${results.errors.length}):`)
      results.errors.forEach(e => console.log(`  - ${e}`))
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\nCompleted in ${duration}s`)

  } catch (error) {
    console.error('RSS import failed:', error)
    throw error
  }
}