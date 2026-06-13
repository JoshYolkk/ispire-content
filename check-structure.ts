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
    `*[_type == "pressRelease"] | order(importedAt desc) [0...1]`
  )
  
  console.log('Article structure:')
  console.log(JSON.stringify(articles, null, 2))
}

main().catch(console.error)
