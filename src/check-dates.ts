import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

const sanityClient = createClient({
  projectId: 'edocyjic',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function checkDates() {
  const docs = await sanityClient.fetch(
    '*[_type == "pressRelease"]{ title, date, importedAt, publishedAt, _createdAt, _updatedAt }'
  )
  
  console.log('=== Sanity Date Fields ===')
  docs.forEach((d: any) => {
    console.log('\nTitle:', d.title.substring(0, 60))
    console.log('  article date:', d.date || '(none)')
    console.log('  importedAt:', d.importedAt || '(none)')
    console.log('  publishedAt:', d.publishedAt || '(none)')
    console.log('  _createdAt:', d._createdAt)
  })
}

checkDates().catch(console.error)