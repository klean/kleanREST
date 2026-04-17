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
  listAllCollections
} from '../project/loader'
import { saveHistory, listHistory, clearHistory, clearHistoryForRequest } from '../history/manager'
import { importPostmanDump, readPostmanEnvironments } from '../import/postman-importer'
import { getWorkspaces, addWorkspace, removeWorkspace, createWorkspace, getLastActiveWorkspace, setLastActiveWorkspace } from '../config/app-config'
import { isGitRepo, getBranchName, gitFetch, getAheadBehind, gitPull, gitStatus, gitCommit, gitPush } from '../git/git-operations'
import { checkForUpdates, downloadUpdate, quitAndInstall, getLastUpdaterStatus } from '../updater/auto-updater'

export function registerIpcHandlers(): void {
  // ── Request execution ────────────────────────────────────────────────────

  ipcMain.handle('request:send', async (_event, params) => {
    return executeRequest(params.request)
  })

  // ── Project operations ───────────────────────────────────────────────────

  ipcMain.handle('project:load', async (_event, params) => {
    return loadProject(params.projectPath)
  })

  ipcMain.handle('project:create', async (_event, params) => {
    return createProject(params.parentPath, params.name)
  })

  ipcMain.handle('project:list', async (_event, params) => {
    return listProjects(params.workspacePath)
  })

  ipcMain.handle('project:list-collections', async (_event, params) => {
    return listAllCollections(params.workspacePath)
  })

  // ── Collection operations ────────────────────────────────────────────────

  ipcMain.handle('collection:create', async (_event, params) => {
    return createCollection(params.projectPath, params.collectionPath, params.name)
  })

  ipcMain.handle('collection:delete', async (_event, params) => {
    return deleteCollection(params.collectionPath)
  })

  // ── Request file operations ──────────────────────────────────────────────

  ipcMain.handle('request:load', async (_event, params) => {
    return loadRequest(params.requestPath)
  })

  ipcMain.handle('request:save', async (_event, params) => {
    return saveRequest(params.requestPath, params.request)
  })

  ipcMain.handle('request:create', async (_event, params) => {
    return createRequest(params.collectionPath, params.name)
  })

  ipcMain.handle('request:delete', async (_event, params) => {
    return deleteRequest(params.requestPath)
  })

  ipcMain.handle('request:rename', async (_event, params) => {
    return renameRequest(params.requestPath, params.newName)
  })

  // ── Environment operations ───────────────────────────────────────────────

  ipcMain.handle('env:list', async (_event, params) => {
    return listEnvironments(params.projectPath)
  })

  ipcMain.handle('env:save', async (_event, params) => {
    return saveEnvironment(params.projectPath, params.environment)
  })

  ipcMain.handle('env:delete', async (_event, params) => {
    return deleteEnvironment(params.projectPath, params.envId)
  })

  // ── History ──────────────────────────────────────────────────────────────

  ipcMain.handle('history:list', async (_event, params) => {
    return listHistory(params.projectPath, params.limit, params.offset, params.requestId)
  })

  ipcMain.handle('history:save', async (_event, params) => {
    return saveHistory(params.projectPath, params.entry)
  })

  ipcMain.handle('history:clear', async (_event, params) => {
    return clearHistory(params.projectPath)
  })

  ipcMain.handle('history:clear-for-request', async (_event, params) => {
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

  // ── Import ───────────────────────────────────────────────────────────────

  ipcMain.handle('import:postman', async (_event, params) => {
    return importPostmanDump(params.dumpPath, params.outputPath)
  })

  ipcMain.handle('import:postman-environments', async (_event, params) => {
    return readPostmanEnvironments(params.dumpPath)
  })

  // ── Workspaces ────────────────────────────────────────────────────────

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
    return setLastActiveWorkspace(params.path)
  })

  // ── Updater ──────────────────────────────────────────────────────────

  ipcMain.handle('updater:check', async () => checkForUpdates())
  ipcMain.handle('updater:download', async () => downloadUpdate())
  ipcMain.handle('updater:install', async () => quitAndInstall())
  ipcMain.handle('updater:get-status', async () => getLastUpdaterStatus())

  // ── Git ──────────────────────────────────────────────────────────────

  ipcMain.handle('git:is-repo', async (_event, params) => isGitRepo(params.dirPath))
  ipcMain.handle('git:branch', async (_event, params) => getBranchName(params.dirPath))
  ipcMain.handle('git:fetch', async (_event, params) => gitFetch(params.dirPath))
  ipcMain.handle('git:ahead-behind', async (_event, params) => getAheadBehind(params.dirPath))
  ipcMain.handle('git:pull', async (_event, params) => gitPull(params.dirPath))
  ipcMain.handle('git:status', async (_event, params) => gitStatus(params.dirPath))
  ipcMain.handle('git:commit', async (_event, params) => gitCommit(params.dirPath, params.message))
  ipcMain.handle('git:push', async (_event, params) => gitPush(params.dirPath))
}
