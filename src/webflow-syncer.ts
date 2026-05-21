import dotenv from 'dotenv'

import {
  getUnsyncedReleases,
  updateSyncStatus,
  markSyncFailed,
  getRepeatedFailures,
  PressRelease
} from './sanity-client.js'
import { createWebflowItem } from './webflow-client.js'

dotenv.config()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

/**
 * Sync a single press release to Webflow
 */
async function syncToWebflow(release: PressRelease): Promise<string> {
  console.log(`Syncing to Webflow: ${release.title}`)

  const webflowItemId = await createWebflowItem({
    title: release.title,
    slug: release.slug?.current || '',
    shortDescription: release.shortDescription,
    bodyText: release.bodyText
      ? JSON.stringify(release.bodyText)
      : undefined,
    date: release.date,
    sourceUrl: release.sourceUrl,
    sourceGuid: release.sourceGuid,
    sourceId: release.sourceId,
    sourceName: release.sourceName,
    newsProvidedBy: release.newsProvidedBy,
    importedAt: release.importedAt,
  })

  return webflowItemId
}

/**
 * Sync all unsynced press releases to Webflow
 */
export async function syncToWebflowAll(): Promise<{
  total: number
  synced: number
  failed: number
  errors: string[]
}> {
  console.log('Fetching unsynced press releases from Sanity...')

  const releases = await getUnsyncedReleases(50)
  const results = {
    total: releases.length,
    synced: 0,
    failed: 0,
    errors: [] as string[],
  }

  console.log(`Found ${releases.length} items to sync`)

  for (const release of releases) {
    try {
      const webflowItemId = await syncToWebflow(release)
      await updateSyncStatus(release._id!, 'published', webflowItemId)

      console.log(`✓ Synced: ${release.title}`)
      results.synced++

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`✗ Failed: ${release.title} - ${errMsg}`)

      await markSyncFailed(release._id!, errMsg)
      results.failed++
      results.errors.push(`${release.title}: ${errMsg}`)
    }
  }

  return results
}

/**
 * Check for repeated failures and generate alert
 */
export async function checkForAlerts(): Promise<{
  hasAlerts: boolean
  failures: PressRelease[]
}> {
  const failures = await getRepeatedFailures(MAX_RETRIES)

  return {
    hasAlerts: failures.length > 0,
    failures,
  }
}

/**
 * Run Webflow sync job
 */
export async function runWebflowSync(): Promise<void> {
  const startTime = Date.now()
  console.log('=== Webflow Sync Job Started ===')
  console.log(`Time: ${new Date().toISOString()}`)

  try {
    const results = await syncToWebflowAll()

    console.log('\n=== Webflow Sync Results ===')
    console.log(`Total items: ${results.total}`)
    console.log(`Synced: ${results.synced}`)
    console.log(`Failed: ${results.failed}`)

    if (results.errors.length > 0) {
      console.log(`\nErrors (${results.errors.length}):`)
      results.errors.forEach(e => console.log(`  - ${e}`))
    }

    // Check for alerts
    const alerts = await checkForAlerts()
    if (alerts.hasAlerts) {
      console.log(`\n⚠️  ALERT: ${alerts.failures.length} items have failed multiple times:`)
      alerts.failures.forEach(f => {
        console.log(`  - ${f.title} (failures: ${(f as any).failureCount || 0})`)
      })
      // In production, send email/notification here
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\nCompleted in ${duration}s`)

  } catch (error) {
    console.error('Webflow sync failed:', error)
    throw error
  }
}