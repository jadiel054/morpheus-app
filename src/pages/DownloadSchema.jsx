import { useState } from 'react'

const SCHEMA_SQL = `-- MORPHEUS Database Schema -- Nebuchadnezzar v1.0
-- Supabase PostgreSQL

CREATE TABLE user_settings (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  user_name TEXT NOT NULL,
  user_email TEXT UNIQUE NOT NULL,
  user_birthday DATE,
  preferred_city TEXT,
  voice_enabled BOOLEAN DEFAULT true,
  memory_facts JSONB DEFAULT '[]',
  memory_summary TEXT,
  style_profile JSONB DEFAULT '{}',
  feedback_log JSONB DEFAULT '[]',
  message_count INTEGER DEFAULT 0,
  last_sync_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  last_message_at BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE system_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, key)
);

CREATE TABLE agent_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE morpheus_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('decision','error_solved','project','preference','code_pattern')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  importance INTEGER DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_morpheus_memory_trgm ON morpheus_memory USING gin(content gin_trgm_ops);
CREATE INDEX idx_morpheus_memory_user ON morpheus_memory(user_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_system_status_user_key ON system_status(user_id, key);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE morpheus_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own settings" ON user_settings FOR ALL USING (auth.uid() = id);
CREATE POLICY "users can manage own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users can manage own oracle" ON system_status FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users can manage own sessions" ON agent_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users can manage own memory" ON morpheus_memory FOR ALL USING (auth.uid() = user_id);
`

export default function DownloadSchema() {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => { await navigator.clipboard.writeText(SCHEMA_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const handleDownload = () => { const blob = new Blob([SCHEMA_SQL], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'morpheus_schema.sql'; a.click(); URL.revokeObjectURL(url) }

  return (
    <div className="min-h-screen bg-dark-bg p-6">
      <h1 className="text-xl text-cyan font-bold mb-4">DATABASE SCHEMA</h1>
      <div className="flex gap-4 mb-4">
        <button onClick={handleCopy} className="px-4 py-2 bg-dark-card border border-dark-border rounded text-sm text-cyan hover:border-cyan">{copied ? 'COPIADO' : 'COPIAR SQL'}</button>
        <button onClick={handleDownload} className="px-4 py-2 bg-dark-card border border-dark-border rounded text-sm text-cyan hover:border-cyan">DOWNLOAD .SQL</button>
      </div>
      <pre className="bg-dark-card border border-dark-border rounded-lg p-4 text-xs text-cyan/70 overflow-auto max-h-[70vh]">{SCHEMA_SQL}</pre>
    </div>
  )
}
