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

async function publishItems(itemIds: string[]): Promise<void> {
  console.log(`Publishing ${itemIds.length} items...`)
  
  // Webflow v2 uses the publish endpoint
  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${WEBFLOW_COLLECTION_ID}/items/publish`,
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        itemIds: itemIds
      })
    }
  )
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to publish items: ${error}`)
  }
  
  console.log('✓ Items published')
}

async function syncAndPublish() {
  console.log('=== Syncing Sanity → Webflow ===')
  
  // Get unsynced items from Sanity
  const releases = await sanityClient.fetch(
    `*[_type == "pressRelease" && (!webflowItemId || webflowItemId == null)] | order(date desc){ 
      _id, title, slug, shortDescription, bodyText, date, sourceUrl, sourceGuid, sourceId, sourceName, newsProvidedBy, importedAt 
    }`
  )
  
  console.log(`Found ${releases.length} items to sync`)
  
  if (releases.length === 0) {
    console.log('\n✓ All items are synced')
    return
  }
  
  const syncedIds: { sanityId: string; webflowId: string }[] = []
  
  for (const release of releases) {
    console.log(`\nSyncing: ${release.title.substring(0, 50)}...`)
    
    try {
      // Createitem (creates as draft)
      const webflowId = await createWebflowItem({
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
      
      console.log(`Created Webflow item: ${webflowId}`)
      syncedIds.push({ sanityId: release._id, webflowId })
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
      
    } catch (error) {
      console.error(`✗ Failed: ${error}`)
    }
  }
  
  // Publish all items
  if (syncedIds.length > 0) {
    console.log('\n--- Publishing items ---')
    try {
      await publishItems(syncedIds.map(s => s.webflowId))
    } catch (error) {
      console.error('Failed to publish:', error)
      console.log('Items remain as drafts - can be published manually in Webflow')
    }
  }
  
  // Update Sanity with webflow IDs
  console.log('\n--- Updating Sanity ---')
  for (const { sanityId, webflowId } of syncedIds) {
    await sanityClient
      .patch(sanityId)
      .set({
        webflowItemId: webflowId,
        syncStatus: 'published'
      })
      .commit()
    console.log(`Updated: ${webflowId}`)
  }
  
  console.log('\n=== Done ===')
}

syncAndPublish().catch(console.error)