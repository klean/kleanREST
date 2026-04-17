import { useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'

export default function ImportDialog(): JSX.Element {
  const { setShowImportDialog, importPostman } = useAppStore()

  const [dumpPath, setDumpPath] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    projects: string[]
    environments: number
    requests: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectFolder = useCallback(async () => {
    const selected = await ipc<string | null>('dialog:open-folder')
    if (selected) {
      setDumpPath(selected)
      setResult(null)
      setError(null)
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!dumpPath) return
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const importResult = await importPostman(dumpPath)
      setResult(importResult)
    } catch (err) {
      setError(String(err))
    } finally {
      setImporting(false)
    }
  }, [dumpPath, importPostman])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowImportDialog(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Import Postman Collection
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="space-y-4 px-4 py-4">
            <p className="text-xs text-zinc-400">
              Select a folder containing Postman export files (JSON). kleanREST will
              import collections, requests, and environments.
            </p>

            {/* Folder picker */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectFolder}
                className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Select Folder
              </button>
              <span className="min-w-0 truncate text-xs text-zinc-500">
                {dumpPath || 'No folder selected'}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-xs font-semibold text-green-300">
                  Import successful
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-green-400/80">
                  <li>
                    {result.projects.length} project{result.projects.length !== 1 ? 's' : ''} imported
                  </li>
                  <li>
                    {result.environments} environment{result.environments !== 1 ? 's' : ''} imported
                  </li>
                  <li>
                    {result.requests} request{result.requests !== 1 ? 's' : ''} imported
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
            <Dialog.Close className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300">
              {result ? 'Done' : 'Cancel'}
            </Dialog.Close>
            {!result && (
              <button
                onClick={handleImport}
                disabled={!dumpPath || importing}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
