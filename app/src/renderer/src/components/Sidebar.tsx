import { useState, useCallback, useMemo } from 'react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'
import { confirm } from '@renderer/lib/confirm'
import type { ProjectTreeNode, HttpMethod, RequestDefinition } from '@shared/types/project'
import MoveToDialog from './MoveToDialog'

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-orange-500/20 text-orange-400',
  PATCH: 'bg-purple-500/20 text-purple-400',
  DELETE: 'bg-red-500/20 text-red-400',
  HEAD: 'bg-zinc-500/20 text-zinc-400',
  OPTIONS: 'bg-zinc-500/20 text-zinc-400'
}

function flattenTree(nodes: ProjectTreeNode[]): ProjectTreeNode[] {
  const result: ProjectTreeNode[] = []
  const visit = (n: ProjectTreeNode): void => {
    result.push(n)
    if (n.children) for (const c of n.children) visit(c)
  }
  nodes.forEach(visit)
  return result
}

export default function Sidebar(): JSX.Element {
  const {
    projectTree,
    activeRequestPath,
    showHistory,
    openRequest,
    createCollection,
    createRequest,
    deleteRequest,
    deleteCollection,
    deleteNodes,
    toggleHistory
  } = useAppStore()

  const [filter, setFilter] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [anchorPath, setAnchorPath] = useState<string | null>(null)
  const [moveDialogSource, setMoveDialogSource] = useState<string[] | null>(null)

  // Creation state
  const [newCollectionName, setNewCollectionName] = useState('')
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [newCollectionParent, setNewCollectionParent] = useState<string | undefined>()
  const [newRequestName, setNewRequestName] = useState('')
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [newRequestParent, setNewRequestParent] = useState('')

  const filterTree = useCallback(
    (nodes: ProjectTreeNode[]): ProjectTreeNode[] => {
      if (!filter) return nodes
      const lower = filter.toLowerCase()
      return nodes
        .map((node) => {
          if (node.type === 'request') {
            return node.name.toLowerCase().includes(lower) ? node : null
          }
          const filteredChildren = node.children ? filterTree(node.children) : []
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
            return { ...node, children: filteredChildren }
          }
          return null
        })
        .filter(Boolean) as ProjectTreeNode[]
    },
    [filter]
  )

  const filtered = useMemo(() => filterTree(projectTree), [filterTree, projectTree])
  const flatFiltered = useMemo(() => flattenTree(filtered), [filtered])

  const clearSelection = useCallback(() => {
    setSelection(new Set())
    setAnchorPath(null)
  }, [])

  const handleNodeClick = useCallback(
    (node: ProjectTreeNode, e: React.MouseEvent) => {
      if (e.shiftKey && anchorPath) {
        const i = flatFiltered.findIndex((n) => n.path === anchorPath)
        const j = flatFiltered.findIndex((n) => n.path === node.path)
        if (i >= 0 && j >= 0) {
          const [from, to] = i < j ? [i, j] : [j, i]
          setSelection(new Set(flatFiltered.slice(from, to + 1).map((n) => n.path)))
        }
        return
      }
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selection)
        if (next.has(node.path)) next.delete(node.path)
        else next.add(node.path)
        setSelection(next)
        setAnchorPath(node.path)
        return
      }
      setSelection(new Set([node.path]))
      setAnchorPath(node.path)
      if (node.type === 'request') openRequest(node.path)
    },
    [anchorPath, flatFiltered, selection, openRequest]
  )

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) return
    await createCollection(newCollectionName.trim(), newCollectionParent)
    setNewCollectionName('')
    setShowNewCollection(false)
    setNewCollectionParent(undefined)
  }, [newCollectionName, newCollectionParent, createCollection])

  const handleCreateRequest = useCallback(async () => {
    if (!newRequestName.trim() || !newRequestParent) return
    await createRequest(newRequestParent, newRequestName.trim())
    setNewRequestName('')
    setShowNewRequest(false)
    setNewRequestParent('')
  }, [newRequestName, newRequestParent, createRequest])

  const handleDeleteSelection = useCallback(async () => {
    const paths = Array.from(selection)
    if (paths.length === 0) return
    const ok = await confirm({
      title: `Delete ${paths.length} item${paths.length === 1 ? '' : 's'}?`,
      message: `${paths.length} selected item${paths.length === 1 ? '' : 's'} will be permanently deleted from disk. For collections, all their nested requests and sub-collections go too.`,
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return
    await deleteNodes(paths)
    clearSelection()
  }, [selection, deleteNodes, clearSelection])

  const handleMoveSelection = useCallback(() => {
    setMoveDialogSource(Array.from(selection))
  }, [selection])

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      {/* Search */}
      <div className="border-b border-zinc-800 p-2">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter requests..."
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 py-1 pl-7 pr-2 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 border-b border-zinc-800 px-2 py-1">
        <button
          onClick={() => {
            setShowNewCollection(true)
            setNewCollectionParent(undefined)
          }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          title="New Collection"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Collection
        </button>
      </div>

      {/* Selection action bar */}
      {selection.size > 0 && (
        <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-800/50 px-2 py-1">
          <span className="flex-1 text-[11px] text-zinc-400">
            {selection.size} selected
          </span>
          <button
            onClick={handleMoveSelection}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700"
            title="Move to..."
          >
            Move
          </button>
          <button
            onClick={handleDeleteSelection}
            className="rounded px-2 py-0.5 text-[11px] text-red-400 hover:bg-zinc-700"
            title="Delete selected"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="rounded px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-700"
            title="Clear selection"
          >
            Clear
          </button>
        </div>
      )}

      {/* Inline new collection form */}
      {showNewCollection && !newCollectionParent && (
        <div className="border-b border-zinc-800 p-2">
          <input
            type="text"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateCollection()
              if (e.key === 'Escape') setShowNewCollection(false)
            }}
            placeholder="Collection name..."
            autoFocus
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
          />
          <div className="mt-1 flex gap-1">
            <button
              onClick={handleCreateCollection}
              className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-500"
            >
              Create
            </button>
            <button
              onClick={() => setShowNewCollection(false)}
              className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline new request form */}
      {showNewRequest && (
        <div className="border-b border-zinc-800 p-2">
          <p className="mb-1 text-[10px] text-zinc-500">New request in collection</p>
          <input
            type="text"
            value={newRequestName}
            onChange={(e) => setNewRequestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateRequest()
              if (e.key === 'Escape') setShowNewRequest(false)
            }}
            placeholder="Request name..."
            autoFocus
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
          />
          <div className="mt-1 flex gap-1">
            <button
              onClick={handleCreateRequest}
              className="rounded bg-blue-600 px-2 py-0.5 text-[11px] text-white hover:bg-blue-500"
            >
              Create
            </button>
            <button
              onClick={() => setShowNewRequest(false)}
              className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto px-1 py-1"
        onClick={(e) => {
          // Clicks on empty tree area clear selection
          if (e.target === e.currentTarget) clearSelection()
        }}
      >
        {filtered.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-zinc-600">
            {filter ? 'No matching requests' : 'No collections yet'}
          </div>
        ) : (
          filtered.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              activeRequestPath={activeRequestPath}
              selection={selection}
              onNodeClick={handleNodeClick}
              onNewRequest={(collPath) => {
                setNewRequestParent(collPath)
                setShowNewRequest(true)
              }}
              onNewSubCollection={(parentPath) => {
                setNewCollectionParent(parentPath)
                setShowNewCollection(true)
              }}
              onDeleteRequest={deleteRequest}
              onDeleteCollection={deleteCollection}
              onMoveRequest={(path) => setMoveDialogSource([path])}
            />
          ))
        )}
      </div>

      {/* Bottom bar: history toggle */}
      <div className="border-t border-zinc-800 p-1">
        <button
          onClick={toggleHistory}
          className={`flex w-full items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
            showHistory
              ? 'bg-zinc-700 text-zinc-200'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
        </button>
      </div>

      {moveDialogSource && (
        <MoveToDialog
          sourcePaths={moveDialogSource}
          onClose={() => {
            setMoveDialogSource(null)
            clearSelection()
          }}
        />
      )}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  activeRequestPath,
  selection,
  onNodeClick,
  onNewRequest,
  onNewSubCollection,
  onDeleteRequest,
  onDeleteCollection,
  onMoveRequest
}: {
  node: ProjectTreeNode
  depth: number
  activeRequestPath: string | null
  selection: Set<string>
  onNodeClick: (node: ProjectTreeNode, e: React.MouseEvent) => void
  onNewRequest: (collectionPath: string) => void
  onNewSubCollection: (parentPath: string) => void
  onDeleteRequest: (path: string) => void
  onDeleteCollection: (path: string) => void
  onMoveRequest: (path: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const isCollection = node.type === 'collection' || node.type === 'folder'
  const isActive = node.path === activeRequestPath
  const isSelected = selection.has(node.path)

  if (isCollection) {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div>
            <button
              onClick={(e) => {
                // Let ctrl/shift/meta clicks select without toggling expansion
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  onNodeClick(node, e)
                } else {
                  setExpanded(!expanded)
                  onNodeClick(node, e)
                }
              }}
              className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-zinc-300 ${
                isSelected ? 'bg-blue-500/20 text-zinc-100' : 'hover:bg-zinc-800'
              }`}
              style={{ paddingLeft: depth * 12 + 4 }}
            >
              <svg
                className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="truncate">{node.name}</span>
            </button>
            {expanded && node.children && (
              <div>
                {node.children
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((child) => (
                    <TreeNode
                      key={child.path}
                      node={child}
                      depth={depth + 1}
                      activeRequestPath={activeRequestPath}
                      selection={selection}
                      onNodeClick={onNodeClick}
                      onNewRequest={onNewRequest}
                      onNewSubCollection={onNewSubCollection}
                      onDeleteRequest={onDeleteRequest}
                      onDeleteCollection={onDeleteCollection}
                      onMoveRequest={onMoveRequest}
                    />
                  ))}
              </div>
            )}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl">
            <ContextMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
              onSelect={() => onNewRequest(node.path)}
            >
              New Request
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
              onSelect={() => onNewSubCollection(node.path)}
            >
              New Sub-Collection
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
              onSelect={() => useAppStore.getState().setShowCurlImportDialog(true, node.path)}
            >
              Import from cURL
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-zinc-700" />
            <ContextMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
              onSelect={() => onMoveRequest(node.path)}
            >
              Move to...
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-zinc-700" />
            <ContextMenu.Item
              className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-red-400 outline-none hover:bg-zinc-700"
              onSelect={async () => {
                const ok = await confirm({
                  title: 'Delete collection?',
                  message: `"${node.name}" and all its requests and sub-collections will be permanently deleted from disk.`,
                  confirmLabel: 'Delete',
                  destructive: true
                })
                if (ok) onDeleteCollection(node.path)
              }}
            >
              Delete Collection
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )
  }

  // Request node
  const method = node.method || 'GET'
  const colorClass = METHOD_COLORS[method] || METHOD_COLORS.GET

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          onClick={(e) => onNodeClick(node, e)}
          className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs transition-colors ${
            isSelected
              ? 'bg-blue-500/20 text-zinc-100'
              : isActive
                ? 'bg-zinc-700/70 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <span className={`method-badge shrink-0 ${colorClass}`}>
            {method.substring(0, 3)}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl">
          <ContextMenu.Item
            className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
            onSelect={() => onMoveRequest(node.path)}
          >
            Move to...
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-zinc-300 outline-none hover:bg-zinc-700"
            onSelect={async () => {
              const ok = await confirm({
                title: 'Clear history for this request?',
                message: `All history entries for "${node.name}" will be permanently deleted.`,
                confirmLabel: 'Clear',
                destructive: true
              })
              if (!ok) return
              try {
                const req = await ipc<RequestDefinition>('request:load', { requestPath: node.path })
                await useAppStore.getState().clearHistoryForRequest(req.id)
              } catch { /* ignore */ }
            }}
          >
            Clear History
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-zinc-700" />
          <ContextMenu.Item
            className="flex cursor-pointer items-center rounded px-2 py-1.5 text-xs text-red-400 outline-none hover:bg-zinc-700"
            onSelect={async () => {
              const ok = await confirm({
                title: 'Delete request?',
                message: `"${node.name}" will be permanently deleted from disk.`,
                confirmLabel: 'Delete',
                destructive: true
              })
              if (ok) onDeleteRequest(node.path)
            }}
          >
            Delete Request
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
