import { useState, useCallback, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '@renderer/stores/app-store'
import { ipc } from '@renderer/lib/ipc'
import type { Environment, EnvironmentVariable } from '@shared/types/environment'
import { ENV_COLOR_PRESETS } from '@shared/types/environment'
interface ProjectCollections {
  projectName: string
  projectPath: string
  collections: { name: string; path: string }[]
}

export default function EnvironmentManager(): JSX.Element {
  const {
    activeProjectPath,
    workspacePath,
    environments,
    loadEnvironments,
    setShowEnvironmentManager
  } = useAppStore()

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    environments[0]?.id || null
  )
  const [editedEnv, setEditedEnv] = useState<Environment | null>(null)
  const [newEnvName, setNewEnvName] = useState('')
  const [showNewEnv, setShowNewEnv] = useState(false)

  // Postman import state
  const [showImport, setShowImport] = useState(false)
  const [importedEnvs, setImportedEnvs] = useState<Environment[]>([])
  const [envCollectionMap, setEnvCollectionMap] = useState<Record<string, string>>({})
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [allProjects, setAllProjects] = useState<ProjectCollections[]>([])

  // Load all projects and their collections when import view is shown
  useEffect(() => {
    if (showImport && workspacePath) {
      ipc<{ name: string; path: string; projectName: string }[]>('project:list-collections', { workspacePath })
        .then((collections) => {
          // Group by project
          const byProject = new Map<string, ProjectCollections>()
          for (const c of collections) {
            if (!byProject.has(c.projectName)) {
              // Derive project path: collection path is {project}/collections/{name}, so go up 2 levels
              const projectPath = c.path.replace(/[/\\]collections[/\\][^/\\]+$/, '')
              byProject.set(c.projectName, { projectName: c.projectName, projectPath, collections: [] })
            }
            byProject.get(c.projectName)!.collections.push({ name: c.name, path: c.path })
          }
          setAllProjects(Array.from(byProject.values()))
        })
        .catch(() => setAllProjects([]))
    }
  }, [showImport, workspacePath])
  const selectedEnv = environments.find((e) => e.id === selectedEnvId) || null

  useEffect(() => {
    if (selectedEnv) {
      setEditedEnv(structuredClone(selectedEnv))
    } else {
      setEditedEnv(null)
    }
  }, [selectedEnvId, selectedEnv])

  const handleCreateEnv = useCallback(async () => {
    if (!activeProjectPath || !newEnvName.trim()) return
    const newEnv: Environment = {
      schemaVersion: 1,
      id: uuid(),
      name: newEnvName.trim(),
      color: '#3b82f6',
      variables: []
    }
    await ipc('env:save', {
      projectPath: activeProjectPath,
      environment: newEnv
    })
    await loadEnvironments()
    setSelectedEnvId(newEnv.id)
    setNewEnvName('')
    setShowNewEnv(false)
  }, [activeProjectPath, newEnvName, loadEnvironments])

  const handleSaveEnv = useCallback(async () => {
    if (!activeProjectPath || !editedEnv) return
    await ipc('env:save', {
      projectPath: activeProjectPath,
      environment: editedEnv
    })
    await loadEnvironments()
  }, [activeProjectPath, editedEnv, loadEnvironments])

  const handleDeleteEnv = useCallback(async () => {
    if (!activeProjectPath || !selectedEnvId) return
    await ipc('env:delete', {
      projectPath: activeProjectPath,
      envId: selectedEnvId
    })
    await loadEnvironments()
    setSelectedEnvId(null)
  }, [activeProjectPath, selectedEnvId, loadEnvironments])

  const updateVariable = useCallback(
    (index: number, field: keyof EnvironmentVariable, value: string | boolean) => {
      if (!editedEnv) return
      const vars = [...editedEnv.variables]
      vars[index] = { ...vars[index], [field]: value }
      setEditedEnv({ ...editedEnv, variables: vars })
    },
    [editedEnv]
  )

  const addVariable = useCallback(() => {
    if (!editedEnv) return
    setEditedEnv({
      ...editedEnv,
      variables: [
        ...editedEnv.variables,
        { key: '', value: '', enabled: true, secret: false }
      ]
    })
  }, [editedEnv])

  const removeVariable = useCallback(
    (index: number) => {
      if (!editedEnv) return
      setEditedEnv({
        ...editedEnv,
        variables: editedEnv.variables.filter((_, i) => i !== index)
      })
    },
    [editedEnv]
  )

  // ── Postman import handlers ──────────────────────────────────────────────

  const handleSelectDump = useCallback(async () => {
    const selected = await ipc<string | null>('dialog:open-folder')
    if (!selected) return

    setImportLoading(true)
    setImportResult(null)
    try {
      const envs = await ipc<Environment[]>('import:postman-environments', { dumpPath: selected })
      if (envs.length === 0) {
        setImportResult('No environments found in the selected Postman dump.')
        setImportedEnvs([])
        return
      }
      setImportedEnvs(envs)
      // Pre-fill: default to first project
      const defaultProjectPath = allProjects[0]?.projectPath || ''
      const map: Record<string, string> = {}
      for (const env of envs) {
        map[env.id] = defaultProjectPath
      }
      setEnvCollectionMap(map)
    } catch (err) {
      setImportResult(`Error reading dump: ${err}`)
    } finally {
      setImportLoading(false)
    }
  }, [allProjects])

  const handleImportSelected = useCallback(async () => {
    setImportLoading(true)
    setImportResult(null)
    let imported = 0

    try {
      for (const env of importedEnvs) {
        const projectPath = envCollectionMap[env.id]
        if (!projectPath) continue
        await ipc('env:save', {
          projectPath,
          environment: { ...env, id: uuid() }
        })
        imported++
      }
      setImportResult(`Imported ${imported} environment${imported !== 1 ? 's' : ''} successfully.`)
      setImportedEnvs([])
      setEnvCollectionMap({})
      await loadEnvironments()
    } catch (err) {
      setImportResult(`Error importing: ${err}`)
    } finally {
      setImportLoading(false)
    }
  }, [importedEnvs, envCollectionMap, loadEnvironments])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowEnvironmentManager(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex h-[540px] w-[750px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-zinc-100">
              Manage Environments
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: environment list */}
            <div className="flex w-48 shrink-0 flex-col border-r border-zinc-700 bg-zinc-800/30">
              <div className="flex-1 overflow-y-auto p-1">
                {environments.map((env) => (
                  <button
                    key={env.id}
                    onClick={() => { setSelectedEnvId(env.id); setShowImport(false) }}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-left ${
                      env.id === selectedEnvId && !showImport
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: env.color }}
                    />
                    <span className="truncate">{env.name}</span>
                  </button>
                ))}

                {showNewEnv && (
                  <div className="mt-1 px-1">
                    <input
                      type="text"
                      value={newEnvName}
                      onChange={(e) => setNewEnvName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateEnv()
                        if (e.key === 'Escape') setShowNewEnv(false)
                      }}
                      placeholder="Environment name..."
                      autoFocus
                      className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-0.5 border-t border-zinc-700 p-1">
                <button
                  onClick={() => setShowNewEnv(true)}
                  className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  New Environment
                </button>
                <button
                  onClick={() => { setShowImport(true); setSelectedEnvId(null); setImportedEnvs([]); setImportResult(null) }}
                  className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                    showImport
                      ? 'bg-zinc-700 text-zinc-200'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import Postman
                </button>
              </div>
            </div>

            {/* Right panel */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {showImport ? (
                /* ── Postman import view ──────────────────────────────────── */
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="border-b border-zinc-700 px-4 py-3">
                    <h3 className="text-xs font-semibold text-zinc-200">Import Postman Environments</h3>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Select a Postman data dump folder. Then assign each environment to a project.
                      It will be available in all collections within that project.
                    </p>
                  </div>

                  {importedEnvs.length === 0 ? (
                    /* No environments loaded yet - show the folder picker */
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
                      <button
                        onClick={handleSelectDump}
                        disabled={importLoading}
                        className="rounded-md bg-zinc-700 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                      >
                        {importLoading ? 'Reading...' : 'Select Postman Dump Folder'}
                      </button>
                      {importResult && (
                        <p className="max-w-xs text-center text-[11px] text-zinc-500">{importResult}</p>
                      )}
                      {allProjects.length === 0 && (
                        <p className="text-[11px] text-amber-400">
                          No projects found. Create a project with collections first before importing.
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Environments loaded - show assignment UI */
                    <>
                      <div className="flex-1 overflow-y-auto p-3">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                          {importedEnvs.length} environment{importedEnvs.length !== 1 ? 's' : ''} found
                        </p>

                        <div className="space-y-1.5">
                          {importedEnvs.map((env) => (
                            <div
                              key={env.id}
                              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
                            >
                              {/* Environment info */}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-zinc-200">
                                  {env.name}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                  {env.variables.length} variable{env.variables.length !== 1 ? 's' : ''}
                                </p>
                              </div>

                              {/* Arrow */}
                              <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>

                              {/* Collection selector */}
                              <select
                                value={envCollectionMap[env.id] || ''}
                                onChange={(e) =>
                                  setEnvCollectionMap((prev) => ({
                                    ...prev,
                                    [env.id]: e.target.value
                                  }))
                                }
                                className="w-56 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500"
                              >
                                <option value="" disabled>
                                  Select project...
                                </option>
                                {allProjects.map((proj) => (
                                  <option key={proj.projectPath} value={proj.projectPath}>
                                    {proj.projectName} ({proj.collections.length} collection{proj.collections.length !== 1 ? 's' : ''})
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Import actions */}
                      <div className="flex items-center gap-2 border-t border-zinc-700 px-4 py-3">
                        {importResult && (
                          <p className={`flex-1 text-[11px] ${importResult.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                            {importResult}
                          </p>
                        )}
                        {!importResult && <div className="flex-1" />}
                        <button
                          onClick={() => { setImportedEnvs([]); setImportResult(null) }}
                          className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleImportSelected}
                          disabled={importLoading || importedEnvs.every(e => !envCollectionMap[e.id]) || allProjects.length === 0}
                          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {importLoading ? 'Importing...' : `Import ${importedEnvs.length} Environment${importedEnvs.length !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : editedEnv ? (
                /* ── Environment editor view ──────────────────────────────── */
                <>
                  {/* Env name and actions */}
                  <div className="flex items-center gap-2 border-b border-zinc-700 px-3 py-2">
                    <input
                      type="text"
                      value={editedEnv.name}
                      onChange={(e) =>
                        setEditedEnv({ ...editedEnv, name: e.target.value })
                      }
                      className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-600"
                    />
                    <button
                      onClick={handleSaveEnv}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleDeleteEnv}
                      className="rounded px-3 py-1 text-xs text-red-400 hover:bg-zinc-800"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Color picker */}
                  <div className="flex items-center gap-2 border-b border-zinc-700 px-3 py-2">
                    <span className="text-[11px] text-zinc-500">Color</span>
                    <div className="flex gap-1.5">
                      {ENV_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setEditedEnv({ ...editedEnv, color })}
                          className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                            editedEnv.color === color ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Variables table */}
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="text-xs">
                      {/* Header */}
                      <div className="flex items-center gap-1 border-b border-zinc-700 px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                        <div className="w-6" />
                        <div className="flex-1">Key</div>
                        <div className="flex-1">Value</div>
                        <div className="w-14">Secret</div>
                        <div className="w-6" />
                      </div>

                      {editedEnv.variables.map((variable, index) => (
                        <div
                          key={index}
                          className="group flex items-center gap-1 border-b border-zinc-800 px-1 py-0.5 hover:bg-zinc-800/50"
                        >
                          <div className="flex w-6 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={variable.enabled}
                              onChange={(e) =>
                                updateVariable(index, 'enabled', e.target.checked)
                              }
                              className="h-3 w-3 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                            />
                          </div>
                          <input
                            type="text"
                            value={variable.key}
                            onChange={(e) =>
                              updateVariable(index, 'key', e.target.value)
                            }
                            placeholder="Variable name"
                            className="flex-1 rounded bg-transparent px-1.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
                          />
                          <input
                            type={variable.secret ? 'password' : 'text'}
                            value={variable.value}
                            onChange={(e) =>
                              updateVariable(index, 'value', e.target.value)
                            }
                            placeholder="Value"
                            className="flex-1 rounded bg-transparent px-1.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:bg-zinc-800 focus:ring-1 focus:ring-zinc-600"
                          />
                          <div className="flex w-14 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={variable.secret}
                              onChange={(e) =>
                                updateVariable(index, 'secret', e.target.checked)
                              }
                              className="h-3 w-3 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                            />
                          </div>
                          <button
                            onClick={() => removeVariable(index)}
                            className="flex w-6 items-center justify-center rounded p-0.5 text-zinc-600 opacity-0 hover:bg-zinc-700 hover:text-zinc-400 group-hover:opacity-100"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={addVariable}
                        className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add variable
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* ── Empty state ──────────────────────────────────────────── */
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-zinc-600">
                    Select an environment or create a new one
                  </p>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
