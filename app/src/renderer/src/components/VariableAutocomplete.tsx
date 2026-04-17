import { useEffect, useRef } from 'react'
import type { EnvironmentVariable } from '@shared/types/environment'

interface Props {
  variables: EnvironmentVariable[]
  filter: string
  position: { top: number; left: number }
  onSelect: (varName: string) => void
  onClose: () => void
  selectedIndex: number
  onSelectedIndexChange: (index: number) => void
}

export default function VariableAutocomplete({
  variables,
  filter,
  position,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange
}: Props): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  const filtered = variables
    .filter(v => v.enabled && v.key.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 10)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={ref}
      className="fixed z-50 max-h-48 min-w-[200px] overflow-y-auto rounded-md border border-zinc-600 bg-zinc-800 p-1 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((v, i) => (
        <button
          key={v.key}
          className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-left text-xs outline-none ${
            i === selectedIndex
              ? 'bg-blue-600/30 text-zinc-100'
              : 'text-zinc-300 hover:bg-zinc-700'
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(v.key)
          }}
          onMouseEnter={() => onSelectedIndexChange(i)}
        >
          <span className="font-mono text-green-400">{`{{${v.key}}}`}</span>
          <span className="max-w-[120px] truncate text-zinc-500">
            {v.secret ? '••••••' : v.value}
          </span>
        </button>
      ))}
    </div>
  )
}
