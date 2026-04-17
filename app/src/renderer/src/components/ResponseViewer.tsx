import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { useAppStore } from '@renderer/stores/app-store'
import type { ErrorInsight } from '@shared/types/error-insight'

function getStatusColor(status: number): string {
  if (status === 0) return 'bg-red-500/20 text-red-400'
  if (status < 300) return 'bg-green-500/20 text-green-400'
  if (status < 400) return 'bg-blue-500/20 text-blue-400'
  if (status < 500) return 'bg-amber-500/20 text-amber-400'
  return 'bg-red-500/20 text-red-400'
}

function getSeverityColor(severity: ErrorInsight['severity']): string {
  switch (severity) {
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'info':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function tryPrettyPrintJson(body: string): { formatted: string; isJson: boolean } {
  try {
    const parsed = JSON.parse(body)
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true }
  } catch {
    return { formatted: body, isJson: false }
  }
}

export default function ResponseViewer(): JSX.Element {
  const { response, isLoading } = useAppStore()
  const [elapsed, setElapsed] = useState(0)
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(
    new Set()
  )

  // Elapsed time counter during loading
  useEffect(() => {
    if (!isLoading) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 100)
    return () => clearInterval(interval)
  }, [isLoading])

  const dismissInsight = useCallback((id: string) => {
    setDismissedInsights((prev) => new Set(prev).add(id))
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-400" />
        <span className="text-xs text-zinc-500">
          Sending request... {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>
    )
  }

  // No response yet
  if (!response) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto mb-2 h-8 w-8 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <p className="text-xs text-zinc-600">Send a request to see the response</p>
        </div>
      </div>
    )
  }

  const statusColor = getStatusColor(response.status)
  const visibleInsights = response.errorInsights.filter(
    (i) => !dismissedInsights.has(i.id)
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-700 bg-zinc-800/30 px-3 py-1.5">
        {/* Status badge */}
        {response.error && response.status === 0 ? (
          <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-500/20 text-red-400">
            Error
          </span>
        ) : (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
            {response.status} {response.statusText}
          </span>
        )}

        {/* Response time */}
        <span className="text-[11px] text-zinc-500">
          {response.time}ms
        </span>

        {/* Response size */}
        <span className="text-[11px] text-zinc-500">
          {formatSize(response.size)}
        </span>
      </div>

      {/* Error insights */}
      {visibleInsights.length > 0 && (
        <div className="shrink-0 space-y-1 border-b border-zinc-700 p-2">
          {visibleInsights.map((insight) => (
            <div
              key={insight.id}
              className={`flex items-start gap-2 rounded-md border p-2 ${getSeverityColor(insight.severity)}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{insight.title}</p>
                <p className="mt-0.5 text-[11px] opacity-80">
                  {insight.description}
                </p>
                {insight.suggestion && (
                  <p className="mt-1 text-[11px] opacity-70">
                    Suggestion: {insight.suggestion}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismissInsight(insight.id)}
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Response body / headers tabs */}
      <Tabs.Root defaultValue="body" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex shrink-0 border-b border-zinc-700 bg-zinc-800/30">
          <Tabs.Trigger
            value="body"
            className="border-b-2 border-transparent px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100"
          >
            Body
          </Tabs.Trigger>
          <Tabs.Trigger
            value="headers"
            className="border-b-2 border-transparent px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100"
          >
            Headers
            {response.headers.length > 0 && (
              <span className="ml-1 text-[10px] text-zinc-500">
                ({response.headers.length})
              </span>
            )}
          </Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 overflow-hidden">
          <Tabs.Content value="body" className="h-full outline-none">
            <ResponseBody body={response.body} error={response.error} />
          </Tabs.Content>
          <Tabs.Content value="headers" className="h-full outline-none">
            <ResponseHeaders headers={response.headers} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  )
}

function ResponseBody({
  body,
  error
}: {
  body: string
  error?: string
}): JSX.Element {
  const { formatted, isJson } = useMemo(() => tryPrettyPrintJson(body), [body])

  if (error) {
    return (
      <div className="h-full overflow-auto p-3">
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-red-400">
          {error}
        </pre>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3">
      <pre
        className={`whitespace-pre-wrap break-all font-mono text-xs ${
          isJson ? 'text-zinc-200' : 'text-zinc-300'
        }`}
      >
        {formatted}
      </pre>
    </div>
  )
}

function ResponseHeaders({
  headers
}: {
  headers: { key: string; value: string }[]
}): JSX.Element {
  if (headers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-zinc-600">No headers</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-700 text-left">
            <th className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Name
            </th>
            <th className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header, index) => (
            <tr
              key={index}
              className="border-b border-zinc-800 hover:bg-zinc-800/50"
            >
              <td className="px-3 py-1 font-medium text-zinc-300">
                {header.key}
              </td>
              <td className="px-3 py-1 font-mono text-zinc-400 break-all">
                {header.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
