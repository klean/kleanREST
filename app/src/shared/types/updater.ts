export type UpdaterStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; releaseNotes?: string; releaseDate?: string }
  | { kind: 'not-available'; version: string }
  | {
      kind: 'downloading'
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string }

export const UPDATER_STATUS_CHANNEL = 'updater:status'
