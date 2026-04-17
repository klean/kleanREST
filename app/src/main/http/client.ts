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

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      res.on('end', () => {
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

export async function executeRequest(params: ExecuteRequestParams): Promise<RequestResult> {
  const startTime = Date.now()
  let redirectCount = 0

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

    while (true) {
      const parsedUrl = new URL(currentUrl)

      const options: https.RequestOptions = {
        method: params.method,
        headers,
        rejectUnauthorized: params.validateSSL
      }

      const result = await makeRequest(parsedUrl, options, requestBody, params.timeout)
      const totalTime = Date.now() - startTime

      // Handle redirects
      if (
        params.followRedirects &&
        result.status >= 300 &&
        result.status < 400 &&
        result.headers.location
      ) {
        redirectCount++
        if (redirectCount > params.maxRedirects) {
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
            maxRedirects: params.maxRedirects
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
        try {
          currentUrl = new URL(location, currentUrl).toString()
        } catch {
          currentUrl = location
        }

        // On 303 or when method changes, convert to GET and drop body
        if (result.status === 303) {
          options.method = 'GET'
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
        maxRedirects: params.maxRedirects
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
