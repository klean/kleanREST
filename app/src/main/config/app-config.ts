import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { app } from 'electron'

interface AppConfig {
  workspaces: WorkspaceEntry[]
  lastActiveWorkspace: string | null
}

export interface WorkspaceEntry {
  path: string
  name: string
  addedAt: string
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

const DEFAULT_CONFIG: AppConfig = {
  workspaces: [],
  lastActiveWorkspace: null
}

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

async function saveAppConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath()
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export async function getWorkspaces(): Promise<WorkspaceEntry[]> {
  const config = await loadAppConfig()
  return config.workspaces
}

export async function addWorkspace(workspacePath: string, name?: string): Promise<void> {
  // Registering a workspace widens the set of paths every file operation is
  // allowed to touch (the path-guard trusts registered workspace roots), so
  // only accept a path that is actually an existing directory.
  let stat: import('node:fs').Stats
  try {
    stat = await fs.stat(workspacePath)
  } catch {
    throw new Error(`Workspace path does not exist: ${workspacePath}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${workspacePath}`)
  }

  const config = await loadAppConfig()
  if (config.workspaces.some(w => w.path === workspacePath)) return
  const workspaceName = name || path.basename(workspacePath)
  config.workspaces.push({
    path: workspacePath,
    name: workspaceName,
    addedAt: new Date().toISOString()
  })
  await saveAppConfig(config)
}

export async function removeWorkspace(workspacePath: string): Promise<void> {
  const config = await loadAppConfig()
  config.workspaces = config.workspaces.filter(w => w.path !== workspacePath)
  if (config.lastActiveWorkspace === workspacePath) {
    config.lastActiveWorkspace = null
  }
  await saveAppConfig(config)
}

export async function createWorkspace(parentPath: string, name: string): Promise<string> {
  const folderName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').slice(0, 50) || 'workspace'
  const workspacePath = path.join(parentPath, folderName)
  await fs.mkdir(workspacePath, { recursive: true })
  await addWorkspace(workspacePath, name)
  return workspacePath
}

export async function getLastActiveWorkspace(): Promise<string | null> {
  const config = await loadAppConfig()
  return config.lastActiveWorkspace
}

export async function setLastActiveWorkspace(workspacePath: string): Promise<void> {
  const config = await loadAppConfig()
  config.lastActiveWorkspace = workspacePath
  await saveAppConfig(config)
}
