export function routeToAgent(message) {
  if (!message) return null
  const t = message.toLowerCase()
  const agents = [
    { key: 'maps', name: 'Agente Maps', triggers: ['rota','distancia','endereco','localizacao','maps','trajeto'] },
    { key: 'webSearch', name: 'Agente Busca Web', triggers: ['pesquisar online','noticia','informacao atual','buscar na web'] },
    { key: 'fullstack', name: 'Agente Full-stack', triggers: ['arquitetura','projeto','deploy','app completo'] },
    { key: 'devWeb', name: 'Agente Dev Web', triggers: ['browser','nginx','cors','seo','http','dominio'] },
    { key: 'devMobile', name: 'Agente Dev Mobile', triggers: ['apk','flutter','react native','expo','android'] },
    { key: 'frontend', name: 'Agente Frontend', triggers: ['css','layout','tailwind','ui','ux','componente'] },
    { key: 'backend', name: 'Agente Backend', triggers: ['api','servidor','banco de dados','endpoint','express','supabase'] },
    { key: 'weather', name: 'Agente Clima', triggers: ['temperatura','chuva','previsao','meteorologia','clima'] },
    { key: 'analyst', name: 'Analista Estrategico', triggers: ['analisar repo','planejar','delegar zarith','estrategia'] },
  ]
  for (const a of agents) for (const tr of a.triggers) if (t.includes(tr)) return { key: a.key, name: a.name }
  return null
}
