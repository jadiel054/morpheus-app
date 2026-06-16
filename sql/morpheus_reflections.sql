CREATE TABLE IF NOT EXISTS morpheus_reflections (
  id UUID PRIMARY KEY,
  acao TEXT NOT NULL,
  resultado TEXT,
  sucesso BOOLEAN NOT NULL,
  melhorias JSONB DEFAULT '[]',
  licao TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE morpheus_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morpheus_reflections_policy ON morpheus_reflections;
CREATE POLICY morpheus_reflections_policy ON morpheus_reflections FOR ALL USING (true);
