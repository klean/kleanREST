import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GitFileStatus } from '../../shared/types/git'

const execFileAsync = promisify(execFile)

async function runGit(args: string[], cwd: string, timeout = 30000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout })
  return stdout.trim()
}

export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--is-inside-work-tree'], dirPath)
    return true
  } catch {
    return false
  }
}

export async function getBranchName(dirPath: string): Promise<string | null> {
  try {
    return await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dirPath)
  } catch {
    return null
  }
}

export async function gitFetch(dirPath: string): Promise<void> {
  try {
    await runGit(['fetch', '--all', '--prune'], dirPath, 30000)
  } catch {
    // Fetch failures are non-fatal
  }
}

export async function getAheadBehind(dirPath: string): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await runGit(
      ['rev-list', '--count', '--left-right', '@{upstream}...HEAD'],
      dirPath
    )
    const parts = output.split(/\s+/)
    return {
      behind: parseInt(parts[0], 10) || 0,
      ahead: parseInt(parts[1], 10) || 0
    }
  } catch {
    return { ahead: 0, behind: 0 }
  }
}

export async function gitPull(dirPath: string): Promise<{ success: boolean; output: string }> {
  try {
    const output = await runGit(['pull', '--ff-only'], dirPath, 60000)
    return { success: true, output }
  } catch (err) {
    const error = err as Error & { stderr?: string }
    return { success: false, output: error.stderr || error.message || String(err) }
  }
}

export async function gitStatus(dirPath: string): Promise<GitFileStatus[]> {
  try {
    const output = await runGit(['status', '--porcelain=v1'], dirPath)
    if (!output) return []

    return output.split('\n').filter(Boolean).map(line => {
      const indexStatus = line[0]
      const workStatus = line[1]
      const filePath = line.substring(3).trim()

      let status: GitFileStatus['status'] = 'modified'
      let staged = false

      if (indexStatus === '?' && workStatus === '?') {
        status = 'untracked'
      } else if (indexStatus === 'A') {
        status = 'added'
        staged = true
      } else if (indexStatus === 'D' || workStatus === 'D') {
        status = 'deleted'
        staged = indexStatus === 'D'
      } else if (indexStatus === 'R') {
        status = 'renamed'
        staged = true
      } else if (indexStatus === 'M') {
        status = 'modified'
        staged = true
      } else if (workStatus === 'M') {
        status = 'modified'
        staged = false
      }

      return { path: filePath, status, staged }
    })
  } catch {
    return []
  }
}

export async function gitCommit(
  dirPath: string,
  message: string
): Promise<{ success: boolean; output: string }> {
  try {
    // Never stage kleanREST's internal dir — it holds the split-out secret
    // store and request history. It's normally covered by the per-project
    // .gitignore, but excluding it here means a missing or edited .gitignore
    // can't lead to secrets being committed.
    await runGit(
      ['add', '-A', '--', '.', ':(exclude,glob)**/.kleanrest/**'],
      dirPath
    )

    // Belt-and-suspenders for the case where a secret file was already tracked
    // (staged before this guard existed): refuse to commit if any staged path
    // lives under a .kleanrest/secrets directory.
    const staged = await runGit(['diff', '--cached', '--name-only'], dirPath)
    const leaked = staged
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l.replace(/\\/g, '/').includes('.kleanrest/secrets/'))
    if (leaked.length > 0) {
      return {
        success: false,
        output:
          'Refusing to commit: secret files are tracked by git:\n' +
          leaked.join('\n') +
          '\n\nRun `git rm --cached` on these files and ensure .kleanrest/ is gitignored.'
      }
    }

    const output = await runGit(['commit', '-m', message], dirPath, 60000)
    return { success: true, output }
  } catch (err) {
    const error = err as Error & { stderr?: string }
    return { success: false, output: error.stderr || error.message || String(err) }
  }
}

export async function gitPush(dirPath: string): Promise<{ success: boolean; output: string }> {
  try {
    const output = await runGit(['push'], dirPath, 60000)
    return { success: true, output }
  } catch (err) {
    const error = err as Error & { stderr?: string }
    return { success: false, output: error.stderr || error.message || String(err) }
  }
}
