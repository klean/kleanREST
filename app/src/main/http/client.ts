import * as http from 'node:http'
import * as https from 'node:https'
import { URL } from 'node:url'
import type { RequestResult } from '../../shared/types/ipc'
import { analyzeResponse, analyzeError } from './error-analyzer'

interface ExecuteRequestParams {
  method: string
  url: string
  headers: { key: string; value: string }[]
  body: string | null
  bodyType: string
  formData?: { key: string; value: string; type: string }[]
  timeout: number
  followRedirects: boolean
  maxRedirects: number
  validateSSL: boolean
}

function buildMultipartBody(
  formData: { key: string; value: string; type: string }[]
): { body: Buffer; boundary: string } {
  const boundary = `----kleanrest_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const parts: Buffer[] = []

  for (const entry of formData) {
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${entry.key}"` +
      (entry.type === 'file' ? `; filename="${entry.value}"` : '') +
      '\r\n\r\n'
    parts.push(Buffer.from(header, 'utf-8'))
    parts.push(Buffer.from(entry.value, 'utf-8'))
    parts.push(Buffer.from('\r\n', 'utf-8'))
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'))

  return { body: Buffer.concat(parts), boundary }
}

// Cap the in-memory response body so a hostile or runaway endpoint can't OOM
// the main process. 100 MB is well above any realistic API response.
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024

function makeRequest(
  parsedUrl: URL,
  options: https.RequestOptions,
  requestBody: Buffer | string | null,
  timeoutMs: number
): Promise<{ status: number; statusText: string; headers: http.IncomingHttpHeaders; body: string; size: number }> {
  return new Promise((resolve, reject) => {
    const transport = parsedUrl.protocol === 'https:' ? https : http
    const startTime = Date.now()

    const req = transport.request(parsedUrl, options, (res) => {
      const chunks: Buffer[] = []
      let received = 0
      let aborted = false

      res.on('data', (chunk: Buffer) => {
        if (aborted) return
        received += chunk.length
        if (received > MAX_RESPONSE_BYTES) {
          aborted = true
          req.destroy(
            Object.assign(
              new Error(
                `Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`
              ),
              { code: 'ERESPONSETOOLARGE' }
            )
          )
          return
        }
        chunks.push(chunk)
      })

      res.on('end', () => {
        if (aborted) return
        const buffer = Buffer.concat(chunks)
        const body = buffer.toString('utf-8')
        const elapsed = Date.now() - startTime

        resolve({
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: res.headers,
          body,
          size: buffer.length
        })
      })

      res.on('error', reject)
    })

    req.on('error', reject)

    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }))
    }, timeoutMs)

    req.on('close', () => clearTimeout(timer))

    if (requestBody !== null) {
      req.write(requestBody)
    }

    req.end()
  })
}

// Hard upper bounds — keep renderer-supplied values from being pathological.
const MAX_REDIRECTS_LIMIT = 20
const MAX_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_TIMEOUT_MS = 30 * 1000

// Headers that carry credentials. They must NOT be replayed when a redirect
// crosses to a different origin (or downgrades https→http), or the user's
// secrets leak to whatever host the Location header points at. Matches the
// browser/curl behaviour of dropping auth on cross-origin redirects.
const CREDENTIAL_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'www-authenticate'
])

/** Two URLs share an origin when scheme, host, and port all match. */
function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.host === b.host
}

function stripCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (CREDENTIAL_HEADER_NAMES.has(key.toLowerCase())) continue
    next[key] = value
  }
  return next
}

function clampPositive(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.max(value, min), max)
}

export async function executeRequest(params: ExecuteRequestParams): Promise<RequestResult> {
  const startTime = Date.now()
  let redirectCount = 0

  const timeoutMs = clampPositive(params.timeout, 1, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  const maxRedirects = Math.min(
    Math.max(params.maxRedirects | 0, 0),
    MAX_REDIRECTS_LIMIT
  )

  try {
    let currentUrl = params.url

    // Prepare the request body
    let requestBody: Buffer | string | null = null
    const headers: Record<string, string> = {}

    for (const h of params.headers) {
      headers[h.key] = h.value
    }

    if (params.bodyType === 'formdata' && params.formData && params.formData.length > 0) {
      const { body: multipartBody, boundary } = buildMultipartBody(params.formData)
      requestBody = multipartBody
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`
    } else if (params.body !== null && params.body !== '') {
      requestBody = params.body
      // Set Content-Type for JSON if not already set
      if (
        params.bodyType === 'json' &&
        !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      ) {
        headers['Content-Type'] = 'application/json'
      }
    }

    // Method and headers can both change across a redirect chain (303 → GET,
    // credential stripping on cross-origin hops), so track them mutably.
    let currentMethod = params.method
    let currentHeaders = headers

    while (true) {
      const parsedUrl = new URL(currentUrl)

      const options: https.RequestOptions = {
        method: currentMethod,
        headers: currentHeaders,
        rejectUnauthorized: params.validateSSL
      }

      const result = await makeRequest(parsedUrl, options, requestBody, timeoutMs)
      const totalTime = Date.now() - startTime

      // Handle redirects
      if (
        params.followRedirects &&
        result.status >= 300 &&
        result.status < 400 &&
        result.headers.location
      ) {
        redirectCount++
        if (redirectCount > maxRedirects) {
          const responseHeaders = flattenHeaders(result.headers)
          const insights = analyzeResponse({
            status: result.status,
            statusText: result.statusText,
            headers: responseHeaders,
            body: result.body,
            requestMethod: params.method,
            requestUrl: params.url,
            requestHeaders: params.headers,
            requestBody: params.body,
            redirectCount,
            maxRedirects
          })

          return {
            status: result.status,
            statusText: result.statusText,
            headers: responseHeaders,
            body: result.body,
            size: result.size,
            time: totalTime,
            error: `Too many redirects (${redirectCount})`,
            errorInsights: insights
          }
        }

        // Resolve relative redirects against current URL
        const location = result.headers.location
        const previousUrl = parsedUrl
        let nextUrl: URL
        try {
          nextUrl = new URL(location, currentUrl)
          currentUrl = nextUrl.toString()
        } catch {
          currentUrl = location
          // Can't parse the target — treat as cross-origin and strip credentials
          // to be safe rather than replay them blindly.
          currentHeaders = stripCredentialHeaders(currentHeaders)
          continue
        }

        // Drop credential-bearing headers when the redirect leaves the origin.
        if (!sameOrigin(previousUrl, nextUrl)) {
          currentHeaders = stripCredentialHeaders(currentHeaders)
        }

        // 303 See Other turns the follow-up into a GET with no body.
        if (result.status === 303) {
          currentMethod = 'GET'
          requestBody = null
        }

        continue
      }

      // Build final response
      const responseHeaders = flattenHeaders(result.headers)

      const insights = analyzeResponse({
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
        body: result.body,
        requestMethod: params.method,
        requestUrl: params.url,
        requestHeaders: params.headers,
        requestBody: params.body,
        redirectCount,
        maxRedirects
      })

      return {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
        body: result.body,
        size: result.size,
        time: totalTime,
        errorInsights: insights
      }
    }
  } catch (err) {
    const totalTime = Date.now() - startTime
    const error = err instanceof Error ? err : new Error(String(err))

    const errorInsights = analyzeError(
      {
        method: params.method,
        url: params.url,
        headers: params.headers
      },
      error
    )

    return {
      status: 0,
      statusText: '',
      headers: [],
      body: '',
      size: 0,
      time: totalTime,
      error: error.message,
      errorInsights
    }
  }
}

function flattenHeaders(
  raw: http.IncomingHttpHeaders
): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        result.push({ key, value: v })
      }
    } else {
      result.push({ key, value })
    }
  }

  return result
}
