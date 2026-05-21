import dotenv from 'dotenv'
import { runRSSImport } from './rss-importer.js'
import { runWebflowSync } from './webflow-syncer.js'

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
        await runRSSImport()
        break

      case 'sync':
      case 'webflow':
        await runWebflowSync()
        break

      case 'all':
        console.log('\n--- Running RSS Import ---\n')
        await runRSSImport()
        console.log('\n--- Running Webflow Sync ---\n')
        await runWebflowSync()
        break

      default:
        console.error(`Unknown command: ${command}`)
        console.log('\nUsage:')
        console.log('  npm run job import   - Import RSS feed to Sanity')
        console.log('  npm run job sync     - Sync Sanity to Webflow')
        console.log('  npm run job all      - Run both jobs')
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