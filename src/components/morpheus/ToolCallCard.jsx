import { useState } from 'react'
const ICONS = { github_list_repos: 'REPO', github_read_file: 'FILE', github_commit_file: 'COMMIT', github_create_pr: 'PR', vercel_list_deploys: 'DEPLOY', vercel_diagnose: 'DIAG', supabase_read: 'DB', supabase_write: 'SAVE', oracle_read: 'MEM', oracle_write: 'MEM', web_search: 'WEB', scan_url: 'URL', get_weather: 'WTHR', get_distance: 'MAP', calculate: 'CALC', telegram_send: 'TG', memory_save: 'SAVE', memory_search: 'FIND', sandbox_check: 'CHECK', send_email_alert: 'MAIL' }

export function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={'tool-card tool-card--' + (toolCall.status || 'running')} onClick={() => setExpanded(!expanded)}>
      <div className="tool-card-header"><span className="text-xs opacity-60">[{ICONS[toolCall.name] || 'TOOL'}]</span><code className="tool-name">{toolCall.name}</code>{toolCall.status === 'running' ? <div className="ldrs-orbit" /> : toolCall.status === 'done' ? <span className="text-green-400">OK</span> : <span className="text-red-400">FAIL</span>}<span className="text-xs opacity-30 ml-auto">{expanded ? 'MENOS' : 'MAIS'}</span></div>
      {expanded && <div className="tool-card-body">{toolCall.input && <div><span className="opacity-50">Input:</span><pre>{JSON.stringify(toolCall.input, null, 2)}</pre></div>}{toolCall.result && <div><span className="opacity-50">Resultado:</span><pre>{String(toolCall.result).slice(0, 500)}</pre></div>}</div>}
    </div>
  )
}
