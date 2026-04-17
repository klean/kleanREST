import type { IpcChannels } from '@shared/types/ipc'

export async function ipc<R>(
  channel: keyof IpcChannels,
  params?: unknown
): Promise<R> {
  return window.electronAPI.invoke(
    channel,
    params as IpcChannels[typeof channel]['params']
  ) as Promise<R>
}
