export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
}

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  ahead: number
  behind: number
  changeCount: number
  changedFiles: GitFileStatus[]
  fetchError: string | null
}
