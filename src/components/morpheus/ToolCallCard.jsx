import { GitBranch, Database, Search, Cloud, Terminal, Shield, Brain, Globe, FileCode, Zap } from 'lucide-react'

const TOOL_ICONS = {
  gitOperator: GitBranch,
  databaseOracle: Database,
  vectorMemory: Brain,
  webSearch: Search,
  deployAnalyst: Cloud,
  sandboxRunner: Terminal,
  morpheusLogger: Shield,
  telegramSend: Globe,
  fileHandler: FileCode,
  default: Zap,
}

const TOOL_LABELS = {
  gitOperator: 'Git Operator',
  databaseOracle: 'Database Oracle',
  vectorMemory: 'Vector Memory',
  webSearch: 'Web Search',
  deployAnalyst: 'Deploy Analyst',
  sandboxRunner: 'Sandbox Runner',
  morpheusLogger: 'Logger',
  telegramSend: 'Telegram',
  fileHandler: 'File Handler',
}

export function ToolCallCard({ tool, status = 'pending', result, error, duration, collapsed = false }) {
  const Icon = TOOL_ICONS[tool] || TOOL_ICONS.default
  const label = TOOL_LABELS[tool] || tool || 'Tool'

  const statusClass = `tool-card--${status}`
  const statusDot = status === 'running' ? <span className="spinner" /> : status === 'done' ? <span className="deploy-status-dot deploy-status-dot--success" /> : status === 'failed' ? <span className="deploy-status-dot deploy-status-dot--failed" /> : <span className="deploy-status-dot" style={{ background: 'rgba(255,255,255,0.2)' }} />

  return (
    <div className={`tool-card ${statusClass}`}>
      <div className="tool-card-header">
        {statusDot}
        <Icon size={14} opacity={0.6} />
        <span style={{ flex: 1 }}>{label}</span>
        {duration && <span className="tool-name">{duration}ms</span>}
        {status === 'running' && <span className="tool-name">running...</span>}
      </div>
      {!collapsed && result && (
        <div className="tool-card-body">
          {typeof result === 'string' ? (
            <pre>{result.length > 500 ? result.slice(0, 500) + '...' : result}</pre>
          ) : (
            <pre>{JSON.stringify(result, null, 2).slice(0, 500)}</pre>
          )}
        </div>
      )}
      {!collapsed && error && (
        <div className="tool-card-body" style={{ color: '#ff4444' }}>
          {error}
        </div>
      )}
    </div>
  )
}
