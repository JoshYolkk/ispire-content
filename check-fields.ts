import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function main() {
  // Get the full document with all fields
  const doc = await client.fetch(`*[_type == "pressRelease"][0]`)
  console.log('Document fields:')
  console.log(JSON.stringify(doc, null, 2))
}

main().catch(console.error)
