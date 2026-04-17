import { useEffect, useState } from 'react'
import { ipc } from '@renderer/lib/ipc'
import type { UpdaterStatus } from '../../../shared/types/updater'
import { UPDATER_STATUS_CHANNEL } from '../../../shared/types/updater'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function UpdatePrompt(): JSX.Element | null {
  const [status, setStatus] = useState<UpdaterStatus>({ kind: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Pick up current status in case the event fired before mount
    void ipc<UpdaterStatus>('updater:get-status').then((s) => setStatus(s))

    const handler = (s: unknown): void => {
      setStatus(s as UpdaterStatus)
      setDismissed(false)
    }
    window.electronAPI.on(UPDATER_STATUS_CHANNEL, handler)
    return () => {
      window.electronAPI.off(UPDATER_STATUS_CHANNEL, handler)
    }
  }, [])

  // Hide for statuses the user shouldn't be bothered with
  if (dismissed) return null
  if (status.kind === 'idle' || status.kind === 'checking' || status.kind === 'not-available') {
    return null
  }

  const handleUpdate = async (): Promise<void> => {
    await ipc('updater:download')
  }

  const handleInstall = async (): Promise<void> => {
    await ipc('updater:install')
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-800 p-3 shadow-xl">
      {status.kind === 'available' && (
        <>
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Update available</div>
              <div className="text-xs text-zinc-400">Version {status.version}</div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Later
            </button>
            <button
              onClick={handleUpdate}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              Update now
            </button>
          </div>
        </>
      )}

      {status.kind === 'downloading' && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-100">Downloading update</div>
            <div className="text-xs text-zinc-400">{Math.round(status.percent)}%</div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${status.percent}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">
            {formatBytes(status.transferred)} / {formatBytes(status.total)}
            {status.bytesPerSecond > 0 && ` · ${formatBytes(status.bytesPerSecond)}/s`}
          </div>
        </>
      )}

      {status.kind === 'downloaded' && (
        <>
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Update ready</div>
              <div className="text-xs text-zinc-400">
                Version {status.version} will install on restart
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Later
            </button>
            <button
              onClick={handleInstall}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              Restart now
            </button>
          </div>
        </>
      )}

      {status.kind === 'error' && (
        <>
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-red-400">Update failed</div>
              <div className="mt-1 text-xs text-zinc-400 break-words">{status.message}</div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
