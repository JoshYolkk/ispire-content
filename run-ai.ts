import dotenv from 'dotenv'
import { createClient } from '@sanity/client'
import { processArticleWithAI, updateArticle } from './src/ai-processor.js'

dotenv.config()

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function main() {
  console.log('Fetching articles...')
  
  const articles = await client.fetch(
    `*[_type == "pressRelease" && defined(bodyText) && bodyText != "" && ( !defined(shortDescription) || shortDescription == null || shortDescription == "" )] | order(importedAt asc)[0...3] {
      _id,
      title,
      bodyText,
      shortDescription
    }`
  )
  
  console.log(`Found ${articles.length} articles\n`)
  
  for (const article of articles) {
    console.log(`Processing: ${article.title.substring(0, 60)}...`)
    
    try {
      const result = await processArticleWithAI(
        article.title,
        article.bodyText,
        article.shortDescription
      )
      
      if (result.processed) {
        await updateArticle(article._id, result)
        console.log(`  ✓ Updated - Description: ${result.shortDescription.substring(0, 80)}...`)
      } else {
        console.log(`  ✗ Not processed`)
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000))
    } catch (error) {
      console.error(`  Error: ${error.message}`)
    }
  }
}

main().catch(console.error)
