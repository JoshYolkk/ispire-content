import dotenv from 'dotenv'
import { runRSSImport } from './rss-importer.js'
import { runWebflowSync } from './webflow-syncer.js'
import { runNotteImport } from './notte-scraper.js'

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

      case 'all':
        console.log('\n--- Running Notte Import ---\n')
        await runNotteImport()
        console.log('\n--- Running Webflow Sync ---\n')
        await runWebflowSync()
        break

      case 'full':
        // Full pipeline: Notte import + Webflow sync
        console.log('\n--- Running Full Pipeline ---\n')
        await runNotteImport()
        await runWebflowSync()
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log('\nUsage:')
        console.log('  npm run notte     - Import from PR Newswire (Ispire-specific, full content)')
        console.log('  npm run import    - Import from RSS feed (legacy, may pull unrelated)')
        console.log('  npm run sync      - Sync Sanity to Webflow')
        console.log('  npm run job all   - Run Notte import + Webflow sync')
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