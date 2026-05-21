import RSSParser from 'rss-parser'

const parser = new RSSParser()

async function main() {
  const feed = await parser.parseURL(
    'https://www.prnewswire.com/rss/news-releases-list.rss?company=ispire-technology-inc'
  )
  
  console.log('Feed title:', feed.title)
  console.log('Items:', feed.items.length)
  console.log('\n=== First Item Keys ===')
  
  const first = feed.items[0]
  console.log('Available fields:', Object.keys(first))
  console.log('\n=== Item Content ===')
  console.log('title:', first.title)
  console.log('link:', first.link)
  console.log('guid:', first.guid)
  console.log('pubDate:', first.pubDate)
  console.log('contentSnippet:', first.contentSnippet?.substring(0, 300))
  console.log('content:encoded available:', 'content:encoded' in first)
  console.log('content:', (first as any).content?.substring(0, 300))
  console.log('encoded:', (first as any).encoded?.substring(0, 300))
  
  // Check what PR Newswire provides
  for (const key of Object.keys(first)) {
    if (key.includes('content') || key.includes('body') || key.includes('description')) {
      console.log(`\n${key}:`, (first as any)[key]?.substring(0, 200))
    }
  }
}

main().catch(console.error)
