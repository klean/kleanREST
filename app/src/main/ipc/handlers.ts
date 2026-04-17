import { ipcMain, dialog } from 'electron'
import { executeRequest } from '../http/client'
import {
  loadProject,
  createProject,
  listProjects,
  loadRequest,
  saveRequest,
  createRequest,
  deleteRequest,
  renameRequest,
  createCollection,
  deleteCollection,
  listEnvironments,
  saveEnvironment,
  deleteEnvironment,
  listAllCollections,
  deleteProject,
  moveNode
} from '../project/loader'
import { saveHistory, listHistory, clearHistory, clearHistoryForRequest } from '../history/manager'
import { importPostmanDump, readPostmanEnvironments, importPostmanCollection } from '../import/postman-importer'
import { getWorkspaces, addWorkspace, removeWorkspace, createWorkspace, getLastActiveWorkspace, setLastActiveWorkspace } from '../config/app-config'
import { isGitRepo, getBranchName, gitFetch, getAheadBehind, gitPull, gitStatus, gitCommit, gitPush } from '../git/git-operations'
import { checkForUpdates, downloadUpdate, quitAndInstall, getLastUpdaterStatus } from '../updater/auto-updater'
import { getMcpStatus, setMcpEnabled, rotateMcpToken, setMcpDisabledTools } from '../mcp/mcp-server'
import { assertPathInWorkspace, assertIsRegisteredWorkspace } from '../security/path-guard'

export function registerIpcHandlers(): void {
  // ── Request execution ────────────────────────────────────────────────────

  ipcMain.handle('request:send', async (_event, params) => {
    return executeRequest(params.request)
  })

  // ── Project operations ───────────────────────────────────────────────────

  ipcMain.handle('project:load', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return loadProject(params.projectPath)
  })

  ipcMain.handle('project:create', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.parentPath)
    return createProject(params.parentPath, params.name)
  })

  ipcMain.handle('project:list', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.workspacePath)
    return listProjects(params.workspacePath)
  })

  ipcMain.handle('project:list-collections', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.workspacePath)
    return listAllCollections(params.workspacePath)
  })

  ipcMain.handle('project:delete', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return deleteProject(params.projectPath)
  })

  // ── Collection operations ────────────────────────────────────────────────

  ipcMain.handle('collection:create', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    await assertPathInWorkspace(params.collectionPath)
    return createCollection(params.projectPath, params.collectionPath, params.name)
  })

  ipcMain.handle('collection:delete', async (_event, params) => {
    await assertPathInWorkspace(params.collectionPath)
    return deleteCollection(params.collectionPath)
  })

  // ── Request file operations ──────────────────────────────────────────────

  ipcMain.handle('request:load', async (_event, params) => {
    await assertPathInWorkspace(params.requestPath)
    return loadRequest(params.requestPath)
  })

  ipcMain.handle('request:save', async (_event, params) => {
    await assertPathInWorkspace(params.requestPath)
    return saveRequest(params.requestPath, params.request)
  })

  ipcMain.handle('request:create', async (_event, params) => {
    await assertPathInWorkspace(params.collectionPath)
    return createRequest(params.collectionPath, params.name)
  })

  ipcMain.handle('request:delete', async (_event, params) => {
    await assertPathInWorkspace(params.requestPath)
    return deleteRequest(params.requestPath)
  })

  ipcMain.handle('request:rename', async (_event, params) => {
    await assertPathInWorkspace(params.requestPath)
    return renameRequest(params.requestPath, params.newName)
  })

  ipcMain.handle('node:move', async (_event, params) => {
    // Source and destination can be in different workspaces; both must be inside one.
    await assertPathInWorkspace(params.sourcePath)
    await assertPathInWorkspace(params.destParentPath)
    return moveNode(params.sourcePath, params.destParentPath, params.targetIndex)
  })

  // ── Environment operations ───────────────────────────────────────────────

  ipcMain.handle('env:list', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return listEnvironments(params.projectPath)
  })

  ipcMain.handle('env:save', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return saveEnvironment(params.projectPath, params.environment)
  })

  ipcMain.handle('env:delete', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return deleteEnvironment(params.projectPath, params.envId)
  })

  // ── History ──────────────────────────────────────────────────────────────

  ipcMain.handle('history:list', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return listHistory(params.projectPath, params.limit, params.offset, params.requestId)
  })

  ipcMain.handle('history:save', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return saveHistory(params.projectPath, params.entry)
  })

  ipcMain.handle('history:clear', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return clearHistory(params.projectPath)
  })

  ipcMain.handle('history:clear-for-request', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return clearHistoryForRequest(params.projectPath, params.requestId)
  })

  // ── Dialogs ──────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (_event, params) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: params?.filters
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  // ── Import ───────────────────────────────────────────────────────────────

  // dumpPath / filePath come from user-initiated dialogs, so they may
  // legitimately be anywhere on disk. The write target (outputPath /
  // projectPath) must be inside a registered workspace.
  ipcMain.handle('import:postman', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.outputPath)
    return importPostmanDump(params.dumpPath, params.outputPath)
  })

  ipcMain.handle('import:postman-environments', async (_event, params) => {
    return readPostmanEnvironments(params.dumpPath)
  })

  ipcMain.handle('import:postman-collection', async (_event, params) => {
    await assertPathInWorkspace(params.projectPath)
    return importPostmanCollection(params.filePath, params.projectPath)
  })

  // ── Workspaces ────────────────────────────────────────────────────────

  // workspace:add, workspace:create, and workspace:remove all deal with paths
  // the user has explicitly picked or previously registered, so no guard applies here.
  ipcMain.handle('workspace:list', async () => {
    return getWorkspaces()
  })
  ipcMain.handle('workspace:add', async (_event, params) => {
    return addWorkspace(params.path, params.name)
  })
  ipcMain.handle('workspace:remove', async (_event, params) => {
    return removeWorkspace(params.path)
  })
  ipcMain.handle('workspace:create', async (_event, params) => {
    const wsPath = await createWorkspace(params.parentPath, params.name)
    return { path: wsPath }
  })
  ipcMain.handle('workspace:get-last', async () => {
    return getLastActiveWorkspace()
  })
  ipcMain.handle('workspace:set-last', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.path)
    return setLastActiveWorkspace(params.path)
  })

  // ── Updater ──────────────────────────────────────────────────────────

  ipcMain.handle('updater:check', async () => checkForUpdates())
  ipcMain.handle('updater:download', async () => downloadUpdate())
  ipcMain.handle('updater:install', async () => quitAndInstall())
  ipcMain.handle('updater:get-status', async () => getLastUpdaterStatus())

  // ── MCP ──────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:status', async () => getMcpStatus())
  ipcMain.handle('mcp:set-enabled', async (_event, params) => setMcpEnabled(params.enabled))
  ipcMain.handle('mcp:rotate-token', async () => rotateMcpToken())
  ipcMain.handle('mcp:set-disabled-tools', async (_event, params) =>
    setMcpDisabledTools(params.disabledTools)
  )

  // ── Git ──────────────────────────────────────────────────────────────

  ipcMain.handle('git:is-repo', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return isGitRepo(params.dirPath)
  })
  ipcMain.handle('git:branch', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return getBranchName(params.dirPath)
  })
  ipcMain.handle('git:fetch', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return gitFetch(params.dirPath)
  })
  ipcMain.handle('git:ahead-behind', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return getAheadBehind(params.dirPath)
  })
  ipcMain.handle('git:pull', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return gitPull(params.dirPath)
  })
  ipcMain.handle('git:status', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return gitStatus(params.dirPath)
  })
  ipcMain.handle('git:commit', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return gitCommit(params.dirPath, params.message)
  })
  ipcMain.handle('git:push', async (_event, params) => {
    await assertIsRegisteredWorkspace(params.dirPath)
    return gitPush(params.dirPath)
  })
}
