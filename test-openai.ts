import dotenv from 'dotenv'
dotenv.config()

const OPENAI_KEY = process.env.OPENAI_API_KEY

async function test() {
  console.log('Testing OpenAI API...')
  console.log('Key starts with:', OPENAI_KEY?.substring(0, 10) + '...')
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: 'Say hello in 5 words.'
      }],
      max_tokens: 20,
    }),
  })
  
  const data = await response.json()
  console.log('Response:', JSON.stringify(data, null, 2))
}

test().catch(console.error)
