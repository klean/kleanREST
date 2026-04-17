/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    invoke: (channel: string, params?: unknown) => Promise<unknown>
  }
}
