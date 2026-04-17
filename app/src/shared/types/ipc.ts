import type { ProjectConfig, ProjectTreeNode, RequestDefinition, CollectionMeta } from './project'
import type { Environment } from './environment'
import type { HistoryEntry } from './history'
import type { ErrorInsight } from './error-insight'
import type { GitFileStatus } from './git'
import type { UpdaterStatus } from './updater'

export interface RequestResult {
  status: number
  statusText: string
  headers: { key: string; value: string }[]
  body: string
  size: number
  time: number
  error?: string
  errorInsights: ErrorInsight[]
}

export interface IpcChannels {
  // Request execution
  'request:send': {
    params: {
      request: {
        method: string
        url: string
        headers: { key: string; value: string }[]
        body: string | null
        bodyType: string
        formData?: { key: string; value: string; type: string }[]
        timeout: number
        followRedirects: boolean
        maxRedirects: number
        validateSSL: boolean
      }
    }
    result: RequestResult
  }

  // Project operations
  'project:load': {
    params: { projectPath: string }
    result: { config: ProjectConfig; tree: ProjectTreeNode[] }
  }
  'project:create': {
    params: { parentPath: string; name: string }
    result: { projectPath: string; config: ProjectConfig }
  }
  'project:list': {
    params: { workspacePath: string }
    result: { name: string; path: string }[]
  }
  'project:list-collections': {
    params: { workspacePath: string }
    result: { name: string; path: string; projectName: string }[]
  }
  'project:delete': {
    params: { projectPath: string }
    result: void
  }

  // Collection operations
  'collection:create': {
    params: { projectPath: string; collectionPath: string; name: string }
    result: CollectionMeta
  }
  'collection:delete': {
    params: { collectionPath: string }
    result: void
  }

  // Request file operations
  'request:load': {
    params: { requestPath: string }
    result: RequestDefinition
  }
  'request:save': {
    params: { requestPath: string; request: RequestDefinition }
    result: void
  }
  'request:create': {
    params: { collectionPath: string; name: string }
    result: { path: string; request: RequestDefinition }
  }
  'request:delete': {
    params: { requestPath: string }
    result: void
  }
  'request:rename': {
    params: { requestPath: string; newName: string }
    result: { newPath: string }
  }
  'node:move': {
    params: { sourcePath: string; destParentPath: string; targetIndex?: number }
    result: { newPath: string }
  }

  // Environment operations
  'env:list': {
    params: { projectPath: string }
    result: Environment[]
  }
  'env:save': {
    params: { projectPath: string; environment: Environment }
    result: void
  }
  'env:delete': {
    params: { projectPath: string; envId: string }
    result: void
  }

  // History
  'history:list': {
    params: { projectPath: string; limit: number; offset: number; requestId?: string }
    result: HistoryEntry[]
  }
  'history:save': {
    params: { projectPath: string; entry: HistoryEntry }
    result: void
  }
  'history:clear': {
    params: { projectPath: string }
    result: void
  }
  'history:clear-for-request': {
    params: { projectPath: string; requestId: string }
    result: number
  }

  // Dialogs
  'dialog:open-folder': {
    params: void
    result: string | null
  }
  'dialog:open-file': {
    params: { filters?: { name: string; extensions: string[] }[] } | void
    result: string | null
  }

  // Import
  'import:postman': {
    params: { dumpPath: string; outputPath: string }
    result: { projects: string[]; environments: number; requests: number }
  }
  'import:postman-environments': {
    params: { dumpPath: string }
    result: Environment[]
  }
  'import:postman-collection': {
    params: { filePath: string; projectPath: string }
    result: {
      collectionPath: string
      collectionName: string
      merged: boolean
      added: number
      updated: number
    }
  }

  // Workspaces
  'workspace:list': {
    params: void
    result: { path: string; name: string }[]
  }
  'workspace:add': {
    params: { path: string; name?: string }
    result: void
  }
  'workspace:remove': {
    params: { path: string }
    result: void
  }
  'workspace:create': {
    params: { parentPath: string; name: string }
    result: { path: string }
  }
  'workspace:get-last': {
    params: void
    result: string | null
  }
  'workspace:set-last': {
    params: { path: string }
    result: void
  }

  // Git
  'git:is-repo': {
    params: { dirPath: string }
    result: boolean
  }
  'git:branch': {
    params: { dirPath: string }
    result: string | null
  }
  'git:fetch': {
    params: { dirPath: string }
    result: void
  }
  'git:ahead-behind': {
    params: { dirPath: string }
    result: { ahead: number; behind: number }
  }
  'git:pull': {
    params: { dirPath: string }
    result: { success: boolean; output: string }
  }
  'git:status': {
    params: { dirPath: string }
    result: GitFileStatus[]
  }
  'git:commit': {
    params: { dirPath: string; message: string }
    result: { success: boolean; output: string }
  }
  'git:push': {
    params: { dirPath: string }
    result: { success: boolean; output: string }
  }

  // MCP
  'mcp:status': {
    params: void
    result: {
      enabled: boolean
      running: boolean
      url: string | null
      token: string | null
      disabledTools: string[]
      error: string | null
    }
  }
  'mcp:set-enabled': {
    params: { enabled: boolean }
    result: {
      enabled: boolean
      running: boolean
      url: string | null
      token: string | null
      disabledTools: string[]
      error: string | null
    }
  }
  'mcp:rotate-token': {
    params: void
    result: {
      enabled: boolean
      running: boolean
      url: string | null
      token: string | null
      disabledTools: string[]
      error: string | null
    }
  }
  'mcp:set-disabled-tools': {
    params: { disabledTools: string[] }
    result: {
      enabled: boolean
      running: boolean
      url: string | null
      token: string | null
      disabledTools: string[]
      error: string | null
    }
  }

  // Updater
  'updater:check': {
    params: void
    result: void
  }
  'updater:download': {
    params: void
    result: void
  }
  'updater:install': {
    params: void
    result: void
  }
  'updater:get-status': {
    params: void
    result: UpdaterStatus
  }
}
