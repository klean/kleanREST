import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels } from '../shared/types/ipc'
import type { EventChannel } from '../shared/types/ipc-channels'
import { isInvokeChannel, isEventChannel } from '../shared/types/ipc-channels'

export interface ElectronAPI {
  invoke<K extends keyof IpcChannels>(
    channel: K,
    params: IpcChannels[K]['params']
  ): Promise<IpcChannels[K]['result']>
  on(channel: EventChannel, callback: (...args: unknown[]) => void): void
  off(channel: EventChannel, callback: (...args: unknown[]) => void): void
}

const wrappedCallbacks = new WeakMap<
  (...args: unknown[]) => void,
  (event: unknown, ...args: unknown[]) => void
>()

const api: ElectronAPI = {
  invoke: (channel, params) => {
    if (!isInvokeChannel(channel as string)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${String(channel)}`)) as never
    }
    return ipcRenderer.invoke(channel as string, params) as never
  },
  on: (channel, callback) => {
    if (!isEventChannel(channel)) return
    const wrapped = (_event: unknown, ...args: unknown[]): void => callback(...args)
    wrappedCallbacks.set(callback, wrapped)
    ipcRenderer.on(channel, wrapped)
  },
  off: (channel, callback) => {
    if (!isEventChannel(channel)) return
    const wrapped = wrappedCallbacks.get(callback)
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped)
      wrappedCallbacks.delete(callback)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
