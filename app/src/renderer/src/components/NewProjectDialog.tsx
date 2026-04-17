import { useState, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'

export default function NewProjectDialog(): JSX.Element {
  const { setShowNewProjectDialog, createProject } = useAppStore()

  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setCreating(true)
    setError(null)

    try {
      await createProject(name.trim())
      setShowNewProjectDialog(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setCreating(false)
    }
  }, [name, createProject, setShowNewProjectDialog])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowNewProjectDialog(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              New Project
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="space-y-3 px-4 py-4">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                }}
                placeholder="My API Project"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {error}
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
              disabled={!name.trim() || creating}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
