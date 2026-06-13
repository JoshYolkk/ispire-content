import dotenv from 'dotenv'
import { sanityClient } from './sanity-client.js'

dotenv.config()

async function clearAndResync() {
  console.log('=== Clearing Webflow IDs for re-sync ===')
  
  // Get all documents
  const docs = await sanityClient.fetch(
    `*[_type == "pressRelease"]{ _id, title }`
  )
  
  console.log(`Found ${docs.length} documents to clear`)
  
  // Clear webflowItemId and reset sync status
  for (const doc of docs) {
    await sanityClient
      .patch(doc._id)
      .set({
        webflowItemId: null,
        syncStatus: 'imported'
      })
      .commit()
    console.log(`Cleared: ${doc.title.substring(0, 50)}...`)
  }
  
  console.log('\n=== Done ===')
  console.log('Run `npm run sync` to push all articles to Webflow')
}

clearAndResync().catch(console.error)