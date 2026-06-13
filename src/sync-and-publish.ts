import dotenv from 'dotenv'
import { sanityClient } from './sanity-client.js'
import { createWebflowItem } from './webflow-client.js'

dotenv.config()

const WEBFLOW_API_URL = 'https://api.webflow.com/v2'
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID!

function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

async function publishItem(itemId: string): Promise<void> {
  console.log(`Publishing item ${itemId}...`)
  
  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}/publish`,
    {
      method: 'POST',
      headers: getHeaders(),
    }
  )
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to publish: ${error}`)
  }
  
  console.log(`✓ Published ${itemId}`)
}

async function syncAndPublish() {
  console.log('=== Syncing and Publishing ===')
  
  // Get unsynced items from Sanity
  const releases = await sanityClient.fetch(
    `*[_type == "pressRelease" && (!webflowItemId || webflowItemId == null)]{ _id, title, slug, shortDescription, bodyText, date, sourceUrl, sourceGuid, sourceId, sourceName, newsProvidedBy, importedAt }`
  )
  
  console.log(`Found ${releases.length} items to sync`)
  
  for (const release of releases) {
    console.log(`Syncing: ${release.title.substring(0, 50)}...`)
    
    try {
      // Create item (will be draft)
      const itemId = await createWebflowItem({
        title: release.title,
        slug: release.slug?.current || '',
        shortDescription: release.shortDescription,
        bodyText: release.bodyText,
        date: release.date,
        sourceUrl: release.sourceUrl,
        sourceGuid: release.sourceGuid,
        sourceId: release.sourceId,
        sourceName: release.sourceName,
        newsProvidedBy: release.newsProvidedBy,
        importedAt: release.importedAt,
      })
      
      console.log(`Created item: ${itemId}`)
      
      // Publish the item
      await publishItem(itemId)
      
      // Update Sanity with the item ID
      await sanityClient
        .patch(release._id)
        .set({
          webflowItemId: itemId,
          syncStatus: 'published'
        })
        .commit()
      
      console.log(`✓ Synced and published: ${release.title.substring(0, 50)}...`)
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
      
    } catch (error) {
      console.error(`✗ Failed: ${release.title.substring(0, 50)}... - ${error}`)
    }
  }
  
  console.log('\n=== Done ===')
}

syncAndPublish().catch(console.error)