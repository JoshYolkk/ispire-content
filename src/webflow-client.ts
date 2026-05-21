import dotenv from 'dotenv'
import { marked } from 'marked'

dotenv.config()

const WEBFLOW_API_URL = 'https://api.webflow.com/v2'
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID

interface WebflowResponse {
  id: string
  slug: string
  name: string
  [key: string]: any
}

/**
 * Create headers for Webflow API requests
 */
function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// Webflow sync-status option IDs
const SYNC_STATUS_IDS: Record<string, string> = {
  imported: 'c9c2666f04879d883467e05d1a70e51d',
  published: 'd1f429393a75beda65e3d506354329b8',
  failed: '984acf0b1895f1f53e10f747444001a0',
  skipped: '6691157ddd53af805ba5f00ee6fae101',
  manual: 'b2d946f612b1eb564630431db14e41f8',
}

/**
 * Extract clean URL from PRNewswire tracking link
 * edge.prnewswire.com/c/link/?...&u=ACTUAL_URL&a=...
 */
function extractCleanUrl(url: string): string {
  try {
    // Check if it's a PRNewswire tracking link
    if (url.includes('prnewswire.com') && url.includes('u=')) {
      const uParamMatch = url.match(/[?&]u=([^&]+)/)
      if (uParamMatch) {
        const decoded = decodeURIComponent(uParamMatch[1])
        return decoded
      }
    }
    return url
  } catch {
    return url
  }
}

/**
 * Convert date to ISO format for Webflow
 */
function toISODate(date: string | undefined): string | undefined {
  if (!date) return undefined
  try {
    return new Date(date).toISOString()
  } catch {
    return undefined
  }
}

/**
 * Convert markdown to HTML for Webflow RichText
 * Handles links: [text](url) -> <a href="url">text</a>
 * Strips tables (not supported in Webflow RichText)
 * Cleans PRNewswire tracking URLs
 */
function markdownToHtml(markdown: string | undefined): string | undefined {
  if (!markdown) return undefined
  
  try {
    // First, clean up PRNewswire tracking URLs in the markdown
    // Convert edge.prnewswire.com/c/link/?...&u=ACTUAL_URL&a=... -> ACTUAL_URL
    let cleaned = markdown.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+prnewswire[^)]+)\)/g,
      (match, text, url) => {
        const cleanUrl = extractCleanUrl(url)
        return `[${text}](${cleanUrl})`
      }
    )
    
    // Strip markdown tables (lines with | characters and separator rows)
    // Tables have the pattern: | cell | cell | ... |
    cleaned = cleaned
      .split('\n')
      .filter(line => {
        // Skip lines that look like table rows (have multiple | characters)
        const pipeCount = (line.match(/\|/g) || []).length
        if (pipeCount >= 2) return false
        // Skip table separator rows (e.g., |---|---|)
        if (line.match(/^\s*\|[\s\-:]+\|/)) return false
        // Skip "-- Tables Follow --" markers
        if (line.includes('-- Tables Follow --')) return false
        return true
      })
      .join('\n')
    
    // Use marked to convert markdown to HTML
    let html = marked.parse(cleaned, {
      breaks: true, // Convert line breaks to <br>
      gfm: true, // GitHub Flavored Markdown
    }) as string
    
    return html
  } catch (error) {
    console.warn('Failed to convert markdown to HTML:', error)
    return markdown
  }
}

/**
 * Create a new item in Webflow collection
 */
export async function createWebflowItem(data: {
  title: string
  slug: string
  shortDescription?: string
  bodyText?: string
  date?: string
  sourceUrl?: string
  sourceGuid?: string
  sourceId?: string
  sourceName?: string
  newsProvidedBy?: string
  importedAt?: string
  heroImage?: { url: string; alt?: string }
  thumbnailImage?: { url: string; alt?: string }
}): Promise<string> {
  // Map to correct Webflow field slugs
  const fieldData: any = {
    name: data.title,
    slug: data.slug,
    title: data.title,
    'short-description': data.shortDescription,
    body: markdownToHtml(data.bodyText), // Convert markdown to HTML for Webflow RichText
    date: toISODate(data.date),
    'source-url': data.sourceUrl,
    'source-guid': data.sourceGuid,
    'source-id-pr-newswire-id': data.sourceId,
    'source-name': data.sourceName,
    'company-news-provided-by': data.newsProvidedBy,
    'imported-at': toISODate(data.importedAt) || new Date().toISOString(),
    'sync-status': SYNC_STATUS_IDS.imported,
  }

  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}/items`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        fieldData,
        _archived: false,
        _draft: true, // Keep items in draft state
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Webflow API error (${response.status}): ${error}`)
  }

  const result: WebflowResponse = await response.json()
  return result.id
}

/**
 * Update an existing item in Webflow collection
 */
export async function updateWebflowItem(
  itemId: string,
  data: {
    title?: string
    slug?: string
    shortDescription?: string
    bodyText?: string
    date?: string
    syncStatus?: string
  }
): Promise<void> {
  const fieldData: any = {
    name: data.title,
    slug: data.slug,
    title: data.title,
    'short-description': data.shortDescription,
    body: markdownToHtml(data.bodyText),
    date: toISODate(data.date),
  }

  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ fieldData }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Webflow API error (${response.status}): ${error}`)
  }
}

/**
 * Delete an item from Webflow collection
 */
export async function deleteWebflowItem(itemId: string): Promise<void> {
  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Webflow API error (${response.status}): ${error}`)
  }
}

/**
 * Get collection schema to verify field IDs match
 */
export async function getCollectionSchema(): Promise<any> {
  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}`,
    {
      headers: getHeaders(),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Webflow API error (${response.status}): ${error}`)
  }

  return response.json()
}