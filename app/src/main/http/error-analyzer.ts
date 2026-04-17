import type { ErrorInsight, ErrorCategory } from '../../shared/types/error-insight'

interface ResponseContext {
  status: number
  statusText: string
  headers: { key: string; value: string }[]
  body: string
  requestMethod: string
  requestUrl: string
  requestHeaders: { key: string; value: string }[]
  requestBody: string | null
  redirectCount: number
  maxRedirects: number
}

let insightCounter = 0

function createInsight(
  severity: ErrorInsight['severity'],
  category: ErrorCategory,
  title: string,
  description: string,
  suggestion: string
): ErrorInsight {
  return {
    id: `insight_${Date.now()}_${++insightCounter}`,
    severity,
    category,
    title,
    description,
    suggestion
  }
}

function getHeader(
  headers: { key: string; value: string }[],
  name: string
): string | undefined {
  const entry = headers.find((h) => h.key.toLowerCase() === name.toLowerCase())
  return entry?.value
}

function detectAuthIssues(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  if (ctx.status === 401) {
    const hasAuth = ctx.requestHeaders.some(
      (h) => h.key.toLowerCase() === 'authorization'
    )
    if (hasAuth) {
      insights.push(
        createInsight(
          'error',
          'auth',
          'Authentication Failed',
          'The server rejected your credentials. The Authorization header was sent but the server returned 401 Unauthorized.',
          'Verify your credentials are correct and not expired. Check that the authentication scheme (Bearer, Basic, etc.) matches what the server expects.'
        )
      )
    } else {
      insights.push(
        createInsight(
          'error',
          'auth',
          'Missing Authentication',
          'The server requires authentication but no Authorization header was included in the request.',
          'Add an Authorization header with valid credentials. Use the Auth tab to configure Bearer token or Basic authentication.'
        )
      )
    }
  }

  if (ctx.status === 403) {
    insights.push(
      createInsight(
        'error',
        'auth',
        'Permission Denied',
        'The server understood your request but refuses to authorize it. Your credentials may be valid but lack the required permissions.',
        'Verify your account has the necessary permissions for this endpoint. Contact the API administrator if you believe this is an error.'
      )
    )
  }

  return insights
}

function detectRateLimiting(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  if (ctx.status === 429) {
    const retryAfter = getHeader(ctx.headers, 'retry-after')
    const rateLimit = getHeader(ctx.headers, 'x-ratelimit-limit')
    const remaining = getHeader(ctx.headers, 'x-ratelimit-remaining')
    const resetTime = getHeader(ctx.headers, 'x-ratelimit-reset')

    let description = 'You have exceeded the API rate limit.'
    if (rateLimit) description += ` Limit: ${rateLimit} requests.`
    if (remaining) description += ` Remaining: ${remaining}.`
    if (resetTime) description += ` Resets at: ${resetTime}.`

    let suggestion = 'Reduce your request frequency.'
    if (retryAfter) {
      suggestion += ` The server suggests waiting ${retryAfter} seconds before retrying.`
    }

    insights.push(
      createInsight('error', 'rate-limit', 'Rate Limit Exceeded', description, suggestion)
    )
  }

  return insights
}

function detectCorsIssues(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  try {
    const requestUrl = new URL(ctx.requestUrl)
    const origin = requestUrl.origin
    const allowOrigin = getHeader(ctx.headers, 'access-control-allow-origin')

    if (!allowOrigin && origin && origin !== 'null') {
      insights.push(
        createInsight(
          'warning',
          'cors',
          'Missing CORS Headers',
          'The response does not include Access-Control-Allow-Origin headers. If this request is made from a browser, it may be blocked by CORS policy.',
          'This is expected when calling APIs from Electron\'s main process. If you encounter issues, ask the API provider to add appropriate CORS headers.'
        )
      )
    }
  } catch {
    // Invalid URL, skip CORS check
  }

  return insights
}

function detectRedirectIssues(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  if (ctx.redirectCount >= ctx.maxRedirects) {
    insights.push(
      createInsight(
        'error',
        'redirect',
        'Too Many Redirects',
        `The request was redirected ${ctx.redirectCount} times, reaching the maximum limit of ${ctx.maxRedirects}.`,
        'This may indicate a redirect loop. Check the URL for typos or increase the maximum redirect limit in request settings.'
      )
    )
  }

  return insights
}

function detectBodyParseIssues(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []
  const contentType = getHeader(ctx.headers, 'content-type') || ''

  if (contentType.includes('application/json') && ctx.body.length > 0) {
    const trimmed = ctx.body.trimStart()
    if (trimmed.startsWith('<')) {
      insights.push(
        createInsight(
          'warning',
          'body-parse',
          'Response Claims JSON but Contains HTML',
          'The Content-Type header indicates JSON, but the response body starts with "<", suggesting it is HTML. This often happens when a server returns an error page or login form.',
          'Check the URL is correct. The server may be returning an error page, a proxy login page, or a redirect to a web interface.'
        )
      )
    } else {
      try {
        JSON.parse(ctx.body)
      } catch {
        insights.push(
          createInsight(
            'warning',
            'body-parse',
            'Invalid JSON Response',
            'The Content-Type header indicates JSON, but the response body is not valid JSON.',
            'The server may be returning malformed data. Check if the endpoint is correct and the server is functioning properly.'
          )
        )
      }
    }
  }

  return insights
}

function detectServerErrors(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  if (ctx.status === 500) {
    insights.push(
      createInsight(
        'error',
        'server-error',
        'Internal Server Error',
        'The server encountered an unexpected condition that prevented it from fulfilling the request.',
        'This is a server-side issue. Check the response body for error details. If you control the server, check the server logs for stack traces.'
      )
    )
  } else if (ctx.status === 502) {
    insights.push(
      createInsight(
        'error',
        'server-error',
        'Bad Gateway',
        'The server acting as a gateway received an invalid response from the upstream server.',
        'This is typically a temporary issue with load balancers or reverse proxies. Wait a moment and retry. If persistent, the upstream service may be down.'
      )
    )
  } else if (ctx.status === 503) {
    insights.push(
      createInsight(
        'error',
        'server-error',
        'Service Unavailable',
        'The server is currently unable to handle the request, usually due to maintenance or overloading.',
        'The service may be temporarily down for maintenance or overloaded. Check the Retry-After header and try again later.'
      )
    )
  } else if (ctx.status === 504) {
    insights.push(
      createInsight(
        'error',
        'server-error',
        'Gateway Timeout',
        'The server acting as a gateway did not receive a timely response from the upstream server.',
        'The upstream server may be slow or unresponsive. Try increasing your timeout or contacting the API provider.'
      )
    )
  }

  return insights
}

function detectClientErrors(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  if (ctx.status === 400) {
    insights.push(
      createInsight(
        'error',
        'client-error',
        'Bad Request',
        'The server could not understand the request due to invalid syntax or missing required parameters.',
        'Check the request body, query parameters, and headers match the API specification. The response body may contain details about what is invalid.'
      )
    )
  } else if (ctx.status === 404) {
    insights.push(
      createInsight(
        'error',
        'client-error',
        'Not Found',
        'The requested resource could not be found on the server.',
        'Verify the URL path is correct. Check for typos, ensure the resource exists, and confirm you are using the right API version.'
      )
    )
  } else if (ctx.status === 405) {
    insights.push(
      createInsight(
        'error',
        'client-error',
        'Method Not Allowed',
        `The HTTP method "${ctx.requestMethod}" is not allowed for this endpoint.`,
        'Check the API documentation for the correct HTTP method. The Allow header in the response may list accepted methods.'
      )
    )
  } else if (ctx.status === 409) {
    insights.push(
      createInsight(
        'error',
        'client-error',
        'Conflict',
        'The request conflicts with the current state of the resource on the server.',
        'This often occurs with concurrent modifications. Check the current state of the resource and retry with updated data.'
      )
    )
  } else if (ctx.status === 422) {
    insights.push(
      createInsight(
        'error',
        'client-error',
        'Unprocessable Entity',
        'The server understands the request but cannot process the contained instructions. The request body is likely syntactically correct but semantically invalid.',
        'Check the response body for validation error details. Ensure all required fields are present and values conform to the expected schema.'
      )
    )
  }

  return insights
}

function detectMissingContentType(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []
  const methodsWithBody = ['POST', 'PUT', 'PATCH']

  if (methodsWithBody.includes(ctx.requestMethod.toUpperCase()) && ctx.requestBody) {
    const hasContentType = ctx.requestHeaders.some(
      (h) => h.key.toLowerCase() === 'content-type'
    )
    if (!hasContentType) {
      insights.push(
        createInsight(
          'warning',
          'content-type',
          'Missing Content-Type Header',
          `The ${ctx.requestMethod} request includes a body but no Content-Type header. The server may not parse the body correctly.`,
          'Add a Content-Type header (e.g., "application/json" for JSON bodies, "application/x-www-form-urlencoded" for form data).'
        )
      )
    }
  }

  return insights
}

export function analyzeResponse(ctx: ResponseContext): ErrorInsight[] {
  const insights: ErrorInsight[] = []

  insights.push(...detectAuthIssues(ctx))
  insights.push(...detectRateLimiting(ctx))
  insights.push(...detectCorsIssues(ctx))
  insights.push(...detectRedirectIssues(ctx))
  insights.push(...detectBodyParseIssues(ctx))
  insights.push(...detectServerErrors(ctx))
  insights.push(...detectClientErrors(ctx))
  insights.push(...detectMissingContentType(ctx))

  return insights
}

interface ErrorAnalysisRequest {
  method: string
  url: string
  headers: { key: string; value: string }[]
}

export function analyzeError(request: ErrorAnalysisRequest, error: Error): ErrorInsight[] {
  const insights: ErrorInsight[] = []
  const code = (error as NodeJS.ErrnoException).code || ''
  const message = error.message || ''

  // SSL errors
  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    message.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
  ) {
    insights.push(
      createInsight(
        'error',
        'ssl',
        'SSL Certificate Verification Failed',
        'The SSL certificate could not be verified. The certificate chain may be incomplete or signed by an untrusted authority.',
        'If this is a development server, disable SSL validation in request settings. For production, ensure the server has a valid certificate chain installed.'
      )
    )
  } else if (code === 'CERT_HAS_EXPIRED' || message.includes('CERT_HAS_EXPIRED')) {
    insights.push(
      createInsight(
        'error',
        'ssl',
        'SSL Certificate Expired',
        'The server\'s SSL certificate has expired.',
        'Contact the server administrator to renew the SSL certificate. If this is a development server, you can disable SSL validation in request settings.'
      )
    )
  } else if (
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    message.includes('DEPTH_ZERO_SELF_SIGNED_CERT')
  ) {
    insights.push(
      createInsight(
        'error',
        'ssl',
        'Self-Signed Certificate',
        'The server is using a self-signed SSL certificate that is not trusted.',
        'Disable SSL validation in request settings to allow self-signed certificates. This is common in development environments.'
      )
    )
  } else if (
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    message.includes('ERR_TLS_CERT_ALTNAME_INVALID')
  ) {
    insights.push(
      createInsight(
        'error',
        'ssl',
        'SSL Certificate Hostname Mismatch',
        'The SSL certificate does not match the hostname you are connecting to.',
        'Verify you are using the correct hostname. The certificate may be issued for a different domain.'
      )
    )
  }

  // DNS errors
  if (code === 'ENOTFOUND' || message.includes('ENOTFOUND')) {
    insights.push(
      createInsight(
        'error',
        'dns',
        'DNS Resolution Failed',
        `Could not resolve the hostname. The domain may not exist or DNS servers are unreachable.`,
        'Check the URL for typos. Verify your internet connection and DNS settings. Try pinging the hostname from a terminal.'
      )
    )
  } else if (code === 'EAI_AGAIN' || message.includes('EAI_AGAIN')) {
    insights.push(
      createInsight(
        'error',
        'dns',
        'DNS Lookup Timeout',
        'The DNS lookup timed out. This is usually a temporary network issue.',
        'Check your internet connection. Try again in a few moments. If persistent, try changing your DNS server.'
      )
    )
  }

  // Timeout errors
  if (
    code === 'ABORT_ERR' ||
    code === 'ETIMEDOUT' ||
    code === 'ESOCKETTIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('ETIMEDOUT') ||
    message.includes('aborted') ||
    message.includes('timeout')
  ) {
    // Avoid duplicate if already matched by DNS or SSL
    const hasTimeout = insights.some((i) => i.category === 'timeout')
    if (!hasTimeout) {
      insights.push(
        createInsight(
          'error',
          'timeout',
          'Request Timed Out',
          'The request did not receive a response within the configured timeout period.',
          'Increase the timeout in request settings. The server may be slow or unresponsive. Check that the server is running and accessible.'
        )
      )
    }
  }

  // Connection errors
  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    insights.push(
      createInsight(
        'error',
        'connection',
        'Connection Refused',
        'The target server actively refused the connection. The server may not be running or may be listening on a different port.',
        'Verify the server is running and the port number is correct. Check firewalls and security groups that may be blocking the connection.'
      )
    )
  } else if (code === 'ECONNRESET' || message.includes('ECONNRESET')) {
    insights.push(
      createInsight(
        'error',
        'connection',
        'Connection Reset',
        'The connection was forcibly closed by the remote server.',
        'This can happen due to server restarts, load balancer timeouts, or network issues. Try again. If persistent, check server health.'
      )
    )
  } else if (code === 'EPIPE' || message.includes('EPIPE')) {
    insights.push(
      createInsight(
        'error',
        'connection',
        'Broken Pipe',
        'The connection was closed by the remote server before the request could be fully sent.',
        'The server may have closed the connection prematurely. Check if the request body is too large or if the server has a request size limit.'
      )
    )
  }

  return insights
}
