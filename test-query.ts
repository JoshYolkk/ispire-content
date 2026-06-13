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
  // Simplified query
  console.log('Query 1: All pressRelease')
  const q1 = await client.fetch(`*[_type == "pressRelease"] { _id, title, shortDescription }`)
  console.log('Found:', q1.length)
  
  console.log('\nQuery 2: With bodyText check')
  const q2 = await client.fetch(`*[_type == "pressRelease" && defined(bodyText)] { _id, title }`)
  console.log('Found:', q2.length)
  
  console.log('\nQuery 3: Full query from ai-processor')
  const q3 = await client.fetch(
    `*[_type == "pressRelease" && defined(bodyText) && bodyText != "" && ( !defined(shortDescription) || shortDescription == null || shortDescription == "" )] { _id, title }`
  )
  console.log('Found:', q3.length)
  
  // Check bodyText field specifically
  console.log('\nQuery 4: Check bodyText content')
  const q4 = await client.fetch(`*[_type == "pressRelease"][0] { _id, "bodyPreview": bodyText[0..100] }`)
  console.log('Body preview:', q4?.bodyPreview?.substring(0, 100))
}

main().catch(console.error)
