import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

interface ProcessedArticle {
  title: string
  shortDescription: string
  bodyText: string
  originalBodyText: string
  processed: boolean
  changed: boolean
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface UnprocessedArticle {
  _id: string
  title: string
  bodyText?: string
  shortDescription?: string
  sourceGuid: string
}

interface ProcessingResults {
  total: number
  processed: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Call AI API to process article text
 * Uses DeepInfra with Llama 3.1 70B as fallback (OpenAI quota exhausted)
 */
async function callOpenAI(prompt: string, content: string): Promise<string> {
  const OPENAI_KEY = process.env.OPENAI_API_KEY
  const DEEPINFRA_KEY = process.env.DEEPINFRA_TOKEN
  
  // Try OpenAI first, fall back to DeepInfra
  let lastError: Error | null = null
  
  if (OPENAI_KEY && !process.env.SKIP_OPENAI) {
    try {
      console.log('  Trying OpenAI API...')
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a content editor for press releases.' },
            { role: 'user', content: `${prompt}\n\n---CONTENT TO PROCESS---\n${content}` }
          ],
          temperature: 0.3,
          max_tokens: 16000,
        }),
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${error}`)
      }
      
      const data = await response.json() as OpenAIResponse
      if (data.choices?.[0]?.message?.content) {
        console.log('  ✓ OpenAI succeeded')
        return data.choices[0].message.content
      }
    } catch (e) {
      lastError = e
      console.log(`  OpenAI failed: ${e.message}`)
    }
  }
  
  // Fall back to DeepInfra
  if (DEEPINFRA_KEY) {
    console.log('  Using DeepInfra API...')
    const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPINFRA_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        messages: [
          { role: 'system', content: 'You are a content editor for press releases. Improve formatting and structure while preserving all factual information.' },
          { role: 'user', content: `${prompt}\n\n---CONTENT TO PROCESS---\n${content}` }
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`DeepInfra API error: ${response.status} - ${error}`)
    }
    
    const data = await response.json() as OpenAIResponse
    if (data.choices?.[0]?.message?.content) {
      console.log('  ✓ DeepInfra succeeded')
      return data.choices[0].message.content
    }
  }
  
  throw new Error(lastError?.message || 'No AI API available')
}

/**
 * Extract text between markers
 */
function extractSection(text: string, marker: string): string {
  const regex = new RegExp(`${marker}\\s*\\n([\\s\\S]*?)(?=\\n---[A-Z]|$)`, 'i')
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

/**
 * Process article with AI to improve formatting and generate metadata
 */
export async function processArticleWithAI(
  title: string,
  bodyText: string,
  existingDescription?: string
): Promise<ProcessedArticle> {
  console.log(`Processing article: ${title.substring(0, 60)}...`)
  
  // If article already has a good description and the body is well-formatted, skip
  const hasGoodDescription = existingDescription && existingDescription.length > 50
  const looksWellFormatted = bodyText.includes('<table') || bodyText.includes('## ')
  
  if (hasGoodDescription && looksWellFormatted) {
    return {
      title,
      shortDescription: existingDescription!,
      bodyText,
      originalBodyText: bodyText,
      processed: true,
      changed: false,
    }
  }
  
  const prompt = `You are processing a press release. Your tasks:

1. GRAMMAR & MARKDOWN CLEANUP:
   - Fix any grammar issues
   - Convert markdown links to clean format: [text](url)
   - Remove broken or empty links

2. PARAGRAPH FORMATTING:
   - Ensure paragraphs are separated by double newlines
   - Remove excessive whitespace

3. TABLE FORMATTING:
   - If you find data that looks like a table (financial data, comparisons, lists), convert it to proper HTML <table> format
   - Use <table>, <thead>, <tbody>, <tr>, <th>, <td> tags
   - Tables should have headers (<th>) in first row

4. HEADING STRUCTURE:
   - Add proper Markdown headings: ## for major sections, ### for subsections
   - Common sections: "About [Company]", "Forward Looking Statements", "Contacts"
   - DO NOT change the content - only add heading markers

5. GENERATE SHORT DESCRIPTION:
   - Create a 2-3 sentence summary (100-200 characters) that captures the key news
   - This should be suitable for a preview/card display
   - Focus on: WHAT happened, WHO is involved, WHY it matters

CRITICAL RULES:
- NEVER change facts, numbers, names, quotes, or any actual content
- NEVER add new information
- NEVER remove information (except fixing formatting)
- If unsure about whether something is a table, leave it as-is text

Return the result in this EXACT format:

---DESCRIPTION---
[Your 2-3 sentence summary here]

---BODY---
[The formatted and cleaned press release body]

---END---`

  try {
    const response = await callOpenAI(prompt, bodyText)
    
    // Parse the response
    const description = extractSection(response, '---DESCRIPTION---')
    const body = extractSection(response, '---BODY---')
    
    if (!description || !body) {
      console.warn('AI response missing required sections, using original')
      return {
        title,
        shortDescription: existingDescription || '',
        bodyText: bodyText,
        originalBodyText: bodyText,
        processed: false,
        changed: false,
      }
    }
    
    // Check if anything actually changed
    const changed = body !== bodyText || description !== existingDescription
    
    return {
      title,
      shortDescription: description,
      bodyText: body,
      originalBodyText: bodyText,
      processed: true,
      changed,
    }
  } catch (error) {
    console.error('AI processing failed:', error)
    return {
      title,
      shortDescription: existingDescription || '',
      bodyText: bodyText,
      originalBodyText: bodyText,
      processed: false,
      changed: false,
    }
  }
}

/**
 * Get articles from Sanity that need processing
 */
export async function getUnprocessedArticles(limit: number = 20): Promise<UnprocessedArticle[]> {
  // Get all articles and filter in JavaScript (GROQ defined() is unreliable)
  const articles = await sanityClient.fetch(
    `*[_type == "pressRelease"] | order(importedAt asc) [0...$limit] {
      _id,
      title,
      bodyText,
      shortDescription,
      sourceGuid
    }`,
    { limit }
  )
  
  // Filter in JavaScript - needs processing if no description or short description
  return articles.filter((a: UnprocessedArticle) => 
    a.bodyText && 
    a.bodyText.length > 100 && 
    (!a.shortDescription || a.shortDescription.length < 50)
  )
}

/**
 * Update article in Sanity with processed content
 */
export async function updateArticle(
  documentId: string,
  processed: ProcessedArticle
): Promise<void> {
  await sanityClient
    .patch(documentId)
    .set({
      shortDescription: processed.shortDescription,
      bodyText: processed.bodyText,
    })
    .commit()
}

/**
 * Run AI processing on unprocessed articles
 */
export async function runAIProcessing(): Promise<ProcessingResults> {
  const results: ProcessingResults = {
    total: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }
  
  console.log('=== AI Processing Job Started ===')
  console.log(`Time: ${new Date().toISOString()}`)
  
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment variables. Please add it to .env file.')
  }
  
  const articles = await getUnprocessedArticles(20)
  results.total = articles.length
  
  console.log(`Found ${articles.length} articles needing processing`)
  
  for (const article of articles) {
    try {
      console.log(`\n--- Processing: ${article.title.substring(0, 60)}...`)
      
      if (!article.bodyText) {
        console.log('  Skipping - no body text')
        results.skipped++
        continue
      }
      
      const result = await processArticleWithAI(
        article.title,
        article.bodyText,
        article.shortDescription
      )
      
      if (result.processed && result.changed) {
        await updateArticle(article._id, result)
        console.log('  ✓ Updated successfully')
        results.processed++
      } else if (result.processed && !result.changed) {
        console.log('  ✓ No changes needed')
        results.skipped++
      } else {
        console.log('  ✗ Processing failed (using original)')
        results.failed++
      }
      
      // Rate limiting - wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`  ✗ Error: ${errMsg}`)
      results.errors.push(`${article.title}: ${errMsg}`)
      results.failed++
    }
  }
  
  console.log('\n=== AI Processing Results ===')
  console.log(`Total: ${results.total}`)
  console.log(`Processed: ${results.processed}`)
  console.log(`Skipped: ${results.skipped}`)
  console.log(`Failed: ${results.failed}`)
  
  if (results.errors.length > 0) {
    console.log('\nErrors:')
    results.errors.forEach(e => console.log(`  - ${e}`))
  }
  
  return results
}

/**
 * Test AI processing on a single article by ID
 */
export async function testAIProcessing(documentId: string): Promise<ProcessedArticle> {
  const article = await sanityClient.fetch(
    `*[_type == "pressRelease" && _id == $id][0]{
      title,
      bodyText,
      shortDescription
    }`,
    { id: documentId }
  )
  
  if (!article || !article.bodyText) {
    throw new Error(`Article ${documentId} not found or has no body text`)
  }
  
  return processArticleWithAI(
    article.title,
    article.bodyText,
    article.shortDescription
  )
}