import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { getWorkspaces } from '../config/app-config'

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Resolve symlinks as far down the path as actually exists on disk, then
 * re-append the trailing not-yet-created segments. `fs.realpath` throws on
 * non-existent paths, but guarded paths are often write targets that don't
 * exist yet (a new request file, a collection about to be created), so we walk
 * up to the deepest existing ancestor and canonicalise that.
 *
 * Without this, a symlink planted inside a workspace (e.g. carried in via a
 * cloned git repo) could point outside the workspace and slip past the guard,
 * since `path.resolve` does not follow links.
 */
async function canonicalize(input: string): Promise<string> {
  let current = path.resolve(input)
  const trailing: string[] = []

  // Walk up until we hit a path that exists (or the filesystem root).
  while (true) {
    try {
      const real = await fs.realpath(current)
      return trailing.length > 0 ? path.join(real, ...trailing.reverse()) : real
    } catch {
      const parent = path.dirname(current)
      if (parent === current) {
        // Reached the root without finding an existing path — fall back to the
        // lexically resolved path.
        return path.resolve(input)
      }
      trailing.push(path.basename(current))
      current = parent
    }
  }
}

export async function assertPathInWorkspace(input: string): Promise<void> {
  const resolved = await canonicalize(input)
  const workspaces = await getWorkspaces()
  for (const ws of workspaces) {
    const wsResolved = await canonicalize(ws.path)
    if (isInside(resolved, wsResolved)) return
  }
  throw new Error(`Path is not inside any registered workspace: ${input}`)
}

export async function assertIsRegisteredWorkspace(input: string): Promise<void> {
  const resolved = await canonicalize(input)
  const workspaces = await getWorkspaces()
  for (const ws of workspaces) {
    if ((await canonicalize(ws.path)) === resolved) return
  }
  throw new Error(`Path is not a registered workspace: ${input}`)
}
