import dotenv from 'dotenv'

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
    body: data.bodyText,
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
        _draft: false,
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
    body: data.bodyText,
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