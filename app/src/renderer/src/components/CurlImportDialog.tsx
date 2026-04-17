import { useState, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import { parseCurl } from '@renderer/lib/curl-parser'
import { ipc } from '@renderer/lib/ipc'
import type { RequestDefinition, HttpMethod } from '@shared/types/project'

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-blue-400',
  PUT: 'text-orange-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
  HEAD: 'text-zinc-400',
  OPTIONS: 'text-zinc-400'
}

export default function CurlImportDialog(): JSX.Element {
  const { setShowCurlImportDialog, curlImportTargetCollection, loadProjectTree, openRequest } = useAppStore()

  const [curlCommand, setCurlCommand] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const parsed = useMemo(() => {
    if (!curlCommand.trim()) return null
    try {
      setError(null)
      return parseCurl(curlCommand.trim())
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      return null
    }
  }, [curlCommand])

  const handleCreate = useCallback(async () => {
    if (!parsed || !curlImportTargetCollection) return
    setCreating(true)
    try {
      // Extract a name from the URL
      let name = 'Imported Request'
      try {
        const urlObj = new URL(parsed.url)
        const pathParts = urlObj.pathname.split('/').filter(Boolean)
        name = pathParts[pathParts.length - 1] || urlObj.hostname
      } catch { /* keep default name */ }

      // Create the request file
      const result = await ipc<{ path: string; request: RequestDefinition }>('request:create', {
        collectionPath: curlImportTargetCollection,
        name
      })

      // Update the request with parsed cURL data
      const updatedRequest: RequestDefinition = {
        ...result.request,
        method: parsed.method,
        url: parsed.url,
        headers: parsed.headers,
        body: parsed.body,
        auth: parsed.auth,
        settings: {
          ...result.request.settings,
          validateSSL: parsed.validateSSL
        }
      }

      await ipc('request:save', {
        requestPath: result.path,
        request: updatedRequest
      })

      await loadProjectTree()
      await openRequest(result.path)
      setShowCurlImportDialog(false)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setCreating(false)
    }
  }, [parsed, curlImportTargetCollection, loadProjectTree, openRequest, setShowCurlImportDialog])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowCurlImportDialog(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[560px] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Import from cURL
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto space-y-3 px-4 py-4">
            <p className="text-xs text-zinc-400">
              Paste a cURL command to create a new request. Supports commands from Chrome DevTools, Postman, and other tools.
            </p>

            <textarea
              value={curlCommand}
              onChange={(e) => setCurlCommand(e.target.value)}
              placeholder={'curl -X POST \\\n  -H "Content-Type: application/json" \\\n  -d \'{"key": "value"}\' \\\n  https://api.example.com/endpoint'}
              className="h-40 w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              spellCheck={false}
            />

            {/* Error */}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Preview */}
            {parsed && (
              <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Preview</p>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${METHOD_COLORS[parsed.method]}`}>
                    {parsed.method}
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs text-zinc-300">
                    {parsed.url}
                  </span>
                </div>

                <div className="flex gap-4 text-[11px] text-zinc-500">
                  {parsed.headers.length > 0 && (
                    <span>{parsed.headers.length} header{parsed.headers.length !== 1 ? 's' : ''}</span>
                  )}
                  {parsed.body.mode !== 'none' && (
                    <span>Body: {parsed.body.mode}</span>
                  )}
                  {parsed.auth.type !== 'none' && (
                    <span>Auth: {parsed.auth.type}</span>
                  )}
                  {!parsed.validateSSL && (
                    <span className="text-amber-400">SSL disabled</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
            <Dialog.Close className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300">
              Cancel
            </Dialog.Close>
            <button
              onClick={handleCreate}
              disabled={!parsed || !curlImportTargetCollection || creating}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
