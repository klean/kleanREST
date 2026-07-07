import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { HistoryEntry } from '../../shared/types/history'

function getHistoryDir(projectPath: string): string {
  return path.join(projectPath, '.kleanrest', 'history')
}

function generateShortId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Headers that commonly carry credentials. Values are redacted before the entry
// is written to disk so that secrets resolved from env vars don't end up in
// persisted history (which is inside .kleanrest/ and gitignored, but can still
// leak via backups, crash reports, file-share, etc.).
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'api-key',
  'apikey'
])

const REDACTED = '[REDACTED]'

// Substrings that mark a query-param or JSON body field as credential-bearing.
// Matched case-insensitively against the key name. Auth configured as an API
// key in the query string (auth.addTo === 'query') lands in the resolved URL,
// and login bodies routinely carry passwords/tokens — both end up in history
// verbatim without this.
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'api-key',
  'auth',
  'credential',
  'sessionid',
  'session_id'
]

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p))
}

function redactHeaders(
  headers: { key: string; value: string }[]
): { key: string; value: string }[] {
  return headers.map((h) =>
    SENSITIVE_HEADER_NAMES.has(h.key.toLowerCase())
      ? { key: h.key, value: REDACTED }
      : h
  )
}

// Redact credential-bearing query-string values while leaving the rest of the
// URL intact. Returns the input unchanged if it can't be parsed as a URL.
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    let changed = false
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, REDACTED)
        changed = true
      }
    }
    return changed ? parsed.toString() : url
  } catch {
    return url
  }
}

// Best-effort redaction of sensitive fields in a JSON request body. Non-JSON
// bodies are left untouched — we don't want to mangle XML/form payloads or
// over-redact free text.
function redactBody(body: string | null): string | null {
  if (!body) return body
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = isSensitiveKey(k) ? REDACTED : walk(v)
      }
      return out
    }
    return value
  }

  try {
    return JSON.stringify(walk(parsed))
  } catch {
    return body
  }
}

function redactEntry(entry: HistoryEntry): HistoryEntry {
  return {
    ...entry,
    request: {
      ...entry.request,
      url: redactUrl(entry.request.url),
      headers: redactHeaders(entry.request.headers),
      body: redactBody(entry.request.body)
    },
    response: entry.response
      ? { ...entry.response, headers: redactHeaders(entry.response.headers) }
      : null
  }
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

  await fs.writeFile(filePath, JSON.stringify(redactEntry(entry), null, 2), 'utf-8')
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
