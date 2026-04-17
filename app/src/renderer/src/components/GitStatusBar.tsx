import { useAppStore } from '@renderer/stores/app-store'

export default function GitStatusBar(): JSX.Element | null {
  const { gitInfo, setShowGitPanel } = useAppStore()

  if (!gitInfo || !gitInfo.isRepo) return null

  return (
    <button
      onClick={() => setShowGitPanel(true)}
      className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
    >
      {/* Branch icon */}
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 8V4m0 0L12 8m4-4l4 4M8 20v-4m0 4l-4-4m4 4l4-4M12 4v16" />
      </svg>
      <span>{gitInfo.branch || 'detached'}</span>

      {gitInfo.behind > 0 && (
        <span className="rounded bg-blue-500/20 px-1 text-[10px] text-blue-400" title={`${gitInfo.behind} behind`}>
          ↓{gitInfo.behind}
        </span>
      )}
      {gitInfo.ahead > 0 && (
        <span className="rounded bg-green-500/20 px-1 text-[10px] text-green-400" title={`${gitInfo.ahead} ahead`}>
          ↑{gitInfo.ahead}
        </span>
      )}
      {gitInfo.changeCount > 0 && (
        <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-400" title={`${gitInfo.changeCount} changes`}>
          ●{gitInfo.changeCount}
        </span>
      )}
    </button>
  )
}
