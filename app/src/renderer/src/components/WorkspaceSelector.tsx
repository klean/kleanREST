import { useState, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'

export default function WorkspaceSelector(): JSX.Element {
  const {
    workspaces,
    workspacePath,
    switchWorkspace,
    addWorkspace,
    removeWorkspace,
    createWorkspace: createWs
  } = useAppStore()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleAddExisting = useCallback(async () => {
    const selected = await ipc<string | null>('dialog:open-folder')
    if (selected) {
      await addWorkspace(selected)
      await switchWorkspace(selected)
    }
  }, [addWorkspace, switchWorkspace])

  const handleCreate = useCallback(async () => {
    if (!newWsName.trim()) return
    setCreating(true)
    try {
      const parentDir = await ipc<string | null>('dialog:open-folder')
      if (parentDir) {
        await createWs(parentDir, newWsName.trim())
      }
    } finally {
      setCreating(false)
      setShowCreateDialog(false)
      setNewWsName('')
    }
  }, [newWsName, createWs])

  const activeWs = workspaces.find(w => w.path === workspacePath)

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <span className="max-w-[140px] truncate">
              {activeWs?.name || 'Select Workspace'}
            </span>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="min-w-[220px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl" sideOffset={4}>
            {workspaces.map((ws) => (
              <DropdownMenu.Item
                key={ws.path}
                className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={() => switchWorkspace(ws.path)}
              >
                <span className="truncate">{ws.name}</span>
                {ws.path === workspacePath && (
                  <svg className="ml-2 h-4 w-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </DropdownMenu.Item>
            ))}
            {workspaces.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-zinc-700" />}
            <DropdownMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-400 outline-none hover:bg-zinc-700 hover:text-zinc-100"
              onSelect={handleAddExisting}
            >
              Add Existing Folder...
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-400 outline-none hover:bg-zinc-700 hover:text-zinc-100"
              onSelect={() => setShowCreateDialog(true)}
            >
              Create New Workspace...
            </DropdownMenu.Item>
            {workspaces.length > 0 && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-zinc-700" />
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-500 outline-none hover:bg-zinc-700 hover:text-zinc-400">
                    Remove Workspace...
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className="min-w-[200px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl">
                      {workspaces.map(ws => (
                        <DropdownMenu.Item
                          key={ws.path}
                          className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-red-400 outline-none hover:bg-zinc-700"
                          onSelect={() => removeWorkspace(ws.path)}
                        >
                          {ws.name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Create workspace dialog */}
      <Dialog.Root open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
            <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Create Workspace</Dialog.Title>
              <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>
            <div className="space-y-3 px-4 py-4">
              <p className="text-xs text-zinc-400">Enter a name, then choose where to create the folder.</p>
              <input
                type="text"
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Workspace name"
                autoFocus
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
              <Dialog.Close className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300">Cancel</Dialog.Close>
              <button
                onClick={handleCreate}
                disabled={!newWsName.trim() || creating}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating...' : 'Create & Select Location'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
