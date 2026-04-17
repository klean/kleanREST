import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ProjectConfig,
  ProjectTreeNode,
  RequestDefinition,
  CollectionMeta,
  ProjectSettings
} from '../../shared/types/project'
import {
  DEFAULT_PROJECT_SETTINGS,
  createDefaultRequest,
  createDefaultCollection
} from '../../shared/types/project'
import type { Environment } from '../../shared/types/environment'

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'untitled'
}

async function exists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath)
    return true
  } catch {
    return false
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

// ── Migration: collection-level envs back to project-level ──────────────────

async function migrateCollectionEnvsToProject(projectPath: string): Promise<void> {
  const projectEnvDir = path.join(projectPath, 'environments')
  await ensureDir(projectEnvDir)

  // Also restore from environments.migrated if it exists. Only remove the
  // source dir if every copy succeeds — otherwise we could silently drop env
  // files when a single copy fails.
  const migratedDir = path.join(projectPath, 'environments.migrated')
  try {
    const migrated = await fs.readdir(migratedDir, { withFileTypes: true })
    let allCopied = true
    for (const entry of migrated) {
      if (entry.isFile() && entry.name.endsWith('.env.json')) {
        const dest = path.join(projectEnvDir, entry.name)
        if (!(await exists(dest))) {
          try {
            await fs.copyFile(path.join(migratedDir, entry.name), dest)
          } catch {
            allCopied = false
          }
        }
      }
    }
    if (allCopied) {
      await fs.rm(migratedDir, { recursive: true, force: true })
    }
  } catch {
    // No migrated dir, that's fine
  }

  // Scan all collection dirs for environments/ subdirectories and move envs up
  const collectionsDir = path.join(projectPath, 'collections')
  try {
    const scanDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const fullPath = path.join(dir, entry.name)
        if (entry.name === 'environments') {
          // Move env files to project level
          const envFiles = await fs.readdir(fullPath, { withFileTypes: true })
          for (const ef of envFiles) {
            if (ef.isFile() && ef.name.endsWith('.env.json')) {
              const dest = path.join(projectEnvDir, ef.name)
              if (!(await exists(dest))) {
                await fs.copyFile(path.join(fullPath, ef.name), dest)
              }
            }
          }
          await fs.rm(fullPath, { recursive: true, force: true })
        } else if (entry.name !== '.kleanrest') {
          await scanDir(fullPath)
        }
      }
    }
    await scanDir(collectionsDir)
  } catch {
    // Scan failed, skip
  }
}

// ── Project loading ──────────────────────────────────────────────────────────

export async function loadProject(
  projectPath: string
): Promise<{ config: ProjectConfig; tree: ProjectTreeNode[] }> {
  // Migrate any collection-level environments back to project level
  await migrateCollectionEnvsToProject(projectPath)

  const configPath = path.join(projectPath, 'kleanrest.project.json')
  const raw = await fs.readFile(configPath, 'utf-8')
  const config: ProjectConfig = JSON.parse(raw)

  const collectionsDir = path.join(projectPath, 'collections')
  const tree = await scanCollectionsDir(collectionsDir)

  return { config, tree }
}

async function scanCollectionsDir(dirPath: string): Promise<ProjectTreeNode[]> {
  const nodes: ProjectTreeNode[] = []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return nodes
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Skip internal directories
      if (entry.name === 'environments' || entry.name === '.kleanrest') continue

      // Check for collection.json inside
      const collectionJsonPath = path.join(fullPath, 'collection.json')
      let meta: CollectionMeta | null = null
      try {
        const raw = await fs.readFile(collectionJsonPath, 'utf-8')
        meta = JSON.parse(raw)
      } catch {
        // Not a valid collection folder, skip
      }

      const children = await scanCollectionsDir(fullPath)

      nodes.push({
        type: meta ? 'collection' : 'folder',
        name: meta?.name || entry.name,
        path: fullPath,
        children,
        sortOrder: meta?.sortOrder ?? 0
      })
    } else if (entry.name.endsWith('.request.json')) {
      try {
        const raw = await fs.readFile(fullPath, 'utf-8')
        const req: RequestDefinition = JSON.parse(raw)
        nodes.push({
          type: 'request',
          name: req.name,
          path: fullPath,
          method: req.method,
          sortOrder: req.sortOrder ?? 0
        })
      } catch {
        // Skip malformed request files
      }
    }
  }

  // Sort by sortOrder then by name
  nodes.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })

  return nodes
}

// ── Project creation ─────────────────────────────────────────────────────────

export async function deleteProject(projectPath: string): Promise<void> {
  // Sanity check — only delete directories that actually look like a project.
  const configPath = path.join(projectPath, 'kleanrest.project.json')
  if (!(await exists(configPath))) {
    throw new Error('Not a kleanREST project directory')
  }
  await fs.rm(projectPath, { recursive: true, force: true })
}

export async function createProject(
  parentPath: string,
  name: string
): Promise<{ projectPath: string; config: ProjectConfig }> {
  const folderName = sanitizeFilename(name)
  const projectPath = path.join(parentPath, folderName)

  await ensureDir(projectPath)
  await ensureDir(path.join(projectPath, 'collections'))
  await ensureDir(path.join(projectPath, 'environments'))
  await ensureDir(path.join(projectPath, '.kleanrest', 'history'))

  const config: ProjectConfig = {
    schemaVersion: 1,
    id: randomUUID(),
    name,
    description: '',
    defaultEnvironment: null,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  await fs.writeFile(
    path.join(projectPath, 'kleanrest.project.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  )

  const gitignore = [
    '# kleanREST internal files',
    '.kleanrest/',
    ''
  ].join('\n')

  await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore, 'utf-8')

  return { projectPath, config }
}

// ── Move operations (requests & collections) ────────────────────────────────

export interface MoveResult {
  newPath: string
}

async function resolveMoveTarget(source: string, destDir: string): Promise<string> {
  const baseName = path.basename(source)
  const isDir = (await fs.stat(source)).isDirectory()
  let target = path.join(destDir, baseName)

  // If the destination IS the source's current parent, keep the same filename
  // (no renaming) — only a reorder is happening.
  if (path.resolve(target) === path.resolve(source)) return target

  if (await exists(target)) {
    const ext = isDir ? '' : path.extname(baseName)
    const base = isDir ? baseName : baseName.slice(0, -ext.length)
    let counter = 2
    while (await exists(path.join(destDir, `${base}-${counter}${ext}`))) {
      counter++
    }
    target = path.join(destDir, `${base}-${counter}${ext}`)
  }
  return target
}

async function renumberChildren(
  parentDir: string,
  movedPath: string,
  targetIndex: number
): Promise<void> {
  // Gather the parent's current children (requests + collection sub-dirs) with
  // their sort orders, re-insert movedPath at targetIndex, and rewrite each.
  type Child = { path: string; sortOrder: number; kind: 'request' | 'collection' }
  const children: Child[] = []

  const entries = await fs.readdir(parentDir, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(parentDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.kleanrest' || entry.name === 'environments') continue
      const cjson = path.join(entryPath, 'collection.json')
      try {
        const raw = await fs.readFile(cjson, 'utf-8')
        const meta: CollectionMeta = JSON.parse(raw)
        children.push({ path: entryPath, sortOrder: meta.sortOrder ?? 0, kind: 'collection' })
      } catch {
        // Not a collection folder
      }
    } else if (entry.isFile() && entry.name.endsWith('.request.json')) {
      try {
        const raw = await fs.readFile(entryPath, 'utf-8')
        const def: RequestDefinition = JSON.parse(raw)
        children.push({ path: entryPath, sortOrder: def.sortOrder ?? 0, kind: 'request' })
      } catch {
        // Skip
      }
    }
  }

  // Sort by current sortOrder
  children.sort((a, b) => a.sortOrder - b.sortOrder)

  // Remove the moved item from its current slot, then re-insert at target
  const movedResolved = path.resolve(movedPath)
  const withoutMoved = children.filter((c) => path.resolve(c.path) !== movedResolved)
  const moved = children.find((c) => path.resolve(c.path) === movedResolved)
  if (!moved) return

  const clampedIndex = Math.max(0, Math.min(targetIndex, withoutMoved.length))
  withoutMoved.splice(clampedIndex, 0, moved)

  // Rewrite sortOrder for each in their new index
  for (let i = 0; i < withoutMoved.length; i++) {
    const c = withoutMoved[i]
    if (c.kind === 'request') {
      const raw = await fs.readFile(c.path, 'utf-8')
      const def: RequestDefinition = JSON.parse(raw)
      if (def.sortOrder === i) continue
      def.sortOrder = i
      def.updatedAt = new Date().toISOString()
      await fs.writeFile(c.path, JSON.stringify(def, null, 2), 'utf-8')
    } else {
      const cjson = path.join(c.path, 'collection.json')
      const raw = await fs.readFile(cjson, 'utf-8')
      const meta: CollectionMeta = JSON.parse(raw)
      if (meta.sortOrder === i) continue
      meta.sortOrder = i
      await fs.writeFile(cjson, JSON.stringify(meta, null, 2), 'utf-8')
    }
  }
}

/**
 * Move a request or collection into a different parent directory.
 * If targetIndex is provided, the moved item is placed at that index among its
 * new siblings and sortOrder is re-numbered for all of them.
 */
export async function moveNode(
  sourcePath: string,
  destParentPath: string,
  targetIndex?: number
): Promise<MoveResult> {
  const stat = await fs.stat(sourcePath)
  const isRequest = !stat.isDirectory() && sourcePath.endsWith('.request.json')
  const isCollection =
    stat.isDirectory() && (await exists(path.join(sourcePath, 'collection.json')))

  if (!isRequest && !isCollection) {
    throw new Error('Source must be a request file or a collection folder')
  }

  // Requests can only live inside collections
  if (isRequest) {
    if (!(await exists(path.join(destParentPath, 'collection.json')))) {
      throw new Error('Requests can only be moved into a collection')
    }
  }

  if (isCollection) {
    const sourceResolved = path.resolve(sourcePath)
    const destResolved = path.resolve(destParentPath)
    if (destResolved === sourceResolved) {
      throw new Error('Cannot move a collection into itself')
    }
    if (destResolved.startsWith(sourceResolved + path.sep)) {
      throw new Error('Cannot move a collection into one of its descendants')
    }
  }

  const target = await resolveMoveTarget(sourcePath, destParentPath)
  const isSameLocation = path.resolve(target) === path.resolve(sourcePath)

  if (!isSameLocation) {
    try {
      await fs.rename(sourcePath, target)
    } catch (err) {
      // Cross-device renames fail with EXDEV — fall back to recursive copy + delete
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        if (isCollection) {
          await fs.cp(sourcePath, target, { recursive: true })
          await fs.rm(sourcePath, { recursive: true, force: true })
        } else {
          await fs.copyFile(sourcePath, target)
          await fs.unlink(sourcePath)
        }
      } else {
        throw err
      }
    }
  }

  if (targetIndex !== undefined) {
    await renumberChildren(destParentPath, target, targetIndex)
  }

  return { newPath: target }
}

// ── Request operations ───────────────────────────────────────────────────────

export async function loadRequest(requestPath: string): Promise<RequestDefinition> {
  const raw = await fs.readFile(requestPath, 'utf-8')
  return JSON.parse(raw)
}

export async function saveRequest(
  requestPath: string,
  request: RequestDefinition
): Promise<void> {
  const updated = { ...request, updatedAt: new Date().toISOString() }
  await fs.writeFile(requestPath, JSON.stringify(updated, null, 2), 'utf-8')
}

export async function createRequest(
  collectionPath: string,
  name: string
): Promise<{ path: string; request: RequestDefinition }> {
  const id = randomUUID()
  const request = createDefaultRequest(name, id)

  const filename = sanitizeFilename(name) + '.request.json'
  let filePath = path.join(collectionPath, filename)

  // Handle duplicate names
  let counter = 2
  while (await exists(filePath)) {
    const dedupName = sanitizeFilename(name) + `-${counter}` + '.request.json'
    filePath = path.join(collectionPath, dedupName)
    counter++
  }

  await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf-8')

  return { path: filePath, request }
}

export async function deleteRequest(requestPath: string): Promise<void> {
  await fs.unlink(requestPath)
}

export async function renameRequest(
  requestPath: string,
  newName: string
): Promise<{ newPath: string }> {
  const raw = await fs.readFile(requestPath, 'utf-8')
  const request: RequestDefinition = JSON.parse(raw)

  request.name = newName
  request.updatedAt = new Date().toISOString()

  const dir = path.dirname(requestPath)
  const newFilename = sanitizeFilename(newName) + '.request.json'
  let newPath = path.join(dir, newFilename)

  // Handle duplicate names (but allow renaming to same file)
  if (newPath !== requestPath) {
    let counter = 2
    while (await exists(newPath)) {
      const dedupName = sanitizeFilename(newName) + `-${counter}` + '.request.json'
      newPath = path.join(dir, dedupName)
      counter++
    }
  }

  await fs.writeFile(newPath, JSON.stringify(request, null, 2), 'utf-8')

  // Remove old file if path changed
  if (newPath !== requestPath) {
    await fs.unlink(requestPath)
  }

  return { newPath }
}

// ── Collection operations ────────────────────────────────────────────────────

export async function createCollection(
  projectPath: string,
  collectionPath: string,
  name: string
): Promise<CollectionMeta> {
  const folderName = sanitizeFilename(name)
  let fullPath = path.join(collectionPath, folderName)

  // Handle duplicate names
  let counter = 2
  while (await exists(fullPath)) {
    fullPath = path.join(collectionPath, `${folderName}-${counter}`)
    counter++
  }

  await ensureDir(fullPath)

  const id = randomUUID()
  const meta = createDefaultCollection(name, id)

  await fs.writeFile(
    path.join(fullPath, 'collection.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  )

  return meta
}

export async function deleteCollection(collectionPath: string): Promise<void> {
  await fs.rm(collectionPath, { recursive: true, force: true })
}

// ── Secret storage helpers ────────────────────────────────────────────────────

function secretsDir(projectPath: string): string {
  return path.join(projectPath, '.kleanrest', 'secrets')
}

function secretsFilePath(projectPath: string, envId: string): string {
  return path.join(secretsDir(projectPath), `${envId}.secrets.json`)
}

async function loadSecrets(
  projectPath: string,
  envId: string
): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(secretsFilePath(projectPath, envId), 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed.secrets || {}
  } catch {
    return {}
  }
}

async function saveSecretValues(
  projectPath: string,
  envId: string,
  secrets: Record<string, string>
): Promise<void> {
  const dir = secretsDir(projectPath)
  await ensureDir(dir)
  await fs.writeFile(
    secretsFilePath(projectPath, envId),
    JSON.stringify({ envId, secrets }, null, 2),
    'utf-8'
  )
}

async function deleteSecretValues(projectPath: string, envId: string): Promise<void> {
  try {
    await fs.unlink(secretsFilePath(projectPath, envId))
  } catch {
    // File may not exist
  }
}

// ── Environment operations ───────────────────────────────────────────────────

export async function listEnvironments(projectPath: string): Promise<Environment[]> {
  const envDir = path.join(projectPath, 'environments')
  const environments: Environment[] = []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(envDir, { withFileTypes: true })
  } catch {
    return environments
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.env.json')) {
      try {
        const raw = await fs.readFile(path.join(envDir, entry.name), 'utf-8')
        const env: Environment = JSON.parse(raw)
        if (!env.color) env.color = '#3b82f6'

        // Merge secret values back from the gitignored secrets store
        const secrets = await loadSecrets(projectPath, env.id)
        for (const variable of env.variables) {
          if (variable.secret && secrets[variable.key] !== undefined) {
            variable.value = secrets[variable.key]
          }
        }

        environments.push(env)
      } catch {
        // Skip malformed env files
      }
    }
  }

  return environments
}

export async function saveEnvironment(
  projectPath: string,
  env: Environment
): Promise<void> {
  const envDir = path.join(projectPath, 'environments')
  await ensureDir(envDir)

  const filename = sanitizeFilename(env.name) + '.env.json'
  const filePath = path.join(envDir, filename)

  // Check if environment already exists by ID (could have different name/filename)
  const existingFiles = await listEnvironmentFiles(envDir)
  for (const existing of existingFiles) {
    try {
      const raw = await fs.readFile(existing.path, 'utf-8')
      const parsed: Environment = JSON.parse(raw)
      if (parsed.id === env.id && existing.path !== filePath) {
        // Remove old file if the name changed
        await fs.unlink(existing.path)
        break
      }
    } catch {
      // Skip
    }
  }

  // Extract secret values into the gitignored secrets store,
  // and blank them out in the committed .env.json file
  const secrets: Record<string, string> = {}
  const safeEnv: Environment = {
    ...env,
    variables: env.variables.map((v) => {
      if (v.secret) {
        secrets[v.key] = v.value
        return { ...v, value: '' }
      }
      return v
    })
  }

  await fs.writeFile(filePath, JSON.stringify(safeEnv, null, 2), 'utf-8')

  if (Object.keys(secrets).length > 0) {
    await saveSecretValues(projectPath, env.id, secrets)
  } else {
    // Clean up secrets file if no secrets remain
    await deleteSecretValues(projectPath, env.id)
  }
}

export async function deleteEnvironment(
  projectPath: string,
  envId: string
): Promise<void> {
  const envDir = path.join(projectPath, 'environments')
  const files = await listEnvironmentFiles(envDir)

  for (const file of files) {
    try {
      const raw = await fs.readFile(file.path, 'utf-8')
      const parsed: Environment = JSON.parse(raw)
      if (parsed.id === envId) {
        await fs.unlink(file.path)
        await deleteSecretValues(projectPath, envId)
        return
      }
    } catch {
      // Skip
    }
  }
}

async function listEnvironmentFiles(
  envDir: string
): Promise<{ name: string; path: string }[]> {
  const results: { name: string; path: string }[] = []

  try {
    const entries = await fs.readdir(envDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.env.json')) {
        results.push({ name: entry.name, path: path.join(envDir, entry.name) })
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results
}

// ── Workspace scanning ───────────────────────────────────────────────────────

export async function listProjects(
  workspacePath: string
): Promise<{ name: string; path: string }[]> {
  const projects: { name: string; path: string }[] = []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(workspacePath, { withFileTypes: true })
  } catch {
    return projects
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const dirPath = path.join(workspacePath, entry.name)
    const configPath = path.join(dirPath, 'kleanrest.project.json')

    if (await exists(configPath)) {
      try {
        const raw = await fs.readFile(configPath, 'utf-8')
        const config: ProjectConfig = JSON.parse(raw)
        projects.push({ name: config.name, path: dirPath })
      } catch {
        // Has the file but it's malformed, still list it
        projects.push({ name: entry.name, path: dirPath })
      }
    }
  }

  return projects
}

// ── List all top-level collections across all projects ──────────────────────

export async function listAllCollections(
  workspacePath: string
): Promise<{ name: string; path: string; projectName: string }[]> {
  const results: { name: string; path: string; projectName: string }[] = []
  const projects = await listProjects(workspacePath)

  for (const project of projects) {
    const collectionsDir = path.join(project.path, 'collections')
    let entries: Dirent[]
    try {
      entries = await fs.readdir(collectionsDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'environments' || entry.name === '.kleanrest') continue

      const collPath = path.join(collectionsDir, entry.name)
      const collJsonPath = path.join(collPath, 'collection.json')
      let collName = entry.name
      try {
        const raw = await fs.readFile(collJsonPath, 'utf-8')
        const meta: CollectionMeta = JSON.parse(raw)
        collName = meta.name
      } catch {
        // Use directory name if no collection.json
      }

      results.push({
        name: collName,
        path: collPath,
        projectName: project.name
      })
    }
  }

  return results
}

// Re-export sanitizer for use in other modules
export { sanitizeFilename }
