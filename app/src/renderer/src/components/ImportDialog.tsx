import { useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'

type Mode = 'dump' | 'collection'

export default function ImportDialog(): JSX.Element {
  const {
    setShowImportDialog,
    importPostman,
    importPostmanCollection,
    projects,
    activeProjectPath
  } = useAppStore()

  const [mode, setMode] = useState<Mode>('dump')

  // Full-dump mode state
  const [dumpPath, setDumpPath] = useState<string | null>(null)
  const [dumpResult, setDumpResult] = useState<{
    projects: string[]
    environments: number
    requests: number
  } | null>(null)

  // Single-collection mode state
  const [collectionFile, setCollectionFile] = useState<string | null>(null)
  const [targetProjectPath, setTargetProjectPath] = useState<string>(
    activeProjectPath || projects[0]?.path || ''
  )
  const [collectionResult, setCollectionResult] = useState<{
    collectionName: string
    merged: boolean
    added: number
    updated: number
  } | null>(null)

  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetAll = (): void => {
    setDumpPath(null)
    setDumpResult(null)
    setCollectionFile(null)
    setCollectionResult(null)
    setError(null)
  }

  const handleSelectDumpFolder = useCallback(async () => {
    const selected = await ipc<string | null>('dialog:open-folder')
    if (selected) {
      setDumpPath(selected)
      setDumpResult(null)
      setError(null)
    }
  }, [])

  const handleSelectCollectionFile = useCallback(async () => {
    const selected = await ipc<string | null>('dialog:open-file', {
      filters: [{ name: 'Postman collection', extensions: ['json'] }]
    })
    if (selected) {
      setCollectionFile(selected)
      setCollectionResult(null)
      setError(null)
    }
  }, [])

  const handleImport = useCallback(async () => {
    setImporting(true)
    setError(null)
    try {
      if (mode === 'dump') {
        if (!dumpPath) return
        const result = await importPostman(dumpPath)
        setDumpResult(result)
      } else {
        if (!collectionFile || !targetProjectPath) return
        const result = await importPostmanCollection(collectionFile, targetProjectPath)
        setCollectionResult(result)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setImporting(false)
    }
  }, [mode, dumpPath, collectionFile, targetProjectPath, importPostman, importPostmanCollection])

  const hasResult = !!dumpResult || !!collectionResult
  const canImport =
    mode === 'dump'
      ? !!dumpPath
      : !!collectionFile && !!targetProjectPath

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowImportDialog(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Import from Postman
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 border-b border-zinc-700 px-4 py-2">
            <button
              onClick={() => { setMode('dump'); resetAll() }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === 'dump'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              Full dump
            </button>
            <button
              onClick={() => { setMode('collection'); resetAll() }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === 'collection'
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              Single collection
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 px-4 py-4">
            {mode === 'dump' ? (
              <>
                <p className="text-xs text-zinc-400">
                  Select a folder containing a Postman data dump. kleanREST will create a new
                  project for each collection and import environments.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectDumpFolder}
                    className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    Select Folder
                  </button>
                  <span className="min-w-0 truncate text-xs text-zinc-500">
                    {dumpPath || 'No folder selected'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  Import a single <code className="rounded bg-zinc-800 px-1 py-0.5">.postman_collection.json</code> file
                  into a project. If a collection with the same name already exists, the import
                  will merge into it (import takes precedence where items differ).
                </p>

                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
                    Target project
                  </label>
                  <select
                    value={targetProjectPath}
                    onChange={(e) => setTargetProjectPath(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600"
                  >
                    {projects.length === 0 ? (
                      <option value="">No projects — create one first</option>
                    ) : (
                      projects.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
                    Collection file
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectCollectionFile}
                      className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      Select File
                    </button>
                    <span className="min-w-0 truncate text-xs text-zinc-500">
                      {collectionFile || 'No file selected'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Dump result */}
            {dumpResult && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-xs font-semibold text-green-300">Import successful</p>
                <ul className="mt-2 space-y-0.5 text-xs text-green-400/80">
                  <li>
                    {dumpResult.projects.length} project{dumpResult.projects.length !== 1 ? 's' : ''} imported
                  </li>
                  <li>
                    {dumpResult.environments} environment{dumpResult.environments !== 1 ? 's' : ''} imported
                  </li>
                  <li>
                    {dumpResult.requests} request{dumpResult.requests !== 1 ? 's' : ''} imported
                  </li>
                </ul>
              </div>
            )}

            {/* Collection result */}
            {collectionResult && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-xs font-semibold text-green-300">
                  {collectionResult.merged
                    ? `Merged into "${collectionResult.collectionName}"`
                    : `Created "${collectionResult.collectionName}"`}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-green-400/80">
                  <li>
                    {collectionResult.added} request{collectionResult.added !== 1 ? 's' : ''} added
                  </li>
                  {collectionResult.merged && (
                    <li>
                      {collectionResult.updated} request{collectionResult.updated !== 1 ? 's' : ''} updated
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
            <Dialog.Close className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300">
              {hasResult ? 'Done' : 'Cancel'}
            </Dialog.Close>
            {!hasResult && (
              <button
                onClick={handleImport}
                disabled={!canImport || importing}
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
