import * as path from 'node:path'
import { getWorkspaces } from '../config/app-config'

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function assertPathInWorkspace(input: string): Promise<void> {
  const resolved = path.resolve(input)
  const workspaces = await getWorkspaces()
  for (const ws of workspaces) {
    const wsResolved = path.resolve(ws.path)
    if (isInside(resolved, wsResolved)) return
  }
  throw new Error(`Path is not inside any registered workspace: ${input}`)
}

export async function assertIsRegisteredWorkspace(input: string): Promise<void> {
  const resolved = path.resolve(input)
  const workspaces = await getWorkspaces()
  for (const ws of workspaces) {
    if (path.resolve(ws.path) === resolved) return
  }
  throw new Error(`Path is not a registered workspace: ${input}`)
}
