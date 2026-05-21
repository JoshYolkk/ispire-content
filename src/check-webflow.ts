import dotenv from 'dotenv'
dotenv.config()

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID

async function main() {
  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  )
  
  const data = await response.json()
  console.log('Collection:', data.displayName || data.slug)
  console.log('Fields:')
  data.fields?.forEach((f: any) => {
    console.log(`  - ${f.slug} (${f.type})${f.required ? ' [required]' : ''}`)
    if (f.type === 'Option' || f.type === 'Select') {
      console.log(`    Options: ${f.validations?.options?.join(', ') || 'N/A'}`)
    }
  })
}

main().catch(console.error)