-- Morpheus auth on Neon (no Supabase Auth)
-- Run once on your Neon database (SQL Editor or psql).

CREATE TABLE IF NOT EXISTS morpheus_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_morpheus_users_email
  ON morpheus_users (lower(email));

-- Optional: ensure pgcrypto for gen_random_uuid on older PG
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;
