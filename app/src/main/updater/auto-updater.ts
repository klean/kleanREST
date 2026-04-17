import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdaterStatus } from '../../shared/types/updater'
import { UPDATER_STATUS_CHANNEL } from '../../shared/types/updater'

let statusWindow: BrowserWindow | null = null
let lastStatus: UpdaterStatus = { kind: 'idle' }

function broadcast(status: UpdaterStatus): void {
  lastStatus = status
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.webContents.send(UPDATER_STATUS_CHANNEL, status)
  }
}

export function getLastUpdaterStatus(): UpdaterStatus {
  return lastStatus
}

export function initAutoUpdater(window: BrowserWindow): void {
  statusWindow = window
  window.once('closed', () => {
    if (statusWindow === window) statusWindow = null
  })

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    broadcast({ kind: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    broadcast({
      kind: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    broadcast({ kind: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      kind: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ kind: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    broadcast({ kind: 'error', message: err?.message || String(err) })
  })

  // Initial silent check on startup (after a short delay so the window has time to render)
  setTimeout(() => {
    void checkForUpdates()
  }, 5000)
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    broadcast({ kind: 'error', message: (err as Error)?.message || String(err) })
  }
}

export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    broadcast({ kind: 'error', message: (err as Error)?.message || String(err) })
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
