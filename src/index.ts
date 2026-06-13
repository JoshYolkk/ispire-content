import dotenv from 'dotenv'
import { runRSSImport } from './rss-importer.js'
import { runWebflowSync } from './webflow-syncer.js'
import { runNotteImport } from './notte-scraper.js'
import { runAIProcessing, testAIProcessing } from './ai-processor.js'

dotenv.config()

/**
 * Main entry point for running automation jobs
 */
async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'all'

  console.log('='.repeat(50))
  console.log('Ispire Content Automation')
  console.log('='.repeat(50))
  console.log(`Command: ${command}`)
  console.log(`Time: ${new Date().toISOString()}`)
  console.log('='.repeat(50))

  try {
    switch (command) {
      case 'import':
      case 'rss':
        // Legacy RSS importer (may pull wrong articles)
        console.log('\n⚠️  Using RSS importer - may pull unrelated articles')
        console.log('    Use "npm run notte" for Ispire-specific articles\n')
        await runRSSImport()
        break

      case 'notte':
      case 'scrape':
        // New Notte-based importer (Ispire-specific, full content)
        await runNotteImport()
        break

      case 'sync':
      case 'webflow':
        await runWebflowSync()
        break

      case 'process':
      case 'ai':
        // AI processing: improve formatting, add description
        await runAIProcessing()
        break

      case 'test-ai':
        // Test AI processing on a specific document
        const docId = args[1]
        if (!docId) {
          console.error('Please provide document ID: npm run job test-ai <document-id>')
          process.exit(1)
        }
        const result = await testAIProcessing(docId)
        console.log('\n=== Test Results ===')
        console.log('Title:', result.title)
        console.log('\nShort Description:')
        console.log(result.shortDescription)
        console.log('\n--- Original Body (first 500 chars) ---')
        console.log(result.originalBodyText.substring(0, 500))
        console.log('\n--- Processed Body (first 500 chars) ---')
        console.log(result.bodyText.substring(0, 500))
        console.log('\nProcessed:', result.processed)
        console.log('Changed:', result.changed)
        break

      case 'all':
        console.log('\n--- Running Notte Import ---\n')
        await runNotteImport()
        console.log('\n--- Running AI Processing ---\n')
        await runAIProcessing()
        console.log('\n--- Running Webflow Sync ---\n')
        await runWebflowSync()
        break

      case 'full':
        // Full pipeline: Notte import + AI processing + Webflow sync
        console.log('\n--- Running Full Pipeline ---\n')
        await runNotteImport()
        await runAIProcessing()
        await runWebflowSync()
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log('\nUsage:')
        console.log('  npm run notte     - Import from PR Newswire (Ispire-specific, full content)')
        console.log('  npm run import    - Import from RSS feed (legacy, may pull unrelated)')
        console.log('  npm run sync      - Sync Sanity to Webflow')
        console.log('  npm run process   - AI processing (improve formatting, add descriptions)')
        console.log('  npm run job all   - Run Notte import + AI process + Webflow sync')
        console.log('  npm run job test-ai <id> - Test AI processing on specific document')
        process.exit(1)
    }

    console.log('\n✓ Job completed successfully')
    process.exit(0)

  } catch (error) {
    console.error('\n✗ Job failed:', error)
    process.exit(1)
  }
}

main()