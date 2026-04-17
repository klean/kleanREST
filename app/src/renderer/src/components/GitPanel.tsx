import { useState, useCallback, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAppStore } from '@renderer/stores/app-store'
import type { GitFileStatus } from '@shared/types/git'

const STATUS_ICONS: Record<GitFileStatus['status'], { label: string; color: string }> = {
  modified: { label: 'M', color: 'text-amber-400' },
  added: { label: 'A', color: 'text-green-400' },
  deleted: { label: 'D', color: 'text-red-400' },
  renamed: { label: 'R', color: 'text-blue-400' },
  untracked: { label: '?', color: 'text-zinc-400' }
}

export default function GitPanel(): JSX.Element {
  const { gitInfo, setShowGitPanel, gitPull, gitCommit, gitPush, checkGitStatus } = useAppStore()

  const [commitMsg, setCommitMsg] = useState('')
  const [output, setOutput] = useState<string | null>(null)
  const [outputType, setOutputType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    checkGitStatus()
  }, [checkGitStatus])

  const handlePull = useCallback(async () => {
    setLoading('pull')
    setOutput(null)
    const result = await gitPull()
    setOutput(result.output)
    setOutputType(result.success ? 'success' : 'error')
    setLoading(null)
  }, [gitPull])

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return
    setLoading('commit')
    setOutput(null)
    const result = await gitCommit(commitMsg.trim())
    setOutput(result.output)
    setOutputType(result.success ? 'success' : 'error')
    if (result.success) setCommitMsg('')
    setLoading(null)
  }, [commitMsg, gitCommit])

  const handlePush = useCallback(async () => {
    setLoading('push')
    setOutput(null)
    const result = await gitPush()
    setOutput(result.output)
    setOutputType(result.success ? 'success' : 'error')
    setLoading(null)
  }, [gitPush])

  const handleRefresh = useCallback(async () => {
    setLoading('refresh')
    await checkGitStatus()
    setLoading(null)
  }, [checkGitStatus])

  const changedFiles = gitInfo?.changedFiles || []

  return (
    <Dialog.Root open onOpenChange={(open) => !open && setShowGitPanel(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex h-[520px] w-[550px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Git</Dialog.Title>
              {gitInfo?.branch && (
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                  {gitInfo.branch}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefresh}
                disabled={loading === 'refresh'}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                title="Refresh"
              >
                <svg className={`h-4 w-4 ${loading === 'refresh' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <Dialog.Close className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>
          </div>

          {/* Sync status bar */}
          <div className="flex items-center gap-2 border-b border-zinc-700 px-4 py-2">
            {gitInfo && gitInfo.behind > 0 && (
              <button
                onClick={handlePull}
                disabled={!!loading}
                className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading === 'pull' ? 'Pulling...' : `Pull ${gitInfo.behind} change${gitInfo.behind !== 1 ? 's' : ''}`}
              </button>
            )}
            {gitInfo && gitInfo.ahead > 0 && (
              <button
                onClick={handlePush}
                disabled={!!loading}
                className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                {loading === 'push' ? 'Pushing...' : `Push ${gitInfo.ahead} commit${gitInfo.ahead !== 1 ? 's' : ''}`}
              </button>
            )}
            {gitInfo && gitInfo.ahead === 0 && gitInfo.behind === 0 && (
              <span className="text-[11px] text-zinc-500">Up to date with remote</span>
            )}
          </div>

          {/* Changed files */}
          <div className="flex-1 overflow-y-auto">
            {changedFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-600">No changes</div>
            ) : (
              <div className="p-1">
                <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  Changes ({changedFiles.length})
                </p>
                {changedFiles.map((file, idx) => {
                  const info = STATUS_ICONS[file.status]
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded px-2 py-0.5 text-xs hover:bg-zinc-800/50">
                      <span className={`w-4 text-center font-mono font-bold ${info.color}`}>{info.label}</span>
                      <span className="min-w-0 truncate text-zinc-300">{file.path}</span>
                      {file.staged && <span className="text-[9px] text-green-500">staged</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Commit section */}
          {changedFiles.length > 0 && (
            <div className="border-t border-zinc-700 p-3 space-y-2">
              <textarea
                value={commitMsg}
                onChange={e => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                className="h-16 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 p-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCommit}
                  disabled={!commitMsg.trim() || !!loading}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === 'commit' ? 'Committing...' : 'Commit All'}
                </button>
                <button
                  onClick={handlePush}
                  disabled={!!loading}
                  className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
                >
                  {loading === 'push' ? 'Pushing...' : 'Push'}
                </button>
              </div>
            </div>
          )}

          {/* Output */}
          {output && (
            <div className={`border-t border-zinc-700 p-3 ${outputType === 'error' ? 'bg-red-500/5' : 'bg-green-500/5'}`}>
              <pre className={`max-h-20 overflow-auto text-[11px] whitespace-pre-wrap ${outputType === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                {output}
              </pre>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
