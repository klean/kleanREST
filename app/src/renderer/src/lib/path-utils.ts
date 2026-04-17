/**
 * Cross-platform dirname for use in the renderer process
 * (node:path is not available in the browser context)
 */
export function dirname(p: string): string {
  return p.replace(/[/\\][^/\\]+$/, '')
}

export function basename(p: string): string {
  const match = p.match(/[/\\]([^/\\]+)$/)
  return match ? match[1] : p
}

/**
 * Find the top-level collection path for a given file path.
 * Given a path like .../project/collections/top-coll/sub-coll/request.json
 * returns .../project/collections/top-coll
 */
export function topLevelCollectionPath(filePath: string): string | null {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/')
  const marker = '/collections/'
  const idx = normalized.lastIndexOf(marker)
  if (idx === -1) return null

  const afterCollections = normalized.substring(idx + marker.length)
  const firstSegment = afterCollections.split('/')[0]
  if (!firstSegment) return null

  return normalized.substring(0, idx + marker.length + firstSegment.length)
}
