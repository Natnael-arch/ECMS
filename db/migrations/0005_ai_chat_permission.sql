-- Migration 0005: Add ai_chat.use permission and grant to project manager roles (employer_pm, contractor_pm)

SET search_path TO ecms, public;

INSERT INTO permissions (permission_key, description) VALUES
    ('ai_chat.use', 'Use the AI project assistant chat')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, 'ai_chat.use'
FROM roles r
WHERE r.tenant_id IS NULL AND r.role_key IN ('employer_pm', 'contractor_pm')
ON CONFLICT DO NOTHING;
