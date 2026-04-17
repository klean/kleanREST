/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    invoke: (channel: string, params?: unknown) => Promise<unknown>
    on: (channel: string, callback: (...args: unknown[]) => void) => void
    off: (channel: string, callback: (...args: unknown[]) => void) => void
  }
}
