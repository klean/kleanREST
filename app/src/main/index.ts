import { app, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'
import { initAutoUpdater } from './updater/auto-updater'
import { initMcp, shutdownMcp } from './mcp/mcp-server'

// The PNG next to the build/ dir — used for the window icon (taskbar / Linux).
// On Windows/macOS packaged builds the platform-specific icon from
// electron-builder is used instead; this icon option is mainly for
// development mode and Linux.
const WINDOW_ICON = join(__dirname, '../../build/icon.png')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'kleanREST',
    titleBarStyle: 'hiddenInset',
    icon: WINDOW_ICON,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
      // Invalid URL — ignore
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Auto-update is only meaningful in packaged builds.
  if (!is.dev) {
    initAutoUpdater(mainWindow)
  }
}

// A strict Content-Security-Policy for the renderer. Only applied to packaged
// builds — in dev, Vite serves the renderer over HTTP and needs inline scripts,
// eval, and a websocket for HMR, which a strict policy would break. The
// renderer never makes network requests directly (all HTTP goes through the
// main process over IPC), so connect-src can stay locked to 'self'.
function applyContentSecurityPolicy(): void {
  if (is.dev) return
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // Vite/Tailwind inject styles as inline <style> tags in the built output.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kleangroup.kleanrest')

  applyContentSecurityPolicy()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  // Start the MCP server if it's enabled in saved settings. No-op otherwise.
  void initMcp()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void shutdownMcp()
})
