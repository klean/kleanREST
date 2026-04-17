export interface ProjectConfig {
  schemaVersion: 1
  id: string
  name: string
  description: string
  defaultEnvironment: string | null
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
}

export interface ProjectSettings {
  timeout: number
  followRedirects: boolean
  maxRedirects: number
  validateSSL: boolean
}

export interface CollectionMeta {
  schemaVersion: 1
  id: string
  name: string
  description: string
  auth: RequestAuth | null
  headers: KeyValuePair[]
  sortOrder: number
}

export interface RequestDefinition {
  schemaVersion: 1
  id: string
  name: string
  method: HttpMethod
  url: string
  queryParams: KeyValuePair[]
  headers: KeyValuePair[]
  auth: RequestAuth
  body: RequestBody
  settings: Partial<ProjectSettings>
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type RequestAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apikey'; key: string; value: string; addTo: 'header' | 'query' }
  | { type: 'inherit' }

export interface RequestBody {
  mode: 'none' | 'json' | 'formdata' | 'raw' | 'binary'
  json: string
  formData: FormDataEntry[]
  raw: string
  rawLanguage: string
  binary: string | null
}

export interface FormDataEntry {
  key: string
  value: string
  type: 'text' | 'file'
  enabled: boolean
}

export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean
  description?: string
}

export interface ProjectTreeNode {
  type: 'collection' | 'request' | 'folder'
  name: string
  path: string
  method?: HttpMethod
  children?: ProjectTreeNode[]
  sortOrder: number
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  timeout: 30000,
  followRedirects: true,
  maxRedirects: 10,
  validateSSL: true
}

export function createDefaultRequest(name: string, id: string): RequestDefinition {
  return {
    schemaVersion: 1,
    id,
    name,
    method: 'GET',
    url: '',
    queryParams: [],
    headers: [],
    auth: { type: 'none' },
    body: {
      mode: 'none',
      json: '{\n  \n}',
      formData: [],
      raw: '',
      rawLanguage: 'text',
      binary: null
    },
    settings: {},
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export function createDefaultCollection(name: string, id: string): CollectionMeta {
  return {
    schemaVersion: 1,
    id,
    name,
    description: '',
    auth: null,
    headers: [],
    sortOrder: 0
  }
}
