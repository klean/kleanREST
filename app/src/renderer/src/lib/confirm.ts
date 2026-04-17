import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions | null
  resolve: ((value: boolean) => void) | null
  ask: (options: ConfirmOptions) => Promise<boolean>
  answer: (value: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,

  ask: (options) => {
    return new Promise<boolean>((resolve) => {
      set({ open: true, options, resolve })
    })
  },

  answer: (value) => {
    const { resolve } = get()
    set({ open: false, resolve: null })
    if (resolve) resolve(value)
  }
}))

export async function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirm.getState().ask(options)
}
