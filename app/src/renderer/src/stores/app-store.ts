import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { ipc } from '@renderer/lib/ipc'
import type {
  ProjectTreeNode,
  RequestDefinition,
  HttpMethod,
  KeyValuePair,
  ProjectConfig
} from '@shared/types/project'
import type { Environment, EnvironmentVariable } from '@shared/types/environment'
import type { HistoryEntry } from '@shared/types/history'
import type { RequestResult } from '@shared/types/ipc'
import type { GitInfo, GitFileStatus } from '@shared/types/git'

export interface Tab {
  id: string
  name: string
  path: string
  method: HttpMethod
  dirty: boolean
}

interface AppState {
  // Workspace
  workspacePath: string | null
  workspaces: { path: string; name: string }[]
  projects: { name: string; path: string }[]
  activeProjectPath: string | null

  // Git
  gitInfo: GitInfo | null
  showGitPanel: boolean

  // Project tree
  projectTree: ProjectTreeNode[]

  // Tabs
  openTabs: Tab[]
  activeTabId: string | null

  // Active request
  activeRequest: RequestDefinition | null
  activeRequestPath: string | null
  activeRequestDirty: boolean

  // Response
  response: RequestResult | null
  isLoading: boolean

  // Environments
  environments: Environment[]
  activeEnvironmentId: string | null

  // History
  historyEntries: HistoryEntry[]
  showHistory: boolean

  // UI
  sidebarWidth: number
  showEnvironmentManager: boolean
  showImportDialog: boolean
  showNewProjectDialog: boolean
  showCurlImportDialog: boolean
  curlImportTargetCollection: string | null

  // Actions
  setWorkspacePath: (path: string) => void
  loadWorkspaces: () => Promise<void>
  addWorkspace: (path: string, name?: string) => Promise<void>
  removeWorkspace: (path: string) => Promise<void>
  createWorkspace: (parentPath: string, name: string) => Promise<void>
  switchWorkspace: (path: string) => Promise<void>
  loadProjects: () => Promise<void>
  openProject: (path: string) => Promise<void>
  deleteProject: (path: string) => Promise<void>
  loadProjectTree: () => Promise<void>

  openRequest: (path: string) => Promise<void>
  updateActiveRequest: (updates: Partial<RequestDefinition>) => void
  saveActiveRequest: () => Promise<void>
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void

  sendRequest: () => Promise<void>

  loadEnvironments: () => Promise<void>
  setActiveEnvironment: (envId: string | null) => void

  loadHistory: () => Promise<void>
  toggleHistory: () => void

  setSidebarWidth: (width: number) => void
  setShowEnvironmentManager: (show: boolean) => void
  setShowImportDialog: (show: boolean) => void
  setShowNewProjectDialog: (show: boolean) => void
  setShowCurlImportDialog: (show: boolean, collectionPath?: string | null) => void

  createProject: (name: string) => Promise<void>
  createCollection: (name: string, parentPath?: string) => Promise<void>
  createRequest: (collectionPath: string, name: string) => Promise<void>
  deleteRequest: (path: string) => Promise<void>
  deleteCollection: (path: string) => Promise<void>
  deleteNodes: (paths: string[]) => Promise<void>
  moveNode: (
    sourcePath: string,
    destParentPath: string,
    targetIndex?: number
  ) => Promise<{ newPath: string }>
  moveNodes: (
    sourcePaths: string[],
    destParentPath: string
  ) => Promise<void>

  clearHistoryForRequest: (requestId: string) => Promise<void>

  checkGitStatus: () => Promise<void>
  gitPull: () => Promise<{ success: boolean; output: string }>
  gitCommit: (message: string) => Promise<{ success: boolean; output: string }>
  gitPush: () => Promise<{ success: boolean; output: string }>
  setShowGitPanel: (show: boolean) => void

  importPostman: (
    dumpPath: string
  ) => Promise<{ projects: string[]; environments: number; requests: number }>
  importPostmanCollection: (
    filePath: string,
    projectPath: string
  ) => Promise<{
    collectionPath: string
    collectionName: string
    merged: boolean
    added: number
    updated: number
  }>
}

function resolveVariables(
  text: string,
  variables: EnvironmentVariable[]
): string {
  let result = text
  for (const v of variables) {
    if (v.enabled) {
      result = result.replace(new RegExp(`\\{\\{${v.key}\\}\\}`, 'g'), v.value)
    }
  }
  return result
}

function resolveHeaderVariables(
  headers: { key: string; value: string }[],
  variables: EnvironmentVariable[]
): { key: string; value: string }[] {
  return headers.map((h) => ({
    key: resolveVariables(h.key, variables),
    value: resolveVariables(h.value, variables)
  }))
}

export const useAppStore = create<AppState>((set, get) => ({
  // Workspace
  workspacePath: null,
  workspaces: [],
  projects: [],
  activeProjectPath: null,

  // Git
  gitInfo: null,
  showGitPanel: false,

  // Project tree
  projectTree: [],

  // Tabs
  openTabs: [],
  activeTabId: null,

  // Active request
  activeRequest: null,
  activeRequestPath: null,
  activeRequestDirty: false,

  // Response
  response: null,
  isLoading: false,

  // Environments
  environments: [],
  activeEnvironmentId: null,

  // History
  historyEntries: [],
  showHistory: false,

  // UI
  sidebarWidth: 280,
  showEnvironmentManager: false,
  showImportDialog: false,
  showNewProjectDialog: false,
  showCurlImportDialog: false,
  curlImportTargetCollection: null,

  // --- Actions ---

  setWorkspacePath: (path: string) => {
    set({ workspacePath: path })
    ipc('workspace:set-last', { path })
  },

  loadWorkspaces: async () => {
    const workspaces = await ipc<{ path: string; name: string }[]>('workspace:list')
    set({ workspaces })
  },

  addWorkspace: async (wsPath: string, name?: string) => {
    await ipc('workspace:add', { path: wsPath, name })
    await get().loadWorkspaces()
  },

  removeWorkspace: async (wsPath: string) => {
    await ipc('workspace:remove', { path: wsPath })
    await get().loadWorkspaces()
    const { workspacePath } = get()
    if (workspacePath === wsPath) {
      set({ workspacePath: null, projects: [], activeProjectPath: null, projectTree: [] })
    }
  },

  createWorkspace: async (parentPath: string, name: string) => {
    const result = await ipc<{ path: string }>('workspace:create', { parentPath, name })
    await get().loadWorkspaces()
    await get().switchWorkspace(result.path)
  },

  switchWorkspace: async (wsPath: string) => {
    await ipc('workspace:set-last', { path: wsPath })
    set({
      workspacePath: wsPath,
      activeProjectPath: null,
      projectTree: [],
      openTabs: [],
      activeTabId: null,
      activeRequest: null,
      activeRequestPath: null,
      activeRequestDirty: false,
      response: null,
      environments: [],
      activeEnvironmentId: null,
      historyEntries: [],
      showHistory: false
    })
    await get().loadProjects()
    // Restore last active project for this workspace
    const lastProject = localStorage.getItem(`kleanrest:lastProject:${wsPath}`)
    if (lastProject) {
      const { projects } = get()
      if (projects.some(p => p.path === lastProject)) {
        await get().openProject(lastProject)
      }
    }
  },

  loadProjects: async () => {
    const { workspacePath } = get()
    if (!workspacePath) return
    const projects = await ipc<{ name: string; path: string }[]>('project:list', {
      workspacePath
    })
    set({ projects })
  },

  openProject: async (path: string) => {
    const result = await ipc<{ config: ProjectConfig; tree: ProjectTreeNode[] }>(
      'project:load',
      { projectPath: path }
    )
    const { workspacePath } = get()
    if (workspacePath) {
      localStorage.setItem(`kleanrest:lastProject:${workspacePath}`, path)
    }
    set({
      activeProjectPath: path,
      projectTree: result.tree,
      openTabs: [],
      activeTabId: null,
      activeRequest: null,
      activeRequestPath: null,
      activeRequestDirty: false,
      response: null,
      environments: [],
      historyEntries: [],
      showHistory: false
    })
    // Load environments and history after project opens
    await get().loadEnvironments()
    // Restore last active environment
    const lastEnv = localStorage.getItem(`kleanrest:lastEnv:${path}`)
    if (lastEnv) {
      const { environments } = get()
      if (environments.some(e => e.id === lastEnv)) {
        set({ activeEnvironmentId: lastEnv })
      }
    }
    get().loadHistory()
  },

  loadProjectTree: async () => {
    const { activeProjectPath } = get()
    if (!activeProjectPath) return
    const result = await ipc<{ config: ProjectConfig; tree: ProjectTreeNode[] }>(
      'project:load',
      { projectPath: activeProjectPath }
    )
    set({ projectTree: result.tree })
  },

  deleteProject: async (projectPath: string) => {
    await ipc<void>('project:delete', { projectPath })
    const { activeProjectPath, workspacePath } = get()
    if (activeProjectPath === projectPath) {
      set({
        activeProjectPath: null,
        projectTree: [],
        openTabs: [],
        activeTabId: null,
        activeRequest: null,
        activeRequestPath: null,
        activeRequestDirty: false,
        response: null,
        environments: [],
        activeEnvironmentId: null,
        historyEntries: []
      })
      if (workspacePath) {
        localStorage.removeItem(`kleanrest:lastProject:${workspacePath}`)
      }
    }
    await get().loadProjects()
  },

  openRequest: async (path: string) => {
    const { openTabs } = get()

    // Check if already open in a tab
    const existingTab = openTabs.find((t) => t.path === path)
    if (existingTab) {
      // Switch to that tab and load the request
      const request = await ipc<RequestDefinition>('request:load', { requestPath: path })
      set({
        activeTabId: existingTab.id,
        activeRequest: request,
        activeRequestPath: path,
        activeRequestDirty: false,
        response: null
      })
      return
    }

    // Load the request
    const request = await ipc<RequestDefinition>('request:load', { requestPath: path })

    const tab: Tab = {
      id: uuid(),
      name: request.name,
      path,
      method: request.method,
      dirty: false
    }

    set({
      openTabs: [...openTabs, tab],
      activeTabId: tab.id,
      activeRequest: request,
      activeRequestPath: path,
      activeRequestDirty: false,
      response: null
    })
  },

  updateActiveRequest: (updates: Partial<RequestDefinition>) => {
    const { activeRequest, openTabs, activeTabId } = get()
    if (!activeRequest) return

    const updated = { ...activeRequest, ...updates }

    // Mark the active tab as dirty
    const updatedTabs = openTabs.map((t) =>
      t.id === activeTabId
        ? { ...t, dirty: true, method: updated.method, name: updated.name }
        : t
    )

    set({
      activeRequest: updated,
      activeRequestDirty: true,
      openTabs: updatedTabs
    })
  },

  saveActiveRequest: async () => {
    const { activeRequest, activeRequestPath, openTabs, activeTabId } = get()
    if (!activeRequest || !activeRequestPath) return

    await ipc<void>('request:save', {
      requestPath: activeRequestPath,
      request: { ...activeRequest, updatedAt: new Date().toISOString() }
    })

    // Mark tab as clean
    const updatedTabs = openTabs.map((t) =>
      t.id === activeTabId ? { ...t, dirty: false } : t
    )

    set({ activeRequestDirty: false, openTabs: updatedTabs })
  },

  closeTab: (tabId: string) => {
    const { openTabs, activeTabId } = get()
    const filtered = openTabs.filter((t) => t.id !== tabId)

    if (activeTabId === tabId) {
      // Activate the closest remaining tab
      const closedIndex = openTabs.findIndex((t) => t.id === tabId)
      const nextTab =
        filtered[Math.min(closedIndex, filtered.length - 1)] || null

      if (nextTab) {
        set({ openTabs: filtered, activeTabId: nextTab.id })
        // Load the request for the new active tab
        get().openRequest(nextTab.path)
      } else {
        set({
          openTabs: filtered,
          activeTabId: null,
          activeRequest: null,
          activeRequestPath: null,
          activeRequestDirty: false,
              environments: [],
          response: null
        })
      }
    } else {
      set({ openTabs: filtered })
    }
  },

  setActiveTab: (tabId: string) => {
    const { openTabs } = get()
    const tab = openTabs.find((t) => t.id === tabId)
    if (tab) {
      get().openRequest(tab.path)
    }
  },

  sendRequest: async () => {
    const { activeRequest, activeProjectPath, environments, activeEnvironmentId } =
      get()
    if (!activeRequest || !activeProjectPath) return

    // Find active environment variables
    const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
    const vars = activeEnv?.variables ?? []

    // Resolve variables in the request
    const resolvedUrl = resolveVariables(activeRequest.url, vars)
    const enabledHeaders: { key: string; value: string }[] = activeRequest.headers
      .filter((h: KeyValuePair) => h.enabled)
      .map((h: KeyValuePair) => ({ key: h.key, value: h.value }))
    const resolvedHeaders = resolveHeaderVariables(enabledHeaders, vars)

    // Build query string from enabled params
    const enabledParams = activeRequest.queryParams.filter(
      (p: KeyValuePair) => p.enabled && p.key
    )
    let urlWithParams = resolvedUrl
    if (enabledParams.length > 0) {
      const qs = enabledParams
        .map(
          (p: KeyValuePair) =>
            `${encodeURIComponent(resolveVariables(p.key, vars))}=${encodeURIComponent(resolveVariables(p.value, vars))}`
        )
        .join('&')
      urlWithParams += (resolvedUrl.includes('?') ? '&' : '?') + qs
    }

    // Resolve body
    let bodyContent: string | null = null
    if (activeRequest.body.mode === 'json') {
      bodyContent = resolveVariables(activeRequest.body.json, vars)
    } else if (activeRequest.body.mode === 'raw') {
      bodyContent = resolveVariables(activeRequest.body.raw, vars)
    }

    // Build formData if applicable
    const formData =
      activeRequest.body.mode === 'formdata'
        ? activeRequest.body.formData
            .filter((f) => f.enabled)
            .map((f) => ({
              key: resolveVariables(f.key, vars),
              value: resolveVariables(f.value, vars),
              type: f.type
            }))
        : undefined

    // Handle auth headers
    const auth = activeRequest.auth
    if (auth.type === 'bearer') {
      resolvedHeaders.push({
        key: 'Authorization',
        value: `Bearer ${resolveVariables(auth.token, vars)}`
      })
    } else if (auth.type === 'basic') {
      const encoded = btoa(
        `${resolveVariables(auth.username, vars)}:${resolveVariables(auth.password, vars)}`
      )
      resolvedHeaders.push({
        key: 'Authorization',
        value: `Basic ${encoded}`
      })
    } else if (auth.type === 'apikey' && auth.addTo === 'header') {
      resolvedHeaders.push({
        key: resolveVariables(auth.key, vars),
        value: resolveVariables(auth.value, vars)
      })
    } else if (auth.type === 'apikey' && auth.addTo === 'query') {
      const sep = urlWithParams.includes('?') ? '&' : '?'
      urlWithParams += `${sep}${encodeURIComponent(resolveVariables(auth.key, vars))}=${encodeURIComponent(resolveVariables(auth.value, vars))}`
    }

    set({ isLoading: true, response: null })

    try {
      const result = await ipc<RequestResult>('request:send', {
        request: {
          method: activeRequest.method,
          url: urlWithParams,
          headers: resolvedHeaders,
          body: bodyContent,
          bodyType: activeRequest.body.mode,
          formData,
          timeout: activeRequest.settings.timeout ?? 30000,
          followRedirects: activeRequest.settings.followRedirects ?? true,
          maxRedirects: activeRequest.settings.maxRedirects ?? 10,
          validateSSL: activeRequest.settings.validateSSL ?? true
        }
      })

      set({ response: result, isLoading: false })

      // Save to history
      const historyEntry: HistoryEntry = {
        id: uuid(),
        requestId: activeRequest.id,
        requestName: activeRequest.name || urlWithParams,
        timestamp: new Date().toISOString(),
        request: {
          method: activeRequest.method,
          url: urlWithParams,
          headers: resolvedHeaders,
          body: bodyContent
        },
        response: result.error
          ? null
          : {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
              body: result.body,
              size: result.size,
              time: result.time
            },
        errorInsights: result.errorInsights
      }

      await ipc<void>('history:save', {
        projectPath: activeProjectPath,
        entry: historyEntry
      })

      // Reload history
      get().loadHistory()
    } catch (err) {
      set({
        response: {
          status: 0,
          statusText: 'Error',
          headers: [],
          body: String(err),
          size: 0,
          time: 0,
          error: String(err),
          errorInsights: []
        },
        isLoading: false
      })
    }
  },

  loadEnvironments: async () => {
    const { activeProjectPath } = get()
    if (!activeProjectPath) {
      set({ environments: [] })
      return
    }
    const environments = await ipc<Environment[]>('env:list', {
      projectPath: activeProjectPath
    })
    set({ environments })
  },

  setActiveEnvironment: (envId: string | null) => {
    const { activeProjectPath } = get()
    if (activeProjectPath) {
      localStorage.setItem(`kleanrest:lastEnv:${activeProjectPath}`, envId || '')
    }
    set({ activeEnvironmentId: envId })
  },

  loadHistory: async () => {
    const { activeProjectPath } = get()
    if (!activeProjectPath) return
    const entries = await ipc<HistoryEntry[]>('history:list', {
      projectPath: activeProjectPath,
      limit: 100,
      offset: 0
    })
    set({ historyEntries: entries })
  },

  toggleHistory: () => {
    set((state) => ({ showHistory: !state.showHistory }))
  },

  setSidebarWidth: (width: number) => {
    set({ sidebarWidth: width })
  },

  setShowEnvironmentManager: (show: boolean) => {
    set({ showEnvironmentManager: show })
  },

  setShowImportDialog: (show: boolean) => {
    set({ showImportDialog: show })
  },

  setShowNewProjectDialog: (show: boolean) => {
    set({ showNewProjectDialog: show })
  },

  setShowCurlImportDialog: (show: boolean, collectionPath?: string | null) => {
    set({
      showCurlImportDialog: show,
      curlImportTargetCollection: collectionPath ?? null
    })
  },

  createProject: async (name: string) => {
    const { workspacePath } = get()
    if (!workspacePath) return
    await ipc<{ projectPath: string; config: ProjectConfig }>('project:create', {
      parentPath: workspacePath,
      name
    })
    await get().loadProjects()
  },

  createCollection: async (name: string, parentPath?: string) => {
    const { activeProjectPath } = get()
    if (!activeProjectPath) return
    const defaultCollectionPath = activeProjectPath + '/collections'
    await ipc('collection:create', {
      projectPath: activeProjectPath,
      collectionPath: parentPath || defaultCollectionPath,
      name
    })
    await get().loadProjectTree()
  },

  createRequest: async (collectionPath: string, name: string) => {
    const result = await ipc<{ path: string; request: RequestDefinition }>(
      'request:create',
      { collectionPath, name }
    )
    await get().loadProjectTree()
    await get().openRequest(result.path)
  },

  deleteRequest: async (path: string) => {
    const { openTabs } = get()
    await ipc<void>('request:delete', { requestPath: path })
    // Close the tab if it's open
    const tab = openTabs.find((t) => t.path === path)
    if (tab) {
      get().closeTab(tab.id)
    }
    await get().loadProjectTree()
  },

  deleteCollection: async (path: string) => {
    await ipc<void>('collection:delete', { collectionPath: path })
    await get().loadProjectTree()
  },

  deleteNodes: async (paths: string[]) => {
    // Best-effort bulk delete: we don't know each node's type from the path alone,
    // so try request delete first, fall back to collection delete.
    const { openTabs, closeTab } = get()
    for (const p of paths) {
      try {
        if (p.endsWith('.request.json')) {
          await ipc<void>('request:delete', { requestPath: p })
          const tab = openTabs.find((t) => t.path === p)
          if (tab) closeTab(tab.id)
        } else {
          await ipc<void>('collection:delete', { collectionPath: p })
        }
      } catch {
        // Continue through the list even if one fails
      }
    }
    await get().loadProjectTree()
  },

  moveNode: async (sourcePath, destParentPath, targetIndex) => {
    const result = await ipc<{ newPath: string }>('node:move', {
      sourcePath,
      destParentPath,
      targetIndex
    })
    await get().loadProjectTree()
    return result
  },

  moveNodes: async (sourcePaths, destParentPath) => {
    for (const sp of sourcePaths) {
      try {
        await ipc<{ newPath: string }>('node:move', {
          sourcePath: sp,
          destParentPath
        })
      } catch {
        // Continue through the list even if one move fails
      }
    }
    await get().loadProjectTree()
  },

  clearHistoryForRequest: async (requestId: string) => {
    const { activeProjectPath } = get()
    if (!activeProjectPath) return
    await ipc('history:clear-for-request', {
      projectPath: activeProjectPath,
      requestId
    })
    await get().loadHistory()
  },

  checkGitStatus: async () => {
    const { workspacePath } = get()
    if (!workspacePath) {
      set({ gitInfo: null })
      return
    }
    try {
      const isRepo = await ipc<boolean>('git:is-repo', { dirPath: workspacePath })
      if (!isRepo) {
        set({ gitInfo: { isRepo: false, branch: null, ahead: 0, behind: 0, changeCount: 0, changedFiles: [], fetchError: null } })
        return
      }
      // Fetch in background (don't await errors)
      ipc('git:fetch', { dirPath: workspacePath }).catch(() => {})

      const [branch, aheadBehind, changedFiles] = await Promise.all([
        ipc<string | null>('git:branch', { dirPath: workspacePath }),
        ipc<{ ahead: number; behind: number }>('git:ahead-behind', { dirPath: workspacePath }),
        ipc<GitFileStatus[]>('git:status', { dirPath: workspacePath })
      ])

      set({
        gitInfo: {
          isRepo: true,
          branch,
          ahead: aheadBehind.ahead,
          behind: aheadBehind.behind,
          changeCount: changedFiles.length,
          changedFiles,
          fetchError: null
        }
      })
    } catch (err) {
      set({
        gitInfo: {
          isRepo: false,
          branch: null,
          ahead: 0,
          behind: 0,
          changeCount: 0,
          changedFiles: [],
          fetchError: String(err)
        }
      })
    }
  },

  gitPull: async () => {
    const { workspacePath } = get()
    if (!workspacePath) return { success: false, output: 'No workspace' }
    const result = await ipc<{ success: boolean; output: string }>('git:pull', { dirPath: workspacePath })
    await get().checkGitStatus()
    return result
  },

  gitCommit: async (message: string) => {
    const { workspacePath } = get()
    if (!workspacePath) return { success: false, output: 'No workspace' }
    const result = await ipc<{ success: boolean; output: string }>('git:commit', { dirPath: workspacePath, message })
    await get().checkGitStatus()
    return result
  },

  gitPush: async () => {
    const { workspacePath } = get()
    if (!workspacePath) return { success: false, output: 'No workspace' }
    const result = await ipc<{ success: boolean; output: string }>('git:push', { dirPath: workspacePath })
    await get().checkGitStatus()
    return result
  },

  setShowGitPanel: (show: boolean) => {
    set({ showGitPanel: show })
  },

  importPostman: async (dumpPath: string) => {
    const { workspacePath } = get()
    if (!workspacePath) throw new Error('No workspace selected')
    const result = await ipc<{
      projects: string[]
      environments: number
      requests: number
    }>('import:postman', {
      dumpPath,
      outputPath: workspacePath
    })
    await get().loadProjects()
    return result
  },

  importPostmanCollection: async (filePath: string, projectPath: string) => {
    const result = await ipc<{
      collectionPath: string
      collectionName: string
      merged: boolean
      added: number
      updated: number
    }>('import:postman-collection', { filePath, projectPath })

    // If the user imported into the currently active project, refresh the tree
    if (get().activeProjectPath === projectPath) {
      await get().loadProjectTree()
    }
    return result
  }
}))
