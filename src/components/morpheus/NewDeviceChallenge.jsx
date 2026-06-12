export function NewDeviceChallenge({ deviceInfo, onTrust, onBlock }) {
  return (
    <div className="fixed inset-0 bg-dark-bg/95 z-50 flex items-center justify-center">
      <div className="bg-dark-card border border-dark-border rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg text-cyan font-bold mb-2">NOVO DISPOSITIVO DETECTADO</h2>
        <div className="text-xs space-y-1 opacity-60 mb-4"><p>Tipo: {deviceInfo?.label || 'Desconhecido'}</p><p>IP: {deviceInfo?.ip || 'N/A'}</p><p>Cidade: {deviceInfo?.city || 'N/A'}</p></div>
        <p className="text-xs opacity-50 mb-4">Um email de alerta foi enviado.</p>
        <div className="flex gap-3"><button onClick={onTrust} className="flex-1 py-2 bg-cyan/10 border border-cyan rounded text-cyan text-sm">CONFIAR</button><button onClick={onBlock} className="flex-1 py-2 bg-red-500/10 border border-red-500 rounded text-red-400 text-sm">BLOQUEAR</button></div>
      </div>
    </div>
  )
}
