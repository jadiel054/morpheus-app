CREATE TABLE IF NOT EXISTS morpheus_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id TEXT,
  tipo TEXT,
  ferramenta TEXT,
  status TEXT,
  detalhes JSONB DEFAULT '{}',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_morpheus_logs_conversation ON morpheus_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_morpheus_logs_created ON morpheus_logs(criado_em);

ALTER TABLE morpheus_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morpheus_logs_policy ON morpheus_logs;
CREATE POLICY morpheus_logs_policy ON morpheus_logs FOR ALL USING (true);
