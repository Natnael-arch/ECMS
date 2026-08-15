-- Add paid_by to ipc_certificates: records who marked an IPC as paid.
-- Segregation of duty: the user who records payment cannot be the certifier.

SET search_path TO ecms, public;

ALTER TABLE ipc_certificates
    ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES app_users (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
