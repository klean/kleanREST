import { useCallback } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import * as Select from '@radix-ui/react-select'
import { useAppStore } from '@renderer/stores/app-store'
import KeyValueTable from '@renderer/components/KeyValueTable'
import type { KeyValueRow } from '@renderer/components/KeyValueTable'
import VariableInput from '@renderer/components/VariableInput'
import type {
  HttpMethod,
  RequestAuth,
  KeyValuePair,
  FormDataEntry
} from '@shared/types/project'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-blue-400',
  PUT: 'text-orange-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
  HEAD: 'text-zinc-400',
  OPTIONS: 'text-zinc-400'
}

export default function RequestEditor(): JSX.Element {
  const {
    openTabs,
    activeTabId,
    activeRequest,
    activeRequestDirty,
    isLoading,
    setActiveTab,
    closeTab,
    updateActiveRequest,
    saveActiveRequest,
    sendRequest,
    environments,
    activeEnvironmentId
  } = useAppStore()

  const activeEnvVars = environments.find(e => e.id === activeEnvironmentId)?.variables ?? []

  const handleSend = useCallback(async () => {
    if (activeRequestDirty) {
      await saveActiveRequest()
    }
    await sendRequest()
  }, [activeRequestDirty, saveActiveRequest, sendRequest])

  const handleMethodChange = useCallback(
    (method: string) => {
      updateActiveRequest({ method: method as HttpMethod })
    },
    [updateActiveRequest]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSend()
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveActiveRequest()
      }
    },
    [handleSend, saveActiveRequest]
  )

  if (!activeRequest) return <div />

  return (
    <div className="flex h-full flex-col overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-zinc-700 bg-zinc-800/50">
        <div className="flex flex-1 overflow-x-auto">
          {openTabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const methodColor = METHOD_COLORS[tab.method] || 'text-zinc-400'

            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center gap-1.5 border-r border-zinc-700 px-3 py-1.5 text-xs cursor-pointer select-none ${
                  isActive
                    ? 'bg-zinc-900 text-zinc-100'
                    : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className={`text-[10px] font-bold uppercase ${methodColor}`}>
                  {tab.method.substring(0, 3)}
                </span>
                <span className="max-w-[120px] truncate">{tab.name}</span>
                {tab.dirty && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  className="ml-1 rounded p-0.5 opacity-0 hover:bg-zinc-700 group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* URL bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-700 px-3 py-2">
        {/* Method dropdown */}
        <Select.Root
          value={activeRequest.method}
          onValueChange={handleMethodChange}
        >
          <Select.Trigger className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs font-bold uppercase focus:outline-none focus:ring-1 focus:ring-zinc-500">
            <Select.Value>
              <span className={METHOD_COLORS[activeRequest.method]}>
                {activeRequest.method}
              </span>
            </Select.Value>
            <Select.Icon>
              <svg className="h-3 w-3 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="rounded-md border border-zinc-700 bg-zinc-800 shadow-xl">
              <Select.Viewport className="p-1">
                {METHODS.map((m) => (
                  <Select.Item
                    key={m}
                    value={m}
                    className={`flex cursor-pointer items-center rounded px-2 py-1.5 text-xs font-bold uppercase outline-none hover:bg-zinc-700 ${METHOD_COLORS[m]}`}
                  >
                    <Select.ItemText>{m}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        {/* URL input */}
        <VariableInput
          value={activeRequest.url}
          onChange={(val) => updateActiveRequest({ url: val })}
          variables={activeEnvVars}
          placeholder="Enter request URL..."
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          onKeyDown={handleKeyDown}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isLoading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Request config tabs */}
      <Tabs.Root defaultValue="params" className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex shrink-0 border-b border-zinc-700 bg-zinc-800/30">
          {['params', 'headers', 'body', 'auth'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="border-b-2 border-transparent px-3 py-1.5 text-xs capitalize text-zinc-400 hover:text-zinc-200 data-[state=active]:border-blue-500 data-[state=active]:text-zinc-100"
            >
              {tab}
              {tab === 'params' && activeRequest.queryParams.filter((p) => p.enabled && p.key).length > 0 && (
                <span className="ml-1 text-[10px] text-zinc-500">
                  ({activeRequest.queryParams.filter((p) => p.enabled && p.key).length})
                </span>
              )}
              {tab === 'headers' && activeRequest.headers.filter((h) => h.enabled && h.key).length > 0 && (
                <span className="ml-1 text-[10px] text-zinc-500">
                  ({activeRequest.headers.filter((h) => h.enabled && h.key).length})
                </span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Params */}
          <Tabs.Content value="params" className="outline-none">
            <KeyValueTable
              rows={activeRequest.queryParams.map(kvToRow)}
              onChange={(rows) =>
                updateActiveRequest({ queryParams: rows.map(rowToKv) })
              }
              showDescription
              placeholder={{ key: 'Parameter', value: 'Value' }}
              variables={activeEnvVars}
            />
          </Tabs.Content>

          {/* Headers */}
          <Tabs.Content value="headers" className="outline-none">
            <KeyValueTable
              rows={activeRequest.headers.map(kvToRow)}
              onChange={(rows) =>
                updateActiveRequest({ headers: rows.map(rowToKv) })
              }
              showDescription
              placeholder={{ key: 'Header', value: 'Value' }}
              variables={activeEnvVars}
            />
          </Tabs.Content>

          {/* Body */}
          <Tabs.Content value="body" className="outline-none">
            <BodyEditor />
          </Tabs.Content>

          {/* Auth */}
          <Tabs.Content value="auth" className="outline-none">
            <AuthEditor />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  )
}

function BodyEditor(): JSX.Element {
  const { activeRequest, updateActiveRequest, environments, activeEnvironmentId } = useAppStore()
  const activeEnvVars = environments.find(e => e.id === activeEnvironmentId)?.variables ?? []
  if (!activeRequest) return <div />

  const body = activeRequest.body
  const mode = body.mode

  const setMode = (newMode: typeof mode): void => {
    updateActiveRequest({
      body: { ...body, mode: newMode }
    })
  }

  return (
    <div className="space-y-2">
      {/* Mode selector */}
      <div className="flex gap-1">
        {(['none', 'json', 'formdata', 'raw'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
              mode === m
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {m === 'formdata' ? 'Form Data' : m === 'none' ? 'None' : m}
          </button>
        ))}
      </div>

      {/* Body content */}
      {mode === 'none' && (
        <p className="py-4 text-center text-xs text-zinc-600">
          This request does not have a body
        </p>
      )}

      {mode === 'json' && (
        <VariableInput
          value={body.json}
          onChange={(val) => updateActiveRequest({ body: { ...body, json: val } })}
          variables={activeEnvVars}
          placeholder='{\n  "key": "value"\n}'
          className="h-48 w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          multiline
        />
      )}

      {mode === 'raw' && (
        <VariableInput
          value={body.raw}
          onChange={(val) => updateActiveRequest({ body: { ...body, raw: val } })}
          variables={activeEnvVars}
          placeholder="Enter raw body content..."
          className="h-48 w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 p-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          multiline
        />
      )}

      {mode === 'formdata' && (
        <KeyValueTable
          rows={body.formData.map((fd) => ({
            key: fd.key,
            value: fd.value,
            enabled: fd.enabled,
            description: ''
          }))}
          onChange={(rows) =>
            updateActiveRequest({
              body: {
                ...body,
                formData: rows.map((r, i) => ({
                  key: r.key,
                  value: r.value,
                  enabled: r.enabled,
                  type: (body.formData[i]?.type as 'text' | 'file') || 'text'
                }))
              }
            })
          }
          typeColumn
          types={body.formData.map((fd) => fd.type)}
          onTypeChange={(index, type) => {
            const updated = [...body.formData]
            if (updated[index]) {
              updated[index] = { ...updated[index], type: type as 'text' | 'file' }
              updateActiveRequest({ body: { ...body, formData: updated } })
            }
          }}
          placeholder={{ key: 'Field', value: 'Value' }}
          variables={activeEnvVars}
        />
      )}
    </div>
  )
}

function AuthEditor(): JSX.Element {
  const { activeRequest, updateActiveRequest, environments, activeEnvironmentId } = useAppStore()
  const activeEnvVars = environments.find(e => e.id === activeEnvironmentId)?.variables ?? []
  if (!activeRequest) return <div />

  const auth = activeRequest.auth

  const setAuth = (newAuth: RequestAuth): void => {
    updateActiveRequest({ auth: newAuth })
  }

  return (
    <div className="space-y-3">
      {/* Auth type selector */}
      <div className="flex gap-1">
        {(['none', 'bearer', 'basic', 'apikey'] as const).map((type) => (
          <button
            key={type}
            onClick={() => {
              if (type === 'none') setAuth({ type: 'none' })
              else if (type === 'bearer') setAuth({ type: 'bearer', token: '' })
              else if (type === 'basic')
                setAuth({ type: 'basic', username: '', password: '' })
              else if (type === 'apikey')
                setAuth({
                  type: 'apikey',
                  key: '',
                  value: '',
                  addTo: 'header'
                })
            }}
            className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
              auth.type === type
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            {type === 'apikey' ? 'API Key' : type === 'none' ? 'None' : type}
          </button>
        ))}
      </div>

      {/* Auth fields */}
      {auth.type === 'none' && (
        <p className="py-4 text-center text-xs text-zinc-600">
          No authentication
        </p>
      )}

      {auth.type === 'bearer' && (
        <div className="space-y-2">
          <label className="block text-[11px] text-zinc-500">Token</label>
          <VariableInput
            value={auth.token}
            onChange={(val) => setAuth({ type: 'bearer', token: val })}
            variables={activeEnvVars}
            placeholder="Enter bearer token..."
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] text-zinc-500">Username</label>
            <VariableInput
              value={auth.username}
              onChange={(val) => setAuth({ ...auth, username: val })}
              variables={activeEnvVars}
              placeholder="Username"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500">Password</label>
            <VariableInput
              value={auth.password}
              onChange={(val) => setAuth({ ...auth, password: val })}
              variables={activeEnvVars}
              placeholder="Password"
              type="password"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] text-zinc-500">Key</label>
            <VariableInput
              value={auth.key}
              onChange={(val) => setAuth({ ...auth, key: val })}
              variables={activeEnvVars}
              placeholder="Header/parameter name"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500">Value</label>
            <VariableInput
              value={auth.value}
              onChange={(val) => setAuth({ ...auth, value: val })}
              variables={activeEnvVars}
              placeholder="API key value"
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500">Add to</label>
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => setAuth({ ...auth, addTo: 'header' })}
                className={`rounded px-2 py-1 text-xs ${
                  auth.addTo === 'header'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Header
              </button>
              <button
                onClick={() => setAuth({ ...auth, addTo: 'query' })}
                className={`rounded px-2 py-1 text-xs ${
                  auth.addTo === 'query'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Query Param
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helpers to convert between KeyValuePair and KeyValueRow
function kvToRow(kv: KeyValuePair): KeyValueRow {
  return {
    key: kv.key,
    value: kv.value,
    enabled: kv.enabled,
    description: kv.description || ''
  }
}

function rowToKv(row: KeyValueRow): KeyValuePair {
  return {
    key: row.key,
    value: row.value,
    enabled: row.enabled,
    description: row.description || ''
  }
}
