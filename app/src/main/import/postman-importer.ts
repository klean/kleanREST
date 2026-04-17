import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  RequestDefinition,
  RequestAuth,
  RequestBody,
  CollectionMeta,
  KeyValuePair,
  FormDataEntry,
  HttpMethod
} from '../../shared/types/project'
import {
  createDefaultRequest,
  createDefaultCollection,
  DEFAULT_PROJECT_SETTINGS
} from '../../shared/types/project'
import type { ProjectConfig } from '../../shared/types/project'
import type { Environment, EnvironmentVariable } from '../../shared/types/environment'
import { sanitizeFilename } from '../project/loader'

// ── Postman types (v2.1.0) ──────────────────────────────────────────────────

interface PostmanArchive {
  collection: Record<string, boolean>
  environment: Record<string, boolean>
}

interface PostmanCollection {
  info: {
    _postman_id: string
    name: string
    schema: string
  }
  item: PostmanItem[]
}

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: PostmanRequest
  response?: unknown[]
}

interface PostmanRequest {
  method: string
  header: { key: string; value: string; disabled?: boolean }[]
  body?: PostmanBody
  url: PostmanUrl
  auth?: PostmanAuth
  description?: string
}

interface PostmanBody {
  mode: string
  raw?: string
  formdata?: PostmanFormDataEntry[]
  graphql?: {
    query?: string
    variables?: string
  }
  options?: {
    raw?: {
      language?: string
    }
  }
}

interface PostmanFormDataEntry {
  key: string
  value?: string
  type: string
  src?: string
}

interface PostmanUrl {
  raw: string
  protocol?: string
  host?: string[]
  path?: string[]
  query?: { key: string; value: string; disabled?: boolean }[]
}

interface PostmanAuth {
  type: string
  bearer?: { key: string; value: string; type?: string }[]
  basic?: { key: string; value: string; type?: string }[]
}

interface PostmanEnvironment {
  id: string
  name: string
  values: {
    key: string
    value: string
    enabled: boolean
    type?: string
  }[]
}

// ── Import result ────────────────────────────────────────────────────────────

interface ImportResult {
  projects: string[]
  environments: number
  requests: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

async function exists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath)
    return true
  } catch {
    return false
  }
}

async function uniquePath(basePath: string, isDir: boolean): Promise<string> {
  if (!(await exists(basePath))) return basePath

  let counter = 2
  const ext = isDir ? '' : path.extname(basePath)
  const base = isDir ? basePath : basePath.slice(0, -ext.length)

  while (true) {
    const candidate = `${base}-${counter}${ext}`
    if (!(await exists(candidate))) return candidate
    counter++
  }
}

function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase()
  const valid: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  return valid.includes(upper as HttpMethod) ? (upper as HttpMethod) : 'GET'
}

// ── Converters ───────────────────────────────────────────────────────────────

function convertAuth(auth?: PostmanAuth): RequestAuth {
  if (!auth) return { type: 'none' }

  if (auth.type === 'bearer' && auth.bearer) {
    const tokenEntry = auth.bearer.find((e) => e.key === 'token')
    return { type: 'bearer', token: tokenEntry?.value || '' }
  }

  if (auth.type === 'basic' && auth.basic) {
    const usernameEntry = auth.basic.find((e) => e.key === 'username')
    const passwordEntry = auth.basic.find((e) => e.key === 'password')
    return {
      type: 'basic',
      username: usernameEntry?.value || '',
      password: passwordEntry?.value || ''
    }
  }

  return { type: 'none' }
}

function convertBody(body?: PostmanBody): RequestBody {
  const defaultBody: RequestBody = {
    mode: 'none',
    json: '{\n  \n}',
    formData: [],
    raw: '',
    rawLanguage: 'text',
    binary: null
  }

  if (!body) return defaultBody

  if (body.mode === 'raw') {
    const language = body.options?.raw?.language || 'text'
    if (language === 'json') {
      return {
        ...defaultBody,
        mode: 'json',
        json: body.raw || '{\n  \n}'
      }
    }
    return {
      ...defaultBody,
      mode: 'raw',
      raw: body.raw || '',
      rawLanguage: language
    }
  }

  if (body.mode === 'formdata' && body.formdata) {
    const formData: FormDataEntry[] = body.formdata.map((entry) => ({
      key: entry.key,
      value: entry.type === 'file' ? (entry.src || '') : (entry.value || ''),
      type: entry.type === 'file' ? 'file' as const : 'text' as const,
      enabled: true
    }))

    return {
      ...defaultBody,
      mode: 'formdata',
      formData
    }
  }

  if (body.mode === 'graphql' && body.graphql) {
    // Postman keeps graphql as a separate mode; over the wire it's just JSON.
    // Convert to a json body with the canonical { query, variables } shape.
    let variables: unknown = {}
    const rawVars = body.graphql.variables
    if (rawVars && rawVars.trim().length > 0) {
      try {
        variables = JSON.parse(rawVars)
      } catch {
        variables = rawVars
      }
    }
    const payload = { query: body.graphql.query || '', variables }
    return {
      ...defaultBody,
      mode: 'json',
      json: JSON.stringify(payload, null, 2)
    }
  }

  return defaultBody
}

function convertHeaders(
  headers: { key: string; value: string; disabled?: boolean }[]
): KeyValuePair[] {
  return headers.map((h) => ({
    key: h.key,
    value: h.value,
    enabled: !h.disabled
  }))
}

function convertQueryParams(
  query?: { key: string; value: string; disabled?: boolean }[]
): KeyValuePair[] {
  if (!query) return []
  return query.map((q) => ({
    key: q.key,
    value: q.value,
    enabled: !q.disabled
  }))
}

function convertRequest(item: PostmanItem, sortOrder: number): RequestDefinition {
  const req = item.request!
  const id = randomUUID()
  const def = createDefaultRequest(item.name, id)

  def.method = normalizeMethod(req.method)
  def.url = req.url?.raw || ''
  def.headers = convertHeaders(req.header || [])
  def.queryParams = convertQueryParams(req.url?.query)
  def.auth = convertAuth(req.auth)
  def.body = convertBody(req.body)
  def.sortOrder = sortOrder

  return def
}

function convertEnvironment(postmanEnv: PostmanEnvironment): Environment {
  const variables: EnvironmentVariable[] = postmanEnv.values.map((v) => ({
    key: v.key,
    value: v.value,
    enabled: v.enabled,
    secret: v.type === 'secret'
  }))

  return {
    schemaVersion: 1,
    id: randomUUID(),
    name: postmanEnv.name,
    color: '#3b82f6',
    variables
  }
}

// ── Recursive item walker ────────────────────────────────────────────────────

async function writeItems(
  items: PostmanItem[],
  targetDir: string,
  counters: { requests: number }
): Promise<void> {
  let sortOrder = 0

  for (const item of items) {
    if (item.item && item.item.length > 0) {
      // This is a folder
      const folderName = sanitizeFilename(item.name) || 'folder'
      let folderPath = path.join(targetDir, folderName)
      folderPath = await uniquePath(folderPath, true)

      await ensureDir(folderPath)

      const meta = createDefaultCollection(item.name, randomUUID())
      meta.sortOrder = sortOrder

      await fs.writeFile(
        path.join(folderPath, 'collection.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
      )

      // Recurse into sub-items
      await writeItems(item.item, folderPath, counters)
    } else if (item.request) {
      // This is a request
      const def = convertRequest(item, sortOrder)
      const filename = sanitizeFilename(item.name) + '.request.json'
      let filePath = path.join(targetDir, filename)
      filePath = await uniquePath(filePath, false)

      await fs.writeFile(filePath, JSON.stringify(def, null, 2), 'utf-8')
      counters.requests++
    }

    sortOrder++
  }
}

// ── Main import function ─────────────────────────────────────────────────────

export async function importPostmanDump(
  dumpPath: string,
  outputPath: string
): Promise<ImportResult> {
  const result: ImportResult = {
    projects: [],
    environments: 0,
    requests: 0
  }

  // 1. Read archive.json
  const archivePath = path.join(dumpPath, 'archive.json')
  const archiveRaw = await fs.readFile(archivePath, 'utf-8')
  const archive: PostmanArchive = JSON.parse(archiveRaw)

  // 2. Convert all environments
  const convertedEnvironments: Environment[] = []
  const envUuids = Object.keys(archive.environment || {})

  for (const uuid of envUuids) {
    const envFilePath = path.join(dumpPath, 'environment', `${uuid}.json`)
    try {
      const raw = await fs.readFile(envFilePath, 'utf-8')
      const postmanEnv: PostmanEnvironment = JSON.parse(raw)
      const env = convertEnvironment(postmanEnv)
      convertedEnvironments.push(env)
      result.environments++
    } catch {
      // Skip environments that can't be read
    }
  }

  // 3. Process each collection into a kleanREST project
  const collectionUuids = Object.keys(archive.collection || {})

  for (const uuid of collectionUuids) {
    const collFilePath = path.join(dumpPath, 'collection', `${uuid}.json`)

    let collectionRaw: string
    try {
      collectionRaw = await fs.readFile(collFilePath, 'utf-8')
    } catch {
      continue
    }

    const collection: PostmanCollection = JSON.parse(collectionRaw)
    const projectName = collection.info.name || 'Imported Collection'
    const projectFolderName = sanitizeFilename(projectName)

    let projectPath = path.join(outputPath, projectFolderName)
    projectPath = await uniquePath(projectPath, true)

    // Create project structure
    await ensureDir(projectPath)
    await ensureDir(path.join(projectPath, 'collections'))
    await ensureDir(path.join(projectPath, 'environments'))
    await ensureDir(path.join(projectPath, '.kleanrest', 'history'))

    // Write project config
    const config: ProjectConfig = {
      schemaVersion: 1,
      id: randomUUID(),
      name: projectName,
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

    // Write .gitignore
    await fs.writeFile(
      path.join(projectPath, '.gitignore'),
      '.kleanrest/\n',
      'utf-8'
    )

    // Environments are not auto-assigned to projects during full import.
    // Use the "Import Postman" button in the Environment Manager to
    // selectively import environments to specific projects.

    // Separate root-level requests from folders
    const rootRequests: PostmanItem[] = []
    const folders: PostmanItem[] = []

    for (const item of collection.item) {
      if (item.item && item.item.length > 0) {
        folders.push(item)
      } else if (item.request) {
        rootRequests.push(item)
      }
    }

    const counters = { requests: 0 }
    const collectionsDir = path.join(projectPath, 'collections')

    // Write folders as collections
    await writeItems(folders, collectionsDir, counters)

    // Handle root-level requests: put them in a "requests" default collection
    if (rootRequests.length > 0) {
      const defaultCollPath = path.join(collectionsDir, 'requests')
      await ensureDir(defaultCollPath)

      const defaultMeta = createDefaultCollection('Requests', randomUUID())
      defaultMeta.sortOrder = 999 // Put at end

      await fs.writeFile(
        path.join(defaultCollPath, 'collection.json'),
        JSON.stringify(defaultMeta, null, 2),
        'utf-8'
      )

      await writeItems(rootRequests, defaultCollPath, counters)
    }

    result.requests += counters.requests
    result.projects.push(projectPath)
  }

  return result
}

// ── Single-collection import (with merge) ──────────────────────────────────

export interface CollectionImportResult {
  collectionPath: string
  collectionName: string
  merged: boolean
  added: number
  updated: number
}

async function scanCollectionDir(dir: string): Promise<{
  subfolders: Map<string, string>
  requests: Map<string, { path: string; def: RequestDefinition }>
  maxSortOrder: number
}> {
  const subfolders = new Map<string, string>()
  const requests = new Map<string, { path: string; def: RequestDefinition }>()
  let maxSortOrder = -1

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return { subfolders, requests, maxSortOrder }
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.kleanrest' || entry.name === 'environments') continue
      const cjson = path.join(entryPath, 'collection.json')
      try {
        const raw = await fs.readFile(cjson, 'utf-8')
        const meta: CollectionMeta = JSON.parse(raw)
        subfolders.set(meta.name, entryPath)
        if (meta.sortOrder > maxSortOrder) maxSortOrder = meta.sortOrder
      } catch {
        // Not a collection folder — skip
      }
    } else if (entry.isFile() && entry.name.endsWith('.request.json')) {
      try {
        const raw = await fs.readFile(entryPath, 'utf-8')
        const def: RequestDefinition = JSON.parse(raw)
        requests.set(def.name, { path: entryPath, def })
        if (def.sortOrder > maxSortOrder) maxSortOrder = def.sortOrder
      } catch {
        // Skip unreadable
      }
    }
  }

  return { subfolders, requests, maxSortOrder }
}

async function mergeIntoDir(
  items: PostmanItem[],
  targetDir: string,
  counters: { added: number; updated: number }
): Promise<void> {
  const { subfolders, requests, maxSortOrder } = await scanCollectionDir(targetDir)
  let nextSortOrder = maxSortOrder + 1

  for (const item of items) {
    if (item.item && item.item.length > 0) {
      // Folder — recurse if name matches, else create new
      const existingSub = subfolders.get(item.name)
      if (existingSub) {
        await mergeIntoDir(item.item, existingSub, counters)
      } else {
        const folderName = sanitizeFilename(item.name) || 'folder'
        let newPath = path.join(targetDir, folderName)
        newPath = await uniquePath(newPath, true)
        await ensureDir(newPath)
        const meta = createDefaultCollection(item.name, randomUUID())
        meta.sortOrder = nextSortOrder++
        await fs.writeFile(
          path.join(newPath, 'collection.json'),
          JSON.stringify(meta, null, 2),
          'utf-8'
        )
        const subCounters = { requests: 0 }
        await writeItems(item.item, newPath, subCounters)
        counters.added += subCounters.requests
      }
    } else if (item.request) {
      const existing = requests.get(item.name)
      if (existing) {
        // Overwrite preserving id, createdAt, sortOrder so history links & ordering survive
        const incoming = convertRequest(item, existing.def.sortOrder)
        const mergedDef: RequestDefinition = {
          ...incoming,
          id: existing.def.id,
          sortOrder: existing.def.sortOrder,
          createdAt: existing.def.createdAt,
          updatedAt: new Date().toISOString()
        }
        await fs.writeFile(existing.path, JSON.stringify(mergedDef, null, 2), 'utf-8')
        counters.updated++
      } else {
        const def = convertRequest(item, nextSortOrder++)
        const filename = sanitizeFilename(item.name) + '.request.json'
        let filePath = path.join(targetDir, filename)
        filePath = await uniquePath(filePath, false)
        await fs.writeFile(filePath, JSON.stringify(def, null, 2), 'utf-8')
        counters.added++
      }
    }
  }
}

export async function importPostmanCollection(
  filePath: string,
  projectPath: string
): Promise<CollectionImportResult> {
  const raw = await fs.readFile(filePath, 'utf-8')
  const collection: PostmanCollection = JSON.parse(raw)
  const collectionName = collection.info?.name || 'Imported Collection'

  const collectionsDir = path.join(projectPath, 'collections')
  await ensureDir(collectionsDir)

  // Find an existing top-level collection with the same display name
  const { subfolders } = await scanCollectionDir(collectionsDir)
  const existingPath = subfolders.get(collectionName)

  const counters = { added: 0, updated: 0 }

  if (existingPath) {
    await mergeIntoDir(collection.item, existingPath, counters)
    return {
      collectionPath: existingPath,
      collectionName,
      merged: true,
      added: counters.added,
      updated: counters.updated
    }
  }

  // Create fresh collection
  const folderName = sanitizeFilename(collectionName)
  let newPath = path.join(collectionsDir, folderName)
  newPath = await uniquePath(newPath, true)
  await ensureDir(newPath)
  const meta = createDefaultCollection(collectionName, randomUUID())
  await fs.writeFile(
    path.join(newPath, 'collection.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  )

  const subCounters = { requests: 0 }
  await writeItems(collection.item, newPath, subCounters)

  return {
    collectionPath: newPath,
    collectionName,
    merged: false,
    added: subCounters.requests,
    updated: 0
  }
}

// ── Read environments only (for selective import) ───────────────────────────

export async function readPostmanEnvironments(dumpPath: string): Promise<Environment[]> {
  const environments: Environment[] = []

  // Try reading archive.json first
  const archivePath = path.join(dumpPath, 'archive.json')
  let envUuids: string[] = []

  try {
    const archiveRaw = await fs.readFile(archivePath, 'utf-8')
    const archive: PostmanArchive = JSON.parse(archiveRaw)
    envUuids = Object.keys(archive.environment || {})
  } catch {
    // No archive.json — try scanning the environment/ folder directly
    try {
      const entries = await fs.readdir(path.join(dumpPath, 'environment'))
      envUuids = entries.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    } catch {
      return environments
    }
  }

  for (const uuid of envUuids) {
    const envFilePath = path.join(dumpPath, 'environment', `${uuid}.json`)
    try {
      const raw = await fs.readFile(envFilePath, 'utf-8')
      const postmanEnv: PostmanEnvironment = JSON.parse(raw)
      environments.push(convertEnvironment(postmanEnv))
    } catch {
      // Skip unreadable files
    }
  }

  return environments
}
