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

const OPENAI_KEY = process.env.OPENAI_API_KEY

async function processArticle(title: string, body: string): Promise<{description: string, body: string}> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: 'You are a content editor. Extract a short description (100-200 chars) and clean up the body formatting. Return JSON: {"description": "...", "body": "..."}'
      }, {
        role: 'user',
        content: `Title: ${title}\n\nBody:\n${body}\n\nReturn JSON with short description (2-3 sentences, 100-200 chars) and cleaned body.`
      }],
      temperature: 0.3,
      max_tokens: 16000,
    }),
  })
  
  const data = await response.json()
  const content = data.choices[0].message.content
  
  // Parse JSON from response
  const match = content.match(/\{[\s\S]*\}/)
  if (match) {
    return JSON.parse(match[0])
  }
  throw new Error('No JSON in response')
}

async function main() {
  console.log('=== AI Processing Started ===\n')
  
  // Simpler query - just get all articles
  const articles = await client.fetch(
    `*[_type == "pressRelease"] | order(importedAt asc)[0...3] { _id, title, bodyText, shortDescription }`
  )
  
  console.log(`Found ${articles.length} articles\n`)
  
  for (const article of articles) {
    if (!article.bodyText) {
      console.log(`Skipping: ${article.title} - no body`)
      continue
    }
    
    console.log(`Processing: ${article.title.substring(0, 60)}...`)
    
    try {
      const result = await processArticle(article.title, article.bodyText)
      
      // Update in Sanity
      await client.patch(article._id).set({
        shortDescription: result.description,
        bodyText: result.body
      }).commit()
      
      console.log(`✓ Updated`)
      console.log(`  Description: ${result.description.substring(0, 80)}...\n`)
      
      // Rate limit
      await new Promise(r => setTimeout(r, 1000))
    } catch (error) {
      console.error(`✗ Error: ${error.message}\n`)
    }
  }
  
  console.log('=== Done ===')
}

main().catch(console.error)
