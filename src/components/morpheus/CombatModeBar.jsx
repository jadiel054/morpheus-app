export function CombatModeBar({ active }) {
  if (!active) return null
  return <div className="combat-mode-bar fixed top-0 left-0 right-0 z-50" />
}

export function playCombatBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 800; osc.type = 'square'; gain.gain.value = 0.1
    osc.start(); osc.stop(ctx.currentTime + 0.1)
  } catch {}
}

export function playFriendlyBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 600; osc.type = 'sine'; gain.gain.value = 0.05
    osc.start(); osc.stop(ctx.currentTime + 0.15)
  } catch {}
}
