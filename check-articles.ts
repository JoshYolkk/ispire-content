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
  const articles = await client.fetch(
    `*[_type == "pressRelease"] | order(importedAt desc) {
      _id,
      title,
      shortDescription,
      "bodyLength": length(pt::text(string(bodyText))),
      importedAt
    }`
  )
  
  console.log(`Found ${articles.length} articles:\n`)
  for (const a of articles) {
    const descLen = a.shortDescription ? a.shortDescription.length : 0
    console.log(`${a._id}`)
    console.log(`  Title: ${a.title.substring(0, 60)}...`)
    console.log(`  Description: ${descLen} chars`)
    console.log(`  Body: ${a.bodyLength} chars`)
    console.log()
  }
}

main().catch(console.error)
