import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { executeRequest } from '../http/client'
import { loadRequest, listEnvironments } from '../project/loader'
import { saveHistory } from '../history/manager'
import type { RequestResult } from '../../shared/types/ipc'
import type {
  RequestDefinition,
  KeyValuePair,
  FormDataEntry,
  RequestAuth
} from '../../shared/types/project'
import type { Environment, EnvironmentVariable } from '../../shared/types/environment'

// ── Variable / auth resolution helpers ──────────────────────────────────────

function resolveVariables(text: string, variables: EnvironmentVariable[]): string {
  let result = text
  for (const v of variables) {
    if (v.enabled && v.key) {
      result = result.replace(new RegExp(`\\{\\{${v.key}\\}\\}`, 'g'), v.value)
    }
  }
  return result
}

function resolvePairs(
  pairs: KeyValuePair[],
  vars: EnvironmentVariable[]
): { key: string; value: string }[] {
  return pairs
    .filter((p) => p.enabled && p.key)
    .map((p) => ({ key: p.key, value: resolveVariables(p.value, vars) }))
}

function resolveFormData(
  entries: FormDataEntry[],
  vars: EnvironmentVariable[]
): { key: string; value: string; type: string }[] {
  return entries
    .filter((e) => e.enabled && e.key)
    .map((e) => ({ key: e.key, value: resolveVariables(e.value, vars), type: e.type }))
}

function buildUrlWithQuery(
  baseUrl: string,
  queryParams: { key: string; value: string }[]
): string {
  if (queryParams.length === 0) return baseUrl
  const qs = queryParams
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&')
  return baseUrl.includes('?') ? `${baseUrl}&${qs}` : `${baseUrl}?${qs}`
}

function applyAuth(
  headers: { key: string; value: string }[],
  auth: RequestAuth,
  vars: EnvironmentVariable[]
): { headers: { key: string; value: string }[] } {
  if (auth.type === 'bearer' && auth.token) {
    return {
      headers: [
        ...headers,
        { key: 'Authorization', value: `Bearer ${resolveVariables(auth.token, vars)}` }
      ]
    }
  }
  if (auth.type === 'basic' && auth.username) {
    const user = resolveVariables(auth.username, vars)
    const pass = resolveVariables(auth.password || '', vars)
    const encoded = Buffer.from(`${user}:${pass}`).toString('base64')
    return {
      headers: [...headers, { key: 'Authorization', value: `Basic ${encoded}` }]
    }
  }
  if (auth.type === 'apikey' && auth.key && auth.addTo === 'header') {
    return {
      headers: [
        ...headers,
        {
          key: resolveVariables(auth.key, vars),
          value: resolveVariables(auth.value, vars)
        }
      ]
    }
  }
  return { headers }
}

async function pickEnvironmentVars(
  projectPath: string | null,
  environmentId?: string
): Promise<{ env: Environment | null; vars: EnvironmentVariable[] }> {
  if (!environmentId || !projectPath) return { env: null, vars: [] }
  const envs = await listEnvironments(projectPath)
  const env = envs.find((e) => e.id === environmentId) || null
  return { env, vars: env?.variables ?? [] }
}

// ── Shared execute → save history → notify flow ────────────────────────────

interface ExecuteAndPersistArgs {
  projectPath: string | null
  requestId: string
  requestName: string
  requestPath: string | null
  method: string
  resolvedUrl: string
  resolvedHeaders: { key: string; value: string }[]
  body: string | null
  bodyType: string
  formData?: { key: string; value: string; type: string }[]
  settings: {
    timeout: number
    followRedirects: boolean
    maxRedirects: number
    validateSSL: boolean
  }
  environmentId: string | null
}

async function executeAndPersist(args: ExecuteAndPersistArgs): Promise<RequestResult> {
  const result = await executeRequest({
    method: args.method,
    url: args.resolvedUrl,
    headers: args.resolvedHeaders,
    body: args.body,
    bodyType: args.bodyType,
    formData: args.formData,
    timeout: args.settings.timeout,
    followRedirects: args.settings.followRedirects,
    maxRedirects: args.settings.maxRedirects,
    validateSSL: args.settings.validateSSL
  })

  if (args.projectPath) {
    try {
      await saveHistory(args.projectPath, {
        id: randomUUID(),
        requestId: args.requestId,
        requestName: args.requestName,
        timestamp: new Date().toISOString(),
        request: {
          method: args.method,
          url: args.resolvedUrl,
          headers: args.resolvedHeaders,
          body: args.body
        },
        response: result.error
          ? null
          : {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
              body: result.body,
              size: result.size,
              time: result.time
            },
        errorInsights: result.errorInsights
      })
    } catch {
      // Non-fatal
    }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('mcp:request-executed', {
        projectPath: args.projectPath,
        requestPath: args.requestPath,
        requestId: args.requestId,
        environmentId: args.environmentId,
        result
      })
    }
  }

  return result
}

// ── Entry point: saved request ─────────────────────────────────────────────

export interface ExecutedRequestOutcome {
  request: RequestDefinition
  resolvedUrl: string
  resolvedMethod: string
  result: RequestResult
}

export async function executeRequestFromDisk(
  projectPath: string,
  requestPath: string,
  environmentId?: string
): Promise<ExecutedRequestOutcome> {
  const request = await loadRequest(requestPath)
  const { env, vars } = await pickEnvironmentVars(projectPath, environmentId)

  const resolvedQuery = resolvePairs(request.queryParams, vars)
  const resolvedHeaders = resolvePairs(request.headers, vars)
  const { headers: authHeaders } = applyAuth(resolvedHeaders, request.auth, vars)

  const resolvedUrl = buildUrlWithQuery(
    resolveVariables(request.url, vars),
    resolvedQuery
  )

  let body: string | null = null
  let bodyType = 'none'
  let formData: { key: string; value: string; type: string }[] | undefined

  if (request.body.mode === 'json') {
    body = resolveVariables(request.body.json, vars)
    bodyType = 'json'
  } else if (request.body.mode === 'raw') {
    body = resolveVariables(request.body.raw, vars)
    bodyType = 'raw'
  } else if (request.body.mode === 'formdata') {
    formData = resolveFormData(request.body.formData, vars)
    bodyType = 'formdata'
  }

  const result = await executeAndPersist({
    projectPath,
    requestId: request.id,
    requestName: request.name,
    requestPath,
    method: request.method,
    resolvedUrl,
    resolvedHeaders: authHeaders,
    body,
    bodyType,
    formData,
    settings: {
      timeout: request.settings.timeout ?? 30000,
      followRedirects: request.settings.followRedirects ?? true,
      maxRedirects: request.settings.maxRedirects ?? 10,
      validateSSL: request.settings.validateSSL ?? true
    },
    environmentId: env?.id ?? null
  })

  return {
    request,
    resolvedUrl,
    resolvedMethod: request.method,
    result
  }
}

// ── Entry point: ad-hoc request (no saved file) ────────────────────────────

export interface AdHocRequestInput {
  method: string
  url: string
  headers?: { key: string; value: string }[]
  body?: string | null
  bodyType?: 'json' | 'raw' | 'none'
  /** If both projectPath + environmentId are set, `{{vars}}` are resolved. */
  projectPath?: string | null
  environmentId?: string | null
  /** Optional settings override. Defaults are reasonable. */
  timeout?: number
  followRedirects?: boolean
  maxRedirects?: number
  validateSSL?: boolean
}

export interface AdHocRequestOutcome {
  resolvedUrl: string
  resolvedMethod: string
  result: RequestResult
}

export async function executeAdHocRequest(
  input: AdHocRequestInput
): Promise<AdHocRequestOutcome> {
  const projectPath = input.projectPath ?? null
  const { env, vars } = await pickEnvironmentVars(projectPath, input.environmentId ?? undefined)

  const incomingHeaders = (input.headers ?? []).map((h) => ({
    key: h.key,
    value: resolveVariables(h.value, vars)
  }))
  const resolvedUrl = resolveVariables(input.url, vars)
  const resolvedBody =
    input.body != null ? resolveVariables(input.body, vars) : null

  const result = await executeAndPersist({
    projectPath,
    requestId: randomUUID(), // ad-hoc calls get a unique synthetic requestId
    requestName: `Ad-hoc: ${input.method} ${resolvedUrl}`,
    requestPath: null,
    method: input.method,
    resolvedUrl,
    resolvedHeaders: incomingHeaders,
    body: resolvedBody,
    bodyType: input.bodyType ?? (resolvedBody ? 'raw' : 'none'),
    settings: {
      timeout: input.timeout ?? 30000,
      followRedirects: input.followRedirects ?? true,
      maxRedirects: input.maxRedirects ?? 10,
      validateSSL: input.validateSSL ?? true
    },
    environmentId: env?.id ?? null
  })

  return {
    resolvedUrl,
    resolvedMethod: input.method,
    result
  }
}

/** Utility exported for other tools that need to resolve paths safely. */
export function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath)
}
