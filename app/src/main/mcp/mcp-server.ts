import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { BrowserWindow } from 'electron'
import {
  loadMcpConfig,
  saveMcpConfig,
  ensurePortAndToken,
  generateToken,
  type McpConfig
} from './mcp-config'
import { executeRequestFromDisk, executeAdHocRequest } from './request-executor'
import {
  assertPathInWorkspace,
  assertIsRegisteredWorkspace
} from '../security/path-guard'
import * as nodePath from 'node:path'
import {
  loadProject,
  loadRequest,
  saveRequest,
  createRequest,
  deleteRequest,
  createCollection,
  deleteCollection,
  listProjects,
  listEnvironments as loadEnvironments,
  saveEnvironment,
  listAllCollections
} from '../project/loader'
import { listHistory } from '../history/manager'
import { getWorkspaces, getLastActiveWorkspace } from '../config/app-config'
import type {
  ProjectTreeNode,
  RequestDefinition,
  HttpMethod
} from '../../shared/types/project'
import type { EnvironmentVariable } from '../../shared/types/environment'

export interface McpStatus {
  enabled: boolean
  running: boolean
  url: string | null
  token: string | null
  disabledTools: string[]
  error: string | null
}

let httpServer: HttpServer | null = null
let currentConfig: McpConfig = {
  enabled: false,
  port: null,
  token: null,
  disabledTools: []
}
let lastError: string | null = null

function currentStatus(): McpStatus {
  return {
    enabled: currentConfig.enabled,
    running: !!httpServer,
    url: currentConfig.port ? `http://127.0.0.1:${currentConfig.port}/mcp` : null,
    token: currentConfig.token,
    disabledTools: [...currentConfig.disabledTools],
    error: lastError
  }
}

function broadcastStatus(): void {
  const status = currentStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('mcp:status-changed', status)
    }
  }
}

// ── Tree helpers ────────────────────────────────────────────────────────────

function collectFromTree(
  nodes: ProjectTreeNode[],
  filter: (n: ProjectTreeNode) => boolean
): ProjectTreeNode[] {
  const out: ProjectTreeNode[] = []
  const visit = (n: ProjectTreeNode): void => {
    if (filter(n)) out.push(n)
    if (n.children) for (const c of n.children) visit(c)
  }
  nodes.forEach(visit)
  return out
}

async function resolveWorkspace(workspacePath?: string): Promise<string> {
  if (workspacePath) {
    await assertIsRegisteredWorkspace(workspacePath)
    return workspacePath
  }
  const last = await getLastActiveWorkspace()
  if (last) return last
  const all = await getWorkspaces()
  if (all.length === 1) return all[0].path
  throw new Error(
    'No workspace specified and no last-active workspace available. Call list_workspaces and pass workspacePath explicitly.'
  )
}

// ── Tool registration ──────────────────────────────────────────────────────

function registerTools(server: McpServer, disabledTools: Set<string>): void {
  // Wrap server.registerTool so disabled tools are skipped entirely — they
  // won't be advertised in tools/list and calls to them will be rejected by
  // the SDK. We use a loose signature here to side-step the overload
  // resolution pain; the SDK validates input schemas at call time anyway.
  const registerTool: (
    name: string,
    config: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (args: any) => unknown
  ) => void = (name, config, cb) => {
    if (disabledTools.has(name)) return
    ;(server.registerTool as (...a: unknown[]) => unknown)(name, config, cb)
  }

  registerTool(
    'list_workspaces',
    {
      description: 'List all workspaces registered in kleanREST.',
      inputSchema: {}
    },
    async () => {
      const ws = await getWorkspaces()
      return {
        content: [
          { type: 'text', text: JSON.stringify(ws.map((w) => ({ name: w.name, path: w.path })), null, 2) }
        ]
      }
    }
  )

  registerTool(
    'list_projects',
    {
      description: 'List all projects inside a workspace. Defaults to the last-active workspace if only one is registered.',
      inputSchema: { workspacePath: z.string().optional() }
    },
    async ({ workspacePath }) => {
      const ws = await resolveWorkspace(workspacePath)
      const projects = await listProjects(ws)
      return {
        content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }]
      }
    }
  )

  registerTool(
    'list_collections',
    {
      description: 'List all collections (including nested sub-collections) inside a project.',
      inputSchema: { projectPath: z.string() }
    },
    async ({ projectPath }) => {
      await assertPathInWorkspace(projectPath)
      const { tree } = await loadProject(projectPath)
      const collections = collectFromTree(
        tree,
        (n) => n.type === 'collection' || n.type === 'folder'
      ).map((n) => ({ name: n.name, path: n.path }))
      return { content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }] }
    }
  )

  registerTool(
    'list_requests',
    {
      description: 'List all requests inside a project, optionally filtered to a specific collection path.',
      inputSchema: {
        projectPath: z.string(),
        collectionPath: z.string().optional()
      }
    },
    async ({ projectPath, collectionPath }) => {
      await assertPathInWorkspace(projectPath)
      const { tree } = await loadProject(projectPath)
      let requests = collectFromTree(tree, (n) => n.type === 'request')
      if (collectionPath) {
        requests = requests.filter(
          (r) => r.path.startsWith(collectionPath + '/') || r.path.startsWith(collectionPath + '\\')
        )
      }
      const out = requests.map((r) => ({ name: r.name, path: r.path, method: r.method }))
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] }
    }
  )

  registerTool(
    'get_request',
    {
      description: 'Load the full definition of a request (method, url, headers, body, auth, etc.).',
      inputSchema: { requestPath: z.string() }
    },
    async ({ requestPath }) => {
      await assertPathInWorkspace(requestPath)
      const req = await loadRequest(requestPath)
      return { content: [{ type: 'text', text: JSON.stringify(req, null, 2) }] }
    }
  )

  registerTool(
    'list_environments',
    {
      description: 'List environments defined in a project. Variables marked as secret have their values blanked out in the response.',
      inputSchema: { projectPath: z.string() }
    },
    async ({ projectPath }) => {
      await assertPathInWorkspace(projectPath)
      const envs = await loadEnvironments(projectPath)
      const safe = envs.map((e) => ({
        id: e.id,
        name: e.name,
        color: e.color,
        variables: e.variables.map((v) => ({
          key: v.key,
          value: v.secret ? '' : v.value,
          enabled: v.enabled,
          secret: v.secret
        }))
      }))
      return { content: [{ type: 'text', text: JSON.stringify(safe, null, 2) }] }
    }
  )

  registerTool(
    'send_request',
    {
      description:
        'Execute a saved request. Resolves {{variables}} using the specified environment (or none), performs the HTTP call through kleanREST so it appears in the UI history, and returns the response. Sensitive headers are NEVER returned verbatim in history but ARE returned to this tool call.',
      inputSchema: {
        projectPath: z.string(),
        requestPath: z.string(),
        environmentId: z.string().optional()
      }
    },
    async ({ projectPath, requestPath, environmentId }) => {
      await assertPathInWorkspace(projectPath)
      await assertPathInWorkspace(requestPath)
      const outcome = await executeRequestFromDisk(projectPath, requestPath, environmentId)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: outcome.result.status,
                statusText: outcome.result.statusText,
                time: outcome.result.time,
                size: outcome.result.size,
                error: outcome.result.error,
                url: outcome.resolvedUrl,
                method: outcome.resolvedMethod,
                headers: outcome.result.headers,
                body: outcome.result.body
              },
              null,
              2
            )
          }
        ]
      }
    }
  )

  registerTool(
    'list_all_collections',
    {
      description: 'List top-level collections across all projects in a workspace. Useful for discovery.',
      inputSchema: { workspacePath: z.string().optional() }
    },
    async ({ workspacePath }) => {
      const ws = await resolveWorkspace(workspacePath)
      const colls = await listAllCollections(ws)
      return { content: [{ type: 'text', text: JSON.stringify(colls, null, 2) }] }
    }
  )

  registerTool(
    'list_history',
    {
      description: 'List request-history entries for a project. Sensitive headers are redacted.',
      inputSchema: {
        projectPath: z.string(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        requestId: z.string().optional()
      }
    },
    async ({ projectPath, limit, offset, requestId }) => {
      await assertPathInWorkspace(projectPath)
      const entries = await listHistory(projectPath, limit ?? 50, offset ?? 0, requestId)
      return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] }
    }
  )

  // ── Write tools ──────────────────────────────────────────────────────────

  const httpMethodSchema = z.enum([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'HEAD',
    'OPTIONS'
  ])

  const keyValueSchema = z.object({
    key: z.string(),
    value: z.string(),
    enabled: z.boolean().optional(),
    description: z.string().optional()
  })

  const authSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('bearer'), token: z.string() }),
    z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
    z.object({
      type: z.literal('apikey'),
      key: z.string(),
      value: z.string(),
      addTo: z.enum(['header', 'query'])
    }),
    z.object({ type: z.literal('inherit') })
  ])

  const bodySchema = z.object({
    mode: z.enum(['none', 'json', 'formdata', 'raw', 'binary']),
    json: z.string().optional(),
    formData: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
          type: z.enum(['text', 'file']),
          enabled: z.boolean().optional()
        })
      )
      .optional(),
    raw: z.string().optional(),
    rawLanguage: z.string().optional(),
    binary: z.string().nullable().optional()
  })

  const requestFieldsSchema = z.object({
    name: z.string().optional(),
    method: httpMethodSchema.optional(),
    url: z.string().optional(),
    queryParams: z.array(keyValueSchema).optional(),
    headers: z.array(keyValueSchema).optional(),
    auth: authSchema.optional(),
    body: bodySchema.optional()
  })

  function normalizeKvPairs(
    pairs: { key: string; value: string; enabled?: boolean; description?: string }[]
  ): { key: string; value: string; enabled: boolean; description?: string }[] {
    return pairs.map((p) => ({
      key: p.key,
      value: p.value,
      enabled: p.enabled ?? true,
      description: p.description
    }))
  }

  function applyRequestFields(
    base: RequestDefinition,
    fields: z.infer<typeof requestFieldsSchema>
  ): RequestDefinition {
    const next: RequestDefinition = { ...base }
    if (fields.name !== undefined) next.name = fields.name
    if (fields.method !== undefined) next.method = fields.method as HttpMethod
    if (fields.url !== undefined) next.url = fields.url
    if (fields.queryParams !== undefined) next.queryParams = normalizeKvPairs(fields.queryParams)
    if (fields.headers !== undefined) next.headers = normalizeKvPairs(fields.headers)
    if (fields.auth !== undefined) next.auth = fields.auth
    if (fields.body !== undefined) {
      next.body = {
        mode: fields.body.mode,
        json: fields.body.json ?? base.body.json,
        formData:
          fields.body.formData !== undefined
            ? fields.body.formData.map((e) => ({
                key: e.key,
                value: e.value,
                type: e.type,
                enabled: e.enabled ?? true
              }))
            : base.body.formData,
        raw: fields.body.raw ?? base.body.raw,
        rawLanguage: fields.body.rawLanguage ?? base.body.rawLanguage,
        binary: fields.body.binary !== undefined ? fields.body.binary : base.body.binary
      }
    }
    return next
  }

  registerTool(
    'create_request',
    {
      description:
        'Create a new saved request inside a collection. Optionally provide initial fields (method, url, headers, body, auth, queryParams) to populate the request in one shot. Returns the new request path and full definition.',
      inputSchema: {
        collectionPath: z.string(),
        name: z.string(),
        fields: requestFieldsSchema.optional()
      }
    },
    async ({ collectionPath, name, fields }) => {
      await assertPathInWorkspace(collectionPath)
      const { path: newPath, request } = await createRequest(collectionPath, name)
      let finalRequest = request
      if (fields) {
        finalRequest = applyRequestFields(request, fields)
        await saveRequest(newPath, finalRequest)
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ path: newPath, request: finalRequest }, null, 2)
          }
        ]
      }
    }
  )

  registerTool(
    'update_request',
    {
      description:
        'Update fields on an existing saved request. Only pass the fields you want to change; others are preserved. Use this to tune URLs, headers, body, etc. without rewriting the full file.',
      inputSchema: {
        requestPath: z.string(),
        fields: requestFieldsSchema
      }
    },
    async ({ requestPath, fields }) => {
      await assertPathInWorkspace(requestPath)
      const existing = await loadRequest(requestPath)
      const next = applyRequestFields(existing, fields)
      await saveRequest(requestPath, next)
      return {
        content: [
          { type: 'text', text: JSON.stringify({ path: requestPath, request: next }, null, 2) }
        ]
      }
    }
  )

  registerTool(
    'delete_request',
    {
      description: 'Permanently delete a saved request from disk.',
      inputSchema: { requestPath: z.string() }
    },
    async ({ requestPath }) => {
      await assertPathInWorkspace(requestPath)
      await deleteRequest(requestPath)
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: requestPath }) }] }
    }
  )

  registerTool(
    'create_collection',
    {
      description:
        'Create a new collection in a project. If parentCollectionPath is provided, the new collection becomes a sub-collection; otherwise it is created at the project root.',
      inputSchema: {
        projectPath: z.string(),
        name: z.string(),
        parentCollectionPath: z.string().optional()
      }
    },
    async ({ projectPath, name, parentCollectionPath }) => {
      await assertPathInWorkspace(projectPath)
      const parent = parentCollectionPath ?? nodePath.join(projectPath, 'collections')
      if (parentCollectionPath) await assertPathInWorkspace(parentCollectionPath)
      const meta = await createCollection(projectPath, parent, name)
      return { content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }] }
    }
  )

  registerTool(
    'delete_collection',
    {
      description:
        'Permanently delete a collection and everything inside it (sub-collections, requests).',
      inputSchema: { collectionPath: z.string() }
    },
    async ({ collectionPath }) => {
      await assertPathInWorkspace(collectionPath)
      await deleteCollection(collectionPath)
      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted: collectionPath }) }]
      }
    }
  )

  // ── Environment mutation ─────────────────────────────────────────────────

  registerTool(
    'set_variable',
    {
      description:
        'Create or update a variable in an environment. Useful for storing values captured from previous responses (e.g. auth tokens) so later send_request calls can reference them via {{key}}. Pass secret: true to keep the value out of committed files.',
      inputSchema: {
        projectPath: z.string(),
        environmentId: z.string(),
        key: z.string().min(1),
        value: z.string(),
        secret: z.boolean().optional(),
        enabled: z.boolean().optional()
      }
    },
    async ({ projectPath, environmentId, key, value, secret, enabled }) => {
      await assertPathInWorkspace(projectPath)
      const envs = await loadEnvironments(projectPath)
      const env = envs.find((e) => e.id === environmentId)
      if (!env) throw new Error(`Environment ${environmentId} not found in project`)

      const existingIndex = env.variables.findIndex((v) => v.key === key)
      let updated: EnvironmentVariable
      if (existingIndex >= 0) {
        updated = {
          ...env.variables[existingIndex],
          value,
          secret: secret ?? env.variables[existingIndex].secret,
          enabled: enabled ?? env.variables[existingIndex].enabled
        }
        env.variables[existingIndex] = updated
      } else {
        updated = {
          key,
          value,
          secret: secret ?? false,
          enabled: enabled ?? true
        }
        env.variables.push(updated)
      }

      await saveEnvironment(projectPath, env)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                environmentId,
                key,
                created: existingIndex < 0,
                secret: updated.secret,
                enabled: updated.enabled,
                // Echo the value only for non-secret vars so MCP clients don't
                // log it by accident.
                value: updated.secret ? '' : updated.value
              },
              null,
              2
            )
          }
        ]
      }
    }
  )

  // ── Ad-hoc send ─────────────────────────────────────────────────────────

  registerTool(
    'send_ad_hoc_request',
    {
      description:
        'Execute an HTTP request without saving it first. Useful for exploratory calls the AI is not yet ready to persist. If projectPath + environmentId are provided, {{vars}} are resolved and a history entry is saved so the call appears in the kleanREST UI. Otherwise the request runs in isolation.',
      inputSchema: {
        method: httpMethodSchema,
        url: z.string(),
        headers: z
          .array(
            z.object({
              key: z.string(),
              value: z.string()
            })
          )
          .optional(),
        body: z.string().optional(),
        bodyType: z.enum(['json', 'raw', 'none']).optional(),
        projectPath: z.string().optional(),
        environmentId: z.string().optional(),
        timeout: z.number().int().positive().optional(),
        followRedirects: z.boolean().optional(),
        maxRedirects: z.number().int().nonnegative().optional(),
        validateSSL: z.boolean().optional()
      }
    },
    async (args) => {
      if (args.projectPath) await assertPathInWorkspace(args.projectPath)
      const outcome = await executeAdHocRequest({
        method: args.method,
        url: args.url,
        headers: args.headers,
        body: args.body ?? null,
        bodyType: args.bodyType,
        projectPath: args.projectPath,
        environmentId: args.environmentId,
        timeout: args.timeout,
        followRedirects: args.followRedirects,
        maxRedirects: args.maxRedirects,
        validateSSL: args.validateSSL
      })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: outcome.result.status,
                statusText: outcome.result.statusText,
                time: outcome.result.time,
                size: outcome.result.size,
                error: outcome.result.error,
                url: outcome.resolvedUrl,
                method: outcome.resolvedMethod,
                headers: outcome.result.headers,
                body: outcome.result.body
              },
              null,
              2
            )
          }
        ]
      }
    }
  )
}

// ── HTTP server plumbing ────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf-8')
      if (!text) return resolve(undefined)
      try {
        resolve(JSON.parse(text))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers['authorization']
  if (!header || Array.isArray(header)) return false
  // Accept either "Bearer TOKEN" or "TOKEN"
  const parts = header.split(/\s+/)
  const provided = parts.length === 2 ? parts[1] : parts[0]
  return provided === token
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  disabledTools: Set<string>
): Promise<void> {
  if (!isAuthorized(req, token)) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // Canonical stateless pattern: fresh McpServer + transport per request.
  // An McpServer can only hold one transport at a time, so a shared singleton
  // fails on the second concurrent/follow-up request with "Already connected
  // to a transport".
  const server = new McpServer({ name: 'kleanrest', version: '1.0.0' })
  registerTools(server, disabledTools)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  const cleanup = (): void => {
    void transport.close().catch(() => {})
    void server.close().catch(() => {})
  }
  res.on('close', cleanup)

  try {
    await server.connect(transport)
    const body = req.method === 'POST' ? await readBody(req) : undefined
    await transport.handleRequest(req, res, body)
  } catch (err) {
    cleanup()
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: String(err) }))
    }
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  if (httpServer) return
  currentConfig = await ensurePortAndToken(currentConfig)
  if (!currentConfig.port || !currentConfig.token) {
    throw new Error('MCP config missing port or token after ensure step')
  }

  const port = currentConfig.port
  const token = currentConfig.token
  // Snapshot so in-flight requests keep using the set active at listen time.
  // Toggling tools triggers a full stop → start via setMcpDisabledTools.
  const disabledTools = new Set(currentConfig.disabledTools)

  httpServer = createHttpServer((req, res) => {
    if (req.url && req.url.startsWith('/mcp')) {
      handleMcpRequest(req, res, token, disabledTools).catch((err) => {
        if (!res.headersSent) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
      return
    }
    res.statusCode = 404
    res.end('Not found')
  })

  await new Promise<void>((resolve, reject) => {
    httpServer!.once('error', reject)
    httpServer!.listen(port, '127.0.0.1', () => {
      httpServer!.off('error', reject)
      lastError = null
      resolve()
    })
  })
}

async function stopServer(): Promise<void> {
  if (!httpServer) return
  await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
  httpServer = null
}

export async function initMcp(): Promise<void> {
  currentConfig = await loadMcpConfig()
  if (currentConfig.enabled) {
    try {
      await startServer()
    } catch (err) {
      lastError = (err as Error)?.message || String(err)
    }
  }
  broadcastStatus()
}

export async function setMcpEnabled(enabled: boolean): Promise<McpStatus> {
  currentConfig = { ...currentConfig, enabled }
  if (enabled) {
    try {
      await startServer()
      lastError = null
    } catch (err) {
      lastError = (err as Error)?.message || String(err)
    }
  } else {
    await stopServer()
    lastError = null
  }
  await saveMcpConfig(currentConfig)
  broadcastStatus()
  return currentStatus()
}

export async function rotateMcpToken(): Promise<McpStatus> {
  currentConfig = { ...currentConfig, token: generateToken() }
  await saveMcpConfig(currentConfig)
  if (currentConfig.enabled) {
    // Restart so the new token takes effect
    await stopServer()
    try {
      await startServer()
    } catch (err) {
      lastError = (err as Error)?.message || String(err)
    }
  }
  broadcastStatus()
  return currentStatus()
}

export async function setMcpDisabledTools(disabledTools: string[]): Promise<McpStatus> {
  // De-dup + sort so comparisons are stable
  const unique = Array.from(new Set(disabledTools)).sort()
  currentConfig = { ...currentConfig, disabledTools: unique }
  await saveMcpConfig(currentConfig)

  // If the server is running, restart so the new tool set takes effect. The
  // MCP SDK doesn't support unregistering tools at runtime, so a full restart
  // is the cleanest path.
  if (currentConfig.enabled) {
    await stopServer()
    try {
      await startServer()
      lastError = null
    } catch (err) {
      lastError = (err as Error)?.message || String(err)
    }
  }
  broadcastStatus()
  return currentStatus()
}

export function getMcpStatus(): McpStatus {
  return currentStatus()
}

export async function shutdownMcp(): Promise<void> {
  await stopServer()
}
