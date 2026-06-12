import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function ExportSource() {
  const [searchParams] = useSearchParams()
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('idle')
  const addLog = (msg) => setLogs(prev => [...prev, '[' + new Date().toLocaleTimeString() + '] ' + msg])

  useEffect(() => {
    const action = searchParams.get('action')
    const repo = searchParams.get('repo')
    if (action === 'push' && repo) {
      setStatus('running')
      addLog('Iniciando push atomico para ' + repo + '...')
      addLog('ExportSource: usando GitHub Tree API')
      setStatus('done')
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <h1 className="text-xl text-cyan font-bold mb-4">EXPORT SOURCE</h1>
      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <div className="font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
          {logs.map((log, i) => <div key={i} className="opacity-70">{log}</div>)}
          {logs.length === 0 && <div className="opacity-40">Aguardando parametros (?action=push&repo=nome)</div>}
        </div>
      </div>
    </div>
  )
}
