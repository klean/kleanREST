import { useEffect, useCallback } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAppStore } from '@renderer/stores/app-store'
import Sidebar from '@renderer/components/Sidebar'
import RequestEditor from '@renderer/components/RequestEditor'
import ResponseViewer from '@renderer/components/ResponseViewer'
import HistoryPanel from '@renderer/components/HistoryPanel'
import EnvironmentManager from '@renderer/components/EnvironmentManager'
import ImportDialog from '@renderer/components/ImportDialog'
import NewProjectDialog from '@renderer/components/NewProjectDialog'
import CurlImportDialog from '@renderer/components/CurlImportDialog'
import WorkspaceSelector from '@renderer/components/WorkspaceSelector'
import GitStatusBar from '@renderer/components/GitStatusBar'
import GitPanel from '@renderer/components/GitPanel'
import { ipc } from '@renderer/lib/ipc'

function App(): JSX.Element {
  const {
    workspacePath,
    workspaces,
    projects,
    activeProjectPath,
    activeRequest,
    environments,
    activeEnvironmentId,
    showHistory,
    showEnvironmentManager,
    showImportDialog,
    showNewProjectDialog,
    showCurlImportDialog,
    showGitPanel,
    gitInfo,
    sidebarWidth,
    setSidebarWidth,
    loadWorkspaces,
    addWorkspace,
    switchWorkspace,
    loadProjects,
    openProject,
    setActiveEnvironment,
    setShowEnvironmentManager,
    setShowImportDialog,
    setShowNewProjectDialog,
    checkGitStatus
  } = useAppStore()

  useEffect(() => {
    // Load workspaces on startup and restore last active
    const init = async (): Promise<void> => {
      await loadWorkspaces()
      const lastWs = await ipc<string | null>('workspace:get-last')
      if (lastWs) {
        await switchWorkspace(lastWs)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!workspacePath) return
    checkGitStatus()
    const interval = setInterval(() => checkGitStatus(), 60000)
    return () => clearInterval(interval)
  }, [workspacePath, checkGitStatus])

  const handleSelectWorkspace = useCallback(async () => {
    const result = await ipc<string | null>('dialog:open-folder')
    if (result) {
      await addWorkspace(result)
      await switchWorkspace(result)
    }
  }, [addWorkspace, switchWorkspace])

  // Sidebar resize handler
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = sidebarWidth

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const delta = moveEvent.clientX - startX
        const newWidth = Math.max(200, Math.min(600, startWidth + delta))
        setSidebarWidth(newWidth)
      }

      const handleMouseUp = (): void => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [sidebarWidth, setSidebarWidth]
  )

  const activeProject = projects.find((p) => p.path === activeProjectPath)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top toolbar */}
      <div className="flex h-12 shrink-0 items-center border-b border-zinc-700 bg-zinc-800 px-3 gap-3">
        {/* App name */}
        <span className="text-sm font-semibold text-zinc-100 select-none tracking-tight">
          kleanREST
        </span>

        <div className="mx-1 h-5 w-px bg-zinc-700" />

        {/* Workspace selector */}
        <WorkspaceSelector />

        <div className="mx-1 h-5 w-px bg-zinc-700" />

        {/* Project selector */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="max-w-[160px] truncate">
                {activeProject?.name || 'Select Project'}
              </span>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
              sideOffset={4}
            >
              {projects.map((proj) => (
                <DropdownMenu.Item
                  key={proj.path}
                  className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                  onSelect={() => openProject(proj.path)}
                >
                  {proj.name}
                </DropdownMenu.Item>
              ))}
              {projects.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-zinc-700" />}
              <DropdownMenu.Item
                className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-400 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={() => setShowNewProjectDialog(true)}
              >
                + New Project
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Environment selector */}
        {activeProjectPath && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span className="max-w-[140px] truncate">
                  {environments.find((e) => e.id === activeEnvironmentId)?.name || 'No Environment'}
                </span>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[180px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
                sideOffset={4}
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-400 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                  onSelect={() => setActiveEnvironment(null)}
                >
                  No Environment
                </DropdownMenu.Item>
                {environments.map((env) => (
                  <DropdownMenu.Item
                    key={env.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                    onSelect={() => setActiveEnvironment(env.id)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: env.color }} />
                    {env.name}
                    {env.id === activeEnvironmentId && (
                      <svg className="ml-auto h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="my-1 h-px bg-zinc-700" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-400 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                  onSelect={() => setShowEnvironmentManager(true)}
                >
                  Manage Environments...
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings / actions */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[180px] rounded-md border border-zinc-700 bg-zinc-800 p-1 shadow-xl"
              sideOffset={4}
              align="end"
            >
              <DropdownMenu.Item
                className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={handleSelectWorkspace}
              >
                Open Workspace...
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={() => setShowImportDialog(true)}
              >
                Import Postman...
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={() => {
                  // Use the first collection in the tree as default target, or active collection
                  const tree = useAppStore.getState().projectTree
                  const firstCollection = tree.find(n => n.type === 'collection')
                  if (firstCollection) {
                    useAppStore.getState().setShowCurlImportDialog(true, firstCollection.path)
                  }
                }}
              >
                Import from cURL...
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-zinc-700" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-zinc-300 outline-none hover:bg-zinc-700 hover:text-zinc-100"
                onSelect={() => setShowEnvironmentManager(true)}
              >
                Environments
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Environment color strip */}
      {activeProjectPath && activeEnvironmentId && (() => {
        const activeEnv = environments.find(e => e.id === activeEnvironmentId)
        return activeEnv ? (
          <div className="h-[3px] shrink-0" style={{ backgroundColor: activeEnv.color }} />
        ) : null
      })()}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {activeProjectPath && (
          <>
            <div style={{ width: sidebarWidth }} className="shrink-0 overflow-hidden">
              <Sidebar />
            </div>
            {/* Resize handle */}
            <div
              className="w-1 cursor-col-resize bg-zinc-800 hover:bg-zinc-600 active:bg-zinc-500 transition-colors"
              onMouseDown={handleResizeStart}
            />
          </>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {activeRequest ? (
            <>
              <div className="flex-1 overflow-hidden">
                <RequestEditor />
              </div>
              <div className="h-px bg-zinc-700" />
              <div className="flex-1 overflow-hidden">
                <ResponseViewer />
              </div>
            </>
          ) : (
            <WelcomePage
              hasWorkspace={!!workspacePath}
              hasProject={!!activeProjectPath}
              onSelectWorkspace={handleSelectWorkspace}
              onNewProject={() => setShowNewProjectDialog(true)}
            />
          )}
        </div>

        {/* History panel */}
        {showHistory && activeProjectPath && (
          <div className="w-[440px] shrink-0 border-l border-zinc-700">
            <HistoryPanel />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex h-7 shrink-0 items-center border-t border-zinc-700 bg-zinc-800 px-3">
        <span className="text-[11px] text-zinc-500">
          {workspacePath ? `Workspace: ${workspacePath}` : 'No workspace selected'}
        </span>
        <GitStatusBar />
        <div className="flex-1" />
        {activeProjectPath && (
          <span className="text-[11px] text-zinc-500">
            {activeProject?.name || 'Unknown Project'}
          </span>
        )}
      </div>

      {/* Dialogs */}
      {showEnvironmentManager && <EnvironmentManager />}
      {showImportDialog && <ImportDialog />}
      {showNewProjectDialog && <NewProjectDialog />}
      {showCurlImportDialog && <CurlImportDialog />}
      {showGitPanel && <GitPanel />}
    </div>
  )
}

function WelcomePage({
  hasWorkspace,
  hasProject,
  onSelectWorkspace,
  onNewProject
}: {
  hasWorkspace: boolean
  hasProject: boolean
  onSelectWorkspace: () => void
  onNewProject: () => void
}): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold text-zinc-200">kleanREST</h1>
        <p className="mb-6 text-sm text-zinc-500">
          A git-friendly REST client for teams
        </p>

        <div className="flex flex-col gap-3">
          {!hasWorkspace && (
            <button
              onClick={onSelectWorkspace}
              className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-600 transition-colors"
            >
              Open Workspace Folder
            </button>
          )}
          {hasWorkspace && !hasProject && (
            <>
              <p className="text-xs text-zinc-500">
                No project open. Create one or import from Postman.
              </p>
              <button
                onClick={onNewProject}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 transition-colors"
              >
                Create New Project
              </button>
            </>
          )}
          {hasProject && (
            <p className="text-xs text-zinc-500">
              Select a request from the sidebar or create a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
