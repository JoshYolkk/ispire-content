import { createClient } from '@sanity/client'
import dotenv from 'dotenv'

dotenv.config()

export const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'edocyjic',
  dataset: process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false, // Always use fresh data for mutations
})

export interface PressRelease {
  _id?: string
  title: string
  slug: { current: string }
  shortDescription?: string
  bodyText?: any
  date?: string
  sourceUrl: string
  sourceGuid: string
  sourceId?: string
  sourceName?: string
  newsProvidedBy?: string
  importedAt?: string
  syncStatus?: string
  webflowItemId?: string
  webflowSyncedAt?: string
  syncError?: string
}

/**
 * Check if a press release already exists by sourceGuid
 */
export async function existsByGuid(sourceGuid: string): Promise<boolean> {
  const result = await sanityClient.fetch(
    `count(*[_type == "pressRelease" && sourceGuid == $sourceGuid])`,
    { sourceGuid }
  )
  return result > 0
}

/**
 * Create a new press release document
 */
export async function createPressRelease(release: PressRelease): Promise<string> {
  const doc = {
    _type: 'pressRelease',
    title: release.title,
    slug: { _type: 'slug', current: release.slug.current },
    shortDescription: release.shortDescription,
    bodyText: release.bodyText,
    date: release.date,
    sourceUrl: release.sourceUrl,
    sourceGuid: release.sourceGuid,
    sourceId: release.sourceId,
    sourceName: release.sourceName || 'PR Newswire',
    newsProvidedBy: release.newsProvidedBy || 'Ispire Technology Inc.',
    importedAt: new Date().toISOString(),
    syncStatus: 'imported',
  }

  const result = await sanityClient.create(doc)
  return result._id
}

/**
 * Get all press releases that need to be synced to Webflow
 */
export async function getUnsyncedReleases(limit: number = 50): Promise<PressRelease[]> {
  return sanityClient.fetch(
    `*[_type == "pressRelease" && syncStatus == "imported" && !defined(webflowItemId)] | order(importedAt asc) [0...$limit]`,
    { limit }
  )
}

/**
 * Update sync status after Webflow sync
 */
export async function updateSyncStatus(
  documentId: string,
  status: 'published' | 'failed',
  webflowItemId?: string,
  error?: string
): Promise<void> {
  const update: any = {
    syncStatus: status,
    webflowSyncedAt: new Date().toISOString(),
  }

  if (webflowItemId) {
    update.webflowItemId = webflowItemId
  }

  if (error) {
    update.syncError = error
  }

  await sanityClient.patch(documentId).set(update).commit()
}

/**
 * Increment failure count and update error
 */
export async function markSyncFailed(documentId: string, error: string): Promise<void> {
  const doc = await sanityClient.getDocument(documentId)
  const failureCount = (doc as any)?.failureCount || 0

  await sanityClient
    .patch(documentId)
    .set({
      syncStatus: 'failed',
      syncError: error,
      failureCount: failureCount + 1,
      lastFailedAt: new Date().toISOString(),
    })
    .commit()
}

/**
 * Get releases that have failed multiple times (for alerts)
 */
export async function getRepeatedFailures(threshold: number = 3): Promise<PressRelease[]> {
  return sanityClient.fetch(
    `*[_type == "pressRelease" && syncStatus == "failed" && failureCount >= $threshold] | order(lastFailedAt desc)`,
    { threshold }
  )
}