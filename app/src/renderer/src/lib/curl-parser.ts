import type { RequestDefinition, HttpMethod, KeyValuePair, RequestAuth, RequestBody, FormDataEntry } from '@shared/types/project'

interface ParsedCurl {
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: RequestBody
  auth: RequestAuth
  validateSSL: boolean
}

// Shell-style tokenizer that respects quotes
function tokenize(input: string): string[] {
  // First, collapse line continuations (backslash + newline)
  const collapsed = input.replace(/\\\r?\n\s*/g, ' ').trim()

  const tokens: string[] = []
  let i = 0
  const len = collapsed.length

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(collapsed[i])) i++
    if (i >= len) break

    let token = ''
    const ch = collapsed[i]

    if (ch === "'" ) {
      // Single-quoted string: everything until closing '
      i++ // skip opening quote
      while (i < len && collapsed[i] !== "'") {
        token += collapsed[i]
        i++
      }
      i++ // skip closing quote
    } else if (ch === '"') {
      // Double-quoted string: everything until closing ", with backslash escapes
      i++
      while (i < len && collapsed[i] !== '"') {
        if (collapsed[i] === '\\' && i + 1 < len) {
          const next = collapsed[i + 1]
          if (next === '"' || next === '\\' || next === 'n' || next === 't') {
            token += next === 'n' ? '\n' : next === 't' ? '\t' : next
            i += 2
            continue
          }
        }
        token += collapsed[i]
        i++
      }
      i++ // skip closing quote
    } else if (ch === '$' && i + 1 < len && collapsed[i + 1] === "'") {
      // $'...' ANSI-C quoting
      i += 2
      while (i < len && collapsed[i] !== "'") {
        if (collapsed[i] === '\\' && i + 1 < len) {
          const next = collapsed[i + 1]
          if (next === 'n') { token += '\n'; i += 2; continue }
          if (next === 't') { token += '\t'; i += 2; continue }
          if (next === 'r') { token += '\r'; i += 2; continue }
          if (next === '\\') { token += '\\'; i += 2; continue }
          if (next === "'") { token += "'"; i += 2; continue }
          if (next === 'x' && i + 3 < len) {
            token += String.fromCharCode(parseInt(collapsed.substring(i + 2, i + 4), 16))
            i += 4
            continue
          }
        }
        token += collapsed[i]
        i++
      }
      i++ // skip closing '
    } else {
      // Unquoted token
      while (i < len && !/\s/.test(collapsed[i])) {
        token += collapsed[i]
        i++
      }
    }

    if (token.length > 0) {
      tokens.push(token)
    }
  }

  return tokens
}

function parseHeader(headerStr: string): { key: string; value: string } | null {
  const colonIndex = headerStr.indexOf(':')
  if (colonIndex === -1) return null
  return {
    key: headerStr.substring(0, colonIndex).trim(),
    value: headerStr.substring(colonIndex + 1).trim()
  }
}

function detectBodyMode(body: string, headers: KeyValuePair[]): { mode: 'json' | 'formdata' | 'raw'; formData: FormDataEntry[] } {
  const contentType = headers.find(h => h.key.toLowerCase() === 'content-type')?.value?.toLowerCase() || ''

  // Check if JSON
  if (contentType.includes('application/json') || (body.trimStart().startsWith('{') || body.trimStart().startsWith('['))) {
    try {
      JSON.parse(body)
      return { mode: 'json', formData: [] }
    } catch { /* not valid json */ }
  }

  // Check if form-urlencoded
  if (contentType.includes('application/x-www-form-urlencoded') ||
      (!contentType && body.includes('=') && !body.includes('{') && !body.includes('<'))) {
    // Try to parse as form data
    const pairs = body.split('&')
    if (pairs.every(p => p.includes('='))) {
      const formData: FormDataEntry[] = pairs.map(p => {
        const [key, ...rest] = p.split('=')
        return {
          key: decodeURIComponent(key),
          value: decodeURIComponent(rest.join('=')),
          type: 'text' as const,
          enabled: true
        }
      })
      return { mode: 'formdata', formData }
    }
  }

  return { mode: 'raw', formData: [] }
}

export function parseCurl(command: string): ParsedCurl {
  const tokens = tokenize(command)

  if (tokens.length === 0 || tokens[0] !== 'curl') {
    throw new Error('Command must start with "curl"')
  }

  let method: HttpMethod = 'GET'
  let url = ''
  const headers: KeyValuePair[] = []
  let bodyContent = ''
  let auth: RequestAuth = { type: 'none' }
  let validateSSL = true
  let hasBody = false
  let methodExplicit = false

  let i = 1 // skip 'curl'
  while (i < tokens.length) {
    const token = tokens[i]

    if (token === '-X' || token === '--request') {
      i++
      if (i < tokens.length) {
        const m = tokens[i].toUpperCase()
        const valid: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
        method = valid.includes(m as HttpMethod) ? m as HttpMethod : 'GET'
        methodExplicit = true
      }
    } else if (token === '-H' || token === '--header') {
      i++
      if (i < tokens.length) {
        const parsed = parseHeader(tokens[i])
        if (parsed) {
          headers.push({ key: parsed.key, value: parsed.value, enabled: true })
        }
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
      i++
      if (i < tokens.length) {
        bodyContent = tokens[i]
        hasBody = true
      }
    } else if (token === '-u' || token === '--user') {
      i++
      if (i < tokens.length) {
        const [username, ...passParts] = tokens[i].split(':')
        auth = { type: 'basic', username, password: passParts.join(':') }
      }
    } else if (token === '-k' || token === '--insecure') {
      validateSSL = false
    } else if (token === '-L' || token === '--location') {
      // Follow redirects (already default behavior)
    } else if (token === '--compressed' || token === '-s' || token === '--silent' || token === '-S' || token === '--show-error') {
      // Ignore these flags
    } else if (token === '-o' || token === '--output' || token === '--max-redirs' || token === '-w' || token === '--write-out' || token === '--connect-timeout' || token === '-m' || token === '--max-time' || token === '--proxy') {
      // Skip flags that take an argument
      i++
    } else if (token === '--cookie' || token === '-b') {
      // Cookie header
      i++
      if (i < tokens.length) {
        headers.push({ key: 'Cookie', value: tokens[i], enabled: true })
      }
    } else if (token.startsWith('-')) {
      // Unknown flag - skip
    } else {
      // URL
      url = token
    }

    i++
  }

  // Default to POST if body present but no explicit method
  if (hasBody && !methodExplicit) {
    method = 'POST'
  }

  // Detect body mode
  const { mode: bodyMode, formData } = hasBody ? detectBodyMode(bodyContent, headers) : { mode: 'none' as const, formData: [] as FormDataEntry[] }

  const body: RequestBody = {
    mode: bodyMode,
    json: bodyMode === 'json' ? bodyContent : '{\n  \n}',
    formData: formData,
    raw: bodyMode === 'raw' ? bodyContent : '',
    rawLanguage: 'text',
    binary: null
  }

  return {
    method,
    url,
    headers,
    body,
    auth,
    validateSSL
  }
}
