export interface ErrorInsight {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: ErrorCategory
  title: string
  description: string
  suggestion: string
}

export type ErrorCategory =
  | 'ssl'
  | 'dns'
  | 'timeout'
  | 'connection'
  | 'cors'
  | 'auth'
  | 'rate-limit'
  | 'redirect'
  | 'body-parse'
  | 'encoding'
  | 'server-error'
  | 'client-error'
  | 'content-type'
