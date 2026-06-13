import dotenv from 'dotenv'
import { NotteClient } from 'notte-sdk'
import { sanityClient } from './sanity-client.js'
import { cleanContent, needsCleanup } from './ai-cleaner.js'

dotenv.config()

const NOTTE_API_TOKEN = process.env.NOTTE_API_TOKEN

// Failed articles to re-scrape
const FAILED_ARTICLES = [
  {
    url: 'https://www.prnewswire.com/news-releases/ispire-technology-inc-reports-financial-results-for-fiscal-second-quarter-2026-302680862.html',
    title: 'Ispire Technology Inc. Reports Financial Results for Fiscal Second Quarter 2026'
  },
  {
    url: 'https://www.prnewswire.com/news-releases/ispire-backed-ike-tech-invited-to-participate-in-fda-roundtable-on-pmta-submissions-302678778.html',
    title: 'Ispire-Backed IKE Tech Invited to Participate in FDA Roundtable on PMTA Submissions'
  }
]

/**
 * Extract article content from page markdown
 */
function extractArticleContent(markdown: string, articleUrl: string): { 
  title: string
  shortDescription: string
  body: string 
} {
  const lines = markdown.split('\n')
  
  // Find the article title
  let title = ''
  let titleIndex = -1
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('[') || line.includes('javascript:;')) continue
    if (line.length < 20 || line.length > 300) continue
    if (line.includes('|') || line.includes('Accessibility')) continue
    
    const cleaned = line.replace(/^#+\s*/, '').trim()
    if (cleaned.length > 20 && cleaned.length < 300 && !cleaned.startsWith('[')) {
      title = cleaned
      titleIndex = i
      break
    }
  }
  
  // Find the dateline pattern (multiple formats)
  let datelineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Format 1: LOS ANGELES, Feb. 6, 2026 /PRNewswire/
    if (/[A-Z][A-Z\s]+,\s*\w+\.?\s+\d{1,2},?\s*\d{4}\s*\/PRNewswire\//.test(line)) {
      datelineIndex = i
      break
    }
    // Format 2: LOS ANGELES, Feb. 6, 2026 /PRNewswire/ --
    if (/[A-Z][A-Z\s]+,.*\/PRNewswire\//.test(line)) {
      datelineIndex = i
      break
    }
  }
  
  // Find short description (italic text after date line)
  let shortDescription = ''
  const shareIdx = lines.findIndex(l => l.includes('Share this article'))
  const dateLineIdx = lines.findIndex((l, i) => i > (shareIdx >= 0 ? shareIdx : 0) && /\w+\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s*(ET|PT|GMT)/.test(l))
  
  for (let i = (shareIdx >= 0 ? shareIdx : titleIndex) + 1; i < (datelineIndex > 0 ? datelineIndex : lines.length); i++) {
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
  
  // Extract body content
  let bodyLines: string[] = []
  if (datelineIndex >= 0) {
    for (let i = datelineIndex; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.match(/^IR Contact:/i) || line.match(/^PR Contact:/i)) break
      if (line === 'SOURCE Ispire Technology Inc.' || line === 'SOURCE Ispire') break
      if (line.includes('### Modal') || line.includes('Also from this source')) break
      if (line.includes('Request a Demo') || line.includes('more press release views')) break
      if (line.length < 5) continue
      if (line.startsWith('[') && line.includes('](http')) continue
      if (line === 'javascript:;') continue
      bodyLines.push(line)
      if (bodyLines.length > 500) break
    }
  }
  
  const body = bodyLines.join('\n\n')
  
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
    body: body.substring(0, 100000)
  }
}

async function rescrapeArticle(url: string, expectedTitle: string): Promise<{ title: string; shortDescription: string; body: string } | null> {
  console.log(`\n=== Re-scraping: ${expectedTitle.substring(0, 50)}...`)
  console.log(`URL: ${url}`)
  
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
    
    console.log(`Page content length: ${markdown.length}`)
    
    const content = extractArticleContent(markdown, url)
    console.log(`Title: ${content.title}`)
    console.log(`Body length: ${content.body.length} chars`)
    
    await session.stop()
    
    if (content.body.length < 100) {
      console.log(`WARNING: Body too short (${content.body.length} chars)`)
      console.log(`First 500 chars of markdown:\n${markdown.substring(0, 500)}`)
    }
    
    return content
    
  } catch (error) {
    console.error(`Error scraping: ${error}`)
    if (session) {
      try { await session.stop() } catch (e) {}
    }
    return null
  }
}

async function main() {
  console.log('=== Re-scraping Failed Articles ===')
  console.log(`Time: ${new Date().toISOString()}`)
  
  for (const article of FAILED_ARTICLES) {
    // Get current Sanity document
    const existingDocs = await sanityClient.fetch(
      `*[_type == "pressRelease" && sourceGuid == $url]`,
      { url: article.url }
    )
    
    if (existingDocs.length === 0) {
      console.log(`Document not found in Sanity: ${article.title}`)
      continue
    }
    
    const existingDoc = existingDocs[0]
    console.log(`\nFound document: ${existingDoc._id}`)
    console.log(`Current body length: ${existingDoc.bodyText?.length || 0} chars`)
    
    // Re-scrape
    const content = await rescrapeArticle(article.url, article.title)
    
    if (!content || content.body.length < 100) {
      console.log(`FAILED: Could not extract content`)
      continue
    }
    
    // AI cleanup if needed
    let finalTitle = content.title
    let finalShortDesc = content.shortDescription
    let finalBody = content.body
    
    if (needsCleanup({ title: content.title, body: content.body })) {
      console.log('Running AI cleanup...')
      const cleaned = await cleanContent({
        title: content.title,
        shortDescription: content.shortDescription,
        body: content.body,
        sourceUrl: article.url
      })
      finalTitle = cleaned.title
      finalShortDesc = cleaned.shortDescription
      finalBody = cleaned.body
      console.log(`AI changes: ${cleaned.changes.join(', ')}`)
    }
    
    // Update Sanity document
    console.log(`\nUpdating Sanity document...`)
    await sanityClient
      .patch(existingDoc._id)
      .set({
        title: finalTitle,
        shortDescription: finalShortDesc,
        bodyText: finalBody,
        syncStatus: 'imported',
        syncError: null,
        webflowItemId: null,
        failureCount: 0,
      })
      .commit()
    
    console.log(`✓ Updated: ${finalTitle.substring(0, 50)}...`)
    console.log(`New body length: ${finalBody.length} chars`)
  }
  
  console.log('\n=== Done ===')
  console.log('Run `npm run sync` to sync updated articles to Webflow')
}

main().catch(console.error)