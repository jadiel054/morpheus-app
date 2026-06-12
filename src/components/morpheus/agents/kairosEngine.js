const TICK_MS = 30000; const IDLE_MS = 120000

export class KairosEngine {
  constructor() { this.timer = null; this.lastAction = Date.now(); this.running = false }
  start() { this.schedule(); console.log('[KAIROS] Engine iniciado') }
  stop() { if (this.timer) clearTimeout(this.timer); this.running = false }
  recordUserAction() { this.lastAction = Date.now() }
  schedule() { this.timer = setTimeout(() => this.tick(), TICK_MS) }
  async tick() { if (Date.now() - this.lastAction > IDLE_MS && !this.running) { this.running = true; console.log('[KAIROS] Tick autonomo'); this.running = false }; this.schedule() }
}

export const kairos = new KairosEngine()
