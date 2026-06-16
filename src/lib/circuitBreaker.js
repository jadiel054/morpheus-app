/**
 * Circuit Breaker do Morpheus
 * Bloqueia tools com falha recorrente para evitar loops destrutivos
 */

const estados = new Map()

const CONFIG = {
  limiteFalhas: 3,
  timeoutRecuperacao: 60000,
  limiteSuccessosRecuperacao: 2,
}

function obterEstado(nomeTool) {
  if (!estados.has(nomeTool)) {
    estados.set(nomeTool, {
      estado: 'fechado',
      falhas: 0,
      sucessos: 0,
      ultimaFalha: null,
    })
  }

  return estados.get(nomeTool)
}

export function podeExecutar(nomeTool) {
  const circuito = obterEstado(nomeTool)
  const agora = Date.now()

  if (circuito.estado === 'fechado') return true

  if (circuito.estado === 'aberto') {
    if (circuito.ultimaFalha && (agora - circuito.ultimaFalha) > CONFIG.timeoutRecuperacao) {
      circuito.estado = 'meio-aberto'
      circuito.sucessos = 0
      console.log(`[CircuitBreaker] ${nomeTool}: testando recuperacao`)
      return true
    }

    const tempoRestante = circuito.ultimaFalha
      ? Math.ceil((CONFIG.timeoutRecuperacao - (agora - circuito.ultimaFalha)) / 1000)
      : Math.ceil(CONFIG.timeoutRecuperacao / 1000)

    throw new Error(`[CircuitBreaker] Tool "${nomeTool}" bloqueada por falhas consecutivas. Tente novamente em ${tempoRestante}s.`)
  }

  return true
}

export function registrarSucesso(nomeTool) {
  const circuito = obterEstado(nomeTool)

  if (circuito.estado === 'meio-aberto') {
    circuito.sucessos += 1

    if (circuito.sucessos >= CONFIG.limiteSuccessosRecuperacao) {
      circuito.estado = 'fechado'
      circuito.falhas = 0
      circuito.sucessos = 0
      circuito.ultimaFalha = null
      console.log(`[CircuitBreaker] ${nomeTool}: circuito fechado`)
    }

    return
  }

  circuito.falhas = 0
  circuito.sucessos = 0
  circuito.ultimaFalha = null
}

export function registrarFalha(nomeTool) {
  const circuito = obterEstado(nomeTool)
  circuito.falhas += 1
  circuito.sucessos = 0
  circuito.ultimaFalha = Date.now()

  if (circuito.falhas >= CONFIG.limiteFalhas) {
    circuito.estado = 'aberto'
    console.error(`[CircuitBreaker] ${nomeTool}: ABERTO apos ${circuito.falhas} falhas consecutivas`)
    return
  }

  if (circuito.estado === 'meio-aberto') {
    circuito.estado = 'aberto'
  }
}

export function resetarCircuito(nomeTool) {
  estados.delete(nomeTool)
  console.log(`[CircuitBreaker] ${nomeTool}: resetado manualmente`)
}

export function statusGeral() {
  const resultado = {}

  for (const [nome, estado] of estados.entries()) {
    resultado[nome] = { ...estado }
  }

  return resultado
}
