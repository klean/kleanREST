import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { app } from 'electron'

export interface McpConfig {
  enabled: boolean
  port: number | null
  token: string | null
  /**
   * Tool IDs the user has disabled. All tools are enabled by default, so any
   * tool added in a future version also defaults to enabled for existing users.
   */
  disabledTools: string[]
}

const DEFAULT_CONFIG: McpConfig = {
  enabled: false,
  port: null,
  token: null,
  disabledTools: []
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'mcp.json')
}

export async function loadMcpConfig(): Promise<McpConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveMcpConfig(config: McpConfig): Promise<void> {
  const p = configPath()
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(config, null, 2), 'utf-8')
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/** Finds a free TCP port on 127.0.0.1 that the OS picks for us. */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close()
        reject(new Error('Could not determine free port'))
      }
    })
  })
}

/** Ensures the config has a valid port and token, allocating + persisting them if missing. */
export async function ensurePortAndToken(config: McpConfig): Promise<McpConfig> {
  let changed = false
  const next = { ...config }
  if (!next.port) {
    next.port = await pickFreePort()
    changed = true
  }
  if (!next.token) {
    next.token = generateToken()
    changed = true
  }
  if (changed) await saveMcpConfig(next)
  return next
}
