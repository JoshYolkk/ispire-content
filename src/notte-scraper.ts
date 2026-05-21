import dotenv from 'dotenv'
import { NotteClient } from 'notte-sdk'
import { createClient } from '@sanity/client'

dotenv.config()

const NOTTE_API_TOKEN = process.env.NOTTE_API_TOKEN
const NEWS_SOURCE_URL = process.env.NEWS_SOURCE_URL || 'https://www.prnewswire.com/news/ispire-technology-inc./'

// Initialize Sanity client
const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

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
  const match = url.match(/-(\d+)\.html/)
  return match ? match[1] : undefined
}

/**
 * Check if article already exists by GUID
 */
async function existsByGuid(sourceGuid: string): Promise<boolean> {
  const result = await sanityClient.fetch(
    `count(*[_type == "pressRelease" && sourceGuid == $sourceGuid])`,
    { sourceGuid }
  )
  return result > 0
}

/**
 * Create a press release document in Sanity
 */
async function createPressRelease(article: {
  title: string
  url: string
  body: string
  date?: string
}): Promise<string> {
  const sourceGuid = article.url
  const sourceId = extractSourceId(article.url)

  const doc = {
    _type: 'pressRelease',
    title: article.title,
    slug: { _type: 'slug', current: generateSlug(article.title) },
    shortDescription: article.body.substring(0, 500).replace(/<[^>]*>/g, '').trim(),
    bodyText: article.body,
    date: article.date ? new Date(article.date).toISOString() : new Date().toISOString(),
    sourceUrl: article.url,
    sourceGuid: sourceGuid,
    sourceId: sourceId,
    sourceName: 'PR Newswire',
    newsProvidedBy: 'Ispire Technology Inc.',
    importedAt: new Date().toISOString(),
    syncStatus: 'imported',
  }

  const result = await sanityClient.create(doc)
  return result._id
}

/**
 * Extract clean article title, removing date prefixes
 */
function cleanTitle(title: string, url: string): string {
  // Remove date prefix like "### May 12, 2026, 08:30 ET" or "May 12, 2026, 08:30 ET"
  let cleaned = title
    .replace(/^#+\s*/, '') // Remove heading markers
    .replace(/^\w+\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)?\s*/i, '') // Remove date
    .replace(/^\d{1,2}:\d{2}\s*(ET|PT|GMT)?\s*/i, '') // Remove time-only
    .trim()
  
  // If still empty or too short, try to extract from URL
  if (cleaned.length < 10) {
    const titleMatch = url.match(/\/news-releases\/([^/]+)-\d+\.html/)
    if (titleMatch) {
      cleaned = titleMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  
  return cleaned || 'Untitled Press Release'
}

/**
 * Extract article links from the company news page
 * Handles both full URLs and relative URLs
 */
function extractArticleLinks(content: string): Array<{ title: string; url: string }> {
  const articles: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  const baseUrl = 'https://www.prnewswire.com'
  
  // Pattern 1: Markdown links [Title](URL) - handles both full and relative URLs
  const linkPattern = /\[([^\]]+)\]\(((https?:\/\/www\.prnewswire\.com)?\/[^)]+)\)/g
  let match
  
  while ((match = linkPattern.exec(content)) !== null) {
    const rawTitle = match[1].trim()
    let url = match[2].split('"')[0].split(' ')[0].trim()
    
    // Convert relative URLs to full URLs
    if (url.startsWith('/')) {
      url = baseUrl + url
    }
    
    // Keep only English (/news-releases/) URLs, skip /apac/, /zh/, /jp/
    if (!url.includes('/news-releases/')) continue
    if (url.includes('/apac/') || url.includes('/zh/') || url.includes('/jp/')) continue
    
    // Skip non-article links
    if (url.includes('/account/') || url.includes('/login') || 
        url.includes('/rss/') || url.includes('/contact') || 
        url.includes('/resources/')) continue
    
    // Extract article ID to validate it's a real article
    const idMatch = url.match(/-(\d+)\.html/)
    if (idMatch && !seen.has(url)) {
      seen.add(url)
      const title = cleanTitle(rawTitle, url)
      articles.push({ title, url })
    }
  }
  
  return articles
}

/**
 * Extract clean article content from page
 */
function extractArticleContent(markdown: string, articleUrl: string): { title: string; body: string } {
  const lines = markdown.split('\n').filter(l => l.trim())
  
  // Find the article title (usually the first heading or first significant line)
  let title = ''
  let bodyLines: string[] = []
  let inBody = false
  let foundTitle = false
  
  // Common patterns to skip
  const skipPatterns = [
    'Skip Navigation', 'Client Login', 'Accessibility', 'PR Newswire',
    'Send a Release', 'Resources', 'Journalists', 'RSS',
    'News in Focus', 'Business & Money', 'Science & Tech', 'Lifestyle & Health',
    'Policy & Public Interest', 'People & Culture', 'Explore',
    'Contact', 'Products', 'About', 'All News',
    'SOURCE Ispire', '©', 'Copyright', 'Cision'
  ]
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lowerLine = line.toLowerCase()
    
    // Skip empty lines
    if (line.length < 5) continue
    
    // Skip lines with skip patterns
    if (skipPatterns.some(p => lowerLine.includes(p.toLowerCase()))) {
      continue
    }
    
    // Skip markdown navigation
    if (line.startsWith('[') && line.includes('](http')) {
      continue
    }
    
    // Look for title (first significant line without these patterns)
    if (!foundTitle) {
      // Title is usually a heading or first substantial text
      const cleanLine = line.replace(/^#+\s*/, '').trim()
      
      if (cleanLine.length > 10 && cleanLine.length < 200) {
        // Check if it looks like a title (not a navigational sentence)
        if (!cleanLine.includes('|') && 
            !cleanLine.startsWith('*') &&
            !cleanLine.includes('News provided by')) {
          title = cleanLine
          foundTitle = true
          continue
        }
      }
    }
    
    // After title, collect body content
    if (foundTitle && !inBody) {
      // Skip until we find the first paragraph marker or substantial text
      if (line.length > 50 || line.startsWith('#')) {
        inBody = true
      }
    }
    
    if (inBody) {
      // Stop at contact info or footer
      if (lowerLine.includes('ir contact:') || 
          lowerLine.includes('pr contact:') ||
          lowerLine.includes('source ispire') ||
          lowerLine.includes('### modal') ||
          lowerLine.includes('also from this source') ||
          lowerLine.includes('request a demo')) {
        break
      }
      
      // Collect body text
      const cleanLine = line.replace(/^#+\s*/, '').trim()
      if (cleanLine.length > 10) {
        bodyLines.push(cleanLine)
      }
    }
  }
  
  // If no body found, use everything after title
  if (bodyLines.length === 0 && title) {
    const titleIndex = lines.findIndex(l => l.includes(title.split(' ')[0]))
    bodyLines = lines.slice(titleIndex + 1)
      .map(l => l.trim())
      .filter(l => l.length > 20)
      .filter(l => !skipPatterns.some(p => l.toLowerCase().includes(p.toLowerCase())))
      .slice(0,20)
  }
  
  const body = bodyLines.join('\n\n')
  
  // Extract title from URL if we couldn't find it
  if (!title) {
    const titleMatch = articleUrl.match(/\/news-releases\/([^/]+)-\d+\.html/)
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  
  return { title: title || 'Untitled', body }
}

/**
 * Clean up session helper
 */
async function closeSession(session: any) {
  try {
    await session.stop()
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Main import function using Notte sessions
 */
export async function importWithNotte(): Promise<{
  total: number
  imported: number
  skipped: number
  errors: string[]
}> {
  const results = {
    total: 0,
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  }

  console.log('=== Notte-based Article Import ===')
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Source: ${NEWS_SOURCE_URL}`)

  const client = new NotteClient({ apiKey: NOTTE_API_TOKEN! })
  let session: any = null

  try {
    // Step 1: Get article list from company news page
    console.log('\nFetching article list...')
    
    session = client.Session()
    await session.start()
    
    // Navigate to the company news page
    await session.execute({ type: 'goto', url: NEWS_SOURCE_URL })
    
    // Scrape the page to get all article links
    const response = await session.scrape()
    
    // Parse response
    let markdown = ''
    if (typeof response === 'string') {
      markdown = response
    } else if (response && typeof response === 'object') {
      markdown = response.markdown || response.text || JSON.stringify(response)
    }
    
    console.log('Page content length:', markdown.length)
    console.log('First 500 chars:', markdown.substring(0, 500))
    
    // Extract article links
    const articles = extractArticleLinks(markdown)
    results.total = articles.length

    if (articles.length === 0) {
      console.log('No articles found')
      await closeSession(session)
      return results
    }

    console.log(`\nFound ${articles.length} articles:`)
    articles.slice(0, 10).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title.substring(0, 60)}...`)
      console.log(`     ${a.url}`)
    })

    // Close the list session
    await closeSession(session)

    // Step 2: Import each article (limit to 20 per run to avoid timeouts)
    for (const article of articles.slice(0, 20)) {
      try {
        // Check for duplicates
        const exists = await existsByGuid(article.url)
        if (exists) {
          console.log(`\nSkipping duplicate: ${article.title.substring(0, 50)}...`)
          results.skipped++
          continue
        }

        // Get full article content
        console.log(`\n--- Scraping: ${article.title.substring(0, 60)}...`)
        
        session = client.Session()
        await session.start()
        
        try {
          // Navigate to the article
          await session.execute({ type: 'goto', url: article.url })
          
          // Try to switch to English if needed (check for language dropdown)
          // The English version URL is already in /news-releases/ (not /apac/zh/)
          // So we should already be on English version
          
          const articleResponse = await session.scrape()
          
          let articleMarkdown = ''
          if (typeof articleResponse === 'string') {
            articleMarkdown = articleResponse
          } else if (articleResponse && typeof articleResponse === 'object') {
            articleMarkdown = articleResponse.markdown || articleResponse.text || JSON.stringify(articleResponse)
          }
          
          // Extract clean content
          const { title, body } = extractArticleContent(articleMarkdown, article.url)
          
          console.log(`Title: ${title}`)
          console.log(`Body length: ${body.length} chars`)
          
          if (body.length < 200) {
            console.log(`Skipping - insufficient content (${body.length} chars)`)
            results.skipped++
            continue
          }

          // Create Sanity document
          const docId = await createPressRelease({
            title,
            url: article.url,
            body,
          })

          console.log(`✓ Imported: ${title.substring(0, 50)}... (${docId})`)
          results.imported++

        } finally {
          await closeSession(session)
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.log(`✗ Error: ${article.title.substring(0, 50)}... - ${errMsg}`)
        results.errors.push(`${article.title}: ${errMsg}`)
        results.skipped++
      }
    }

    return results

  } catch (error) {
    console.error('Import failed:', error)
    if (session) {
      await closeSession(session)
    }
    throw error
  }
}

/**
 * Run import job
 */
export async function runNotteImport(): Promise<void> {
  const startTime = Date.now()

  try {
    const results = await importWithNotte()

    console.log('\n' + '='.repeat(50))
    console.log('=== Import Results ===')
    console.log('='.repeat(50))
    console.log(`Total articles: ${results.total}`)
    console.log(`Imported: ${results.imported}`)
    console.log(`Skipped: ${results.skipped}`)

    if (results.errors.length > 0) {
      console.log(`\nErrors (${results.errors.length}):`)
      results.errors.forEach(e => console.log(`  - ${e}`))
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\nCompleted in ${duration}s`)

  } catch (error) {
    console.error('Import failed:', error)
    throw error
  }
}