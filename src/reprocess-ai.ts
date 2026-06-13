import dotenv from 'dotenv'
import { createClient } from '@sanity/client'
import { cleanContent, needsCleanup } from './ai-cleaner.js'

dotenv.config()

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function reprocessWithAI() {
  console.log('=== Reprocessing Articles with AI Cleanup ===')
  
  const docs = await sanityClient.fetch(
    '*[_type == "pressRelease"]{ _id, title, shortDescription, bodyText, sourceUrl }'
  )
  
  console.log(`Found ${docs.length} articles to check`)
  
  for (const doc of docs) {
    console.log(`\nChecking: ${doc.title?.substring(0, 50)}...`)
    
    // Check if cleanup is needed
    if (!needsCleanup({ title: doc.title, body: doc.bodyText })) {
      console.log('  ✓ Already clean, skipping')
      continue
    }
    
    console.log('  Cleaning with AI...')
    
    try {
      const cleaned = await cleanContent({
        title: doc.title,
        shortDescription: doc.shortDescription,
        body: doc.bodyText,
        sourceUrl: doc.sourceUrl
      })
      
      // Update in Sanity
      await sanityClient
        .patch(doc._id)
        .set({
          title: cleaned.title,
          shortDescription: cleaned.shortDescription,
          bodyText: cleaned.body,
        })
        .commit()
      
      console.log('  ✓ Updated')
      if (cleaned.changes.length > 0) {
        console.log('  Changes made:', cleaned.changes.join(', '))
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error('  ✗ Error:', error)
    }
  }
  
  console.log('\n=== Done ===')
}

reprocessWithAI().catch(console.error)