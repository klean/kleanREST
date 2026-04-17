// Central registry of every MCP tool kleanREST can expose.
// Used by both the main-process MCP server (to decide which tools to register)
// and the renderer's Settings UI (to render the per-tool toggles).

export type McpToolCategory = 'read' | 'execute' | 'write'

export interface McpToolMeta {
  id: string
  label: string
  category: McpToolCategory
  description: string
}

export const MCP_TOOLS: McpToolMeta[] = [
  // ── Discovery & read ─────────────────────────────────────────────────────
  {
    id: 'list_workspaces',
    label: 'list_workspaces',
    category: 'read',
    description: 'List all registered workspaces.'
  },
  {
    id: 'list_projects',
    label: 'list_projects',
    category: 'read',
    description: 'List projects in a workspace.'
  },
  {
    id: 'list_collections',
    label: 'list_collections',
    category: 'read',
    description: 'List collections and sub-collections in a project.'
  },
  {
    id: 'list_requests',
    label: 'list_requests',
    category: 'read',
    description: 'List requests in a project, optionally filtered to a collection.'
  },
  {
    id: 'get_request',
    label: 'get_request',
    category: 'read',
    description: 'Load the full definition of a request.'
  },
  {
    id: 'list_environments',
    label: 'list_environments',
    category: 'read',
    description: 'List environments in a project (secret values blanked).'
  },
  {
    id: 'list_all_collections',
    label: 'list_all_collections',
    category: 'read',
    description: 'Top-level collections across every project in a workspace.'
  },
  {
    id: 'list_history',
    label: 'list_history',
    category: 'read',
    description: 'Recent request-history entries for a project.'
  },

  // ── Execute ──────────────────────────────────────────────────────────────
  {
    id: 'send_request',
    label: 'send_request',
    category: 'execute',
    description:
      'Execute a saved request with variable resolution. Appears live in the UI history.'
  },
  {
    id: 'send_ad_hoc_request',
    label: 'send_ad_hoc_request',
    category: 'execute',
    description: 'Fire a raw request without saving it first. Useful for exploration.'
  },

  // ── Write ────────────────────────────────────────────────────────────────
  {
    id: 'create_collection',
    label: 'create_collection',
    category: 'write',
    description: 'Create a new collection (top-level or nested).'
  },
  {
    id: 'delete_collection',
    label: 'delete_collection',
    category: 'write',
    description: 'Delete a collection and everything inside it.'
  },
  {
    id: 'create_request',
    label: 'create_request',
    category: 'write',
    description: 'Create a new saved request, optionally with initial fields.'
  },
  {
    id: 'update_request',
    label: 'update_request',
    category: 'write',
    description: 'Patch fields on an existing request.'
  },
  {
    id: 'delete_request',
    label: 'delete_request',
    category: 'write',
    description: 'Delete a saved request.'
  },
  {
    id: 'set_variable',
    label: 'set_variable',
    category: 'write',
    description:
      'Create or update a variable in an environment. Supports secret flag for tokens.'
  }
]

export const CATEGORY_LABELS: Record<McpToolCategory, string> = {
  read: 'Discovery & read',
  execute: 'Execute',
  write: 'Write'
}

export const CATEGORY_ORDER: McpToolCategory[] = ['read', 'execute', 'write']

export const ALL_MCP_TOOL_IDS: string[] = MCP_TOOLS.map((t) => t.id)
