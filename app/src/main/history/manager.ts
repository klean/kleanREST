import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { HistoryEntry } from '../../shared/types/history'

function getHistoryDir(projectPath: string): string {
  return path.join(projectPath, '.kleanrest', 'history')
}

function generateShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function saveHistory(
  projectPath: string,
  entry: HistoryEntry
): Promise<void> {
  const historyDir = getHistoryDir(projectPath)
  await fs.mkdir(historyDir, { recursive: true })

  const timestamp = new Date(entry.timestamp).getTime()
  const shortId = generateShortId()
  const filename = `${timestamp}_${shortId}.json`
  const filePath = path.join(historyDir, filename)

  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8')
}

export async function listHistory(
  projectPath: string,
  limit: number,
  offset: number,
  requestId?: string
): Promise<HistoryEntry[]> {
  const historyDir = getHistoryDir(projectPath)

  let files: string[]
  try {
    files = await fs.readdir(historyDir)
  } catch {
    return []
  }

  // Filter to only JSON files and sort by timestamp descending (newest first)
  const jsonFiles = files
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => {
      // Extract timestamp from filename: {timestamp}_{shortId}.json
      const tsA = parseInt(a.split('_')[0], 10) || 0
      const tsB = parseInt(b.split('_')[0], 10) || 0
      return tsB - tsA
    })

  const entries: HistoryEntry[] = []
  let skipped = 0

  for (const file of jsonFiles) {
    if (entries.length >= limit) break

    const filePath = path.join(historyDir, file)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const entry: HistoryEntry = JSON.parse(raw)

      // Filter by requestId if specified
      if (requestId && entry.requestId !== requestId) continue

      if (skipped < offset) {
        skipped++
        continue
      }

      entries.push(entry)
    } catch {
      // Skip malformed files
    }
  }

  return entries
}

export async function clearHistoryForRequest(
  projectPath: string,
  requestId: string
): Promise<number> {
  const historyDir = getHistoryDir(projectPath)
  let files: string[]
  try {
    files = await fs.readdir(historyDir)
  } catch {
    return 0
  }

  let deleted = 0
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const filePath = path.join(historyDir, file)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const entry: HistoryEntry = JSON.parse(raw)
      if (entry.requestId === requestId) {
        await fs.unlink(filePath)
        deleted++
      }
    } catch {
      // Skip
    }
  }
  return deleted
}

export async function clearHistory(projectPath: string): Promise<void> {
  const historyDir = getHistoryDir(projectPath)

  let files: string[]
  try {
    files = await fs.readdir(historyDir)
  } catch {
    return
  }

  await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map((f) => fs.unlink(path.join(historyDir, f)))
  )
}
