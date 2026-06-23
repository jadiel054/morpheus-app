export type GithubDiagnosticRecord = {
  requestedRepository: string
  resolvedRepository: string
  owner: string
  repo: string
  branch: string
  path: string
  url: string
  endpoint: string
  status: number
  durationMs: number
  error: string | null
  timestamp: string
}

const MAX_GITHUB_DIAGNOSTICS = 200

class GithubDiagnosticsStore {
  private records: GithubDiagnosticRecord[] = []

  record(record: GithubDiagnosticRecord) {
    this.records.push(record)
    if (this.records.length > MAX_GITHUB_DIAGNOSTICS) {
      this.records.splice(0, this.records.length - MAX_GITHUB_DIAGNOSTICS)
    }
  }

  recordMany(records: GithubDiagnosticRecord[]) {
    records.forEach((record) => this.record(record))
  }

  list() {
    return [...this.records]
  }

  latest() {
    return this.records[this.records.length - 1] || null
  }

  clear() {
    this.records = []
  }
}

export const githubDiagnosticsStore = new GithubDiagnosticsStore()
