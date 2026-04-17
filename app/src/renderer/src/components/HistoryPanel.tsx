import { useState, useCallback } from 'react'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'
import HistoryDetail from '@renderer/components/HistoryDetail'
import type { HistoryEntry } from '@shared/types/history'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-orange-500/20 text-orange-400',
  PATCH: 'bg-purple-500/20 text-purple-400',
  DELETE: 'bg-red-500/20 text-red-400',
  HEAD: 'bg-zinc-500/20 text-zinc-400',
  OPTIONS: 'bg-zinc-500/20 text-zinc-400'
}

function getStatusColor(status: number | null): string {
  if (!status || status === 0) return 'bg-red-500/20 text-red-400'
  if (status < 300) return 'bg-green-500/20 text-green-400'
  if (status < 400) return 'bg-blue-500/20 text-blue-400'
  if (status < 500) return 'bg-amber-500/20 text-amber-400'
  return 'bg-red-500/20 text-red-400'
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

export default function HistoryPanel(): JSX.Element {
  const { historyEntries, activeProjectPath, loadHistory } = useAppStore()
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const selectedEntry = historyEntries.find(e => e.id === selectedEntryId) || null

  const handleClearHistory = useCallback(async () => {
    if (!activeProjectPath) return
    await ipc('history:clear', { projectPath: activeProjectPath })
    await loadHistory()
  }, [activeProjectPath, loadHistory])

  const handleEntryClick = useCallback(
    (entry: HistoryEntry) => {
      const { response } = entry
      // Load the response from history into the app state
      useAppStore.setState({
        response: response
          ? {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              body: response.body,
              size: response.size,
              time: response.time,
              errorInsights: entry.errorInsights
            }
          : null
      })
    },
    []
  )

  if (selectedEntry) {
    return (
      <div className="flex h-full flex-col bg-zinc-900">
        <HistoryDetail
          entry={selectedEntry}
          onClose={() => setSelectedEntryId(null)}
          onLoadResponse={() => {
            handleEntryClick(selectedEntry)
            setSelectedEntryId(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2">
        <span className="text-xs font-semibold text-zinc-300">History</span>
        {historyEntries.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {historyEntries.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-zinc-600">
            No history yet
          </div>
        ) : (
          historyEntries.map((entry) => {
            const methodColor =
              METHOD_COLORS[entry.request.method] || METHOD_COLORS.GET
            const statusColor = getStatusColor(entry.response?.status ?? null)

            return (
              <button
                key={entry.id}
                onClick={() => setSelectedEntryId(entry.id)}
                className="group flex w-full items-start gap-2 border-b border-zinc-800 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <span
                  className={`method-badge mt-0.5 shrink-0 ${methodColor}`}
                >
                  {entry.request.method.substring(0, 3)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-zinc-300">
                    {entry.requestName || entry.request.url}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {entry.response && (
                      <span
                        className={`rounded px-1 py-0 text-[10px] font-medium ${statusColor}`}
                      >
                        {entry.response.status}
                      </span>
                    )}
                    {entry.response && (
                      <span className="text-[10px] text-zinc-600">
                        {entry.response.time}ms
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-600">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    useAppStore.getState().clearHistoryForRequest(entry.requestId)
                  }}
                  className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 hover:bg-zinc-700 hover:text-zinc-400 group-hover:opacity-100"
                  title="Clear history for this request"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
