import dotenv from 'dotenv'
import { NotteClient } from 'notte-sdk'
import { createClient } from '@sanity/client'
import { cleanContent, needsCleanup } from './ai-cleaner.js'

dotenv.config()

const NOTTE_API_TOKEN = process.env.NOTTE_API_TOKEN
const NEWS_SOURCE_URL = process.env.NEWS_SOURCE_URL || 'https://www.prnewswire.com/news/ispire-technology-inc./'

// Article IDs to skip (different page formats, insufficient content, etc.)
const SKIP_SOURCE_IDS = [
  '302759762', // Earnings conference call - different page format
  '302710165', // ROTH Conference participation - different page format
]

// Maximum articles to import per run
const MAX_IMPORTS = 3

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
 * Extract source ID from URL (the numeric ID in PRNewswire URLs)
 */
function extractSourceId(url: string): string {
  const match = url.match(/-(\d+)\.html$/)
  return match ? match[1] : ''
}

/**
 * Check if article already exists in Sanity
 */
async function existsByGuid(url: string): Promise<boolean> {
  const result = await sanityClient.fetch(
    `count(*[_type == "pressRelease" && sourceGuid == $url])`,
    { url }
  )
  return result > 0
}

/**
 * Clean title by removing date prefixes
 */
function cleanTitle(rawTitle: string, url: string): string {
  let cleaned = rawTitle
    .replace(/^#+\s*/, '') // Remove heading markers
    .replace(/^\w+\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)?\s*/i, '') // Remove date
    .trim()
  
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
 * Extract article links from company news page
 */
function extractArticleLinks(content: string): Array<{ title: string; url: string }> {
  const articles: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  const baseUrl = 'https://www.prnewswire.com'
  
  const linkPattern = /\[([^\]]+)\]\(((https?:\/\/www\.prnewswire\.com)?\/[^)]+)\)/g
  let match
  
  while ((match = linkPattern.exec(content)) !== null) {
    const rawTitle = match[1].trim()
    let url = match[2].split('"')[0].split(' ')[0].trim()
    
    if (url.startsWith('/')) {
      url = baseUrl + url
    }
    
    if (!url.includes('/news-releases/')) continue
    if (url.includes('/apac/') || url.includes('/zh/') || url.includes('/jp/')) continue
    if (url.includes('/account/') || url.includes('/login') || 
        url.includes('/rss/') || url.includes('/contact') || 
        url.includes('/resources/')) continue
    
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
 * Extract article content from page markdown
 * PRNewswire structure:
 * - Navigation menus (skip)
 * - Title (first major heading)
 * - Language links
 * - "News provided by" section
 * - Date line (May 12, 2026, 08:30 ET)
 * - "Share this article" links (javascript:; lines)
 * - Short description (italic promo paragraph) <-- THIS
 * - Dateline (LOS ANGELES, May 12, 2026 /PRNewswire/ --)
 * - Body content
 * - IR Contact / PR Contact / SOURCE line
 * - Footer (skip)
 */
function extractArticleContent(markdown: string, articleUrl: string): { 
  title: string
  shortDescription: string
  body: string
  date: Date | null
} {
  const lines = markdown.split('\n')
  
  // Find the article title (first substantial line that looks like a headline)
  let title = ''
  let titleIndex = -1
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Skip navigation links
    if (line.startsWith('[') || line.startsWith('#nav') || line.includes('javascript:;')) continue
    if (line.length < 20 || line.length > 300) continue
    if (line.includes('|') || line.includes('Accessibility') || line.includes('Skip Navigation')) continue
    
    const cleaned = line.replace(/^#+\s*/, '').trim()
    if (cleaned.length > 20 && cleaned.length < 300 && !cleaned.startsWith('[')) {
      title = cleaned
      titleIndex = i
      break
    }
  }
  
  // Find the dateline pattern (LOS ANGELES, May 12, 2026 /PRNewswire/ --)
  // This marks the START of the body content
  let datelineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (/[A-Z][A-Z\s]+,\s*\w+\s+\d{1,2},?\s*\d{4}\s*\/PRNewswire\//.test(lines[i])) {
      datelineIndex = i
      break
    }
  }
  
  // Find the date line pattern (May 12, 2026, 08:30 ET)
  // The short description appears AFTER this line and AFTER "Share this article"
  let dateLineIndex = -1
  for (let i = titleIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/\w+\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)/.test(line)) {
      dateLineIndex = i
      break
    }
  }
  
  // Extract short description:
  // Look for italic text (*...*) AFTER Share this article / javascript:; lines
  // and BEFORE the dateline (city, date /PRNewswire/)
  let shortDescription = ''
  
  // Find Share this article section
  const shareIdx = lines.findIndex(l => l.includes('Share this article'))
  const dateLineIdx = lines.findIndex((l, i) => i > (shareIdx >= 0 ? shareIdx : 0) && /\w+\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)/.test(l))
  
  // Look for italic text (*...*) after share section, before dateline
  for (let i = (shareIdx >= 0 ? shareIdx : titleIndex) + 1; i < (datelineIndex > 0 ? datelineIndex : lines.length); i++) {
    const line = lines[i].trim()
    
    // Check for italic text pattern: *text...*
    const italicMatch = line.match(/^\*(.+)\*$/)
    if (italicMatch && italicMatch[1].length > 30) {
      shortDescription = italicMatch[1]
      break
    }
    
    // Also check for multi-line italic (starts with *, continues on next lines)
    if (line.startsWith('*') && !line.endsWith('*') && line.length > 10) {
      // Collect full italic text across lines
      let italicText = line.substring(1) // remove leading *
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].endsWith('*')) {
          italicText += ' ' + lines[j].replace(/\*$/g, '').trim()
          break
        }
        italicText += ' ' + lines[j].trim()
      }
      shortDescription = italicText.trim()
      break
    }
  }
  
  // Extract body content (from dateline to contact/footer)
  let bodyLines: string[] = []
  if (datelineIndex >= 0) {
    for (let i = datelineIndex; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Stop at contact info or footer markers
      if (line.match(/^IR Contact:/i) || line.match(/^PR Contact:/i)) break
      if (line === 'SOURCE Ispire Technology Inc.' || line === 'SOURCE Ispire') break
      if (line.includes('### Modal') || line.includes('Also from this source')) break
      if (line.includes('Request a Demo') || line.includes('more press release views')) break
      
      // Skip empty lines and navigation
      if (line.length < 5) continue
      if (line.startsWith('[') && line.includes('](http')) continue
      if (line === 'javascript:;') continue
      
      bodyLines.push(line)
      if (bodyLines.length > 500) break
    }
  }
  
  const body = bodyLines.join('\n\n')
  
  // Fallback for title
  if (!title) {
    const titleMatch = articleUrl.match(/\/news-releases\/([^/]+)-\d+\.html/)
    if (titleMatch) {
      title = titleMatch[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  
  // Fallback for short description
  if (!shortDescription && body) {
    // Try to extract first paragraph from body
    const firstPara = body.split('\n\n')[0]
    if (firstPara && firstPara.length > 50) {
      shortDescription = firstPara.substring(0, 300) + '...'
    }
  }
  
  // Extract publication date
  let date: Date | null = null
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Pattern: May 12, 2026, 08:30 ET
    const match = line.match(/(\w+\.?\s+\d{1,2},?\s+\d{4})/)
    if (match) {
      const months: Record<string, number> = {
        'january': 0, 'jan': 0, 'jan.': 0,
        'february': 1, 'feb': 1, 'feb.': 1,
        'march': 2, 'mar': 2, 'mar.': 2,
        'april': 3, 'apr': 3, 'apr.': 3,
        'may': 4,
        'june': 5, 'jun': 5, 'jun.': 5,
        'july': 6, 'jul': 6, 'jul.': 6,
        'august': 7, 'aug': 7, 'aug.': 7,
        'september': 8, 'sep': 8, 'sep.': 8, 'sept': 8, 'sept.': 8,
        'october': 9, 'oct': 9, 'oct.': 9,
        'november': 10, 'nov': 10, 'nov.': 10,
        'december': 11, 'dec': 11, 'dec.': 11,
      }
      const dateMatch = match[1].match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/)
      if (dateMatch) {
        const monthName = dateMatch[1].toLowerCase()
        const day = parseInt(dateMatch[2])
        const year = parseInt(dateMatch[3])
        if (months[monthName] !== undefined) {
          date = new Date(Date.UTC(year, months[monthName], day))
          // Log extracted date for debugging
          console.log(`  Extracted date: ${date.toISOString().substring(0, 10)} from "${match[1]}"`)
          break
        }
      }
    }
  }
  
  return {
    title: title || 'Untitled Press Release',
    shortDescription,
    body: body.substring(0, 100000),
    date
  }
}

/**
 * Create a press release document in Sanity
 */
async function createPressRelease(article: {
  title: string
  url: string
  body: string
  shortDescription?: string
  date?: string
}): Promise<string> {
  const sourceGuid = article.url
  const sourceId = extractSourceId(article.url)

  const doc = {
    _type: 'pressRelease',
    title: article.title,
    slug: { _type: 'slug', current: generateSlug(article.title) },
    shortDescription: article.shortDescription,
    bodyText: article.body,
    date: article.date ? new Date(article.date).toISOString() : new Date().toISOString(),
    // Store original date string for debugging
    _originalDate: article.date || null,
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
    
    await session.execute({ type: 'goto', url: NEWS_SOURCE_URL })
    
    const response = await session.scrape()
    
    let markdown = ''
    if (typeof response === 'string') {
      markdown = response
    } else if (response && typeof response === 'object') {
      markdown = response.markdown || response.text || JSON.stringify(response)
    }
    
    console.log('Page content length:', markdown.length)
    
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

    await closeSession(session)

    // Step 2: Import each article (limit to 20 per run)
    for (const article of articles.slice(0, 20)) {
      try {
        const sourceId = extractSourceId(article.url)
        
        // Skip known problem articles
        if (SKIP_SOURCE_IDS.includes(sourceId)) {
          console.log(`\nSkipping (known issue): ${article.title.substring(0, 50)}...`)
          results.skipped++
          continue
        }
        
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
          await session.execute({ type: 'goto', url: article.url })
          
          const articleResponse = await session.scrape()
          
          let articleMarkdown = ''
          if (typeof articleResponse === 'string') {
            articleMarkdown = articleResponse
          } else if (articleResponse && typeof articleResponse === 'object') {
            articleMarkdown = articleResponse.markdown || articleResponse.text || JSON.stringify(articleResponse)
          }
          
          // Extract clean content
          const { title, shortDescription, body, date } = extractArticleContent(articleMarkdown, article.url)
          
          console.log(`Title: ${title}`)
          console.log(`Body length: ${body.length} chars`)
          
          // AI cleanup if needed
          let finalTitle = title
          let finalShortDesc = shortDescription
          let finalBody = body
          
          if (needsCleanup({ title, body })) {
            console.log('Running AI cleanup...')
            const cleaned = await cleanContent({
              title,
              shortDescription,
              body,
              sourceUrl: article.url
            })
            finalTitle = cleaned.title
            finalShortDesc = cleaned.shortDescription
            finalBody = cleaned.body
            
            if (cleaned.changes.length > 0) {
              console.log(`AI fixes: ${cleaned.changes.join(', ')}`)
            }
          } else {
            console.log('Content clean, skipping AI')
          }
          
          // Create Sanity document
          const docId = await createPressRelease({
            title: finalTitle,
            url: article.url,
            body: finalBody,
            shortDescription: finalShortDesc,
            date: date || new Date(),
          })

          console.log(`✓ Imported: ${title.substring(0, 50)}... (${docId})`)
          results.imported++

        } finally {
          await closeSession(session)
        }

        // Stop after max imports
        if (results.imported >= MAX_IMPORTS) {
          console.log(`\nReached max imports (${MAX_IMPORTS}), stopping.`)
          break
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