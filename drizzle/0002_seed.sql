-- ECMS seed data. Idempotent: ON CONFLICT DO NOTHING / DO UPDATE.

-- Projects (upsert full profiles over the 0000 baseline rows)
INSERT INTO projects (code, name, client, status, contract_value, start_date, end_date, progress, pm, supervisor, consultant, type, contract_type, contractor) VALUES
  ('BCT', 'Bole Commercial Tower', 'Sunrise Developers PLC', 'On Track', 60000000, 'Jan 2025', 'Dec 2026', 72, 'Yonas Alemu', 'Tesfaye Girma', 'Addis Design Group', 'G+12 Commercial', 'Lump Sum', 'MEEKA Technologies PLC'),
  ('ARR', 'Adama Road Rehabilitation', 'Ethiopian Roads Authority', 'At Risk', 68000000, 'Mar 2025', 'Sep 2026', 48, 'Yonas Alemu', 'Tesfaye Girma', 'Unknown', 'Infrastructure', 'Unit Price', NULL),
  ('HIP', 'Hawassa Industrial Park', 'Industrial Parks Development Corp.', 'On Track', 20000000, 'Jun 2025', 'Mar 2027', 63, 'Yonas Alemu', 'Tesfaye Girma', 'Unknown', 'Industrial', 'Lump Sum', NULL)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  client = EXCLUDED.client,
  status = EXCLUDED.status,
  contract_value = EXCLUDED.contract_value,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  progress = EXCLUDED.progress,
  pm = EXCLUDED.pm,
  supervisor = EXCLUDED.supervisor,
  consultant = EXCLUDED.consultant,
  type = EXCLUDED.type,
  contract_type = EXCLUDED.contract_type,
  contractor = EXCLUDED.contractor;

-- Cost codes (Bole Commercial Tower)
INSERT INTO cost_codes (project_id, name, budget, actual)
SELECT id, 'Substructure', 8.5, 8.1 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Superstructure', 22, 18.5 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Masonry', 6.2, 3.8 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'MEP', 9.8, 1.2 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Finishing', 7.5, 0.4 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Preliminaries', 6, 4.2 FROM projects WHERE code = 'BCT'
ON CONFLICT (name, project_id) DO NOTHING;

-- Materials (Bole Commercial Tower)
INSERT INTO materials (project_id, name, unit, qty, capacity, status)
SELECT id, 'Ordinary Portland Cement', 'Bags', 42, 1000, 'Low' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Reinforcement bar Ø12', 'Tons', 8.5, 15.4, 'Good' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Reinforcement bar Ø16', 'Tons', 3.2, 10, 'Medium' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Concrete blocks 20cm', 'Pcs', 1840, 2500, 'Good' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'River sand', 'M³', 12, 66, 'Low' FROM projects WHERE code = 'BCT'
ON CONFLICT (name, project_id) DO NOTHING;

-- Documents (Bole Commercial Tower)
INSERT INTO documents (project_id, number, title, revision, issue_date, status)
SELECT id, 'BCT-STR-001', 'Structural typical floor plan', 'Rev.04', '12 Jul 2026', 'current' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'BCT-STR-001', 'Structural typical floor plan', 'Rev.03', '04 May 2026', 'superseded' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'BCT-ARC-004', 'Architectural elevations N/S', 'Rev.02', '01 Jun 2026', 'current' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'BCT-MEP-012', 'Electrical single line diagram', 'Rev.01', '18 Mar 2026', 'current' FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'BCT-STR-002', 'Foundation layout grid lines', 'Rev.01', '10 Jan 2025', 'superseded' FROM projects WHERE code = 'BCT'
ON CONFLICT (number, revision) DO NOTHING;

-- Milestones
INSERT INTO milestones (project_id, label, status, target_date, sort_order)
SELECT id, 'Foundation complete', 'done', NULL, 1 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Superstructure to 6F', 'done', NULL, 2 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Superstructure to 12F', 'in-progress', 'Oct 2026', 3 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'MEP rough-in', 'upcoming', 'Nov 2026', 4 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Finishing and handover', 'upcoming', 'Dec 2026', 5 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Mobilization', 'done', NULL, 1 FROM projects WHERE code = 'ARR'
UNION ALL SELECT id, 'Earthworks', 'done', NULL, 2 FROM projects WHERE code = 'ARR'
UNION ALL SELECT id, 'Asphalt paving', 'in-progress', 'Nov 2026', 3 FROM projects WHERE code = 'ARR'
UNION ALL SELECT id, 'Road furniture', 'upcoming', 'Dec 2026', 4 FROM projects WHERE code = 'ARR'
UNION ALL SELECT id, 'Handover', 'upcoming', 'Sep 2026', 5 FROM projects WHERE code = 'ARR'
UNION ALL SELECT id, 'Site handover', 'done', NULL, 1 FROM projects WHERE code = 'HIP'
UNION ALL SELECT id, 'Foundation works', 'done', NULL, 2 FROM projects WHERE code = 'HIP'
UNION ALL SELECT id, 'Steel structure erection', 'in-progress', 'Feb 2027', 3 FROM projects WHERE code = 'HIP'
UNION ALL SELECT id, 'Utility connections', 'upcoming', 'Jun 2026', 4 FROM projects WHERE code = 'HIP'
UNION ALL SELECT id, 'Commissioning', 'upcoming', 'Mar 2027', 5 FROM projects WHERE code = 'HIP'
ON CONFLICT (project_id, label) DO NOTHING;

-- Schedule activities (Bole Commercial Tower)
INSERT INTO schedule_activities (project_id, name, start_month, end_month, actual_start, actual_end, progress, sort_order)
SELECT id, 'Site preparation', 'Jan', 'Jan', 'Jan', 'Jan', 100, 1 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Excavation & earthwork', 'Feb', 'Mar', 'Feb', 'Mar', 100, 2 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Foundation works', 'Apr', 'Jun', 'Apr', 'Jul', 100, 3 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Superstructure', 'Jul', 'Oct', 'Aug', 'Oct', 45, 4 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Masonry & blockwork', 'Sep', 'Nov', 'Oct', 'Nov', 20, 5 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'MEP installation', 'Oct', 'Dec', NULL, NULL, 0, 6 FROM projects WHERE code = 'BCT'
UNION ALL SELECT id, 'Finishing works', 'Nov', 'Dec', NULL, NULL, 0, 7 FROM projects WHERE code = 'BCT'
ON CONFLICT (project_id, name) DO NOTHING;

-- S-Curve (cumulative progress by month)
INSERT INTO progress_curve (month, planned, actual) VALUES
  ('Jan', 2, 2), ('Feb', 5, 5), ('Mar', 12, 11), ('Apr', 22, 20), ('May', 35, 30),
  ('Jun', 48, 42), ('Jul', 60, 51), ('Aug', 70, 61), ('Sep', 80, NULL), ('Oct', 88, NULL),
  ('Nov', 95, NULL), ('Dec', 100, NULL)
ON CONFLICT (month) DO NOTHING;

-- Notifications
INSERT INTO notifications (text, type, time) VALUES
  ('Cost alert: Superstructure exceeds 80%', 'alert', '2h ago'),
  ('Material request: 12t Rebar Ø16 pending approval', 'info', '4h ago'),
  ('Document updated: BCT-STR-001 Rev.04 issued', 'success', '1d ago')
ON CONFLICT (text) DO NOTHING;
