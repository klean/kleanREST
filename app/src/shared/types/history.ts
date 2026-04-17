import type { ErrorInsight } from './error-insight'

export interface HistoryEntry {
  id: string
  requestId: string
  requestName: string
  timestamp: string
  request: HistoryRequest
  response: HistoryResponse | null
  errorInsights: ErrorInsight[]
}

export interface HistoryRequest {
  method: string
  url: string
  headers: { key: string; value: string }[]
  body: string | null
}

export interface HistoryResponse {
  status: number
  statusText: string
  headers: { key: string; value: string }[]
  body: string
  size: number
  time: number
}
