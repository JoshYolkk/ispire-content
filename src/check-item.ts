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
  const item = await client.fetch('*[_type == "pressRelease"][0]')
  console.log('Title:', item.title)
  console.log('Sync Status:', item.syncStatus)
  console.log('Body Text type:', typeof item.bodyText)
  console.log('Body Text:', JSON.stringify(item.bodyText, null, 2).substring(0, 500))
}

main().catch(console.error)
