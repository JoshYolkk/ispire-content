import dotenv from 'dotenv'
import { sanityClient } from './sanity-client.js'

dotenv.config()

const WEBFLOW_API_URL = 'https://api.webflow.com/v2'

function getHeaders(): HeadersInit {
  return {
    'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

async function publishDrafts() {
  console.log('=== Publishing drafteditems ===')
  
  // Get all items from Webflow
  const collectionId = process.env.WEBFLOW_COLLECTION_ID!
  const response = await fetch(
    `${WEBFLOW_API_URL}/collections/${collectionId}/items?limit=100`,
    { headers: getHeaders() }
  )
  
  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Find drafts created today
  const todayDrafts = data.items.filter((item: any) => 
    item.createdOn.startsWith('2026-06-13') && item.isDraft === true
  )
  
  console.log(`Found ${todayDrafts.length}drafts from today`)
  
  for (const item of todayDrafts) {
    console.log(`Publishing: ${item.fieldData.name.substring(0, 50)}...`)
    
    // Publish the item (set isDraft to false)
    const publishResponse = await fetch(
      `${WEBFLOW_API_URL}/collections/${collectionId}/items/${item.id}`,
      {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          _draft: false,
          _archived: false
        })
      }
    )
    
    if (!publishResponse.ok) {
      const error = await publishResponse.text()
      console.error(`Failed to publish ${item.id}: ${error}`)
    } else {
      console.log(`✓ Published: ${item.fieldData.name.substring(0, 50)}...`)// Update Sanity with the correct webflowItemId
      await sanityClient
        .patch({ query: `*[_type == "pressRelease" && title == "${item.fieldData.name}"]` })
        .set({ syncStatus: 'published' })
        .commit()
    }
  }
  
  console.log('\n=== Done ===')
}

publishDrafts().catch(console.error)