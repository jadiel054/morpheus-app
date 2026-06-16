CREATE TABLE IF NOT EXISTS morpheus_plans (
  id UUID PRIMARY KEY,
  conversation_id TEXT,
  objetivo TEXT NOT NULL,
  etapas JSONB NOT NULL DEFAULT '[]',
  criterio_sucesso TEXT,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'concluido', 'falhou', 'cancelado')),
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_conversation ON morpheus_plans(conversation_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON morpheus_plans(status);

ALTER TABLE morpheus_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morpheus_plans_policy ON morpheus_plans;
CREATE POLICY morpheus_plans_policy ON morpheus_plans FOR ALL USING (true);
