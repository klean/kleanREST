import { useEffect, useState, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ipc } from '@renderer/lib/ipc'
import { confirm } from '@renderer/lib/confirm'
import {
  MCP_TOOLS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type McpToolCategory
} from '@shared/types/mcp-tools'

interface McpStatus {
  enabled: boolean
  running: boolean
  url: string | null
  token: string | null
  disabledTools: string[]
  error: string | null
}

interface Props {
  onClose: () => void
}

export default function SettingsDialog({ onClose }: Props): JSX.Element {
  const [status, setStatus] = useState<McpStatus>({
    enabled: false,
    running: false,
    url: null,
    token: null,
    disabledTools: [],
    error: null
  })
  const [busy, setBusy] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    const s = await ipc<McpStatus>('mcp:status')
    setStatus(s)
  }, [])

  useEffect(() => {
    refreshStatus()
    const handler = (next: unknown): void => {
      setStatus(next as McpStatus)
    }
    window.electronAPI.on('mcp:status-changed', handler)
    return () => {
      window.electronAPI.off('mcp:status-changed', handler)
    }
  }, [refreshStatus])

  const handleToggle = useCallback(async () => {
    setBusy(true)
    try {
      const next = await ipc<McpStatus>('mcp:set-enabled', { enabled: !status.enabled })
      setStatus(next)
    } finally {
      setBusy(false)
    }
  }, [status.enabled])

  const handleRotateToken = useCallback(async () => {
    const ok = await confirm({
      title: 'Rotate MCP token?',
      message:
        'A new token will be generated. You will need to update your Claude Code config to use the new token before it can connect again.',
      confirmLabel: 'Rotate',
      destructive: true
    })
    if (!ok) return
    setBusy(true)
    try {
      const next = await ipc<McpStatus>('mcp:rotate-token')
      setStatus(next)
    } finally {
      setBusy(false)
    }
  }, [])

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(label)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      // clipboard can fail in some contexts — silently ignore
    }
  }, [])

  // ── Tool toggle helpers ────────────────────────────────────────────────
  const disabledSet = useMemo(() => new Set(status.disabledTools), [status.disabledTools])

  const applyDisabledTools = useCallback(async (next: string[]) => {
    setBusy(true)
    try {
      const updated = await ipc<McpStatus>('mcp:set-disabled-tools', {
        disabledTools: next
      })
      setStatus(updated)
    } finally {
      setBusy(false)
    }
  }, [])

  const toggleTool = useCallback(
    (toolId: string) => {
      const next = new Set(disabledSet)
      if (next.has(toolId)) next.delete(toolId)
      else next.add(toolId)
      return applyDisabledTools(Array.from(next))
    },
    [disabledSet, applyDisabledTools]
  )

  const setCategoryEnabled = useCallback(
    (category: McpToolCategory, enabledAll: boolean) => {
      const idsInCategory = MCP_TOOLS.filter((t) => t.category === category).map((t) => t.id)
      const next = new Set(disabledSet)
      for (const id of idsInCategory) {
        if (enabledAll) next.delete(id)
        else next.add(id)
      }
      return applyDisabledTools(Array.from(next))
    },
    [disabledSet, applyDisabledTools]
  )

  const toolsByCategory = useMemo(() => {
    const grouped: Record<McpToolCategory, typeof MCP_TOOLS> = {
      read: [],
      execute: [],
      write: []
    }
    for (const tool of MCP_TOOLS) grouped[tool.category].push(tool)
    return grouped
  }, [])

  const claudeSnippet = useMemo(() => {
    if (!status.url || !status.token) return ''
    return JSON.stringify(
      {
        mcpServers: {
          kleanrest: {
            type: 'http',
            url: status.url,
            headers: {
              Authorization: `Bearer ${status.token}`
            }
          }
        }
      },
      null,
      2
    )
  }, [status.url, status.token])

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-40 flex max-h-[80vh] w-[620px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Settings
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            {/* MCP section */}
            <section>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">MCP Server</h3>
                  <p className="mt-1 text-xs text-zinc-400">
                    Expose kleanREST projects, collections, and requests to Claude Code
                    (or any MCP client) over a local HTTP server. When enabled, tools
                    like <code className="rounded bg-zinc-800 px-1">send_request</code> let
                    an AI trigger requests through kleanREST so you can follow every
                    call in the UI.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={busy}
                  role="switch"
                  aria-checked={status.enabled}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                    status.enabled ? 'bg-blue-600' : 'bg-zinc-700'
                  } disabled:opacity-50`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      status.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Status line */}
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    status.running ? 'bg-green-500' : status.enabled ? 'bg-amber-500' : 'bg-zinc-600'
                  }`}
                />
                <span className="text-zinc-400">
                  {status.running ? 'Running' : status.enabled ? 'Starting...' : 'Disabled'}
                </span>
                {status.error && (
                  <span className="text-red-400">— {status.error}</span>
                )}
              </div>

              {status.enabled && status.url && status.token && (
                <div className="space-y-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                      Server URL
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 font-mono break-all">
                        {status.url}
                      </code>
                      <button
                        onClick={() => copy('url', status.url!)}
                        className="rounded-md bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-600"
                      >
                        {copiedField === 'url' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                      Token
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 font-mono break-all">
                        {status.token}
                      </code>
                      <button
                        onClick={() => copy('token', status.token!)}
                        className="rounded-md bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-600"
                      >
                        {copiedField === 'token' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                      Claude Code config (paste into your mcp config)
                    </label>
                    <div className="mt-1 flex items-start gap-2">
                      <pre className="flex-1 rounded bg-zinc-900 p-2 text-[11px] text-zinc-200 font-mono whitespace-pre overflow-x-auto">
                        {claudeSnippet}
                      </pre>
                      <button
                        onClick={() => copy('snippet', claudeSnippet)}
                        className="shrink-0 rounded-md bg-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-600"
                      >
                        {copiedField === 'snippet' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleRotateToken}
                      disabled={busy}
                      className="rounded-md px-3 py-1 text-[11px] text-red-400 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Rotate token
                    </button>
                  </div>
                </div>
              )}

              {!status.enabled && (
                <p className="text-[11px] text-zinc-500">
                  Server is off. Toggle on to generate a local URL and token. The server binds to
                  127.0.0.1 only — never exposed to the network.
                </p>
              )}
            </section>

            {/* Tools section — visible regardless of enabled state so user can pre-configure */}
            <section>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-zinc-100">Tools</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Pick which tools Claude Code can call. Disabled tools aren't advertised
                  and calls to them are rejected. Changes apply immediately (server
                  restarts in the background if running).
                </p>
              </div>

              <div className="space-y-3">
                {CATEGORY_ORDER.map((cat) => {
                  const tools = toolsByCategory[cat]
                  if (tools.length === 0) return null
                  const allEnabled = tools.every((t) => !disabledSet.has(t.id))
                  const allDisabled = tools.every((t) => disabledSet.has(t.id))
                  return (
                    <div
                      key={cat}
                      className="rounded-md border border-zinc-700 bg-zinc-800/50"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                          {CATEGORY_LABELS[cat]}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setCategoryEnabled(cat, true)}
                            disabled={busy || allEnabled}
                            className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
                          >
                            Enable all
                          </button>
                          <button
                            onClick={() => setCategoryEnabled(cat, false)}
                            disabled={busy || allDisabled}
                            className="rounded px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
                          >
                            Disable all
                          </button>
                        </div>
                      </div>
                      <ul>
                        {tools.map((tool) => {
                          const isEnabled = !disabledSet.has(tool.id)
                          return (
                            <li
                              key={tool.id}
                              className="flex items-start gap-3 border-b border-zinc-700/50 px-3 py-2 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                id={`tool-${tool.id}`}
                                checked={isEnabled}
                                disabled={busy}
                                onChange={() => toggleTool(tool.id)}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-500"
                              />
                              <label
                                htmlFor={`tool-${tool.id}`}
                                className="flex-1 cursor-pointer"
                              >
                                <div className="text-xs font-mono text-zinc-200">
                                  {tool.label}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {tool.description}
                                </div>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-zinc-700 px-4 py-3">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
