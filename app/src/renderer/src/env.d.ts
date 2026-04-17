/// <reference types="vite/client" />

import type { IpcChannels } from '@shared/types/ipc'
import type { EventChannel } from '@shared/types/ipc-channels'

declare global {
  interface Window {
    electronAPI: {
      invoke<K extends keyof IpcChannels>(
        channel: K,
        params: IpcChannels[K]['params']
      ): Promise<IpcChannels[K]['result']>
      on(channel: EventChannel, callback: (...args: unknown[]) => void): void
      off(channel: EventChannel, callback: (...args: unknown[]) => void): void
    }
  }
}

export {}
