export async function ipc<T>(channel: string, params?: unknown): Promise<T> {
  return window.electronAPI.invoke(channel, params) as Promise<T>
}
