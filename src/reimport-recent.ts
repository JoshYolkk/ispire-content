import dotenv from 'dotenv'
import { NotteClient } from 'notte-sdk'
import { sanityClient } from './sanity-client.js'
import { cleanContent, needsCleanup } from './ai-cleaner.js'

dotenv.config()

const NOTTE_API_TOKEN = process.env.NOTTE_API_TOKEN
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Articles to re-import (most recent)
const ARTICLES_TO_IMPORT = [
  'https://www.prnewswire.com/news-releases/ispire-technology-expands-into-high-growth-nicotine-pouch-market-through-strategic-joint-venture-with-jincheng-pharma-302768974.html',
  'https://www.prnewswire.com/news-releases/ispire-technology-inc-reports-financial-results-for-fiscal-third-quarter-2026-302764809.html',
  'https://www.prnewswire.com/news-releases/ispire-highlights-economic-impact-of-new-fda-guidance-on-flavored-ends-unlocking-a-50-billion-market-and-driving-significant-potential-asset-value-302714232.html',
  'https://www.prnewswire.com/news-releases/ispire-technology-inc-reports-financial-results-for-fiscal-second-quarter-2026-302680862.html',
  'https://www.prnewswire.com/news-releases/ispire-backed-ike-tech-invited-to-participate-in-fda-roundtable-on-pmta-submissions-302678778.html',
]

/**
 * Extract publication date from article
 * Looks for patterns like "May 12, 2026" or "Feb. 6, 2026"
 */
function extractPublicationDate(markdown: string): Date | null {
  const lines = markdown.split('\n')
  
  // Look for date patterns in order of priority
  const datePatterns = [
    // Pattern: May 12, 2026, 08:30 ET (news release timestamp)
    /(\w+\s+\d{1,2},?\s+\d{4}),?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)/i,
    // Pattern: May 12, 2026
    /(\w+\s+\d{1,2},?\s+\d{4})(?!\d)/i,
    // Pattern from dateline: LOS ANGELES, May 12, 2026 /PRNewswire/
    /[A-Z][A-Z\s]+,\s*(\w+\.?\s+\d{1,2},?\s+\d{4})\s*\/PRNewswire/i,
  ]
  
  // Search all lines for date
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Try each pattern
    for (const pattern of datePatterns) {
      const match = line.match(pattern)
      if (match) {
        const dateStr = match[1] || match[0]
        const parsed = parseDate(dateStr)
        if (parsed) {
          console.log(`  Found date at line ${i}: "${dateStr}" → ${parsed.toISOString()}`)
          return parsed
        }
      }
    }
  }
  
  return null
}

/**
 * Parse various date formats
 */
function parseDate(dateStr: string): Date | null {
  // Clean up the date string
  let cleaned = dateStr.trim()
  
  // Month name to number mapping
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
  
  // Pattern: Month Day, Year (May 12, 2026 or May. 12, 2026)
  const match = cleaned.match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/i)
  if (match) {
    const monthName = match[1].toLowerCase()
    const day = parseInt(match[2])
    const year = parseInt(match[3])
    
    if (months[monthName] !== undefined) {
      return new Date(Date.UTC(year, months[monthName], day))
    }
  }
  
  return null
}

/**
 * Extract article content from page markdown
 */
function extractArticleContent(markdown: string, articleUrl: string): { 
  title: string
  shortDescription: string
  body: string
  date: Date | null
} {
  const lines = markdown.split('\n')
  
  // Extract title
  let title = ''
  for (let i = 0; i < Math.min(100, lines.length); i++) {
    const line = lines[i].trim()
    if (line.startsWith('[') || line.includes('javascript:;')) continue
    if (line.length < 20 || line.length > 300) continue
    if (line.includes('|') || line.includes('Accessibility')) continue
    
    const cleaned = line.replace(/^#+\s*/, '').trim()
    if (cleaned.length > 20 && !cleaned.startsWith('[')) {
      title = cleaned
      break
    }
  }
  
  // Extract publication date
  const date = extractPublicationDate(markdown)
  
  // Find dateline for body extraction
  let datelineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (/[A-Z][A-Z\s]+,.*\/PRNewswire\//.test(lines[i])) {
      datelineIndex = i
      break
    }
  }
  
  // Extract short description (italic text)
  let shortDescription = ''
  const shareIdx = lines.findIndex(l => l.includes('Share this article'))
  
  for (let i = (shareIdx >= 0 ? shareIdx : 0) + 1; i < (datelineIndex > 0 ? datelineIndex : lines.length); i++) {
    const line = lines[i].trim()
    const italicMatch = line.match(/^\*(.+)\*$/)
    if (italicMatch && italicMatch[1].length > 30) {
      shortDescription = italicMatch[1]
      break
    }
    if (line.startsWith('*') && !line.endsWith('*') && line.length > 10) {
      let italicText = line.substring(1)
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
  
  // Extract body
  let bodyLines: string[] = []
  if (datelineIndex >= 0) {
    for (let i = datelineIndex; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.match(/^IR Contact:/i) || line.match(/^PR Contact:/i)) break
      if (line === 'SOURCE Ispire Technology Inc.' || line === 'SOURCE Ispire') break
      if (line.includes('### Modal') || line.includes('Also from this source')) break
      if (line.includes('Request a Demo')) break
      if (line.length < 5) continue
      if (line.startsWith('[') && line.includes('](http')) continue
      if (line === 'javascript:;') continue
      bodyLines.push(line)
      if (bodyLines.length > 500) break
    }
  }
  
  const body = bodyLines.join('\n\n')
  
  // Fallbacks
  if (!title) {
    const titleMatch = articleUrl.match(/\/news-releases\/([^/]+)-\d+\.html/)
    if (titleMatch) {
      title = titleMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  
  if (!shortDescription && body) {
    const firstPara = body.split('\n\n')[0]
    if (firstPara && firstPara.length > 50) {
      shortDescription = firstPara.substring(0, 300) + '...'
    }
  }
  
  return {
    title: title || 'Untitled Press Release',
    shortDescription,
    body: body.substring(0, 100000),
    date
  }
}

async function reimportArticle(url: string): Promise<void> {
  console.log(`\n=== Importing: ${url}`)
  
  const client = new NotteClient({ apiKey: NOTTE_API_TOKEN! })
  let session: any = null
  
  try {
    session = client.Session()
    await session.start()
    await session.execute({ type: 'goto', url })
    
    const response = await session.scrape()
    
    let markdown = ''
    if (typeof response === 'string') {
      markdown = response
    } else if (response && typeof response === 'object') {
      markdown = response.markdown || response.text || JSON.stringify(response)
    }
    
    console.log(`Page content: ${markdown.length} chars`)
    
    const content = extractArticleContent(markdown, url)
    console.log(`Title: ${content.title}`)
    console.log(`Date: ${content.date?.toISOString() || 'NOT FOUND'}`)
    console.log(`Body: ${content.body.length} chars`)
    
    await session.stop()
    
    if (content.body.length < 100) {
      console.log(`WARNING: Body too short, skipping`)
      return
    }
    
    // AI cleanup
    let finalTitle = content.title
    let finalShortDesc = content.shortDescription
    let finalBody = content.body
    
    if (OPENAI_API_KEY && needsCleanup({ title: content.title, body: content.body })) {
      console.log('Running AI cleanup...')
      const cleaned = await cleanContent({
        title: content.title,
        shortDescription: content.shortDescription,
        body: content.body,
        sourceUrl: url
      })
      finalTitle = cleaned.title
      finalShortDesc = cleaned.shortDescription
      finalBody = cleaned.body
      console.log(`AI changes: ${cleaned.changes.join(', ')}`)
    }
    
    // Find existing document
    const existingDocs = await sanityClient.fetch(
      `*[_type == "pressRelease" && sourceGuid == $url]`,
      { url }
    )
    
    const now = new Date().toISOString()
    const pubDate = content.date?.toISOString() || now
    
    if (existingDocs.length > 0) {
      // Update existing
      const doc = existingDocs[0]
      console.log(`Updating existing document: ${doc._id}`)
      
      await sanityClient
        .patch(doc._id)
        .set({
          title: finalTitle,
          shortDescription: finalShortDesc,
          bodyText: finalBody,
          date: pubDate,
          importedAt: now,
          syncStatus: 'imported',
          syncError: null,
          webflowItemId: null,
          failureCount: 0,
        })
        .commit()
      
      console.log(`✓ Updated with date: ${pubDate}`)
    } else {
      // Create new
      const sourceId = url.match(/-(\d+)\.html$/)?.[1] || ''
      const slug = finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 200)
      
      await sanityClient.create({
        _type: 'pressRelease',
        title: finalTitle,
        slug: { _type: 'slug', current: slug },
        shortDescription: finalShortDesc,
        bodyText: finalBody,
        date: pubDate,
        sourceUrl: url,
        sourceGuid: url,
        sourceId,
        sourceName: 'PR Newswire',
        newsProvidedBy: 'Ispire Technology Inc.',
        importedAt: now,
        syncStatus: 'imported',
      })
      
      console.log(`✓ Created new document`)
    }
    
  } catch (error) {
    console.error(`Error: ${error}`)
    if (session) {
      try { await session.stop() } catch (e) {}
    }
  }
}

async function main() {
  console.log('=== Re-importing Articles with AI Cleanup ===')
  console.log(`Time: ${new Date().toISOString()}`)
  console.log(`Articles: ${ARTICLES_TO_IMPORT.length}`)
  
  for (const url of ARTICLES_TO_IMPORT) {
    await reimportArticle(url)
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  console.log('\n=== Done ===')
  console.log('Run `npm run sync` to push to Webflow')
}

main().catch(console.error)