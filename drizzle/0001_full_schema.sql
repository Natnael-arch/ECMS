-- ECMS integration schema: extends projects and adds module tables.
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consultant text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor text;

CREATE TABLE IF NOT EXISTS cost_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  budget numeric(12,2) NOT NULL DEFAULT 0,
  actual numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (name, project_id)
);

CREATE TABLE IF NOT EXISTS cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  cost_code_id uuid NOT NULL REFERENCES cost_codes(id),
  amount numeric(14,2) NOT NULL,
  description text,
  logged_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  unit text NOT NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0,
  capacity numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Good',
  UNIQUE (name, project_id)
);

CREATE TABLE IF NOT EXISTS material_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES materials(id),
  qty numeric(12,2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  number text NOT NULL,
  title text NOT NULL,
  revision text NOT NULL,
  issue_date text NOT NULL,
  status text NOT NULL DEFAULT 'current',
  UNIQUE (number, revision)
);

CREATE TABLE IF NOT EXISTS milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming',
  target_date text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (project_id, label)
);

CREATE TABLE IF NOT EXISTS schedule_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  start_month text NOT NULL,
  end_month text NOT NULL,
  actual_start text,
  actual_end text,
  progress integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS progress_curve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  planned numeric(6,2) NOT NULL DEFAULT 0,
  actual numeric(6,2)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'info',
  time text NOT NULL
);

CREATE TABLE IF NOT EXISTS progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  activity text NOT NULL,
  progress integer NOT NULL,
  workers integer NOT NULL,
  notes text,
  reported_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_codes_project_index ON cost_codes (project_id);
CREATE INDEX IF NOT EXISTS materials_project_index ON materials (project_id);
CREATE INDEX IF NOT EXISTS milestones_project_index ON milestones (project_id, sort_order);
CREATE INDEX IF NOT EXISTS schedule_activities_project_index ON schedule_activities (project_id, sort_order);
CREATE INDEX IF NOT EXISTS progress_reports_project_index ON progress_reports (project_id);
