import { useCallback } from 'react'
import VariableInput from '@renderer/components/VariableInput'
import type { EnvironmentVariable } from '@shared/types/environment'

export interface KeyValueRow {
  key: string
  value: string
  enabled: boolean
  description?: string
}

interface KeyValueTableProps {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  showDescription?: boolean
  typeColumn?: boolean
  typeOptions?: string[]
  types?: string[]
  onTypeChange?: (index: number, type: string) => void
  placeholder?: { key?: string; value?: string; description?: string }
  variables?: EnvironmentVariable[]
}

export default function KeyValueTable({
  rows,
  onChange,
  showDescription = false,
  typeColumn = false,
  typeOptions = ['text', 'file'],
  types = [],
  onTypeChange,
  placeholder,
  variables = []
}: KeyValueTableProps): JSX.Element {
  const updateRow = useCallback(
    (index: number, field: keyof KeyValueRow, value: string | boolean) => {
      const updated = rows.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
      onChange(updated)
    },
    [rows, onChange]
  )

  const deleteRow = useCallback(
    (index: number) => {
      onChange(rows.filter((_, i) => i !== index))
    },
    [rows, onChange]
  )

  const addRow = useCallback(() => {
    onChange([...rows, { key: '', value: '', enabled: true, description: '' }])
  }, [rows, onChange])

  return (
    <div className="text-xs">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-zinc-700 px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <div className="w-6" />
        <div className="flex-1">Key</div>
        <div className="flex-1">Value</div>
        {typeColumn && <div className="w-16">Type</div>}
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-6" />
      </div>

      {/* Rows */}
      {rows.map((row, index) => (
        <div
          key={index}
          className="group flex items-center gap-1 border-b border-zinc-800 px-1 py-0.5 hover:bg-zinc-800/50"
        >
          {/* Checkbox */}
          <div className="flex w-6 items-center justify-center">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => updateRow(index, 'enabled', e.target.checked)}
              className="h-3 w-3 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
            />
          </div>

          {/* Key */}
          <div className="flex-1">
            <VariableInput
              value={row.key}
              onChange={(val) => updateRow(index, 'key', val)}
              variables={variables}
              placeholder={placeholder?.key || 'Key'}
              className="w-full rounded bg-transparent px-1.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          {/* Value */}
          <div className="flex-1">
            <VariableInput
              value={row.value}
              onChange={(val) => updateRow(index, 'value', val)}
              variables={variables}
              placeholder={placeholder?.value || 'Value'}
              className="w-full rounded bg-transparent px-1.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
            />
          </div>

          {/* Type column */}
          {typeColumn && (
            <select
              value={types[index] || typeOptions[0]}
              onChange={(e) => onTypeChange?.(index, e.target.value)}
              className="w-16 rounded border-none bg-zinc-800 px-1 py-1 text-xs text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600"
            >
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {/* Description */}
          {showDescription && (
            <input
              type="text"
              value={row.description || ''}
              onChange={(e) => updateRow(index, 'description', e.target.value)}
              placeholder={placeholder?.description || 'Description'}
              className="flex-1 rounded bg-transparent px-1.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
            />
          )}

          {/* Delete button */}
          <button
            onClick={() => deleteRow(index)}
            className="flex w-6 items-center justify-center rounded p-0.5 text-zinc-600 opacity-0 hover:bg-zinc-700 hover:text-zinc-400 group-hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add row */}
      <button
        onClick={addRow}
        className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add row
      </button>
    </div>
  )
}
