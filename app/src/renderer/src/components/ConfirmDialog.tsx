import * as Dialog from '@radix-ui/react-dialog'
import { useConfirm } from '@renderer/lib/confirm'

export default function ConfirmDialog(): JSX.Element | null {
  const { open, options, answer } = useConfirm()

  if (!open || !options) return null

  const destructive = options.destructive ?? false

  return (
    <Dialog.Root open onOpenChange={(o) => !o && answer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          <div className="border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              {options.title}
            </Dialog.Title>
          </div>

          <div className="px-4 py-4">
            <Dialog.Description className="text-xs text-zinc-300 whitespace-pre-wrap">
              {options.message}
            </Dialog.Description>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-700 px-4 py-3">
            <button
              onClick={() => answer(false)}
              className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {options.cancelLabel || 'Cancel'}
            </button>
            <button
              onClick={() => answer(true)}
              autoFocus
              className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                destructive
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {options.confirmLabel || 'Confirm'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
