import type { EnvironmentVariable } from '@shared/types/environment'

export interface Token {
  type: 'text' | 'var-valid' | 'var-invalid'
  content: string
}

export function tokenize(text: string, variables: EnvironmentVariable[]): Token[] {
  const tokens: Token[] = []
  const regex = /\{\{([^}]*)\}\}/g
  const enabledKeys = new Set(variables.filter(v => v.enabled).map(v => v.key))

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before the variable
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }

    const varName = match[1]
    const isValid = enabledKeys.has(varName)
    tokens.push({
      type: isValid ? 'var-valid' : 'var-invalid',
      content: match[0]
    })

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return tokens
}

/**
 * Check if cursor is inside a variable reference pattern for autocomplete.
 * Returns the partial variable name being typed, or null if not in a variable context.
 */
export function getVariableContext(text: string, cursorPosition: number): string | null {
  const before = text.slice(0, cursorPosition)
  const match = before.match(/\{\{([^}]*)$/)
  return match ? match[1] : null
}
