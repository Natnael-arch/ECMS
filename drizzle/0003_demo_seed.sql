-- Demo seed: cost codes for ARR + HIP, realistic cost entries, progress reports
-- Cleans up leftover smoke-test work item.

-- 1. Remove smoke-test artifact + its audit trail
DELETE FROM audit_logs WHERE entity_id = 'f92c1370-4d37-4f0f-8a39-a2a21b523ff7';
DELETE FROM work_items WHERE reference = 'VERIFY-1786615514';

-- 2. Cost codes for Adama Road Rehabilitation (ARR)
INSERT INTO cost_codes (id, project_id, name, budget, actual) VALUES
('11111111-1111-4111-8111-111111111111', '83a67b73-60be-49da-aeab-c7b417e48e6c', 'Asphalt Works', 60.00, 41.50),
('22222222-2222-4222-8222-222222222222', '83a67b73-60be-49da-aeab-c7b417e48e6c', 'Earthworks', 35.00, 22.80),
('33333333-3333-4333-8333-333333333333', '83a67b73-60be-49da-aeab-c7b417e48e6c', 'Drainage & Culverts', 20.00, 9.40),
('44444444-4444-4444-8444-444444444444', '83a67b73-60be-49da-aeab-c7b417e48e6c', 'Preliminaries', 12.00, 7.10);

-- 3. Cost codes for Hawassa Industrial Park (HIP)
INSERT INTO cost_codes (id, project_id, name, budget, actual) VALUES
('55555555-5555-4555-8555-555555555555', 'd2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Structural Steel', 45.00, 12.40),
('66666666-6666-4666-8666-666666666666', 'd2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Civil Works', 30.00, 8.20),
('77777777-7777-4777-8777-777777777777', 'd2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Utilities & Services', 18.00, 5.60),
('88888888-8888-4888-8888-888888888888', 'd2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Preliminaries', 10.00, 3.10);

-- 4. Cost entries — Bole Commercial Tower (BCT)
INSERT INTO cost_entries (project_id, cost_code_id, amount, description, logged_by, created_at) VALUES
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'f2a7e3b9-a6fd-428e-b9e7-ed20b9a48d2f', 0.15, 'Paint works — core & shell, level 6', 'supervisor@ecms.app', '2026-07-15 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'f2a7e3b9-a6fd-428e-b9e7-ed20b9a48d2f', 0.25, 'Ceiling finishing — main lobby', 'supervisor@ecms.app', '2026-08-04 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'ca19cbfb-f894-49a2-a88f-5391ce9c6146', 1.50, 'Block work — level 4 partitions', 'supervisor@ecms.app', '2026-02-12 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'ca19cbfb-f894-49a2-a88f-5391ce9c6146', 1.10, 'Block work — level 5 partitions', 'supervisor@ecms.app', '2026-04-20 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'ca19cbfb-f894-49a2-a88f-5391ce9c6146', 0.80, 'Plastering — lift core', 'supervisor@ecms.app', '2026-06-08 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'ca19cbfb-f894-49a2-a88f-5391ce9c6146', 0.40, 'Cement mortar supply', 'pm@ecms.app', '2026-08-11 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '0abb2e2b-9e92-4f49-898c-cdfee9984ad5', 0.60, 'HVAC ducting — basement', 'supervisor@ecms.app', '2026-03-18 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '0abb2e2b-9e92-4f49-898c-cdfee9984ad5', 0.35, 'Electrical conduits — level 2', 'supervisor@ecms.app', '2026-05-06 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '0abb2e2b-9e92-4f49-898c-cdfee9984ad5', 0.25, 'Fire alarm cabling — core', 'pm@ecms.app', '2026-07-22 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '583a149d-2a7e-4f58-8051-bea8ab088043', 1.60, 'Site establishment & hoarding', 'pm@ecms.app', '2026-01-10 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '583a149d-2a7e-4f58-8051-bea8ab088043', 1.40, 'Tower crane hire — Q2', 'pm@ecms.app', '2026-04-14 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '583a149d-2a7e-4f58-8051-bea8ab088043', 0.70, 'Site security & safety officer', 'pm@ecms.app', '2026-06-09 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '583a149d-2a7e-4f58-8051-bea8ab088043', 0.50, 'Scaffolding hire', 'pm@ecms.app', '2026-08-06 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '623a17b2-e7d5-4b37-9230-9796193a1967', 3.20, 'Bored pile works — pile caps', 'supervisor@ecms.app', '2026-01-20 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '623a17b2-e7d5-4b37-9230-9796193a1967', 2.60, 'Mass concrete — rafts', 'supervisor@ecms.app', '2026-02-17 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '623a17b2-e7d5-4b37-9230-9796193a1967', 1.50, 'Waterproofing — basement slab', 'pm@ecms.app', '2026-03-25 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', '623a17b2-e7d5-4b37-9230-9796193a1967', 0.80, 'Sub-base blinding', 'pm@ecms.app', '2026-04-22 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'bb93a66f-518a-474f-b68c-31ff5a6722e7', 6.40, 'Structural steel — core frame', 'supervisor@ecms.app', '2026-03-11 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'bb93a66f-518a-474f-b68c-31ff5a6722e7', 5.20, 'Slab concreting — levels 1-3', 'supervisor@ecms.app', '2026-05-19 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'bb93a66f-518a-474f-b68c-31ff5a6722e7', 2.10, 'Reinforcement steel supply', 'pm@ecms.app', '2026-06-17 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'bb93a66f-518a-474f-b68c-31ff5a6722e7', 3.40, 'Slab concreting — levels 4-6', 'supervisor@ecms.app', '2026-07-08 10:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'bb93a66f-518a-474f-b68c-31ff5a6722e7', 1.40, 'Formwork — level 7', 'supervisor@ecms.app', '2026-08-13 10:00:00+03');

-- 5. Cost entries — Adama Road Rehabilitation (ARR)
INSERT INTO cost_entries (project_id, cost_code_id, amount, description, logged_by, created_at) VALUES
('83a67b73-60be-49da-aeab-c7b417e48e6c', '11111111-1111-4111-8111-111111111111', 15.00, 'Asphalt paving — Adama town section', 'supervisor@ecms.app', '2026-03-12 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '11111111-1111-4111-8111-111111111111', 11.00, 'Asphalt paving — section 2', 'supervisor@ecms.app', '2026-05-21 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '11111111-1111-4111-8111-111111111111', 4.20, 'Bitumen supply', 'pm@ecms.app', '2026-06-15 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '11111111-1111-4111-8111-111111111111', 8.50, 'Base course compaction — section 3', 'supervisor@ecms.app', '2026-07-10 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '11111111-1111-4111-8111-111111111111', 2.80, 'Crusher-run aggregate', 'pm@ecms.app', '2026-08-07 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '22222222-2222-4222-8222-222222222222', 9.50, 'Earthworks — cut/fill embankment', 'supervisor@ecms.app', '2026-02-09 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '22222222-2222-4222-8222-222222222222', 7.00, 'Embankment — km 8-14', 'supervisor@ecms.app', '2026-04-16 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '22222222-2222-4222-8222-222222222222', 4.30, 'Subgrade preparation', 'pm@ecms.app', '2026-06-10 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '22222222-2222-4222-8222-222222222222', 2.00, 'Drainage earthworks', 'supervisor@ecms.app', '2026-08-05 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '33333333-3333-4333-8333-333333333333', 3.80, 'Box culvert — km 5', 'supervisor@ecms.app', '2026-03-19 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '33333333-3333-4333-8333-333333333333', 3.10, 'Pipe culverts supply', 'pm@ecms.app', '2026-05-07 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '33333333-3333-4333-8333-333333333333', 2.50, 'Side drains — section 1', 'supervisor@ecms.app', '2026-07-14 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '44444444-4444-4444-8444-444444444444', 2.90, 'Site camp & offices', 'pm@ecms.app', '2026-01-15 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '44444444-4444-4444-8444-444444444444', 2.40, 'Plant hire — graders', 'pm@ecms.app', '2026-04-08 10:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', '44444444-4444-4444-8444-444444444444', 1.80, 'Traffic management', 'pm@ecms.app', '2026-06-24 10:00:00+03');

-- 6. Cost entries — Hawassa Industrial Park (HIP)
INSERT INTO cost_entries (project_id, cost_code_id, amount, description, logged_by, created_at) VALUES
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '55555555-5555-4555-8555-555555555555', 5.00, 'Steel frame — Shed 1', 'supervisor@ecms.app', '2026-03-13 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '55555555-5555-4555-8555-555555555555', 3.60, 'Steel frame — Shed 2', 'supervisor@ecms.app', '2026-05-20 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '55555555-5555-4555-8555-555555555555', 2.40, 'Roof trusses supply', 'pm@ecms.app', '2026-07-16 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '55555555-5555-4555-8555-555555555555', 1.40, 'Bolts & fixings', 'pm@ecms.app', '2026-08-12 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '66666666-6666-4666-8666-666666666666', 3.20, 'Foundation works — Shed 1', 'supervisor@ecms.app', '2026-02-11 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '66666666-6666-4666-8666-666666666666', 2.60, 'Concrete floor slabs', 'supervisor@ecms.app', '2026-04-15 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '66666666-6666-4666-8666-666666666666', 1.50, 'Perimeter walls', 'supervisor@ecms.app', '2026-06-17 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '66666666-6666-4666-8666-666666666666', 0.90, 'Hardstand — yard', 'supervisor@ecms.app', '2026-08-06 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '77777777-7777-4777-8777-777777777777', 2.10, 'Water reticulation', 'supervisor@ecms.app', '2026-03-09 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '77777777-7777-4777-8777-777777777777', 1.80, 'Power distribution — site', 'pm@ecms.app', '2026-05-13 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '77777777-7777-4777-8777-777777777777', 1.00, 'Sewer lines', 'supervisor@ecms.app', '2026-07-09 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '77777777-7777-4777-8777-777777777777', 0.70, 'Street lighting', 'pm@ecms.app', '2026-08-13 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '88888888-8888-4888-8888-888888888888', 1.30, 'Site setup', 'pm@ecms.app', '2026-01-20 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '88888888-8888-4888-8888-888888888888', 1.00, 'Project management support', 'pm@ecms.app', '2026-05-27 10:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', '88888888-8888-4888-8888-888888888888', 0.80, 'Testing & commissioning prep', 'pm@ecms.app', '2026-07-29 10:00:00+03');

-- 7. Daily progress reports
INSERT INTO progress_reports (project_id, activity, progress, workers, notes, reported_by, created_at) VALUES
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'Structural Steel', 62, 18, 'Level 7 columns erected; steel arrived for level 8.', 'supervisor@ecms.app', '2026-08-11 17:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'Masonry', 45, 24, 'Level 5 partitions 60% complete.', 'supervisor@ecms.app', '2026-08-12 17:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'MEP', 18, 12, 'Ducting run to level 4 complete.', 'supervisor@ecms.app', '2026-08-13 17:00:00+03'),
('c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'Finishing', 12, 15, 'Paint prep started on level 6.', 'supervisor@ecms.app', '2026-08-13 17:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', 'Asphalt Works', 58, 30, 'Section 3 wearing course laid — 2.1 km today.', 'supervisor@ecms.app', '2026-08-12 17:00:00+03'),
('83a67b73-60be-49da-aeab-c7b417e48e6c', 'Earthworks', 74, 26, 'Embankment km 14 topped out.', 'supervisor@ecms.app', '2026-08-11 17:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Structural Steel', 30, 22, 'Shed 2 roof trusses being lifted.', 'supervisor@ecms.app', '2026-08-12 17:00:00+03'),
('d2544227-a715-4ef8-9c4a-9d4dda2d4411', 'Civil Works', 28, 19, 'Shed 1 floor slab curing.', 'supervisor@ecms.app', '2026-08-13 17:00:00+03');

-- 8. Audit log entries for the seeded charges
INSERT INTO audit_logs (entity_type, entity_id, action, actor, detail, created_at) VALUES
('cost_entries', 'c1fa6ef9-c0e8-495d-afc7-e12996ca33e3', 'create', 'pm@ecms.app', 'Seeded demo charges for Bole Commercial Tower.', '2026-08-13 18:00:00+03'),
('cost_entries', '83a67b73-60be-49da-aeab-c7b417e48e6c', 'create', 'pm@ecms.app', 'Seeded demo charges for Adama Road Rehabilitation.', '2026-08-13 18:00:00+03'),
('cost_entries', 'd2544227-a715-4ef8-9c4a-9d4dda2d4411', 'create', 'pm@ecms.app', 'Seeded demo charges for Hawassa Industrial Park.', '2026-08-13 18:00:00+03');
