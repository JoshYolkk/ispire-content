import { createClient } from '@sanity/client'
import dotenv from 'dotenv'

dotenv.config()

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function main() {
  // Test different query variations
  console.log('=== Query 1: No shortDescription ===')
  const q1 = await client.fetch(
    `*[_type == "pressRelease" && !defined(shortDescription)] { _id, title }`
  )
  console.log('Found:', q1.length)
  
  console.log('\n=== Query 2: Empty shortDescription ===')
  const q2 = await client.fetch(
    `*[_type == "pressRelease" && shortDescription == null] { _id, title }`
  )
  console.log('Found:', q2.length)
  
  console.log('\n=== Query 3: shortDescription not set or empty ===')
  const q3 = await client.fetch(
    `*[_type == "pressRelease" && ( !defined(shortDescription) || shortDescription == "" || shortDescription == null )] { _id, title }`
  )
  console.log('Found:', q3.length)
  console.log(JSON.stringify(q3, null, 2))
}

main().catch(console.error)
