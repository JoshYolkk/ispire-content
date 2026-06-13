import dotenv from 'dotenv'
dotenv.config()

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

interface CleanedContent {
  title: string
  shortDescription: string
  body: string
  changes: string[]
}

/**
 * Clean up messy web-scraped content using OpenAI
 */
export async function cleanContent(raw: {
  title: string
  shortDescription?: string
  body: string
  sourceUrl: string
}): Promise<CleanedContent> {
  if (!OPENAI_API_KEY) {
    console.log('No OpenAI API key, skipping AI cleanup')
    return {
      title: raw.title,
      shortDescription: raw.shortDescription || '',
      body: raw.body,
      changes: []
    }
  }

  const prompt = `You are a content cleaner for press releases. Clean up the following web-scraped content.

RULES:
1. Fix broken sentences and paragraphs
2. Remove web artifacts (navigation text, "Share this", "javascript:;", etc.)
3. Remove duplicate content
4. Fix encoding issues (â€™ → ', â€" → —, etc.)
5. Preserve all factual information
6. Keep the professional tone
7. Do NOT add anything - only clean what exists
8. Return valid JSON only

INPUT:
Title: ${raw.title}
Short Description: ${raw.shortDescription || '(none)'}
Body:
${raw.body.substring(0, 8000)}

Return JSON with this exact structure:
{
  "title": "cleaned title",
  "shortDescription": "cleaned short description (if blank, create one from first paragraph)",
  "body": "cleaned body text",
  "changes": ["list of main fixes applied"]
}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a content cleaning assistant. Return only valid JSON, no markdown formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`OpenAI API error: ${response.status} - ${error}`)
      return {
        title: raw.title,
        shortDescription: raw.shortDescription || '',
        body: raw.body,
        changes: [`AI cleanup failed: ${response.status}`]
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.error('No content from OpenAI')
      return {
        title: raw.title,
        shortDescription: raw.shortDescription || '',
        body: raw.body,
        changes: ['AI cleanup failed: no response']
      }
    }

    // Parse JSON response
    try {
      // Remove potential markdown code blocks
      const jsonStr = content.replace(/^```json\s*/i, '').replace(/\s*```$/,'').trim()
      const cleaned = JSON.parse(jsonStr)

      return {
        title: cleaned.title || raw.title,
        shortDescription: cleaned.shortDescription || raw.shortDescription || '',
        body: cleaned.body || raw.body,
        changes: cleaned.changes || []
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content.substring(0, 200))
      return {
        title: raw.title,
        shortDescription: raw.shortDescription || '',
        body: raw.body,
        changes: ['AI cleanup failed: parse error']
      }
    }

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`AI cleanup error: ${errMsg}`)
    return {
      title: raw.title,
      shortDescription: raw.shortDescription || '',
      body: raw.body,
      changes: [`AI cleanup error: ${errMsg}`]
    }
  }
}

/**
 * Check if content needs AI cleanup (has obvious artifacts)
 */
export function needsCleanup(content: { title: string; body: string }): boolean {
  const artifacts = [
    'javascript:;',
    'â€™',
    'â€"',
    'â€œ',
    'â€',
    'Share this article',
    'Request a Demo',
    '[Sign In]',
    '[Subscribe]',
  ]

  const textToCheck = content.title + ' ' + content.body
  return artifacts.some(artifact => textToCheck.includes(artifact))
}