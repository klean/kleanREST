export interface Environment {
  schemaVersion: 1
  id: string
  name: string
  color: string  // hex color
  variables: EnvironmentVariable[]
}

export const ENV_COLOR_PRESETS = [
  '#ef4444', // red (production)
  '#f97316', // orange (staging)
  '#eab308', // yellow
  '#22c55e', // green (development)
  '#3b82f6', // blue (default)
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
]

export interface EnvironmentVariable {
  key: string
  value: string
  enabled: boolean
  secret: boolean
}

export function createDefaultEnvironment(name: string, id: string): Environment {
  return {
    schemaVersion: 1,
    id,
    name,
    color: '#3b82f6',
    variables: []
  }
}
