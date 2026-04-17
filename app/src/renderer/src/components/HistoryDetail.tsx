import { useMemo } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import type { HistoryEntry } from '@shared/types/history'
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
    case 'error': return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'warning': return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'info': return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  }
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-orange-500/20 text-orange-400',
  PATCH: 'bg-purple-500/20 text-purple-400',
  DELETE: 'bg-red-500/20 text-red-400',
  HEAD: 'bg-zinc-500/20 text-zinc-400',
  OPTIONS: 'bg-zinc-500/20 text-zinc-400'
}

function tryPrettyPrint(body: string | null): string {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  entry: HistoryEntry
  onClose: () => void
  onLoadResponse: () => void
}

export default function HistoryDetail({ entry, onClose, onLoadResponse }: Props): JSX.Element {
  const methodColor = METHOD_COLORS[entry.request.method] || METHOD_COLORS.GET
  const formattedRequestBody = useMemo(() => tryPrettyPrint(entry.request.body), [entry.request.body])
  const formattedResponseBody = useMemo(
    () => (entry.response ? tryPrettyPrint(entry.response.body) : ''),
    [entry.response]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-700 px-3 py-2">
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className={`method-badge shrink-0 ${methodColor}`}>
          {entry.request.method}
        </span>
        <span className="min-w-0 truncate text-xs text-zinc-300">
          {entry.requestName || entry.request.url}
        </span>
        <div className="flex-1" />
        <button
          onClick={onLoadResponse}
          className="rounded bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-600"
        >
          Load Response
        </button>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="request" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex shrink-0 border-b border-zinc-700 bg-zinc-800/30">
          <Tabs.Trigger value="request" className="border-b-2 border-transparent px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100">
            Request
          </Tabs.Trigger>
          <Tabs.Trigger value="response" className="border-b-2 border-transparent px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100">
            Response
            {entry.response && (
              <span className={`ml-1.5 rounded px-1 py-0 text-[10px] font-medium ${getStatusColor(entry.response.status)}`}>
                {entry.response.status}
              </span>
            )}
          </Tabs.Trigger>
          {entry.errorInsights.length > 0 && (
            <Tabs.Trigger value="insights" className="border-b-2 border-transparent px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100">
              Insights ({entry.errorInsights.length})
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <div className="flex-1 overflow-y-auto">
          {/* Request tab */}
          <Tabs.Content value="request" className="p-3 outline-none">
            <div className="space-y-3">
              {/* URL */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">URL</p>
                <p className="break-all rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-200">
                  {entry.request.url}
                </p>
              </div>

              {/* Headers */}
              {entry.request.headers.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    Headers ({entry.request.headers.length})
                  </p>
                  <table className="w-full text-xs">
                    <tbody>
                      {entry.request.headers.map((h, i) => (
                        <tr key={i} className="border-b border-zinc-800">
                          <td className="px-2 py-0.5 font-medium text-zinc-300">{h.key}</td>
                          <td className="px-2 py-0.5 font-mono text-zinc-400 break-all">{h.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Body */}
              {entry.request.body && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Body</p>
                  <pre className="max-h-60 overflow-auto rounded bg-zinc-800 p-2 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all">
                    {formattedRequestBody}
                  </pre>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* Response tab */}
          <Tabs.Content value="response" className="p-3 outline-none">
            {entry.response ? (
              <div className="space-y-3">
                {/* Status bar */}
                <div className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getStatusColor(entry.response.status)}`}>
                    {entry.response.status} {entry.response.statusText}
                  </span>
                  <span className="text-[11px] text-zinc-500">{entry.response.time}ms</span>
                  <span className="text-[11px] text-zinc-500">{formatSize(entry.response.size)}</span>
                </div>

                {/* Response Headers */}
                {entry.response.headers.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                      Headers ({entry.response.headers.length})
                    </p>
                    <table className="w-full text-xs">
                      <tbody>
                        {entry.response.headers.map((h, i) => (
                          <tr key={i} className="border-b border-zinc-800">
                            <td className="px-2 py-0.5 font-medium text-zinc-300">{h.key}</td>
                            <td className="px-2 py-0.5 font-mono text-zinc-400 break-all">{h.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Response Body */}
                {entry.response.body && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Body</p>
                    <pre className="max-h-80 overflow-auto rounded bg-zinc-800 p-2 font-mono text-xs text-zinc-200 whitespace-pre-wrap break-all">
                      {formattedResponseBody}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-zinc-600">
                No response (request failed)
              </div>
            )}
          </Tabs.Content>

          {/* Insights tab */}
          {entry.errorInsights.length > 0 && (
            <Tabs.Content value="insights" className="p-3 outline-none">
              <div className="space-y-2">
                {entry.errorInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className={`rounded-md border p-2 ${getSeverityColor(insight.severity)}`}
                  >
                    <p className="text-xs font-semibold">{insight.title}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{insight.description}</p>
                    {insight.suggestion && (
                      <p className="mt-1 text-[11px] opacity-70">Suggestion: {insight.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            </Tabs.Content>
          )}
        </div>
      </Tabs.Root>
    </div>
  )
}
