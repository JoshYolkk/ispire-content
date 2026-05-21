import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

const client = createClient({
  projectId: 'edocyjic',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function main() {
  // Get all failed items
  const failed = await client.fetch('*[_type == "pressRelease" && syncStatus == "failed"]')
  console.log(`Found ${failed.length} failed items`)
  
  if (failed.length === 0) {
    console.log('No failed items to reset')
    return
  }
  
  // Reset all failed items to imported
  for (const item of failed) {
    await client
      .patch(item._id)
      .set({ syncStatus: 'imported', webflowItemId: undefined, syncError: undefined })
      .commit()
    console.log(`Reset: ${item.title}`)
  }
  
  console.log(`\nReset ${failed.length} items to imported`)
}

main().catch(console.error)