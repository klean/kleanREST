import { useState, useRef, useCallback, useMemo } from 'react'
import type { EnvironmentVariable } from '@shared/types/environment'
import { tokenize, getVariableContext } from '@renderer/lib/variable-tokenizer'
import VariableAutocomplete from '@renderer/components/VariableAutocomplete'

interface VariableInputProps {
  value: string
  onChange: (value: string) => void
  variables: EnvironmentVariable[]
  placeholder?: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
  multiline?: boolean
  type?: string
}

export default function VariableInput({
  value,
  onChange,
  variables,
  placeholder,
  className = '',
  onKeyDown,
  multiline = false,
  type
}: VariableInputProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const tokens = useMemo(() => tokenize(value, variables), [value, variables])

  // Determine if we have any variables to highlight
  const hasVariables = tokens.some(t => t.type !== 'text')

  const updateAutocomplete = useCallback(() => {
    const input = inputRef.current
    if (!input) return

    const cursorPos = input.selectionStart ?? 0
    const context = getVariableContext(value, cursorPos)

    if (context !== null && variables.length > 0) {
      // Calculate position
      const rect = input.getBoundingClientRect()

      // Use a measurement span to find cursor x position
      const measureSpan = document.createElement('span')
      measureSpan.style.cssText = `
        position: absolute; visibility: hidden; white-space: pre;
        font: ${getComputedStyle(input).font};
        letter-spacing: ${getComputedStyle(input).letterSpacing};
      `
      const textBeforeCursor = value.slice(0, cursorPos)
      measureSpan.textContent = textBeforeCursor
      document.body.appendChild(measureSpan)
      const textWidth = measureSpan.getBoundingClientRect().width
      document.body.removeChild(measureSpan)

      const paddingLeft = parseFloat(getComputedStyle(input).paddingLeft)
      const scrollLeft = input.scrollLeft || 0

      setAutocompletePos({
        top: rect.bottom + 2,
        left: Math.min(rect.left + paddingLeft + textWidth - scrollLeft, rect.right - 220)
      })
      setAutocompleteFilter(context)
      setShowAutocomplete(true)
      setSelectedIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [value, variables])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value)
      // Update autocomplete after state update
      setTimeout(updateAutocomplete, 0)
    },
    [onChange, updateAutocomplete]
  )

  const handleSelect = useCallback(
    (varName: string) => {
      const input = inputRef.current
      if (!input) return

      const cursorPos = input.selectionStart ?? 0
      const context = getVariableContext(value, cursorPos)
      if (context === null) return

      // Find where {{ starts
      const before = value.slice(0, cursorPos)
      const matchStart = before.lastIndexOf('{{')
      if (matchStart === -1) return

      // Replace from {{ to cursor with {{varName}}
      const newValue = value.slice(0, matchStart) + `{{${varName}}}` + value.slice(cursorPos)
      onChange(newValue)
      setShowAutocomplete(false)

      // Set cursor position after the inserted variable
      const newCursorPos = matchStart + varName.length + 4 // {{ + name + }}
      setTimeout(() => {
        input.setSelectionRange(newCursorPos, newCursorPos)
        input.focus()
      }, 0)
    },
    [value, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showAutocomplete) {
        const filtered = variables
          .filter(v => v.enabled && v.key.toLowerCase().includes(autocompleteFilter.toLowerCase()))
          .slice(0, 10)

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (filtered[selectedIndex]) {
            e.preventDefault()
            handleSelect(filtered[selectedIndex].key)
            return
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowAutocomplete(false)
          return
        }
      }

      onKeyDown?.(e)
    },
    [showAutocomplete, variables, autocompleteFilter, selectedIndex, handleSelect, onKeyDown]
  )

  const handleClick = useCallback(() => {
    updateAutocomplete()
  }, [updateAutocomplete])

  const handleBlur = useCallback(() => {
    // Delay to allow autocomplete click to fire
    setTimeout(() => setShowAutocomplete(false), 200)
  }, [])

  // Sync scroll between input and overlay
  const handleScroll = useCallback(() => {
    if (inputRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = inputRef.current.scrollTop
      overlayRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  }, [])

  // Common classes for both input and overlay to ensure matching
  const textClasses = 'text-xs font-mono'
  const sharedStyle = multiline
    ? 'whitespace-pre-wrap break-all'
    : 'whitespace-pre overflow-hidden'

  const inputClasses = `${className} ${textClasses}`

  return (
    <div ref={containerRef} className="relative">
      {/* Colored overlay - only render when there are variables to highlight */}
      {hasVariables && (
        <div
          ref={overlayRef}
          className={`pointer-events-none absolute inset-0 overflow-hidden ${textClasses} ${sharedStyle}`}
          style={{
            padding: multiline ? '0.75rem' : '0.375rem 0.625rem',
            lineHeight: multiline ? '1.5' : undefined
          }}
          aria-hidden
        >
          {tokens.map((token, i) => {
            if (token.type === 'var-valid') {
              return (
                <span key={i} className="text-green-400">
                  {token.content}
                </span>
              )
            }
            if (token.type === 'var-invalid') {
              return (
                <span key={i} className="text-red-400">
                  {token.content}
                </span>
              )
            }
            return (
              <span key={i} className="text-zinc-200">
                {token.content}
              </span>
            )
          })}
        </div>
      )}

      {/* Actual input */}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={handleBlur}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
          className={inputClasses}
          style={hasVariables ? { color: 'transparent', caretColor: '#e4e4e7' } : undefined}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type || 'text'}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={handleBlur}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
          className={inputClasses}
          style={hasVariables ? { color: 'transparent', caretColor: '#e4e4e7' } : undefined}
        />
      )}

      {/* Autocomplete dropdown */}
      {showAutocomplete && (
        <VariableAutocomplete
          variables={variables}
          filter={autocompleteFilter}
          position={autocompletePos}
          onSelect={handleSelect}
          onClose={() => setShowAutocomplete(false)}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
        />
      )}
    </div>
  )
}
