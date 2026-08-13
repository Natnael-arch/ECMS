CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  client text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  section text NOT NULL,
  type text NOT NULL,
  reference text NOT NULL UNIQUE,
  title text NOT NULL,
  project text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending_review',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_items_workspace_index ON work_items (module, section, type, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO projects (code, name, client) VALUES
  ('BCT', 'Bole Commercial Tower', 'Sunrise Developers PLC'),
  ('ARR', 'Adama Road Rehabilitation', 'Ethiopian Roads Authority'),
  ('HIP', 'Hawassa Industrial Park', 'Industrial Parks Development Corp.')
ON CONFLICT (code) DO NOTHING;