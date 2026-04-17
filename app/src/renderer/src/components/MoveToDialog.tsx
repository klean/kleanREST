import { useState, useEffect, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'

interface ProjectCollections {
  projectName: string
  projectPath: string
  workspacePath: string
  workspaceName: string
  collections: { name: string; path: string }[]
}

interface Props {
  sourcePaths: string[]
  onClose: () => void
}

export default function MoveToDialog({ sourcePaths, onClose }: Props): JSX.Element {
  const { workspaces, moveNodes, loadProjectTree } = useAppStore()

  const [tree, setTree] = useState<ProjectCollections[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newProjectFor, setNewProjectFor] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')

  const hasRequests = sourcePaths.some((p) => p.endsWith('.request.json'))

  const loadTree = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result: ProjectCollections[] = []
      for (const ws of workspaces) {
        try {
          const projects = await ipc<{ name: string; path: string }[]>('project:list', {
            workspacePath: ws.path
          })
          const collections = await ipc<{
            name: string
            path: string
            projectName: string
          }[]>('project:list-collections', { workspacePath: ws.path })

          for (const p of projects) {
            const projCollections = collections
              .filter((c) => c.projectName === p.name)
              .map((c) => ({ name: c.name, path: c.path }))
            result.push({
              projectName: p.name,
              projectPath: p.path,
              workspacePath: ws.path,
              workspaceName: ws.name,
              collections: projCollections
            })
          }
        } catch {
          // Skip unreachable workspaces
        }
      }
      setTree(result)
    } finally {
      setLoading(false)
    }
  }, [workspaces])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  const toggleProject = useCallback((projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectPath)) next.delete(projectPath)
      else next.add(projectPath)
      return next
    })
  }, [])

  const handleMove = useCallback(
    async (destParentPath: string) => {
      setMoving(true)
      setError(null)
      try {
        await moveNodes(sourcePaths, destParentPath)
        // Refresh the current project tree too in case the move was within the same project
        await loadProjectTree()
        onClose()
      } catch (err) {
        setError(String(err))
      } finally {
        setMoving(false)
      }
    },
    [sourcePaths, moveNodes, loadProjectTree, onClose]
  )

  const handleCreateAndMove = useCallback(
    async (workspacePath: string) => {
      const name = newProjectName.trim()
      if (!name) return
      setMoving(true)
      setError(null)
      try {
        const result = await ipc<{ projectPath: string }>('project:create', {
          parentPath: workspacePath,
          name
        })
        const destCollectionsDir = `${result.projectPath}/collections`
        await moveNodes(sourcePaths, destCollectionsDir)
        await loadProjectTree()
        onClose()
      } catch (err) {
        setError(String(err))
      } finally {
        setMoving(false)
      }
    },
    [newProjectName, sourcePaths, moveNodes, loadProjectTree, onClose]
  )

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-40 flex h-[560px] w-[540px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Move {sourcePaths.length} item{sourcePaths.length === 1 ? '' : 's'} to...
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          <div className="border-b border-zinc-700 px-4 py-2">
            <p className="text-[11px] text-zinc-500">
              {hasRequests
                ? 'Requests can only be moved into collections. Click a collection to move there.'
                : 'Click a project to move to its root, or expand and pick a sub-collection.'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-zinc-500">Loading...</div>
            ) : tree.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                No workspaces or projects found.
              </div>
            ) : (
              tree.map((p) => {
                const expanded = expandedProjects.has(p.projectPath)
                const collectionsRoot = `${p.projectPath}/collections`
                return (
                  <div key={p.projectPath} className="mb-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleProject(p.projectPath)}
                        className="flex flex-1 items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        <svg
                          className={`h-3 w-3 text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="truncate font-medium">{p.projectName}</span>
                        <span className="text-[10px] text-zinc-600">({p.workspaceName})</span>
                      </button>
                      {!hasRequests && (
                        <button
                          onClick={() => handleMove(collectionsRoot)}
                          disabled={moving}
                          className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
                          title="Move to project root"
                        >
                          Here
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div className="ml-5 mt-0.5 space-y-0.5">
                        {p.collections.length === 0 ? (
                          <div className="px-2 py-1 text-[11px] text-zinc-600">No collections</div>
                        ) : (
                          p.collections.map((c) => (
                            <button
                              key={c.path}
                              onClick={() => handleMove(c.path)}
                              disabled={moving}
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                            >
                              <svg className="h-3.5 w-3.5 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                              <span className="truncate">{c.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* Create-new-project section per workspace */}
            {!loading && workspaces.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-zinc-700 pt-3">
                <p className="px-2 text-[10px] uppercase tracking-wider text-zinc-500">
                  Or create a new project
                </p>
                {workspaces.map((ws) => (
                  <div key={ws.path}>
                    {newProjectFor === ws.path ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <input
                          type="text"
                          autoFocus
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newProjectName.trim()) {
                              handleCreateAndMove(ws.path)
                            } else if (e.key === 'Escape') {
                              setNewProjectFor(null)
                              setNewProjectName('')
                            }
                          }}
                          placeholder="New project name"
                          className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                        />
                        <button
                          onClick={() => handleCreateAndMove(ws.path)}
                          disabled={!newProjectName.trim() || moving}
                          className="rounded bg-blue-600 px-2 py-1 text-[11px] text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          Create &amp; Move
                        </button>
                        <button
                          onClick={() => {
                            setNewProjectFor(null)
                            setNewProjectName('')
                          }}
                          className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setNewProjectFor(ws.path)
                          setNewProjectName('')
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        New project in {ws.name}...
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-zinc-700 bg-red-500/10 px-4 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
