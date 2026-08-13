-- ECMS MVP PostgreSQL 16+ baseline schema
-- This file is intentionally opinionated and executable as one initial migration.
-- Split it into versioned migrations before production use.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS ecms;
SET search_path TO ecms, public;

-- ---------------------------------------------------------------------------
-- Enumerated states
-- ---------------------------------------------------------------------------

CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'revoked');
CREATE TYPE project_status AS ENUM ('draft', 'active', 'suspended', 'completed', 'archived');
CREATE TYPE party_role AS ENUM (
    'employer', 'engineer', 'consultant', 'contractor', 'subcontractor',
    'supplier', 'financier', 'government', 'other'
);
CREATE TYPE contract_status AS ENUM (
    'draft', 'signed', 'active', 'suspended', 'completed', 'terminated', 'archived'
);
CREATE TYPE obligation_status AS ENUM (
    'not_started', 'due', 'fulfilled', 'overdue', 'waived', 'cancelled'
);
CREATE TYPE security_instrument_type AS ENUM (
    'performance_security', 'advance_guarantee', 'retention_bond',
    'insurance', 'warranty', 'other'
);
CREATE TYPE security_instrument_status AS ENUM (
    'draft', 'active', 'expiring', 'expired', 'released', 'called', 'cancelled'
);
CREATE TYPE document_status AS ENUM ('draft', 'active', 'archived', 'cancelled');
CREATE TYPE document_revision_status AS ENUM (
    'draft', 'submitted', 'accepted', 'rejected', 'superseded', 'withdrawn'
);
CREATE TYPE transmittal_direction AS ENUM ('incoming', 'outgoing');
CREATE TYPE boq_version_status AS ENUM ('draft', 'under_review', 'approved', 'superseded', 'cancelled');
CREATE TYPE boq_item_type AS ENUM (
    'work', 'lump_sum', 'provisional_sum', 'daywork', 'contingency', 'tax', 'note'
);
CREATE TYPE variation_status AS ENUM (
    'draft', 'submitted', 'under_review', 'returned', 'approved',
    'rejected', 'incorporated', 'cancelled'
);
CREATE TYPE measurement_status AS ENUM (
    'draft', 'submitted', 'returned', 'verified', 'rejected', 'included', 'cancelled'
);
CREATE TYPE rfi_status AS ENUM ('draft', 'open', 'answered', 'closed', 'cancelled');
CREATE TYPE inspection_status AS ENUM (
    'draft', 'requested', 'scheduled', 'completed', 'cancelled'
);
CREATE TYPE inspection_result AS ENUM ('pending', 'accepted', 'accepted_with_comments', 'rejected', 'not_applicable');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'blocked', 'resolved', 'closed', 'cancelled');
CREATE TYPE issue_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
CREATE TYPE ipc_status AS ENUM (
    'draft', 'submitted', 'under_review', 'returned', 'recommended',
    'certified', 'paid', 'cancelled'
);
CREATE TYPE adjustment_kind AS ENUM (
    'price_adjustment', 'retention', 'advance_recovery', 'withholding_tax',
    'vat', 'materials_recovery', 'daywork', 'provisional_sum', 'penalty',
    'other_addition', 'other_deduction'
);
CREATE TYPE workflow_definition_status AS ENUM ('draft', 'active', 'retired');
CREATE TYPE workflow_instance_status AS ENUM ('active', 'completed', 'cancelled', 'failed');
CREATE TYPE workflow_task_status AS ENUM ('pending', 'active', 'completed', 'cancelled', 'skipped');
CREATE TYPE workflow_action_type AS ENUM (
    'start', 'submit', 'approve', 'recommend', 'certify',
    'return', 'reject', 'cancel', 'comment', 'delegate'
);
CREATE TYPE import_job_status AS ENUM (
    'uploaded', 'inspecting', 'mapping', 'validating', 'ready',
    'committing', 'completed', 'completed_with_exceptions', 'failed', 'cancelled'
);
CREATE TYPE import_row_status AS ENUM ('staged', 'valid', 'warning', 'error', 'committed', 'skipped');
CREATE TYPE exception_status AS ENUM ('open', 'assigned', 'resolved', 'accepted_risk', 'dismissed');
CREATE TYPE notification_status AS ENUM ('queued', 'sent', 'read', 'failed', 'cancelled');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');
CREATE TYPE supplier_status AS ENUM ('draft', 'pending_approval', 'approved', 'suspended', 'blacklisted');
CREATE TYPE purchase_requisition_status AS ENUM (
    'draft', 'submitted', 'returned', 'approved', 'rejected', 'ordered', 'cancelled'
);
CREATE TYPE purchase_order_status AS ENUM (
    'draft', 'approved', 'issued', 'partially_received', 'fully_received', 'closed', 'cancelled'
);
CREATE TYPE goods_receipt_status AS ENUM ('draft', 'submitted', 'returned', 'accepted', 'rejected', 'cancelled');
CREATE TYPE supplier_invoice_status AS ENUM (
    'draft', 'submitted', 'matching', 'exception', 'matched',
    'approved_for_payment', 'partially_paid', 'paid', 'rejected', 'cancelled'
);
CREATE TYPE match_status AS ENUM ('pending', 'passed', 'exception', 'rejected', 'superseded');
CREATE TYPE material_issue_status AS ENUM ('draft', 'submitted', 'approved', 'posted', 'returned', 'cancelled');
CREATE TYPE stock_count_status AS ENUM ('draft', 'counted', 'submitted', 'approved', 'posted', 'cancelled');
CREATE TYPE worker_status AS ENUM ('draft', 'active', 'suspended', 'terminated', 'archived');
CREATE TYPE timesheet_status AS ENUM ('draft', 'submitted', 'returned', 'approved', 'included_in_payroll', 'cancelled');
CREATE TYPE payroll_status AS ENUM ('draft', 'calculated', 'submitted', 'returned', 'approved', 'partially_paid', 'paid', 'cancelled');
CREATE TYPE ai_finding_status AS ENUM ('open', 'investigating', 'confirmed', 'dismissed', 'converted_to_issue');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := clock_timestamp();
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Identity, tenancy, roles, and project access
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,
    slug                text NOT NULL,
    default_currency    char(3) NOT NULL DEFAULT 'ETB',
    timezone            text NOT NULL DEFAULT 'Africa/Addis_Ababa',
    settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_tenants_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    CONSTRAINT ck_tenants_settings_object CHECK (jsonb_typeof(settings) = 'object')
);
CREATE UNIQUE INDEX uq_tenants_slug_ci ON tenants (lower(slug));

CREATE TABLE organizations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    legal_name          text NOT NULL,
    short_name          text,
    organization_type   party_role NOT NULL DEFAULT 'other',
    registration_number text,
    tax_number          text,
    email               text,
    phone               text,
    address             jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_organizations_address_object CHECK (jsonb_typeof(address) = 'object')
);
CREATE INDEX ix_organizations_tenant_type ON organizations (tenant_id, organization_type, legal_name);

CREATE TABLE app_users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_subject        text NOT NULL,
    email               text NOT NULL,
    display_name        text NOT NULL,
    mobile              text,
    locale              text NOT NULL DEFAULT 'en',
    is_active           boolean NOT NULL DEFAULT true,
    last_login_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX uq_app_users_auth_subject ON app_users (auth_subject);
CREATE UNIQUE INDEX uq_app_users_email_ci ON app_users (lower(email));

CREATE TABLE tenant_memberships (
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    user_id             uuid NOT NULL REFERENCES app_users(id),
    organization_id     uuid REFERENCES organizations(id),
    status              membership_status NOT NULL DEFAULT 'invited',
    invited_at          timestamptz NOT NULL DEFAULT now(),
    activated_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX ix_tenant_memberships_user_status ON tenant_memberships (user_id, status);

CREATE TABLE roles (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid REFERENCES tenants(id),
    role_key            text NOT NULL,
    name                text NOT NULL,
    description         text,
    is_system           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_roles_key CHECK (role_key ~ '^[a-z][a-z0-9_.-]{1,63}$')
);
CREATE UNIQUE INDEX uq_roles_system_key ON roles (role_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX uq_roles_tenant_key ON roles (tenant_id, role_key) WHERE tenant_id IS NOT NULL;

CREATE TABLE permissions (
    permission_key      text PRIMARY KEY,
    description         text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_permissions_key CHECK (permission_key ~ '^[a-z][a-z0-9_.-]{2,95}$')
);

CREATE TABLE role_permissions (
    role_id             uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key      text NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE tenant_member_roles (
    tenant_id           uuid NOT NULL,
    user_id             uuid NOT NULL,
    role_id             uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id, role_id),
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES tenant_memberships(tenant_id, user_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Projects, organizations, locations, and contracts
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    project_code        text NOT NULL,
    name                text NOT NULL,
    description         text,
    sector              text NOT NULL DEFAULT 'roads',
    delivery_method     text,
    status              project_status NOT NULL DEFAULT 'draft',
    country_code        char(2) NOT NULL DEFAULT 'ET',
    timezone            text NOT NULL DEFAULT 'Africa/Addis_Ababa',
    currency            char(3) NOT NULL DEFAULT 'ETB',
    start_chainage_mm   bigint,
    end_chainage_mm     bigint,
    planned_start_date  date,
    planned_finish_date date,
    actual_start_date   date,
    actual_finish_date  date,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_projects_chainage CHECK (
        start_chainage_mm IS NULL OR end_chainage_mm IS NULL OR end_chainage_mm >= start_chainage_mm
    ),
    CONSTRAINT ck_projects_planned_dates CHECK (
        planned_start_date IS NULL OR planned_finish_date IS NULL OR planned_finish_date >= planned_start_date
    ),
    CONSTRAINT ck_projects_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX uq_projects_tenant_code_ci ON projects (tenant_id, lower(project_code));
CREATE INDEX ix_projects_tenant_status ON projects (tenant_id, status, updated_at DESC);

CREATE TABLE project_organizations (
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    role                party_role NOT NULL,
    is_lead             boolean NOT NULL DEFAULT false,
    start_date          date,
    end_date            date,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, organization_id, role),
    CONSTRAINT ck_project_organizations_dates CHECK (
        start_date IS NULL OR end_date IS NULL OR end_date >= start_date
    )
);
CREATE INDEX ix_project_organizations_role ON project_organizations (project_id, role);

CREATE TABLE project_members (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES app_users(id),
    organization_id     uuid REFERENCES organizations(id),
    status              membership_status NOT NULL DEFAULT 'active',
    valid_from          date,
    valid_to            date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_project_members_user UNIQUE (project_id, user_id),
    CONSTRAINT ck_project_members_dates CHECK (
        valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from
    )
);
CREATE INDEX ix_project_members_user_status ON project_members (user_id, status, project_id);

CREATE TABLE project_member_roles (
    project_member_id   uuid NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
    role_id             uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_member_id, role_id)
);

CREATE TABLE locations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id           uuid REFERENCES locations(id),
    location_type       text NOT NULL,
    location_code       text NOT NULL,
    name                text NOT NULL,
    start_chainage_mm   bigint,
    end_chainage_mm     bigint,
    geometry            jsonb,
    sort_order          integer NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_locations_code UNIQUE (project_id, location_code),
    CONSTRAINT ck_locations_chainage CHECK (
        start_chainage_mm IS NULL OR end_chainage_mm IS NULL OR end_chainage_mm >= start_chainage_mm
    ),
    CONSTRAINT ck_locations_geometry CHECK (geometry IS NULL OR jsonb_typeof(geometry) = 'object')
);
CREATE INDEX ix_locations_project_parent ON locations (project_id, parent_id, sort_order);
CREATE INDEX ix_locations_project_chainage ON locations (project_id, start_chainage_mm, end_chainage_mm);

CREATE TABLE contracts (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id                      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_number                 text NOT NULL,
    title                           text NOT NULL,
    procurement_reference           text,
    contract_type                   text,
    status                          contract_status NOT NULL DEFAULT 'draft',
    currency                        char(3) NOT NULL DEFAULT 'ETB',
    signed_date                     date,
    effective_date                  date,
    commencement_date               date,
    planned_completion_date         date,
    actual_completion_date          date,
    time_for_completion_days        integer,
    defects_liability_days          integer,
    original_contract_amount        numeric(20,4) NOT NULL DEFAULT 0,
    revised_contract_amount         numeric(20,4) NOT NULL DEFAULT 0,
    vat_percent                     numeric(9,6) NOT NULL DEFAULT 0,
    retention_percent               numeric(9,6) NOT NULL DEFAULT 0,
    performance_security_percent    numeric(9,6) NOT NULL DEFAULT 0,
    advance_percent                 numeric(9,6) NOT NULL DEFAULT 0,
    price_adjustment_ceiling_percent numeric(9,6) NOT NULL DEFAULT 0,
    minimum_ipc_amount              numeric(20,4) NOT NULL DEFAULT 0,
    metadata                        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by                      uuid REFERENCES app_users(id),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    row_version                     bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_contracts_project_number UNIQUE (project_id, contract_number),
    CONSTRAINT ck_contracts_amounts CHECK (
        original_contract_amount >= 0 AND revised_contract_amount >= 0 AND minimum_ipc_amount >= 0
    ),
    CONSTRAINT ck_contracts_percentages CHECK (
        vat_percent BETWEEN 0 AND 100
        AND retention_percent BETWEEN 0 AND 100
        AND performance_security_percent BETWEEN 0 AND 100
        AND advance_percent BETWEEN 0 AND 100
        AND price_adjustment_ceiling_percent BETWEEN 0 AND 100
    ),
    CONSTRAINT ck_contracts_durations CHECK (
        (time_for_completion_days IS NULL OR time_for_completion_days >= 0)
        AND (defects_liability_days IS NULL OR defects_liability_days >= 0)
    ),
    CONSTRAINT ck_contracts_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_contracts_project_status ON contracts (project_id, status, updated_at DESC);

CREATE TABLE contract_parties (
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    role                party_role NOT NULL,
    representative_id   uuid REFERENCES app_users(id),
    is_primary          boolean NOT NULL DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contract_id, organization_id, role)
);
CREATE INDEX ix_contract_parties_role ON contract_parties (contract_id, role);

CREATE TABLE work_packages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    parent_id           uuid REFERENCES work_packages(id),
    package_code        text NOT NULL,
    name                text NOT NULL,
    description         text,
    status              text NOT NULL DEFAULT 'active',
    planned_start_date  date,
    planned_finish_date date,
    responsible_org_id uuid REFERENCES organizations(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_work_packages_code UNIQUE (project_id, package_code),
    CONSTRAINT ck_work_packages_dates CHECK (
        planned_start_date IS NULL OR planned_finish_date IS NULL OR planned_finish_date >= planned_start_date
    )
);
CREATE INDEX ix_work_packages_project_parent ON work_packages (project_id, parent_id);

-- ---------------------------------------------------------------------------
-- Files and document control
-- ---------------------------------------------------------------------------

CREATE TABLE stored_files (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    storage_provider    text NOT NULL DEFAULT 's3',
    storage_bucket      text NOT NULL,
    storage_key         text NOT NULL,
    original_name       text NOT NULL,
    mime_type           text NOT NULL,
    size_bytes          bigint NOT NULL,
    sha256_hex          char(64) NOT NULL,
    scan_status         text NOT NULL DEFAULT 'pending',
    scan_message        text,
    uploaded_by         uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_stored_files_storage_key UNIQUE (storage_provider, storage_bucket, storage_key),
    CONSTRAINT ck_stored_files_size CHECK (size_bytes >= 0),
    CONSTRAINT ck_stored_files_sha256 CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_stored_files_scan CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed'))
);
CREATE INDEX ix_stored_files_tenant_hash ON stored_files (tenant_id, sha256_hex);

CREATE TABLE documents (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    document_number     text NOT NULL,
    title               text NOT NULL,
    category            text NOT NULL,
    discipline          text,
    status              document_status NOT NULL DEFAULT 'draft',
    confidentiality     text NOT NULL DEFAULT 'project',
    originator_org_id   uuid REFERENCES organizations(id),
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_documents_number UNIQUE (project_id, document_number),
    CONSTRAINT ck_documents_confidentiality CHECK (
        confidentiality IN ('project', 'restricted', 'commercial', 'public')
    ),
    CONSTRAINT ck_documents_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_documents_register ON documents (project_id, category, status, lower(title));

CREATE TABLE document_revisions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    revision_number     text NOT NULL,
    title               text,
    status              document_revision_status NOT NULL DEFAULT 'draft',
    file_id             uuid NOT NULL REFERENCES stored_files(id),
    issue_purpose       text,
    issued_date         date,
    received_date       date,
    is_current          boolean NOT NULL DEFAULT false,
    page_count          integer,
    ocr_status          text NOT NULL DEFAULT 'pending',
    source_rotation_deg smallint NOT NULL DEFAULT 0,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_document_revisions_number UNIQUE (document_id, revision_number),
    CONSTRAINT ck_document_revision_current CHECK (
        NOT is_current OR status = 'accepted'
    ),
    CONSTRAINT ck_document_revision_pages CHECK (page_count IS NULL OR page_count >= 0),
    CONSTRAINT ck_document_revision_ocr CHECK (
        ocr_status IN ('pending', 'processing', 'completed', 'partial', 'failed')
    ),
    CONSTRAINT ck_document_revision_rotation CHECK (source_rotation_deg IN (0, 90, 180, 270)),
    CONSTRAINT ck_document_revision_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX uq_document_one_current_revision
    ON document_revisions (document_id) WHERE is_current;
CREATE INDEX ix_document_revisions_document_date
    ON document_revisions (document_id, issued_date DESC, created_at DESC);

CREATE TABLE document_pages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id         uuid NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
    page_number         integer NOT NULL,
    ocr_text            text,
    thumbnail_file_id   uuid REFERENCES stored_files(id),
    width_points        numeric(12,4),
    height_points       numeric(12,4),
    rotation_deg        smallint NOT NULL DEFAULT 0,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_document_pages_number UNIQUE (revision_id, page_number),
    CONSTRAINT ck_document_pages_number CHECK (page_number > 0),
    CONSTRAINT ck_document_pages_rotation CHECK (rotation_deg IN (0, 90, 180, 270)),
    CONSTRAINT ck_document_pages_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_document_pages_ocr_search
    ON document_pages USING gin (to_tsvector('simple', coalesce(ocr_text, '')));

CREATE TABLE document_links (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision_id         uuid NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
    page_number         integer,
    target_type         text NOT NULL,
    target_id           uuid NOT NULL,
    relation_type       text NOT NULL DEFAULT 'references',
    anchor              jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_document_links_page CHECK (page_number IS NULL OR page_number > 0),
    CONSTRAINT ck_document_links_anchor_object CHECK (jsonb_typeof(anchor) = 'object')
);
CREATE INDEX ix_document_links_target ON document_links (project_id, target_type, target_id);
CREATE INDEX ix_document_links_revision_page ON document_links (revision_id, page_number);

CREATE TABLE transmittals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    transmittal_number  text NOT NULL,
    direction           transmittal_direction NOT NULL,
    subject             text NOT NULL,
    sender_org_id       uuid REFERENCES organizations(id),
    recipient_org_id    uuid REFERENCES organizations(id),
    sent_at             timestamptz,
    received_at         timestamptz,
    status              text NOT NULL DEFAULT 'draft',
    notes               text,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_transmittals_number UNIQUE (project_id, transmittal_number),
    CONSTRAINT ck_transmittals_status CHECK (status IN ('draft', 'issued', 'received', 'acknowledged', 'cancelled'))
);
CREATE INDEX ix_transmittals_project_direction_date
    ON transmittals (project_id, direction, sent_at DESC);

CREATE TABLE transmittal_items (
    transmittal_id      uuid NOT NULL REFERENCES transmittals(id) ON DELETE CASCADE,
    revision_id         uuid NOT NULL REFERENCES document_revisions(id),
    item_order          integer NOT NULL DEFAULT 0,
    purpose             text,
    response_due_date   date,
    response_status     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (transmittal_id, revision_id)
);

CREATE TABLE record_attachments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    record_type         text NOT NULL,
    record_id           uuid NOT NULL,
    file_id             uuid NOT NULL REFERENCES stored_files(id),
    attachment_role     text NOT NULL DEFAULT 'evidence',
    description         text,
    captured_at         timestamptz,
    captured_by         uuid REFERENCES app_users(id),
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_record_attachments_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_record_attachments_record
    ON record_attachments (project_id, record_type, record_id, created_at);

-- ---------------------------------------------------------------------------
-- Contract clauses, rules, obligations, and securities
-- ---------------------------------------------------------------------------

CREATE TABLE contract_clauses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    clause_number       text NOT NULL,
    title               text,
    text_excerpt        text,
    obligation_party    party_role,
    is_key_control      boolean NOT NULL DEFAULT false,
    source_revision_id  uuid REFERENCES document_revisions(id),
    source_page_number  integer,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_contract_clauses_number UNIQUE (contract_id, clause_number),
    CONSTRAINT ck_contract_clauses_page CHECK (source_page_number IS NULL OR source_page_number > 0),
    CONSTRAINT ck_contract_clauses_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_contract_clauses_key_control
    ON contract_clauses (contract_id, is_key_control, clause_number);

CREATE TABLE contract_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    rule_key            text NOT NULL,
    label               text NOT NULL,
    data_type           text NOT NULL,
    numeric_value       numeric(24,8),
    text_value          text,
    boolean_value       boolean,
    date_value          date,
    json_value          jsonb,
    unit                text,
    effective_from      date NOT NULL,
    effective_to        date,
    source_clause_id    uuid REFERENCES contract_clauses(id),
    is_approved         boolean NOT NULL DEFAULT false,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_contract_rules_effective UNIQUE (contract_id, rule_key, effective_from),
    CONSTRAINT ck_contract_rules_key CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{2,95}$'),
    CONSTRAINT ck_contract_rules_data_type CHECK (
        data_type IN ('numeric', 'text', 'boolean', 'date', 'json')
    ),
    CONSTRAINT ck_contract_rules_one_value CHECK (
        (CASE WHEN numeric_value IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN text_value IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN boolean_value IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN date_value IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN json_value IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    CONSTRAINT ck_contract_rules_type_matches CHECK (
        (data_type = 'numeric' AND numeric_value IS NOT NULL)
        OR (data_type = 'text' AND text_value IS NOT NULL)
        OR (data_type = 'boolean' AND boolean_value IS NOT NULL)
        OR (data_type = 'date' AND date_value IS NOT NULL)
        OR (data_type = 'json' AND json_value IS NOT NULL)
    ),
    CONSTRAINT ck_contract_rules_dates CHECK (
        effective_to IS NULL OR effective_to >= effective_from
    )
);
CREATE INDEX ix_contract_rules_lookup
    ON contract_rules (contract_id, rule_key, effective_from DESC)
    WHERE is_approved;

CREATE TABLE contract_obligations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    clause_id           uuid REFERENCES contract_clauses(id),
    obligation_key      text NOT NULL,
    title               text NOT NULL,
    description         text,
    responsible_role    party_role,
    responsible_org_id uuid REFERENCES organizations(id),
    assigned_to         uuid REFERENCES app_users(id),
    trigger_date        date,
    due_date            date,
    fulfilled_date      date,
    status              obligation_status NOT NULL DEFAULT 'not_started',
    recurrence          jsonb,
    evidence_required   boolean NOT NULL DEFAULT true,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_contract_obligations_key UNIQUE (contract_id, obligation_key),
    CONSTRAINT ck_contract_obligations_dates CHECK (
        trigger_date IS NULL OR due_date IS NULL OR due_date >= trigger_date
    ),
    CONSTRAINT ck_contract_obligations_recurrence CHECK (
        recurrence IS NULL OR jsonb_typeof(recurrence) = 'object'
    )
);
CREATE INDEX ix_contract_obligations_due
    ON contract_obligations (contract_id, status, due_date);

CREATE TABLE contract_securities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    instrument_type     security_instrument_type NOT NULL,
    reference_number    text NOT NULL,
    issuer              text,
    beneficiary_org_id uuid REFERENCES organizations(id),
    currency            char(3) NOT NULL DEFAULT 'ETB',
    amount              numeric(20,4) NOT NULL,
    issue_date          date,
    expiry_date         date,
    status              security_instrument_status NOT NULL DEFAULT 'draft',
    file_id             uuid REFERENCES stored_files(id),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_contract_securities_ref UNIQUE (contract_id, reference_number),
    CONSTRAINT ck_contract_securities_amount CHECK (amount >= 0),
    CONSTRAINT ck_contract_securities_dates CHECK (
        issue_date IS NULL OR expiry_date IS NULL OR expiry_date >= issue_date
    )
);
CREATE INDEX ix_contract_securities_expiry
    ON contract_securities (contract_id, status, expiry_date);

-- ---------------------------------------------------------------------------
-- Import staging and source lineage
-- ---------------------------------------------------------------------------

CREATE TABLE import_jobs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_file_id      uuid NOT NULL REFERENCES stored_files(id),
    import_kind         text NOT NULL,
    status              import_job_status NOT NULL DEFAULT 'uploaded',
    source_name         text NOT NULL,
    parser_version      text,
    statistics          jsonb NOT NULL DEFAULT '{}'::jsonb,
    control_totals      jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message       text,
    started_at          timestamptz,
    completed_at        timestamptz,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_import_jobs_kind CHECK (
        import_kind IN ('boq', 'ipc', 'contract', 'drawings', 'organizations', 'other')
    ),
    CONSTRAINT ck_import_jobs_statistics_object CHECK (jsonb_typeof(statistics) = 'object'),
    CONSTRAINT ck_import_jobs_control_totals_object CHECK (jsonb_typeof(control_totals) = 'object')
);
CREATE INDEX ix_import_jobs_project_status ON import_jobs (project_id, status, created_at DESC);

CREATE TABLE import_sheets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id       uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    sheet_name          text NOT NULL,
    sheet_ordinal       integer NOT NULL,
    is_hidden           boolean NOT NULL DEFAULT false,
    row_count           integer,
    column_count        integer,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_import_sheets_name UNIQUE (import_job_id, sheet_name),
    CONSTRAINT uq_import_sheets_ordinal UNIQUE (import_job_id, sheet_ordinal),
    CONSTRAINT ck_import_sheets_dimensions CHECK (
        (row_count IS NULL OR row_count >= 0) AND (column_count IS NULL OR column_count >= 0)
    ),
    CONSTRAINT ck_import_sheets_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE import_mappings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id       uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    target_entity       text NOT NULL,
    mapping_name        text NOT NULL,
    mapping             jsonb NOT NULL,
    is_selected         boolean NOT NULL DEFAULT true,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_import_mappings_name UNIQUE (import_job_id, target_entity, mapping_name),
    CONSTRAINT ck_import_mappings_object CHECK (jsonb_typeof(mapping) = 'object')
);

CREATE TABLE import_rows (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id       uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    import_sheet_id     uuid REFERENCES import_sheets(id) ON DELETE CASCADE,
    source_row_number   integer NOT NULL,
    source_data         jsonb NOT NULL,
    normalized_data     jsonb,
    row_hash            char(64) NOT NULL,
    status              import_row_status NOT NULL DEFAULT 'staged',
    target_entity       text,
    target_id           uuid,
    error_count         integer NOT NULL DEFAULT 0,
    warning_count       integer NOT NULL DEFAULT 0,
    committed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_import_rows_source UNIQUE (import_job_id, import_sheet_id, source_row_number),
    CONSTRAINT ck_import_rows_number CHECK (source_row_number > 0),
    CONSTRAINT ck_import_rows_source_object CHECK (jsonb_typeof(source_data) = 'object'),
    CONSTRAINT ck_import_rows_normalized_object CHECK (
        normalized_data IS NULL OR jsonb_typeof(normalized_data) = 'object'
    ),
    CONSTRAINT ck_import_rows_hash CHECK (row_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_import_rows_counts CHECK (error_count >= 0 AND warning_count >= 0)
);
CREATE INDEX ix_import_rows_job_status ON import_rows (import_job_id, status, source_row_number);
CREATE INDEX ix_import_rows_target ON import_rows (target_entity, target_id) WHERE target_id IS NOT NULL;

CREATE TABLE import_exceptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id       uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    import_row_id       uuid REFERENCES import_rows(id) ON DELETE CASCADE,
    severity            issue_severity NOT NULL,
    exception_code      text NOT NULL,
    field_name          text,
    message             text NOT NULL,
    source_value        text,
    suggested_value     text,
    status              exception_status NOT NULL DEFAULT 'open',
    assigned_to         uuid REFERENCES app_users(id),
    resolution          text,
    resolved_by         uuid REFERENCES app_users(id),
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1
);
CREATE INDEX ix_import_exceptions_worklist
    ON import_exceptions (import_job_id, status, severity, created_at);

CREATE TABLE source_lineage (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_entity       text NOT NULL,
    target_id           uuid NOT NULL,
    target_field        text NOT NULL,
    source_file_id      uuid NOT NULL REFERENCES stored_files(id),
    source_sheet        text,
    source_row_number   integer,
    source_cell         text,
    source_page_number  integer,
    source_formula      text,
    source_value        text,
    import_job_id       uuid REFERENCES import_jobs(id),
    imported_by         uuid REFERENCES app_users(id),
    imported_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_source_lineage_row CHECK (source_row_number IS NULL OR source_row_number > 0),
    CONSTRAINT ck_source_lineage_page CHECK (source_page_number IS NULL OR source_page_number > 0)
);
CREATE INDEX ix_source_lineage_target
    ON source_lineage (project_id, target_entity, target_id, target_field);
CREATE INDEX ix_source_lineage_source
    ON source_lineage (source_file_id, source_sheet, source_row_number);

-- ---------------------------------------------------------------------------
-- BOQ, rates, variations, provisional sums, and dayworks
-- ---------------------------------------------------------------------------

CREATE TABLE boq_versions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id             uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    version_number          integer NOT NULL,
    name                    text NOT NULL,
    status                  boq_version_status NOT NULL DEFAULT 'draft',
    currency                char(3) NOT NULL DEFAULT 'ETB',
    effective_date          date,
    approved_at             timestamptz,
    approved_by             uuid REFERENCES app_users(id),
    import_job_id           uuid REFERENCES import_jobs(id),
    priced_items_total      numeric(20,4) NOT NULL DEFAULT 0,
    provisional_sums_total  numeric(20,4) NOT NULL DEFAULT 0,
    contingency_total       numeric(20,4) NOT NULL DEFAULT 0,
    tax_total               numeric(20,4) NOT NULL DEFAULT 0,
    grand_total             numeric(20,4) NOT NULL DEFAULT 0,
    checksum                char(64),
    notes                   text,
    created_by              uuid REFERENCES app_users(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    row_version             bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_boq_versions_number UNIQUE (contract_id, version_number),
    CONSTRAINT ck_boq_versions_number CHECK (version_number > 0),
    CONSTRAINT ck_boq_versions_totals CHECK (
        priced_items_total >= 0 AND provisional_sums_total >= 0
        AND contingency_total >= 0 AND tax_total >= 0 AND grand_total >= 0
    ),
    CONSTRAINT ck_boq_versions_checksum CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX uq_boq_one_approved_version
    ON boq_versions (contract_id) WHERE status = 'approved';
CREATE INDEX ix_boq_versions_contract_status ON boq_versions (contract_id, status, version_number DESC);

CREATE TABLE boq_sections (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boq_version_id      uuid NOT NULL REFERENCES boq_versions(id) ON DELETE CASCADE,
    parent_id           uuid REFERENCES boq_sections(id),
    section_code        text NOT NULL,
    title               text NOT NULL,
    sort_order          integer NOT NULL DEFAULT 0,
    source_reference    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_boq_sections_code UNIQUE (boq_version_id, section_code)
);
CREATE INDEX ix_boq_sections_tree ON boq_sections (boq_version_id, parent_id, sort_order);

CREATE TABLE boq_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boq_version_id      uuid NOT NULL REFERENCES boq_versions(id) ON DELETE CASCADE,
    section_id          uuid REFERENCES boq_sections(id),
    item_number         text NOT NULL,
    source_code         text,
    description         text NOT NULL,
    unit                text,
    item_type           boq_item_type NOT NULL DEFAULT 'work',
    original_quantity   numeric(20,6),
    approved_quantity   numeric(20,6),
    rate                numeric(20,6),
    approved_amount     numeric(20,4) NOT NULL DEFAULT 0,
    quantity_trackable  boolean NOT NULL DEFAULT true,
    sort_order          integer NOT NULL DEFAULT 0,
    source_reference    text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_boq_items_number UNIQUE (boq_version_id, item_number),
    CONSTRAINT ck_boq_items_values CHECK (
        (original_quantity IS NULL OR original_quantity >= 0)
        AND (approved_quantity IS NULL OR approved_quantity >= 0)
        AND (rate IS NULL OR rate >= 0)
    ),
    CONSTRAINT ck_boq_items_trackable CHECK (
        NOT quantity_trackable OR (unit IS NOT NULL AND approved_quantity IS NOT NULL AND rate IS NOT NULL)
    ),
    CONSTRAINT ck_boq_items_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_boq_items_section_order ON boq_items (boq_version_id, section_id, sort_order);
CREATE INDEX ix_boq_items_source_code ON boq_items (boq_version_id, source_code);
CREATE INDEX ix_boq_items_description_search
    ON boq_items USING gin (to_tsvector('simple', description));

CREATE TABLE boq_item_rates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    boq_item_id         uuid NOT NULL REFERENCES boq_items(id) ON DELETE CASCADE,
    effective_from      date NOT NULL,
    effective_to        date,
    rate                numeric(20,6) NOT NULL,
    currency            char(3) NOT NULL DEFAULT 'ETB',
    basis               text NOT NULL,
    variation_id        uuid,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_boq_item_rates_effective UNIQUE (boq_item_id, effective_from),
    CONSTRAINT ck_boq_item_rates_rate CHECK (rate >= 0),
    CONSTRAINT ck_boq_item_rates_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_boq_item_rates_lookup ON boq_item_rates (boq_item_id, effective_from DESC);

CREATE TABLE variations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    variation_number    text NOT NULL,
    title               text NOT NULL,
    description         text,
    reason_code         text,
    status              variation_status NOT NULL DEFAULT 'draft',
    initiated_by        uuid REFERENCES app_users(id),
    contractor_ref      text,
    engineer_ref        text,
    submitted_at        timestamptz,
    approved_at         timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    time_impact_days    integer NOT NULL DEFAULT 0,
    approved_value      numeric(20,4) NOT NULL DEFAULT 0,
    incorporated_boq_version_id uuid REFERENCES boq_versions(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_variations_number UNIQUE (contract_id, variation_number)
);
CREATE INDEX ix_variations_contract_status ON variations (contract_id, status, created_at DESC);

ALTER TABLE boq_item_rates
    ADD CONSTRAINT fk_boq_item_rates_variation
    FOREIGN KEY (variation_id) REFERENCES variations(id);

CREATE TABLE variation_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variation_id        uuid NOT NULL REFERENCES variations(id) ON DELETE CASCADE,
    boq_item_id         uuid REFERENCES boq_items(id),
    line_number         integer NOT NULL,
    change_type         text NOT NULL,
    description         text NOT NULL,
    unit                text,
    quantity_delta      numeric(20,6),
    revised_quantity    numeric(20,6),
    rate                numeric(20,6),
    amount              numeric(20,4) NOT NULL DEFAULT 0,
    rate_basis          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_variation_items_line UNIQUE (variation_id, line_number),
    CONSTRAINT ck_variation_items_line CHECK (line_number > 0),
    CONSTRAINT ck_variation_items_change_type CHECK (
        change_type IN ('quantity_change', 'rate_change', 'new_item', 'omit_item', 'provisional_sum')
    ),
    CONSTRAINT ck_variation_items_new_item CHECK (
        change_type <> 'new_item' OR boq_item_id IS NULL
    )
);

CREATE TABLE provisional_sum_usages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    boq_item_id         uuid NOT NULL REFERENCES boq_items(id),
    reference_number    text NOT NULL,
    description         text NOT NULL,
    supplier_org_id     uuid REFERENCES organizations(id),
    approved_amount     numeric(20,4) NOT NULL DEFAULT 0,
    expended_amount     numeric(20,4) NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'draft',
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_provisional_sum_usage_ref UNIQUE (contract_id, reference_number),
    CONSTRAINT ck_provisional_sum_usage_amount CHECK (
        approved_amount >= 0 AND expended_amount >= 0
    ),
    CONSTRAINT ck_provisional_sum_usage_status CHECK (
        status IN ('draft', 'submitted', 'approved', 'rejected', 'closed', 'cancelled')
    )
);

CREATE TABLE daywork_sheets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    sheet_number        text NOT NULL,
    work_date           date NOT NULL,
    location_id         uuid REFERENCES locations(id),
    work_package_id     uuid REFERENCES work_packages(id),
    description         text NOT NULL,
    status              text NOT NULL DEFAULT 'draft',
    total_amount        numeric(20,4) NOT NULL DEFAULT 0,
    submitted_by        uuid REFERENCES app_users(id),
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_daywork_sheets_number UNIQUE (contract_id, sheet_number),
    CONSTRAINT ck_daywork_sheets_status CHECK (
        status IN ('draft', 'submitted', 'returned', 'approved', 'rejected', 'included', 'cancelled')
    )
);

CREATE TABLE daywork_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    daywork_sheet_id    uuid NOT NULL REFERENCES daywork_sheets(id) ON DELETE CASCADE,
    line_number         integer NOT NULL,
    cost_type           text NOT NULL,
    description         text NOT NULL,
    unit                text NOT NULL,
    quantity            numeric(20,6) NOT NULL,
    rate                numeric(20,6) NOT NULL,
    amount              numeric(20,4) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_daywork_lines_number UNIQUE (daywork_sheet_id, line_number),
    CONSTRAINT ck_daywork_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_daywork_lines_cost_type CHECK (cost_type IN ('labour', 'plant', 'material', 'other')),
    CONSTRAINT ck_daywork_lines_values CHECK (quantity >= 0 AND rate >= 0)
);

-- ---------------------------------------------------------------------------
-- Field measurements, RFIs, inspections, and issues
-- ---------------------------------------------------------------------------

CREATE TABLE measurements (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    measurement_number  text NOT NULL,
    measurement_date    date NOT NULL,
    contractor_org_id   uuid REFERENCES organizations(id),
    work_package_id     uuid REFERENCES work_packages(id),
    location_id         uuid REFERENCES locations(id),
    status              measurement_status NOT NULL DEFAULT 'draft',
    revision_number     integer NOT NULL DEFAULT 1,
    summary             text,
    notes               text,
    submitted_by        uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    verified_by         uuid REFERENCES app_users(id),
    verified_at         timestamptz,
    returned_reason     text,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_measurements_number UNIQUE (project_id, measurement_number),
    CONSTRAINT ck_measurements_revision CHECK (revision_number > 0)
);
CREATE INDEX ix_measurements_register
    ON measurements (project_id, contract_id, status, measurement_date DESC);

CREATE TABLE measurement_lines (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id          uuid NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
    line_number             integer NOT NULL,
    boq_item_id             uuid NOT NULL REFERENCES boq_items(id),
    description             text,
    unit                    text NOT NULL,
    calculation_method      text NOT NULL DEFAULT 'direct',
    calculation_inputs      jsonb NOT NULL DEFAULT '{}'::jsonb,
    calculated_quantity     numeric(20,6),
    submitted_quantity      numeric(20,6) NOT NULL,
    accepted_quantity       numeric(20,6),
    rate_snapshot           numeric(20,6),
    amount_snapshot         numeric(20,4),
    drawing_revision_id     uuid REFERENCES document_revisions(id),
    drawing_page_number     integer,
    remarks                 text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    row_version             bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_measurement_lines_number UNIQUE (measurement_id, line_number),
    CONSTRAINT ck_measurement_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_measurement_lines_method CHECK (
        calculation_method IN ('direct', 'length', 'area', 'volume', 'weight', 'count', 'formula')
    ),
    CONSTRAINT ck_measurement_lines_inputs_object CHECK (jsonb_typeof(calculation_inputs) = 'object'),
    CONSTRAINT ck_measurement_lines_rate CHECK (rate_snapshot IS NULL OR rate_snapshot >= 0),
    CONSTRAINT ck_measurement_lines_page CHECK (drawing_page_number IS NULL OR drawing_page_number > 0)
);
CREATE INDEX ix_measurement_lines_boq_item ON measurement_lines (boq_item_id, measurement_id);

CREATE TABLE measurement_segments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_line_id uuid NOT NULL REFERENCES measurement_lines(id) ON DELETE CASCADE,
    segment_number      integer NOT NULL,
    location_id         uuid REFERENCES locations(id),
    start_chainage_mm   bigint,
    end_chainage_mm     bigint,
    offset_m            numeric(12,4),
    quantity            numeric(20,6),
    geometry            jsonb,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_measurement_segments_number UNIQUE (measurement_line_id, segment_number),
    CONSTRAINT ck_measurement_segments_number CHECK (segment_number > 0),
    CONSTRAINT ck_measurement_segments_chainage CHECK (
        start_chainage_mm IS NULL OR end_chainage_mm IS NULL OR end_chainage_mm >= start_chainage_mm
    ),
    CONSTRAINT ck_measurement_segments_geometry CHECK (
        geometry IS NULL OR jsonb_typeof(geometry) = 'object'
    )
);
CREATE INDEX ix_measurement_segments_chainage
    ON measurement_segments (start_chainage_mm, end_chainage_mm);

CREATE TABLE rfis (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    rfi_number          text NOT NULL,
    subject             text NOT NULL,
    question            text NOT NULL,
    status              rfi_status NOT NULL DEFAULT 'draft',
    priority            issue_severity NOT NULL DEFAULT 'medium',
    raised_by           uuid REFERENCES app_users(id),
    assigned_to         uuid REFERENCES app_users(id),
    responsible_org_id uuid REFERENCES organizations(id),
    work_package_id     uuid REFERENCES work_packages(id),
    location_id         uuid REFERENCES locations(id),
    drawing_revision_id uuid REFERENCES document_revisions(id),
    drawing_page_number integer,
    due_date            date,
    opened_at           timestamptz,
    answered_at         timestamptz,
    closed_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_rfis_number UNIQUE (project_id, rfi_number),
    CONSTRAINT ck_rfis_page CHECK (drawing_page_number IS NULL OR drawing_page_number > 0)
);
CREATE INDEX ix_rfis_worklist ON rfis (project_id, status, due_date, priority);

CREATE TABLE rfi_responses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rfi_id              uuid NOT NULL REFERENCES rfis(id) ON DELETE CASCADE,
    response_number     integer NOT NULL,
    response_text       text NOT NULL,
    is_formal_answer    boolean NOT NULL DEFAULT false,
    responded_by        uuid REFERENCES app_users(id),
    responded_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_rfi_responses_number UNIQUE (rfi_id, response_number),
    CONSTRAINT ck_rfi_responses_number CHECK (response_number > 0)
);

CREATE TABLE inspection_requests (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    inspection_number   text NOT NULL,
    subject             text NOT NULL,
    description         text,
    status              inspection_status NOT NULL DEFAULT 'draft',
    result              inspection_result NOT NULL DEFAULT 'pending',
    requested_by        uuid REFERENCES app_users(id),
    inspector_id        uuid REFERENCES app_users(id),
    contractor_org_id   uuid REFERENCES organizations(id),
    work_package_id     uuid REFERENCES work_packages(id),
    location_id         uuid REFERENCES locations(id),
    boq_item_id         uuid REFERENCES boq_items(id),
    measurement_id      uuid REFERENCES measurements(id),
    requested_for       timestamptz,
    inspected_at        timestamptz,
    comments            text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_inspection_requests_number UNIQUE (project_id, inspection_number)
);
CREATE INDEX ix_inspections_worklist
    ON inspection_requests (project_id, status, requested_for);

CREATE TABLE inspection_check_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id       uuid NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,
    item_number         integer NOT NULL,
    check_text          text NOT NULL,
    result              inspection_result NOT NULL DEFAULT 'pending',
    remarks             text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_inspection_check_items_number UNIQUE (inspection_id, item_number),
    CONSTRAINT ck_inspection_check_items_number CHECK (item_number > 0)
);

CREATE TABLE issues (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    issue_number        text NOT NULL,
    issue_type          text NOT NULL,
    title               text NOT NULL,
    description         text,
    status              issue_status NOT NULL DEFAULT 'open',
    severity            issue_severity NOT NULL DEFAULT 'medium',
    source_type         text,
    source_id           uuid,
    assigned_to         uuid REFERENCES app_users(id),
    responsible_org_id uuid REFERENCES organizations(id),
    due_date            date,
    resolved_at         timestamptz,
    resolution          text,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_issues_number UNIQUE (project_id, issue_number),
    CONSTRAINT ck_issues_type CHECK (
        issue_type IN ('ncr', 'defect', 'commercial', 'document', 'safety', 'environment', 'data', 'workflow', 'other')
    )
);
CREATE INDEX ix_issues_worklist ON issues (project_id, status, severity, due_date);

CREATE TABLE issue_comments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id            uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    comment_text        text NOT NULL,
    status_after        issue_status,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_issue_comments_issue_date ON issue_comments (issue_id, created_at);

-- ---------------------------------------------------------------------------
-- Procurement, supplier invoices, stores, and immutable stock movements
-- ---------------------------------------------------------------------------

CREATE TABLE suppliers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id),
    supplier_code       text NOT NULL,
    status              supplier_status NOT NULL DEFAULT 'draft',
    categories          text[] NOT NULL DEFAULT ARRAY[]::text[],
    tax_clearance_expiry date,
    bank_account_fingerprint char(64),
    risk_notes          text,
    submitted_by        uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_suppliers_organization UNIQUE (tenant_id, organization_id),
    CONSTRAINT uq_suppliers_code UNIQUE (tenant_id, supplier_code),
    CONSTRAINT ck_suppliers_fingerprint CHECK (
        bank_account_fingerprint IS NULL OR bank_account_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_suppliers_independent_approval CHECK (
        status <> 'approved'
        OR (
            approved_by IS NOT NULL
            AND approved_at IS NOT NULL
            AND approved_by IS DISTINCT FROM created_by
            AND approved_by IS DISTINCT FROM submitted_by
        )
    )
);
CREATE INDEX ix_suppliers_tenant_status ON suppliers (tenant_id, status, supplier_code);

CREATE TABLE cost_codes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id           uuid REFERENCES cost_codes(id),
    cost_code           text NOT NULL,
    name                text NOT NULL,
    category            text NOT NULL,
    budget_amount       numeric(20,4) NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_cost_codes_code UNIQUE (project_id, cost_code),
    CONSTRAINT ck_cost_codes_category CHECK (
        category IN ('labor', 'material', 'plant', 'subcontract', 'overhead', 'other')
    ),
    CONSTRAINT ck_cost_codes_budget CHECK (budget_amount >= 0)
);
CREATE INDEX ix_cost_codes_tree ON cost_codes (project_id, parent_id, cost_code);

CREATE TABLE warehouses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    warehouse_code      text NOT NULL,
    name                text NOT NULL,
    location_id         uuid REFERENCES locations(id),
    storekeeper_id      uuid REFERENCES app_users(id),
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_warehouses_code UNIQUE (project_id, warehouse_code)
);

CREATE TABLE inventory_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_code           text NOT NULL,
    description         text NOT NULL,
    specification       text,
    unit                text NOT NULL,
    cost_code_id        uuid REFERENCES cost_codes(id),
    minimum_stock       numeric(20,6) NOT NULL DEFAULT 0,
    is_serialized       boolean NOT NULL DEFAULT false,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_inventory_items_code UNIQUE (project_id, item_code),
    CONSTRAINT ck_inventory_items_minimum CHECK (minimum_stock >= 0)
);
CREATE INDEX ix_inventory_items_project_description
    ON inventory_items (project_id, lower(description));

CREATE TABLE purchase_requisitions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    requisition_number  text NOT NULL,
    status              purchase_requisition_status NOT NULL DEFAULT 'draft',
    purpose             text NOT NULL,
    work_package_id     uuid REFERENCES work_packages(id),
    cost_code_id        uuid REFERENCES cost_codes(id),
    required_date       date,
    requested_by        uuid NOT NULL REFERENCES app_users(id),
    submitted_at        timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    returned_reason     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_purchase_requisitions_number UNIQUE (project_id, requisition_number),
    CONSTRAINT ck_purchase_requisition_self_approval CHECK (
        approved_by IS NULL OR approved_by <> requested_by
    ),
    CONSTRAINT ck_purchase_requisition_approved CHECK (
        status NOT IN ('approved', 'ordered')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);
CREATE INDEX ix_purchase_requisitions_worklist
    ON purchase_requisitions (project_id, status, required_date);

CREATE TABLE purchase_requisition_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id      uuid NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    line_number         integer NOT NULL,
    inventory_item_id   uuid REFERENCES inventory_items(id),
    description         text NOT NULL,
    specification       text,
    unit                text NOT NULL,
    requested_quantity  numeric(20,6) NOT NULL,
    estimated_unit_price numeric(20,6),
    estimated_amount    numeric(20,4),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_purchase_requisition_lines_number UNIQUE (requisition_id, line_number),
    CONSTRAINT ck_purchase_requisition_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_purchase_requisition_lines_quantity CHECK (requested_quantity > 0),
    CONSTRAINT ck_purchase_requisition_lines_price CHECK (
        estimated_unit_price IS NULL OR estimated_unit_price >= 0
    )
);

CREATE TABLE supplier_quotes (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requisition_id      uuid NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    supplier_id         uuid NOT NULL REFERENCES suppliers(id),
    quote_number        text NOT NULL,
    quote_date          date NOT NULL,
    valid_until         date,
    currency            char(3) NOT NULL DEFAULT 'ETB',
    delivery_days       integer,
    payment_terms       text,
    tax_amount          numeric(20,4) NOT NULL DEFAULT 0,
    total_amount        numeric(20,4) NOT NULL DEFAULT 0,
    file_id             uuid REFERENCES stored_files(id),
    status              text NOT NULL DEFAULT 'received',
    captured_by         uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_supplier_quotes_number UNIQUE (project_id, supplier_id, quote_number),
    CONSTRAINT ck_supplier_quotes_dates CHECK (valid_until IS NULL OR valid_until >= quote_date),
    CONSTRAINT ck_supplier_quotes_delivery CHECK (delivery_days IS NULL OR delivery_days >= 0),
    CONSTRAINT ck_supplier_quotes_amounts CHECK (tax_amount >= 0 AND total_amount >= 0),
    CONSTRAINT ck_supplier_quotes_status CHECK (status IN ('received', 'clarification', 'evaluated', 'selected', 'not_selected', 'withdrawn'))
);
CREATE INDEX ix_supplier_quotes_requisition ON supplier_quotes (requisition_id, status, total_amount);

CREATE TABLE supplier_quote_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_quote_id   uuid NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
    requisition_line_id uuid NOT NULL REFERENCES purchase_requisition_lines(id),
    line_number         integer NOT NULL,
    offered_description text NOT NULL,
    offered_specification text,
    unit                text NOT NULL,
    quantity            numeric(20,6) NOT NULL,
    unit_price          numeric(20,6) NOT NULL,
    tax_percent         numeric(12,8) NOT NULL DEFAULT 0,
    line_amount         numeric(20,4) NOT NULL,
    complies            boolean,
    deviation_notes     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_supplier_quote_lines_number UNIQUE (supplier_quote_id, line_number),
    CONSTRAINT uq_supplier_quote_lines_requisition UNIQUE (supplier_quote_id, requisition_line_id),
    CONSTRAINT ck_supplier_quote_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_supplier_quote_lines_values CHECK (
        quantity > 0 AND unit_price >= 0 AND line_amount >= 0 AND tax_percent BETWEEN 0 AND 100
    )
);

CREATE TABLE purchase_orders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    purchase_order_number text NOT NULL,
    supplier_id         uuid NOT NULL REFERENCES suppliers(id),
    selected_quote_id   uuid REFERENCES supplier_quotes(id),
    status              purchase_order_status NOT NULL DEFAULT 'draft',
    currency            char(3) NOT NULL DEFAULT 'ETB',
    delivery_location   text,
    expected_delivery_date date,
    subtotal            numeric(20,4) NOT NULL DEFAULT 0,
    tax_amount          numeric(20,4) NOT NULL DEFAULT 0,
    total_amount        numeric(20,4) NOT NULL DEFAULT 0,
    selection_reason    text,
    created_by          uuid REFERENCES app_users(id),
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    issued_by           uuid REFERENCES app_users(id),
    issued_at           timestamptz,
    closed_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_purchase_orders_number UNIQUE (project_id, purchase_order_number),
    CONSTRAINT ck_purchase_orders_amounts CHECK (
        subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0
    ),
    CONSTRAINT ck_purchase_orders_self_approval CHECK (
        approved_by IS NULL OR approved_by IS DISTINCT FROM created_by
    ),
    CONSTRAINT ck_purchase_orders_approved CHECK (
        status NOT IN ('approved', 'issued', 'partially_received', 'fully_received', 'closed')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT ck_purchase_orders_issued CHECK (
        status NOT IN ('issued', 'partially_received', 'fully_received', 'closed')
        OR (issued_by IS NOT NULL AND issued_at IS NOT NULL)
    ),
    CONSTRAINT ck_purchase_orders_selection_reason CHECK (
        selected_quote_id IS NULL OR nullif(btrim(selection_reason), '') IS NOT NULL
    )
);
CREATE INDEX ix_purchase_orders_supplier_status
    ON purchase_orders (project_id, supplier_id, status, expected_delivery_date);

CREATE TABLE purchase_order_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    requisition_line_id uuid NOT NULL REFERENCES purchase_requisition_lines(id),
    inventory_item_id   uuid REFERENCES inventory_items(id),
    line_number         integer NOT NULL,
    description         text NOT NULL,
    specification       text,
    unit                text NOT NULL,
    ordered_quantity    numeric(20,6) NOT NULL,
    unit_price          numeric(20,6) NOT NULL,
    tax_percent         numeric(12,8) NOT NULL DEFAULT 0,
    line_amount         numeric(20,4) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_purchase_order_lines_number UNIQUE (purchase_order_id, line_number),
    CONSTRAINT uq_purchase_order_lines_requisition UNIQUE (purchase_order_id, requisition_line_id),
    CONSTRAINT ck_purchase_order_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_purchase_order_lines_values CHECK (
        ordered_quantity > 0 AND unit_price >= 0 AND line_amount >= 0
        AND tax_percent BETWEEN 0 AND 100
    )
);

CREATE TABLE goods_receipts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    purchase_order_id   uuid NOT NULL REFERENCES purchase_orders(id),
    warehouse_id        uuid NOT NULL REFERENCES warehouses(id),
    receipt_number      text NOT NULL,
    receipt_date        date NOT NULL,
    delivery_note_number text,
    status              goods_receipt_status NOT NULL DEFAULT 'draft',
    received_by         uuid NOT NULL REFERENCES app_users(id),
    inspected_by        uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    accepted_by         uuid REFERENCES app_users(id),
    accepted_at         timestamptz,
    rejection_reason    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_goods_receipts_number UNIQUE (project_id, receipt_number),
    CONSTRAINT ck_goods_receipts_independent_acceptance CHECK (
        accepted_by IS NULL OR accepted_by IS DISTINCT FROM received_by
    ),
    CONSTRAINT ck_goods_receipts_accepted CHECK (
        status <> 'accepted' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
    )
);
CREATE INDEX ix_goods_receipts_po_status
    ON goods_receipts (purchase_order_id, status, receipt_date);

CREATE TABLE goods_receipt_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_receipt_id    uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    purchase_order_line_id uuid NOT NULL REFERENCES purchase_order_lines(id),
    inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
    line_number         integer NOT NULL,
    ordered_quantity_snapshot numeric(20,6) NOT NULL,
    previously_received_quantity numeric(20,6) NOT NULL DEFAULT 0,
    received_quantity   numeric(20,6) NOT NULL,
    accepted_quantity   numeric(20,6) NOT NULL DEFAULT 0,
    rejected_quantity   numeric(20,6) NOT NULL DEFAULT 0,
    actual_specification text,
    specification_result inspection_result NOT NULL DEFAULT 'pending',
    lot_or_batch_number text,
    expiry_date         date,
    remarks             text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_goods_receipt_lines_number UNIQUE (goods_receipt_id, line_number),
    CONSTRAINT uq_goods_receipt_lines_po_line UNIQUE (goods_receipt_id, purchase_order_line_id),
    CONSTRAINT ck_goods_receipt_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_goods_receipt_lines_values CHECK (
        ordered_quantity_snapshot > 0 AND previously_received_quantity >= 0
        AND received_quantity > 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0
    ),
    CONSTRAINT ck_goods_receipt_lines_split CHECK (
        received_quantity = accepted_quantity + rejected_quantity
    )
);
CREATE INDEX ix_goods_receipt_lines_item ON goods_receipt_lines (inventory_item_id, goods_receipt_id);

CREATE TABLE supplier_invoices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    purchase_order_id   uuid NOT NULL REFERENCES purchase_orders(id),
    supplier_id         uuid NOT NULL REFERENCES suppliers(id),
    invoice_number      text NOT NULL,
    invoice_date        date NOT NULL,
    due_date            date,
    currency            char(3) NOT NULL DEFAULT 'ETB',
    subtotal            numeric(20,4) NOT NULL,
    tax_amount          numeric(20,4) NOT NULL DEFAULT 0,
    gross_amount        numeric(20,4) NOT NULL,
    status              supplier_invoice_status NOT NULL DEFAULT 'draft',
    invoice_file_id     uuid REFERENCES stored_files(id),
    invoice_fingerprint char(64),
    recorded_by         uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    rejection_reason    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_supplier_invoices_number UNIQUE (supplier_id, invoice_number),
    CONSTRAINT ck_supplier_invoices_dates CHECK (due_date IS NULL OR due_date >= invoice_date),
    CONSTRAINT ck_supplier_invoices_values CHECK (
        subtotal >= 0 AND tax_amount >= 0 AND gross_amount >= 0
    ),
    CONSTRAINT ck_supplier_invoices_fingerprint CHECK (
        invoice_fingerprint IS NULL OR invoice_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_supplier_invoices_self_approval CHECK (
        approved_by IS NULL OR approved_by IS DISTINCT FROM recorded_by
    ),
    CONSTRAINT ck_supplier_invoices_approved CHECK (
        status NOT IN ('approved_for_payment', 'partially_paid', 'paid')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);
CREATE INDEX ix_supplier_invoices_worklist
    ON supplier_invoices (project_id, status, due_date);
CREATE INDEX ix_supplier_invoices_fingerprint
    ON supplier_invoices (supplier_id, invoice_fingerprint)
    WHERE invoice_fingerprint IS NOT NULL;

CREATE TABLE supplier_invoice_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    purchase_order_line_id uuid NOT NULL REFERENCES purchase_order_lines(id),
    inventory_item_id   uuid REFERENCES inventory_items(id),
    line_number         integer NOT NULL,
    description         text NOT NULL,
    unit                text NOT NULL,
    invoiced_quantity   numeric(20,6) NOT NULL,
    unit_price          numeric(20,6) NOT NULL,
    tax_percent         numeric(12,8) NOT NULL DEFAULT 0,
    line_amount         numeric(20,4) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_supplier_invoice_lines_number UNIQUE (supplier_invoice_id, line_number),
    CONSTRAINT ck_supplier_invoice_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_supplier_invoice_lines_values CHECK (
        invoiced_quantity > 0 AND unit_price >= 0 AND line_amount >= 0
        AND tax_percent BETWEEN 0 AND 100
    )
);

CREATE TABLE three_way_matches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    run_number          integer NOT NULL,
    status              match_status NOT NULL DEFAULT 'pending',
    quantity_tolerance_percent numeric(12,8) NOT NULL DEFAULT 0,
    price_tolerance_percent numeric(12,8) NOT NULL DEFAULT 0,
    exception_count     integer NOT NULL DEFAULT 0,
    matched_by          uuid REFERENCES app_users(id),
    matched_at          timestamptz,
    superseded_at       timestamptz,
    summary             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_three_way_matches_run UNIQUE (supplier_invoice_id, run_number),
    CONSTRAINT ck_three_way_matches_number CHECK (run_number > 0),
    CONSTRAINT ck_three_way_matches_tolerance CHECK (
        quantity_tolerance_percent BETWEEN 0 AND 100
        AND price_tolerance_percent BETWEEN 0 AND 100
    ),
    CONSTRAINT ck_three_way_matches_exceptions CHECK (exception_count >= 0),
    CONSTRAINT ck_three_way_matches_summary CHECK (jsonb_typeof(summary) = 'object'),
    CONSTRAINT ck_three_way_matches_pass CHECK (
        status <> 'passed' OR (exception_count = 0 AND matched_by IS NOT NULL AND matched_at IS NOT NULL)
    )
);
CREATE UNIQUE INDEX uq_three_way_one_current
    ON three_way_matches (supplier_invoice_id)
    WHERE status <> 'superseded';

CREATE TABLE three_way_match_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    three_way_match_id  uuid NOT NULL REFERENCES three_way_matches(id) ON DELETE CASCADE,
    supplier_invoice_line_id uuid NOT NULL REFERENCES supplier_invoice_lines(id),
    purchase_order_line_id uuid NOT NULL REFERENCES purchase_order_lines(id),
    goods_receipt_line_id uuid REFERENCES goods_receipt_lines(id),
    po_quantity         numeric(20,6) NOT NULL,
    received_quantity   numeric(20,6) NOT NULL,
    invoiced_quantity   numeric(20,6) NOT NULL,
    po_unit_price       numeric(20,6) NOT NULL,
    invoice_unit_price  numeric(20,6) NOT NULL,
    quantity_variance   numeric(20,6) NOT NULL,
    price_variance      numeric(20,6) NOT NULL,
    specification_match boolean,
    status              match_status NOT NULL DEFAULT 'pending',
    exception_codes     text[] NOT NULL DEFAULT ARRAY[]::text[],
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_three_way_match_lines_invoice UNIQUE (three_way_match_id, supplier_invoice_line_id),
    CONSTRAINT ck_three_way_match_lines_values CHECK (
        po_quantity >= 0 AND received_quantity >= 0 AND invoiced_quantity >= 0
        AND po_unit_price >= 0 AND invoice_unit_price >= 0
    )
);

CREATE TABLE supplier_payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_invoice_id uuid NOT NULL REFERENCES supplier_invoices(id),
    payment_reference   text NOT NULL,
    payment_date        date NOT NULL,
    currency            char(3) NOT NULL DEFAULT 'ETB',
    gross_paid_amount   numeric(20,4) NOT NULL,
    withholding_amount  numeric(20,4) NOT NULL DEFAULT 0,
    other_deductions    numeric(20,4) NOT NULL DEFAULT 0,
    net_paid_amount     numeric(20,4) NOT NULL,
    bank_reference      text,
    recorded_by         uuid NOT NULL REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_supplier_payments_reference UNIQUE (supplier_invoice_id, payment_reference),
    CONSTRAINT ck_supplier_payments_values CHECK (
        gross_paid_amount > 0 AND withholding_amount >= 0
        AND other_deductions >= 0 AND net_paid_amount >= 0
    ),
    CONSTRAINT ck_supplier_payments_reconcile CHECK (
        net_paid_amount = gross_paid_amount - withholding_amount - other_deductions
    )
);
CREATE INDEX ix_supplier_payments_invoice_date
    ON supplier_payments (supplier_invoice_id, payment_date);

CREATE TABLE material_issues (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    warehouse_id        uuid NOT NULL REFERENCES warehouses(id),
    issue_number        text NOT NULL,
    issue_date          date NOT NULL,
    work_package_id     uuid NOT NULL REFERENCES work_packages(id),
    cost_code_id        uuid REFERENCES cost_codes(id),
    status              material_issue_status NOT NULL DEFAULT 'draft',
    purpose             text NOT NULL,
    requested_by        uuid REFERENCES app_users(id),
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    issued_by           uuid REFERENCES app_users(id),
    received_by         uuid REFERENCES app_users(id),
    recipient_name      text,
    signed_at           timestamptz,
    posted_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_material_issues_number UNIQUE (project_id, issue_number),
    CONSTRAINT ck_material_issues_sod CHECK (
        (approved_by IS NULL OR approved_by IS DISTINCT FROM requested_by)
        AND (issued_by IS NULL OR approved_by IS NULL OR issued_by IS DISTINCT FROM approved_by)
        AND (received_by IS NULL OR issued_by IS NULL OR received_by IS DISTINCT FROM issued_by)
    ),
    CONSTRAINT ck_material_issues_posted CHECK (
        status <> 'posted'
        OR (
            approved_by IS NOT NULL AND issued_by IS NOT NULL
            AND received_by IS NOT NULL AND signed_at IS NOT NULL AND posted_at IS NOT NULL
        )
    )
);

CREATE TABLE material_issue_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_issue_id   uuid NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
    inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
    line_number         integer NOT NULL,
    requested_quantity  numeric(20,6) NOT NULL,
    approved_quantity   numeric(20,6) NOT NULL,
    issued_quantity     numeric(20,6) NOT NULL,
    unit_cost_snapshot  numeric(20,6) NOT NULL DEFAULT 0,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_material_issue_lines_number UNIQUE (material_issue_id, line_number),
    CONSTRAINT ck_material_issue_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_material_issue_lines_values CHECK (
        requested_quantity > 0 AND approved_quantity > 0 AND issued_quantity > 0
        AND issued_quantity <= approved_quantity AND unit_cost_snapshot >= 0
    )
);

CREATE TABLE stock_counts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    warehouse_id        uuid NOT NULL REFERENCES warehouses(id),
    count_number        text NOT NULL,
    count_date          date NOT NULL,
    status              stock_count_status NOT NULL DEFAULT 'draft',
    counted_by          uuid REFERENCES app_users(id),
    submitted_by        uuid REFERENCES app_users(id),
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    posted_at           timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_stock_counts_number UNIQUE (project_id, count_number),
    CONSTRAINT ck_stock_counts_sod CHECK (
        approved_by IS NULL
        OR (
            approved_by IS DISTINCT FROM counted_by
            AND approved_by IS DISTINCT FROM submitted_by
        )
    )
);

CREATE TABLE stock_count_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_count_id      uuid NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
    system_quantity     numeric(20,6) NOT NULL,
    counted_quantity    numeric(20,6) NOT NULL,
    variance_quantity   numeric(20,6) NOT NULL,
    unit_cost_snapshot  numeric(20,6) NOT NULL DEFAULT 0,
    reason              text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_stock_count_lines_item UNIQUE (stock_count_id, inventory_item_id),
    CONSTRAINT ck_stock_count_lines_count CHECK (counted_quantity >= 0 AND unit_cost_snapshot >= 0),
    CONSTRAINT ck_stock_count_lines_variance CHECK (
        variance_quantity = counted_quantity - system_quantity
    )
);

CREATE TABLE stock_ledger_entries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    warehouse_id        uuid NOT NULL REFERENCES warehouses(id),
    inventory_item_id   uuid NOT NULL REFERENCES inventory_items(id),
    entry_type          text NOT NULL,
    quantity_delta      numeric(20,6) NOT NULL,
    unit_cost           numeric(20,6) NOT NULL DEFAULT 0,
    value_delta         numeric(20,4) NOT NULL,
    source_type         text NOT NULL,
    source_id           uuid NOT NULL,
    source_line_id      uuid,
    occurred_at         timestamptz NOT NULL,
    posted_by           uuid REFERENCES app_users(id),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_stock_ledger_source UNIQUE (
        warehouse_id, inventory_item_id, entry_type, source_type, source_id, source_line_id
    ),
    CONSTRAINT ck_stock_ledger_type CHECK (
        entry_type IN ('receipt', 'issue', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'count_adjustment', 'other_adjustment')
    ),
    CONSTRAINT ck_stock_ledger_quantity CHECK (quantity_delta <> 0),
    CONSTRAINT ck_stock_ledger_cost CHECK (unit_cost >= 0)
);
CREATE INDEX ix_stock_ledger_balance
    ON stock_ledger_entries (project_id, warehouse_id, inventory_item_id, occurred_at, id);
CREATE INDEX ix_stock_ledger_source
    ON stock_ledger_entries (source_type, source_id);

-- ---------------------------------------------------------------------------
-- Worker roster, attendance, timesheets, payroll, and worker payment
-- ---------------------------------------------------------------------------

CREATE TABLE workers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employer_org_id     uuid NOT NULL REFERENCES organizations(id),
    worker_number       text NOT NULL,
    display_name        text NOT NULL,
    trade               text,
    employment_type     text NOT NULL DEFAULT 'daily',
    status              worker_status NOT NULL DEFAULT 'draft',
    start_date          date,
    end_date            date,
    identity_fingerprint char(64),
    regular_hourly_rate numeric(20,6) NOT NULL DEFAULT 0,
    overtime_hourly_rate numeric(20,6) NOT NULL DEFAULT 0,
    created_by          uuid REFERENCES app_users(id),
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_workers_number UNIQUE (project_id, worker_number),
    CONSTRAINT ck_workers_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
    CONSTRAINT ck_workers_fingerprint CHECK (
        identity_fingerprint IS NULL OR identity_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_workers_rates CHECK (
        regular_hourly_rate >= 0 AND overtime_hourly_rate >= 0
    ),
    CONSTRAINT ck_workers_approval CHECK (
        status <> 'active'
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS DISTINCT FROM created_by)
    )
);
CREATE INDEX ix_workers_roster ON workers (project_id, status, worker_number);

CREATE TABLE attendance_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worker_id           uuid NOT NULL REFERENCES workers(id),
    attendance_date     date NOT NULL,
    work_package_id     uuid REFERENCES work_packages(id),
    cost_code_id        uuid REFERENCES cost_codes(id),
    check_in_at         timestamptz,
    check_out_at        timestamptz,
    regular_hours       numeric(8,4) NOT NULL DEFAULT 0,
    overtime_hours      numeric(8,4) NOT NULL DEFAULT 0,
    attendance_status   text NOT NULL DEFAULT 'present',
    recorded_by         uuid REFERENCES app_users(id),
    verified_by         uuid REFERENCES app_users(id),
    verified_at         timestamptz,
    source              text NOT NULL DEFAULT 'manual',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_attendance_worker_date_package UNIQUE (
        worker_id, attendance_date, work_package_id, cost_code_id
    ),
    CONSTRAINT ck_attendance_hours CHECK (
        regular_hours >= 0 AND overtime_hours >= 0
        AND regular_hours + overtime_hours <= 24
    ),
    CONSTRAINT ck_attendance_times CHECK (
        check_in_at IS NULL OR check_out_at IS NULL OR check_out_at >= check_in_at
    ),
    CONSTRAINT ck_attendance_status CHECK (
        attendance_status IN ('present', 'absent', 'leave', 'sick', 'holiday')
    ),
    CONSTRAINT ck_attendance_source CHECK (
        source IN ('manual', 'biometric', 'mobile', 'import')
    )
);
CREATE INDEX ix_attendance_project_date
    ON attendance_records (project_id, attendance_date, worker_id);

CREATE TABLE timesheets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id         uuid REFERENCES contracts(id),
    timesheet_number    text NOT NULL,
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    status              timesheet_status NOT NULL DEFAULT 'draft',
    foreman_id          uuid REFERENCES app_users(id),
    submitted_by        uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    returned_reason     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_timesheets_number UNIQUE (project_id, timesheet_number),
    CONSTRAINT ck_timesheets_period CHECK (period_end >= period_start),
    CONSTRAINT ck_timesheets_sod CHECK (
        approved_by IS NULL
        OR (
            approved_by IS DISTINCT FROM submitted_by
            AND approved_by IS DISTINCT FROM foreman_id
        )
    ),
    CONSTRAINT ck_timesheets_approved CHECK (
        status NOT IN ('approved', 'included_in_payroll')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);
CREATE INDEX ix_timesheets_worklist
    ON timesheets (project_id, status, period_end DESC);

CREATE TABLE timesheet_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id        uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
    attendance_record_id uuid REFERENCES attendance_records(id),
    worker_id           uuid NOT NULL REFERENCES workers(id),
    work_date           date NOT NULL,
    work_package_id     uuid REFERENCES work_packages(id),
    cost_code_id        uuid REFERENCES cost_codes(id),
    regular_hours       numeric(8,4) NOT NULL DEFAULT 0,
    overtime_hours      numeric(8,4) NOT NULL DEFAULT 0,
    regular_rate_snapshot numeric(20,6) NOT NULL DEFAULT 0,
    overtime_rate_snapshot numeric(20,6) NOT NULL DEFAULT 0,
    gross_amount        numeric(20,4) NOT NULL DEFAULT 0,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_timesheet_lines_worker_day UNIQUE (
        timesheet_id, worker_id, work_date, work_package_id, cost_code_id
    ),
    CONSTRAINT ck_timesheet_lines_hours CHECK (
        regular_hours >= 0 AND overtime_hours >= 0
        AND regular_hours + overtime_hours > 0
        AND regular_hours + overtime_hours <= 24
    ),
    CONSTRAINT ck_timesheet_lines_rates CHECK (
        regular_rate_snapshot >= 0 AND overtime_rate_snapshot >= 0 AND gross_amount >= 0
    )
);
CREATE INDEX ix_timesheet_lines_worker_date
    ON timesheet_lines (worker_id, work_date);

CREATE TABLE payroll_batches (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    payroll_number      text NOT NULL,
    period_start        date NOT NULL,
    period_end          date NOT NULL,
    status              payroll_status NOT NULL DEFAULT 'draft',
    currency            char(3) NOT NULL DEFAULT 'ETB',
    gross_amount        numeric(20,4) NOT NULL DEFAULT 0,
    deduction_amount    numeric(20,4) NOT NULL DEFAULT 0,
    net_amount          numeric(20,4) NOT NULL DEFAULT 0,
    prepared_by         uuid REFERENCES app_users(id),
    submitted_by        uuid REFERENCES app_users(id),
    submitted_at        timestamptz,
    approved_by         uuid REFERENCES app_users(id),
    approved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_payroll_batches_number UNIQUE (project_id, payroll_number),
    CONSTRAINT ck_payroll_batches_period CHECK (period_end >= period_start),
    CONSTRAINT ck_payroll_batches_values CHECK (
        gross_amount >= 0 AND deduction_amount >= 0 AND net_amount >= 0
        AND net_amount = gross_amount - deduction_amount
    ),
    CONSTRAINT ck_payroll_batches_sod CHECK (
        approved_by IS NULL
        OR (
            approved_by IS DISTINCT FROM prepared_by
            AND approved_by IS DISTINCT FROM submitted_by
        )
    ),
    CONSTRAINT ck_payroll_batches_approved CHECK (
        status NOT IN ('approved', 'partially_paid', 'paid')
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

CREATE TABLE payroll_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_batch_id    uuid NOT NULL REFERENCES payroll_batches(id) ON DELETE CASCADE,
    worker_id           uuid NOT NULL REFERENCES workers(id),
    regular_hours       numeric(12,4) NOT NULL DEFAULT 0,
    overtime_hours      numeric(12,4) NOT NULL DEFAULT 0,
    gross_amount        numeric(20,4) NOT NULL,
    deduction_amount    numeric(20,4) NOT NULL DEFAULT 0,
    net_amount          numeric(20,4) NOT NULL,
    calculation_detail  jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_payroll_lines_worker UNIQUE (payroll_batch_id, worker_id),
    CONSTRAINT ck_payroll_lines_values CHECK (
        regular_hours >= 0 AND overtime_hours >= 0
        AND gross_amount >= 0 AND deduction_amount >= 0 AND net_amount >= 0
        AND net_amount = gross_amount - deduction_amount
    ),
    CONSTRAINT ck_payroll_lines_detail CHECK (jsonb_typeof(calculation_detail) = 'object')
);

CREATE TABLE payroll_timesheet_links (
    payroll_line_id     uuid NOT NULL REFERENCES payroll_lines(id) ON DELETE CASCADE,
    timesheet_line_id   uuid NOT NULL REFERENCES timesheet_lines(id),
    amount_included     numeric(20,4) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (payroll_line_id, timesheet_line_id),
    CONSTRAINT uq_payroll_timesheet_line UNIQUE (timesheet_line_id),
    CONSTRAINT ck_payroll_timesheet_amount CHECK (amount_included >= 0)
);

CREATE TABLE worker_payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_line_id     uuid NOT NULL REFERENCES payroll_lines(id),
    payment_reference   text NOT NULL,
    payment_date        date NOT NULL,
    amount              numeric(20,4) NOT NULL,
    payment_method      text NOT NULL,
    recorded_by         uuid NOT NULL REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_worker_payments_reference UNIQUE (payroll_line_id, payment_reference),
    CONSTRAINT ck_worker_payments_amount CHECK (amount > 0),
    CONSTRAINT ck_worker_payments_method CHECK (
        payment_method IN ('bank', 'mobile_money', 'cash', 'other')
    )
);

-- ---------------------------------------------------------------------------
-- Structural-control evaluations and advisory AI findings
-- ---------------------------------------------------------------------------

CREATE TABLE control_rules (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
    rule_key            text NOT NULL,
    name                text NOT NULL,
    description         text,
    enforcement         text NOT NULL,
    subject_type        text NOT NULL,
    configuration       jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active           boolean NOT NULL DEFAULT true,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_control_rules_key CHECK (rule_key ~ '^[a-z][a-z0-9_.-]{2,95}$'),
    CONSTRAINT ck_control_rules_enforcement CHECK (enforcement IN ('hard_block', 'approval_required', 'warning')),
    CONSTRAINT ck_control_rules_configuration CHECK (jsonb_typeof(configuration) = 'object')
);
CREATE UNIQUE INDEX uq_control_rules_tenant
    ON control_rules (tenant_id, rule_key) WHERE project_id IS NULL;
CREATE UNIQUE INDEX uq_control_rules_project
    ON control_rules (project_id, rule_key) WHERE project_id IS NOT NULL;

CREATE TABLE control_evaluations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    control_rule_id     uuid NOT NULL REFERENCES control_rules(id),
    subject_type        text NOT NULL,
    subject_id          uuid NOT NULL,
    action_attempted    text NOT NULL,
    result              text NOT NULL,
    severity            issue_severity NOT NULL DEFAULT 'medium',
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
    evaluated_by        uuid REFERENCES app_users(id),
    evaluated_at        timestamptz NOT NULL DEFAULT now(),
    override_requested_by uuid REFERENCES app_users(id),
    override_approved_by uuid REFERENCES app_users(id),
    override_reason     text,
    override_approved_at timestamptz,
    CONSTRAINT ck_control_evaluations_result CHECK (result IN ('passed', 'blocked', 'warning', 'overridden')),
    CONSTRAINT ck_control_evaluations_evidence CHECK (jsonb_typeof(evidence) = 'object'),
    CONSTRAINT ck_control_evaluations_override CHECK (
        result <> 'overridden'
        OR (
            override_requested_by IS NOT NULL
            AND override_approved_by IS NOT NULL
            AND override_approved_by <> override_requested_by
            AND nullif(btrim(override_reason), '') IS NOT NULL
            AND override_approved_at IS NOT NULL
        )
    )
);
CREATE INDEX ix_control_evaluations_subject
    ON control_evaluations (project_id, subject_type, subject_id, evaluated_at DESC);
CREATE INDEX ix_control_evaluations_failures
    ON control_evaluations (project_id, result, severity, evaluated_at DESC)
    WHERE result IN ('blocked', 'warning');

CREATE TABLE ai_findings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    finding_type        text NOT NULL,
    subject_type        text NOT NULL,
    subject_id          uuid NOT NULL,
    severity            issue_severity NOT NULL DEFAULT 'medium',
    score               numeric(9,8),
    title               text NOT NULL,
    explanation         text NOT NULL,
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_provider      text NOT NULL,
    model_name          text NOT NULL,
    model_version       text,
    prompt_version      text,
    input_snapshot_hash char(64),
    status              ai_finding_status NOT NULL DEFAULT 'open',
    reviewed_by         uuid REFERENCES app_users(id),
    reviewed_at         timestamptz,
    review_notes        text,
    converted_issue_id  uuid REFERENCES issues(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_ai_findings_score CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    CONSTRAINT ck_ai_findings_evidence CHECK (jsonb_typeof(evidence) = 'object'),
    CONSTRAINT ck_ai_findings_hash CHECK (
        input_snapshot_hash IS NULL OR input_snapshot_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_ai_findings_review CHECK (
        status IN ('open', 'investigating')
        OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT ck_ai_findings_issue CHECK (
        status <> 'converted_to_issue' OR converted_issue_id IS NOT NULL
    )
);
CREATE INDEX ix_ai_findings_worklist
    ON ai_findings (project_id, status, severity, created_at DESC);

-- ---------------------------------------------------------------------------
-- IPC certificates, line snapshots, adjustments, MOS, and payment
-- ---------------------------------------------------------------------------

CREATE TABLE ipc_certificates (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    contract_id                 uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    boq_version_id              uuid NOT NULL REFERENCES boq_versions(id),
    ipc_number                  integer NOT NULL,
    certificate_reference       text,
    period_start                date NOT NULL,
    period_end                  date NOT NULL,
    status                      ipc_status NOT NULL DEFAULT 'draft',
    currency                    char(3) NOT NULL DEFAULT 'ETB',
    calculation_version         text,
    rule_snapshot               jsonb NOT NULL DEFAULT '{}'::jsonb,
    calculation_hash            char(64),
    previous_work_amount        numeric(20,4) NOT NULL DEFAULT 0,
    current_work_amount         numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_work_amount      numeric(20,4) NOT NULL DEFAULT 0,
    previous_mos_amount         numeric(20,4) NOT NULL DEFAULT 0,
    current_mos_amount          numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_mos_amount       numeric(20,4) NOT NULL DEFAULT 0,
    current_additions           numeric(20,4) NOT NULL DEFAULT 0,
    current_deductions          numeric(20,4) NOT NULL DEFAULT 0,
    current_retention           numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_retention        numeric(20,4) NOT NULL DEFAULT 0,
    current_advance_recovery    numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_advance_recovery numeric(20,4) NOT NULL DEFAULT 0,
    current_price_adjustment    numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_price_adjustment numeric(20,4) NOT NULL DEFAULT 0,
    current_withholding_tax     numeric(20,4) NOT NULL DEFAULT 0,
    current_vat                 numeric(20,4) NOT NULL DEFAULT 0,
    current_gross_amount        numeric(20,4) NOT NULL DEFAULT 0,
    net_current_amount          numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_net_amount       numeric(20,4) NOT NULL DEFAULT 0,
    submitted_by                uuid REFERENCES app_users(id),
    submitted_at                timestamptz,
    recommended_by              uuid REFERENCES app_users(id),
    recommended_at              timestamptz,
    certified_by                uuid REFERENCES app_users(id),
    certified_at                timestamptz,
    locked_at                   timestamptz,
    paid_at                     timestamptz,
    notes                       text,
    created_by                  uuid REFERENCES app_users(id),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    row_version                 bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_ipc_certificates_number UNIQUE (contract_id, ipc_number),
    CONSTRAINT ck_ipc_certificates_number CHECK (ipc_number > 0),
    CONSTRAINT ck_ipc_certificates_period CHECK (period_end >= period_start),
    CONSTRAINT ck_ipc_certificates_rule_snapshot CHECK (jsonb_typeof(rule_snapshot) = 'object'),
    CONSTRAINT ck_ipc_certificates_hash CHECK (
        calculation_hash IS NULL OR calculation_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT ck_ipc_certificates_locked CHECK (
        status NOT IN ('certified', 'paid') OR locked_at IS NOT NULL
    ),
    CONSTRAINT ck_ipc_certificates_certified_fields CHECK (
        status NOT IN ('certified', 'paid')
        OR (
            calculation_version IS NOT NULL
            AND calculation_hash IS NOT NULL
            AND certified_by IS NOT NULL
            AND certified_at IS NOT NULL
        )
    )
);
CREATE INDEX ix_ipc_register ON ipc_certificates (contract_id, status, period_end DESC);

CREATE TABLE ipc_lines (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_id                      uuid NOT NULL REFERENCES ipc_certificates(id) ON DELETE CASCADE,
    line_number                 integer NOT NULL,
    boq_item_id                 uuid NOT NULL REFERENCES boq_items(id),
    item_number_snapshot        text NOT NULL,
    source_code_snapshot        text,
    description_snapshot        text NOT NULL,
    unit_snapshot               text,
    contract_quantity_snapshot  numeric(20,6),
    rate_snapshot               numeric(20,6) NOT NULL,
    previous_quantity           numeric(20,6) NOT NULL DEFAULT 0,
    current_quantity            numeric(20,6) NOT NULL DEFAULT 0,
    cumulative_quantity         numeric(20,6) NOT NULL DEFAULT 0,
    previous_amount             numeric(20,4) NOT NULL DEFAULT 0,
    current_amount              numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_amount           numeric(20,4) NOT NULL DEFAULT 0,
    variance_reason             text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    row_version                 bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_ipc_lines_number UNIQUE (ipc_id, line_number),
    CONSTRAINT uq_ipc_lines_item UNIQUE (ipc_id, boq_item_id),
    CONSTRAINT ck_ipc_lines_number CHECK (line_number > 0),
    CONSTRAINT ck_ipc_lines_rate CHECK (rate_snapshot >= 0),
    CONSTRAINT ck_ipc_lines_quantity_reconcile CHECK (
        cumulative_quantity = previous_quantity + current_quantity
    ),
    CONSTRAINT ck_ipc_lines_amount_reconcile CHECK (
        cumulative_amount = previous_amount + current_amount
    )
);
CREATE INDEX ix_ipc_lines_item ON ipc_lines (boq_item_id, ipc_id);

CREATE TABLE ipc_measurement_links (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_line_id         uuid NOT NULL REFERENCES ipc_lines(id) ON DELETE CASCADE,
    measurement_line_id uuid NOT NULL REFERENCES measurement_lines(id),
    quantity_included   numeric(20,6) NOT NULL,
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ipc_measurement_link UNIQUE (ipc_line_id, measurement_line_id),
    CONSTRAINT ck_ipc_measurement_quantity CHECK (quantity_included <> 0)
);
CREATE INDEX ix_ipc_measurement_links_measurement
    ON ipc_measurement_links (measurement_line_id);

CREATE TABLE ipc_adjustments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_id              uuid NOT NULL REFERENCES ipc_certificates(id) ON DELETE CASCADE,
    line_number         integer NOT NULL,
    kind                adjustment_kind NOT NULL,
    description         text NOT NULL,
    direction           smallint NOT NULL,
    basis_code          text,
    basis_amount        numeric(20,4),
    percentage          numeric(12,8),
    quantity            numeric(20,6),
    rate                numeric(20,6),
    previous_amount     numeric(20,4) NOT NULL DEFAULT 0,
    current_amount      numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_amount   numeric(20,4) NOT NULL DEFAULT 0,
    source_clause_id    uuid REFERENCES contract_clauses(id),
    rule_key            text,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_ipc_adjustments_line UNIQUE (ipc_id, line_number),
    CONSTRAINT ck_ipc_adjustments_line CHECK (line_number > 0),
    CONSTRAINT ck_ipc_adjustments_direction CHECK (direction IN (-1, 1)),
    CONSTRAINT ck_ipc_adjustments_amounts CHECK (
        current_amount >= 0 AND previous_amount >= 0 AND cumulative_amount >= 0
    ),
    CONSTRAINT ck_ipc_adjustments_reconcile CHECK (
        cumulative_amount = previous_amount + current_amount
    ),
    CONSTRAINT ck_ipc_adjustments_percentage CHECK (
        percentage IS NULL OR percentage BETWEEN 0 AND 100
    )
);

CREATE TABLE ipc_materials_on_site (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_id              uuid NOT NULL REFERENCES ipc_certificates(id) ON DELETE CASCADE,
    line_number         integer NOT NULL,
    description         text NOT NULL,
    supplier_org_id     uuid REFERENCES organizations(id),
    invoice_number      text,
    invoice_date        date,
    delivery_date       date,
    storage_location    text,
    gross_value         numeric(20,4) NOT NULL,
    eligibility_percent numeric(12,8) NOT NULL DEFAULT 100,
    eligible_value      numeric(20,4) NOT NULL,
    previous_certified  numeric(20,4) NOT NULL DEFAULT 0,
    current_credit      numeric(20,4) NOT NULL DEFAULT 0,
    current_recovery    numeric(20,4) NOT NULL DEFAULT 0,
    cumulative_certified numeric(20,4) NOT NULL DEFAULT 0,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_ipc_mos_line UNIQUE (ipc_id, line_number),
    CONSTRAINT ck_ipc_mos_line CHECK (line_number > 0),
    CONSTRAINT ck_ipc_mos_values CHECK (
        gross_value >= 0 AND eligible_value >= 0 AND previous_certified >= 0
        AND current_credit >= 0 AND current_recovery >= 0 AND cumulative_certified >= 0
        AND eligibility_percent BETWEEN 0 AND 100
    ),
    CONSTRAINT ck_ipc_mos_cumulative CHECK (
        cumulative_certified = previous_certified + current_credit - current_recovery
    )
);

CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ipc_id              uuid NOT NULL REFERENCES ipc_certificates(id),
    payment_reference   text NOT NULL,
    payment_date        date NOT NULL,
    currency            char(3) NOT NULL DEFAULT 'ETB',
    gross_paid_amount   numeric(20,4) NOT NULL,
    withholding_amount  numeric(20,4) NOT NULL DEFAULT 0,
    other_deductions    numeric(20,4) NOT NULL DEFAULT 0,
    net_paid_amount     numeric(20,4) NOT NULL,
    payer_org_id        uuid REFERENCES organizations(id),
    payee_org_id        uuid REFERENCES organizations(id),
    bank_reference      text,
    notes               text,
    recorded_by         uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_payments_reference UNIQUE (ipc_id, payment_reference),
    CONSTRAINT ck_payments_values CHECK (
        gross_paid_amount > 0 AND withholding_amount >= 0
        AND other_deductions >= 0 AND net_paid_amount >= 0
    ),
    CONSTRAINT ck_payments_reconcile CHECK (
        net_paid_amount = gross_paid_amount - withholding_amount - other_deductions
    )
);
CREATE INDEX ix_payments_ipc_date ON payments (ipc_id, payment_date);

-- ---------------------------------------------------------------------------
-- Generic workflow execution
-- ---------------------------------------------------------------------------

CREATE TABLE workflow_definitions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    definition_key      text NOT NULL,
    version_number      integer NOT NULL,
    name                text NOT NULL,
    subject_type        text NOT NULL,
    status              workflow_definition_status NOT NULL DEFAULT 'draft',
    created_by          uuid REFERENCES app_users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_workflow_definitions_version UNIQUE (tenant_id, definition_key, version_number),
    CONSTRAINT ck_workflow_definitions_version CHECK (version_number > 0)
);
CREATE UNIQUE INDEX uq_workflow_one_active_definition
    ON workflow_definitions (tenant_id, definition_key) WHERE status = 'active';

CREATE TABLE workflow_definition_steps (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id       uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    step_number         integer NOT NULL,
    step_key            text NOT NULL,
    name                text NOT NULL,
    required_permission text REFERENCES permissions(permission_key),
    assignment_rule     jsonb NOT NULL DEFAULT '{}'::jsonb,
    sla_hours           integer,
    can_return_to_step  integer,
    is_terminal         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_workflow_steps_number UNIQUE (definition_id, step_number),
    CONSTRAINT uq_workflow_steps_key UNIQUE (definition_id, step_key),
    CONSTRAINT ck_workflow_steps_number CHECK (step_number > 0),
    CONSTRAINT ck_workflow_steps_sla CHECK (sla_hours IS NULL OR sla_hours >= 0),
    CONSTRAINT ck_workflow_steps_assignment CHECK (jsonb_typeof(assignment_rule) = 'object')
);

CREATE TABLE workflow_instances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    definition_id       uuid NOT NULL REFERENCES workflow_definitions(id),
    subject_type        text NOT NULL,
    subject_id          uuid NOT NULL,
    status              workflow_instance_status NOT NULL DEFAULT 'active',
    current_step_number integer,
    started_by          uuid REFERENCES app_users(id),
    started_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz,
    cancelled_at        timestamptz,
    context             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT ck_workflow_instances_context CHECK (jsonb_typeof(context) = 'object')
);
CREATE UNIQUE INDEX uq_workflow_active_subject
    ON workflow_instances (project_id, subject_type, subject_id)
    WHERE status = 'active';
CREATE INDEX ix_workflow_instances_subject
    ON workflow_instances (project_id, subject_type, subject_id, started_at DESC);

CREATE TABLE workflow_tasks (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    definition_step_id  uuid NOT NULL REFERENCES workflow_definition_steps(id),
    step_number         integer NOT NULL,
    status              workflow_task_status NOT NULL DEFAULT 'pending',
    assigned_user_id    uuid REFERENCES app_users(id),
    assigned_role_id    uuid REFERENCES roles(id),
    due_at              timestamptz,
    activated_at        timestamptz,
    completed_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    row_version         bigint NOT NULL DEFAULT 1,
    CONSTRAINT uq_workflow_tasks_step UNIQUE (workflow_instance_id, step_number),
    CONSTRAINT ck_workflow_tasks_number CHECK (step_number > 0)
);
CREATE INDEX ix_workflow_tasks_assignee
    ON workflow_tasks (assigned_user_id, status, due_at);

CREATE TABLE workflow_actions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    workflow_task_id    uuid REFERENCES workflow_tasks(id),
    action              workflow_action_type NOT NULL,
    from_step_number    integer,
    to_step_number      integer,
    comments            text,
    action_data         jsonb NOT NULL DEFAULT '{}'::jsonb,
    acted_by            uuid REFERENCES app_users(id),
    acted_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_workflow_actions_data CHECK (jsonb_typeof(action_data) = 'object')
);
CREATE INDEX ix_workflow_actions_instance_date
    ON workflow_actions (workflow_instance_id, acted_at);

-- ---------------------------------------------------------------------------
-- Notifications, reliable outbox, and immutable audit
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id          uuid REFERENCES projects(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    notification_type   text NOT NULL,
    title               text NOT NULL,
    body                text,
    target_type         text,
    target_id           uuid,
    status              notification_status NOT NULL DEFAULT 'queued',
    sent_at             timestamptz,
    read_at             timestamptz,
    error_message       text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_inbox
    ON notifications (user_id, status, created_at DESC);

CREATE TABLE outbox_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    project_id          uuid REFERENCES projects(id),
    aggregate_type      text NOT NULL,
    aggregate_id        uuid NOT NULL,
    event_type          text NOT NULL,
    payload             jsonb NOT NULL,
    status              outbox_status NOT NULL DEFAULT 'pending',
    available_at        timestamptz NOT NULL DEFAULT now(),
    attempts            integer NOT NULL DEFAULT 0,
    locked_at           timestamptz,
    locked_by           text,
    processed_at        timestamptz,
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0)
);
CREATE INDEX ix_outbox_worker
    ON outbox_events (status, available_at, created_at)
    WHERE status IN ('pending', 'failed');

CREATE TABLE audit_events (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id           uuid NOT NULL REFERENCES tenants(id),
    project_id          uuid REFERENCES projects(id),
    actor_user_id       uuid REFERENCES app_users(id),
    action              text NOT NULL,
    entity_type         text NOT NULL,
    entity_id           uuid,
    request_id          uuid,
    occurred_at         timestamptz NOT NULL DEFAULT clock_timestamp(),
    before_data         jsonb,
    after_data          jsonb,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_audit_before_object CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
    CONSTRAINT ck_audit_after_object CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object'),
    CONSTRAINT ck_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX ix_audit_entity ON audit_events (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_project_date ON audit_events (project_id, occurred_at DESC);
CREATE INDEX ix_audit_request ON audit_events (request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$fn$;

CREATE TRIGGER trg_audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_source_lineage_append_only
BEFORE UPDATE OR DELETE ON source_lineage
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_workflow_actions_append_only
BEFORE UPDATE OR DELETE ON workflow_actions
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_stock_ledger_append_only
BEFORE UPDATE OR DELETE ON stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER trg_control_evaluations_append_only
BEFORE UPDATE OR DELETE ON control_evaluations
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE OR REPLACE FUNCTION validate_purchase_order_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    supplier_state supplier_status;
    quote_supplier uuid;
BEGIN
    IF NEW.status IN ('approved', 'issued', 'partially_received', 'fully_received', 'closed') THEN
        SELECT status INTO supplier_state
        FROM suppliers
        WHERE id = NEW.supplier_id;

        IF supplier_state IS DISTINCT FROM 'approved'::supplier_status THEN
            RAISE EXCEPTION 'Purchase order cannot proceed: supplier % is not approved', NEW.supplier_id
                USING ERRCODE = '23514';
        END IF;

        IF NEW.selected_quote_id IS NOT NULL THEN
            SELECT supplier_id INTO quote_supplier
            FROM supplier_quotes
            WHERE id = NEW.selected_quote_id;

            IF quote_supplier IS DISTINCT FROM NEW.supplier_id THEN
                RAISE EXCEPTION 'Selected quote supplier does not match purchase order supplier'
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_purchase_orders_gate
BEFORE INSERT OR UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_gate();

CREATE OR REPLACE FUNCTION enforce_goods_receipt_separation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    actor_conflict boolean;
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status = 'accepted' AND state_changed THEN
        SELECT
            NEW.received_by IN (po.created_by, po.approved_by, po.issued_by)
            OR EXISTS (
                SELECT 1
                FROM purchase_order_lines pol
                JOIN purchase_requisition_lines prl ON prl.id = pol.requisition_line_id
                JOIN purchase_requisitions pr ON pr.id = prl.requisition_id
                WHERE pol.purchase_order_id = po.id
                  AND NEW.received_by IN (pr.requested_by, pr.approved_by)
            )
        INTO actor_conflict
        FROM purchase_orders po
        WHERE po.id = NEW.purchase_order_id;

        IF COALESCE(actor_conflict, false) THEN
            RAISE EXCEPTION 'Segregation-of-duties violation: receiver participated in requesting or approving this purchase'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_goods_receipts_separation
BEFORE INSERT OR UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_goods_receipt_separation();

CREATE OR REPLACE FUNCTION prevent_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    projected_quantity numeric(20,6);
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.warehouse_id::text || ':' || NEW.inventory_item_id::text, 0)
    );

    SELECT COALESCE(sum(quantity_delta), 0) + NEW.quantity_delta
    INTO projected_quantity
    FROM stock_ledger_entries
    WHERE warehouse_id = NEW.warehouse_id
      AND inventory_item_id = NEW.inventory_item_id;

    IF projected_quantity < 0 THEN
        RAISE EXCEPTION
            'Insufficient stock for warehouse %, item %; projected quantity %',
            NEW.warehouse_id, NEW.inventory_item_id, projected_quantity
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_stock_ledger_nonnegative
BEFORE INSERT ON stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_negative_stock();

CREATE OR REPLACE FUNCTION post_goods_receipt_to_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status = 'accepted' AND state_changed THEN
        INSERT INTO stock_ledger_entries (
            project_id,
            warehouse_id,
            inventory_item_id,
            entry_type,
            quantity_delta,
            unit_cost,
            value_delta,
            source_type,
            source_id,
            source_line_id,
            occurred_at,
            posted_by,
            notes
        )
        SELECT
            NEW.project_id,
            NEW.warehouse_id,
            grl.inventory_item_id,
            'receipt',
            grl.accepted_quantity,
            pol.unit_price,
            round(grl.accepted_quantity * pol.unit_price, 4),
            'goods_receipt',
            NEW.id,
            grl.id,
            COALESCE(NEW.accepted_at, clock_timestamp()),
            NEW.accepted_by,
            'Automatically posted from accepted GRN ' || NEW.receipt_number
        FROM goods_receipt_lines grl
        JOIN purchase_order_lines pol ON pol.id = grl.purchase_order_line_id
        WHERE grl.goods_receipt_id = NEW.id
          AND grl.accepted_quantity > 0
        ON CONFLICT (
            warehouse_id, inventory_item_id, entry_type, source_type, source_id, source_line_id
        ) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_goods_receipts_post_stock
AFTER UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt_to_stock();

CREATE TRIGGER trg_goods_receipts_insert_stock
AFTER INSERT ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt_to_stock();

CREATE OR REPLACE FUNCTION post_material_issue_to_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status = 'posted' AND state_changed THEN
        INSERT INTO stock_ledger_entries (
            project_id,
            warehouse_id,
            inventory_item_id,
            entry_type,
            quantity_delta,
            unit_cost,
            value_delta,
            source_type,
            source_id,
            source_line_id,
            occurred_at,
            posted_by,
            notes
        )
        SELECT
            NEW.project_id,
            NEW.warehouse_id,
            mil.inventory_item_id,
            'issue',
            -mil.issued_quantity,
            mil.unit_cost_snapshot,
            -round(mil.issued_quantity * mil.unit_cost_snapshot, 4),
            'material_issue',
            NEW.id,
            mil.id,
            COALESCE(NEW.posted_at, clock_timestamp()),
            NEW.issued_by,
            'Automatically posted from material issue ' || NEW.issue_number
        FROM material_issue_lines mil
        WHERE mil.material_issue_id = NEW.id
        ON CONFLICT (
            warehouse_id, inventory_item_id, entry_type, source_type, source_id, source_line_id
        ) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_material_issues_post_stock
AFTER UPDATE OF status ON material_issues
FOR EACH ROW EXECUTE FUNCTION post_material_issue_to_stock();

CREATE TRIGGER trg_material_issues_insert_stock
AFTER INSERT ON material_issues
FOR EACH ROW EXECUTE FUNCTION post_material_issue_to_stock();

CREATE OR REPLACE FUNCTION post_stock_count_adjustment()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status = 'posted' AND state_changed THEN
        INSERT INTO stock_ledger_entries (
            project_id,
            warehouse_id,
            inventory_item_id,
            entry_type,
            quantity_delta,
            unit_cost,
            value_delta,
            source_type,
            source_id,
            source_line_id,
            occurred_at,
            posted_by,
            notes
        )
        SELECT
            NEW.project_id,
            NEW.warehouse_id,
            scl.inventory_item_id,
            'count_adjustment',
            scl.variance_quantity,
            scl.unit_cost_snapshot,
            round(scl.variance_quantity * scl.unit_cost_snapshot, 4),
            'stock_count',
            NEW.id,
            scl.id,
            COALESCE(NEW.posted_at, clock_timestamp()),
            NEW.approved_by,
            COALESCE(scl.reason, 'Posted physical stock-count variance')
        FROM stock_count_lines scl
        WHERE scl.stock_count_id = NEW.id
          AND scl.variance_quantity <> 0
        ON CONFLICT (
            warehouse_id, inventory_item_id, entry_type, source_type, source_id, source_line_id
        ) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_stock_counts_post_adjustment
AFTER UPDATE OF status ON stock_counts
FOR EACH ROW EXECUTE FUNCTION post_stock_count_adjustment();

CREATE TRIGGER trg_stock_counts_insert_adjustment
AFTER INSERT ON stock_counts
FOR EACH ROW EXECUTE FUNCTION post_stock_count_adjustment();

CREATE OR REPLACE FUNCTION validate_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    invoice_state supplier_invoice_status;
    invoice_gross numeric(20,4);
    invoice_approver uuid;
    passed_match boolean;
    paid_to_date numeric(20,4);
BEGIN
    SELECT status, gross_amount, approved_by
    INTO invoice_state, invoice_gross, invoice_approver
    FROM supplier_invoices
    WHERE id = NEW.supplier_invoice_id
    FOR UPDATE;

    IF invoice_state NOT IN ('approved_for_payment', 'partially_paid') THEN
        RAISE EXCEPTION 'Supplier invoice is not approved for payment'
            USING ERRCODE = '23514';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM three_way_matches
        WHERE supplier_invoice_id = NEW.supplier_invoice_id
          AND status = 'passed'
    ) INTO passed_match;

    IF NOT passed_match THEN
        RAISE EXCEPTION 'Supplier invoice has no passed three-way match'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.recorded_by = invoice_approver THEN
        RAISE EXCEPTION 'Segregation-of-duties violation: invoice approver cannot record its payment'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(sum(gross_paid_amount), 0)
    INTO paid_to_date
    FROM supplier_payments
    WHERE supplier_invoice_id = NEW.supplier_invoice_id;

    IF paid_to_date + NEW.gross_paid_amount > invoice_gross THEN
        RAISE EXCEPTION 'Supplier payment exceeds invoice gross amount'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_supplier_payments_gate
BEFORE INSERT ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION validate_supplier_payment();

CREATE OR REPLACE FUNCTION validate_worker_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    batch_state payroll_status;
    batch_approver uuid;
    line_net numeric(20,4);
    roster_state worker_status;
    paid_to_date numeric(20,4);
BEGIN
    SELECT pb.status, pb.approved_by, pl.net_amount, w.status
    INTO batch_state, batch_approver, line_net, roster_state
    FROM payroll_lines pl
    JOIN payroll_batches pb ON pb.id = pl.payroll_batch_id
    JOIN workers w ON w.id = pl.worker_id
    WHERE pl.id = NEW.payroll_line_id
    FOR UPDATE OF pl;

    IF batch_state NOT IN ('approved', 'partially_paid') THEN
        RAISE EXCEPTION 'Payroll batch is not approved for payment'
            USING ERRCODE = '23514';
    END IF;

    IF roster_state <> 'active' THEN
        RAISE EXCEPTION 'Worker is not active on the authorized roster'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.recorded_by = batch_approver THEN
        RAISE EXCEPTION 'Segregation-of-duties violation: payroll approver cannot record worker payment'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(sum(amount), 0)
    INTO paid_to_date
    FROM worker_payments
    WHERE payroll_line_id = NEW.payroll_line_id;

    IF paid_to_date + NEW.amount > line_net THEN
        RAISE EXCEPTION 'Worker payment exceeds approved payroll-line net amount'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_worker_payments_gate
BEFORE INSERT ON worker_payments
FOR EACH ROW EXECUTE FUNCTION validate_worker_payment();

CREATE OR REPLACE FUNCTION validate_three_way_match_pass()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    invoice_line_count integer;
    match_line_count integer;
    compliant_line_count integer;
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status = 'passed' AND state_changed THEN
        SELECT count(*)
        INTO invoice_line_count
        FROM supplier_invoice_lines
        WHERE supplier_invoice_id = NEW.supplier_invoice_id;

        SELECT
            count(*),
            count(*) FILTER (
                WHERE twml.status = 'passed'
                  AND twml.goods_receipt_line_id IS NOT NULL
                  AND gr.status = 'accepted'
                  AND twml.specification_match IS TRUE
                  AND twml.quantity_variance = 0
                  AND twml.price_variance = 0
            )
        INTO match_line_count, compliant_line_count
        FROM three_way_match_lines twml
        LEFT JOIN goods_receipt_lines grl ON grl.id = twml.goods_receipt_line_id
        LEFT JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
        WHERE twml.three_way_match_id = NEW.id;

        IF invoice_line_count = 0
           OR match_line_count <> invoice_line_count
           OR compliant_line_count <> invoice_line_count THEN
            RAISE EXCEPTION 'Three-way match cannot pass until every invoice line has a passing PO/accepted-GRN comparison'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_three_way_matches_pass_gate
BEFORE INSERT OR UPDATE ON three_way_matches
FOR EACH ROW EXECUTE FUNCTION validate_three_way_match_pass();

CREATE OR REPLACE FUNCTION validate_supplier_invoice_state()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    po_supplier uuid;
    has_passed_match boolean;
BEGIN
    SELECT supplier_id INTO po_supplier
    FROM purchase_orders
    WHERE id = NEW.purchase_order_id;

    IF po_supplier IS DISTINCT FROM NEW.supplier_id THEN
        RAISE EXCEPTION 'Invoice supplier does not match purchase order supplier'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status IN ('approved_for_payment', 'partially_paid', 'paid') THEN
        SELECT EXISTS (
            SELECT 1
            FROM three_way_matches
            WHERE supplier_invoice_id = NEW.id
              AND status = 'passed'
        ) INTO has_passed_match;

        IF NOT has_passed_match THEN
            RAISE EXCEPTION 'Invoice cannot be approved for payment without a passed three-way match'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_supplier_invoices_state_gate
BEFORE INSERT OR UPDATE ON supplier_invoices
FOR EACH ROW EXECUTE FUNCTION validate_supplier_invoice_state();

CREATE OR REPLACE FUNCTION validate_worker_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    worker_project uuid;
    roster_state worker_status;
    roster_start date;
    roster_end date;
    parent_project uuid;
    parent_start date;
    parent_end date;
    work_day date;
BEGIN
    IF TG_TABLE_NAME = 'attendance_records' THEN
        parent_project := NEW.project_id;
        work_day := NEW.attendance_date;
    ELSE
        SELECT project_id, period_start, period_end
        INTO parent_project, parent_start, parent_end
        FROM timesheets
        WHERE id = NEW.timesheet_id;
        work_day := NEW.work_date;

        IF work_day < parent_start OR work_day > parent_end THEN
            RAISE EXCEPTION 'Timesheet line date is outside the timesheet period'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT project_id, status, start_date, end_date
    INTO worker_project, roster_state, roster_start, roster_end
    FROM workers
    WHERE id = NEW.worker_id;

    IF worker_project IS DISTINCT FROM parent_project THEN
        RAISE EXCEPTION 'Worker and attendance/timesheet belong to different projects'
            USING ERRCODE = '23514';
    END IF;

    IF roster_state <> 'active'
       OR (roster_start IS NOT NULL AND work_day < roster_start)
       OR (roster_end IS NOT NULL AND work_day > roster_end) THEN
        RAISE EXCEPTION 'Worker is not active on the authorized roster for this date'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_attendance_worker_gate
BEFORE INSERT OR UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION validate_worker_transaction();

CREATE TRIGGER trg_timesheet_lines_worker_gate
BEFORE INSERT OR UPDATE ON timesheet_lines
FOR EACH ROW EXECUTE FUNCTION validate_worker_transaction();

CREATE OR REPLACE FUNCTION validate_payroll_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    line_count integer;
    invalid_line_count integer;
    calculated_gross numeric(20,4);
    calculated_deductions numeric(20,4);
    calculated_net numeric(20,4);
    state_changed boolean;
BEGIN
    state_changed := (TG_OP = 'INSERT');
    IF TG_OP = 'UPDATE' THEN
        state_changed := OLD.status IS DISTINCT FROM NEW.status;
    END IF;

    IF NEW.status IN ('approved', 'partially_paid', 'paid')
       AND state_changed THEN
        SELECT
            count(*),
            COALESCE(sum(gross_amount), 0),
            COALESCE(sum(deduction_amount), 0),
            COALESCE(sum(net_amount), 0)
        INTO line_count, calculated_gross, calculated_deductions, calculated_net
        FROM payroll_lines
        WHERE payroll_batch_id = NEW.id;

        SELECT count(*)
        INTO invalid_line_count
        FROM payroll_lines pl
        JOIN workers w ON w.id = pl.worker_id
        WHERE pl.payroll_batch_id = NEW.id
          AND (
              w.status <> 'active'
              OR NOT EXISTS (
                  SELECT 1
                  FROM payroll_timesheet_links ptl
                  JOIN timesheet_lines tl ON tl.id = ptl.timesheet_line_id
                  JOIN timesheets ts ON ts.id = tl.timesheet_id
                  WHERE ptl.payroll_line_id = pl.id
                    AND tl.worker_id = pl.worker_id
                    AND ts.status IN ('approved', 'included_in_payroll')
              )
          );

        IF line_count = 0 OR invalid_line_count > 0 THEN
            RAISE EXCEPTION 'Payroll cannot be approved: every line needs an active worker and approved timesheet evidence'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.gross_amount <> calculated_gross
           OR NEW.deduction_amount <> calculated_deductions
           OR NEW.net_amount <> calculated_net THEN
            RAISE EXCEPTION 'Payroll header totals do not reconcile to payroll lines'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_payroll_batches_approval_gate
BEFORE INSERT OR UPDATE ON payroll_batches
FOR EACH ROW EXECUTE FUNCTION validate_payroll_approval();

CREATE OR REPLACE FUNCTION validate_ipc_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    certificate_state ipc_status;
    certificate_locked timestamptz;
    certificate_net numeric(20,4);
    certificate_currency char(3);
    certificate_certifier uuid;
    paid_to_date numeric(20,4);
BEGIN
    SELECT status, locked_at, net_current_amount, currency, certified_by
    INTO certificate_state, certificate_locked, certificate_net, certificate_currency, certificate_certifier
    FROM ipc_certificates
    WHERE id = NEW.ipc_id
    FOR UPDATE;

    IF certificate_state NOT IN ('certified', 'paid') OR certificate_locked IS NULL THEN
        RAISE EXCEPTION 'Contractor payment requires a certified and locked IPC'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.currency <> certificate_currency THEN
        RAISE EXCEPTION 'Payment currency does not match IPC currency'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.recorded_by = certificate_certifier THEN
        RAISE EXCEPTION 'Segregation-of-duties violation: IPC certifier cannot record payment'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(sum(net_paid_amount), 0)
    INTO paid_to_date
    FROM payments
    WHERE ipc_id = NEW.ipc_id;

    IF paid_to_date + NEW.net_paid_amount > certificate_net THEN
        RAISE EXCEPTION 'Contractor payments exceed the certified net amount'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_ipc_payments_gate
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_ipc_payment();

-- ---------------------------------------------------------------------------
-- Locked IPC protections
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION protect_locked_ipc_child()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    parent_ipc_id uuid;
    parent_locked timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN
        parent_ipc_id := OLD.ipc_id;
    ELSE
        parent_ipc_id := NEW.ipc_id;
    END IF;
    SELECT locked_at INTO parent_locked
    FROM ipc_certificates
    WHERE id = parent_ipc_id;

    IF parent_locked IS NOT NULL THEN
        RAISE EXCEPTION 'IPC % is locked; child records are immutable', parent_ipc_id
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_ipc_lines_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_lines
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE TRIGGER trg_ipc_adjustments_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_adjustments
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE TRIGGER trg_ipc_mos_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_materials_on_site
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE OR REPLACE FUNCTION protect_locked_ipc_measurement_link()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    parent_locked timestamptz;
    parent_line_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        parent_line_id := OLD.ipc_line_id;
    ELSE
        parent_line_id := NEW.ipc_line_id;
    END IF;
    SELECT c.locked_at INTO parent_locked
    FROM ipc_lines l
    JOIN ipc_certificates c ON c.id = l.ipc_id
    WHERE l.id = parent_line_id;

    IF parent_locked IS NOT NULL THEN
        RAISE EXCEPTION 'The parent IPC is locked; measurement links are immutable'
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_ipc_measurement_links_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_measurement_links
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_measurement_link();

-- ---------------------------------------------------------------------------
-- Optimistic-lock and timestamp triggers
-- ---------------------------------------------------------------------------

DO $block$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'tenants', 'organizations', 'app_users', 'tenant_memberships', 'roles',
        'projects', 'project_members', 'locations', 'contracts', 'work_packages',
        'documents', 'document_revisions', 'transmittals', 'contract_clauses',
        'contract_rules', 'contract_obligations', 'contract_securities',
        'import_jobs', 'import_mappings', 'import_exceptions',
        'boq_versions', 'boq_sections', 'boq_items', 'variations', 'variation_items',
        'provisional_sum_usages', 'daywork_sheets', 'daywork_lines',
        'measurements', 'measurement_lines', 'measurement_segments', 'rfis',
        'inspection_requests', 'inspection_check_items', 'issues',
        'suppliers', 'cost_codes', 'warehouses', 'inventory_items',
        'purchase_requisitions', 'purchase_requisition_lines',
        'supplier_quotes', 'supplier_quote_lines',
        'purchase_orders', 'purchase_order_lines',
        'goods_receipts', 'goods_receipt_lines',
        'supplier_invoices', 'supplier_invoice_lines',
        'material_issues', 'material_issue_lines',
        'stock_counts', 'stock_count_lines',
        'workers', 'attendance_records', 'timesheets', 'timesheet_lines',
        'payroll_batches', 'payroll_lines', 'control_rules', 'ai_findings',
        'ipc_certificates', 'ipc_lines', 'ipc_adjustments', 'ipc_materials_on_site',
        'workflow_definitions', 'workflow_instances', 'workflow_tasks'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bump_row_version()',
            'trg_' || table_name || '_version',
            table_name
        );
    END LOOP;
END;
$block$;

CREATE TRIGGER trg_import_rows_updated
BEFORE UPDATE ON import_rows
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------

CREATE VIEW v_boq_progress AS
WITH measured AS (
    SELECT
        ml.boq_item_id,
        sum(COALESCE(ml.accepted_quantity, 0)) AS measured_quantity
    FROM measurement_lines ml
    JOIN measurements m ON m.id = ml.measurement_id
    WHERE m.status IN ('verified', 'included')
    GROUP BY ml.boq_item_id
),
certified AS (
    SELECT
        il.boq_item_id,
        sum(il.current_quantity) AS certified_quantity,
        sum(il.current_amount) AS certified_amount
    FROM ipc_lines il
    JOIN ipc_certificates ipc ON ipc.id = il.ipc_id
    WHERE ipc.status IN ('certified', 'paid')
    GROUP BY il.boq_item_id
)
SELECT
    p.tenant_id,
    c.project_id,
    bv.contract_id,
    bi.boq_version_id,
    bi.id AS boq_item_id,
    bi.item_number,
    bi.source_code,
    bi.description,
    bi.unit,
    bi.approved_quantity,
    bi.rate,
    bi.approved_amount,
    COALESCE(m.measured_quantity, 0) AS measured_quantity,
    COALESCE(cert.certified_quantity, 0) AS certified_quantity,
    COALESCE(cert.certified_amount, 0) AS certified_amount,
    CASE
        WHEN bi.approved_quantity IS NULL THEN NULL
        ELSE bi.approved_quantity - COALESCE(cert.certified_quantity, 0)
    END AS remaining_quantity
FROM boq_items bi
JOIN boq_versions bv ON bv.id = bi.boq_version_id
JOIN contracts c ON c.id = bv.contract_id
JOIN projects p ON p.id = c.project_id
LEFT JOIN measured m ON m.boq_item_id = bi.id
LEFT JOIN certified cert ON cert.boq_item_id = bi.id;

CREATE VIEW v_ipc_register AS
SELECT
    p.tenant_id,
    ipc.project_id,
    ipc.contract_id,
    ipc.id AS ipc_id,
    ipc.ipc_number,
    ipc.period_start,
    ipc.period_end,
    ipc.status,
    ipc.currency,
    ipc.current_work_amount,
    ipc.current_mos_amount,
    ipc.current_additions,
    ipc.current_deductions,
    ipc.current_vat,
    ipc.current_gross_amount,
    ipc.net_current_amount,
    ipc.cumulative_net_amount,
    ipc.certified_at,
    ipc.paid_at,
    COALESCE(pay.total_net_paid, 0) AS total_net_paid
FROM ipc_certificates ipc
JOIN projects p ON p.id = ipc.project_id
LEFT JOIN (
    SELECT ipc_id, sum(net_paid_amount) AS total_net_paid
    FROM payments
    GROUP BY ipc_id
) pay ON pay.ipc_id = ipc.id;

CREATE VIEW v_contract_commercial_position AS
SELECT
    p.tenant_id,
    c.project_id,
    c.id AS contract_id,
    c.contract_number,
    c.currency,
    c.original_contract_amount,
    COALESCE(v.approved_variations, 0) AS approved_variations,
    c.revised_contract_amount,
    COALESCE(i.certified_net, 0) AS certified_net,
    COALESCE(i.retention_held, 0) AS retention_held,
    COALESCE(pay.paid_net, 0) AS paid_net,
    c.revised_contract_amount - COALESCE(i.certified_net, 0) AS uncertified_balance
FROM contracts c
JOIN projects p ON p.id = c.project_id
LEFT JOIN (
    SELECT contract_id, sum(approved_value) AS approved_variations
    FROM variations
    WHERE status IN ('approved', 'incorporated')
    GROUP BY contract_id
) v ON v.contract_id = c.id
LEFT JOIN (
    SELECT
        contract_id,
        sum(net_current_amount) AS certified_net,
        max(cumulative_retention) AS retention_held
    FROM ipc_certificates
    WHERE status IN ('certified', 'paid')
    GROUP BY contract_id
) i ON i.contract_id = c.id
LEFT JOIN (
    SELECT ipc.contract_id, sum(pay.net_paid_amount) AS paid_net
    FROM payments pay
    JOIN ipc_certificates ipc ON ipc.id = pay.ipc_id
    GROUP BY ipc.contract_id
) pay ON pay.contract_id = c.id;

CREATE VIEW v_open_exceptions AS
SELECT
    p.tenant_id,
    j.project_id,
    e.id AS exception_id,
    'import'::text AS source_type,
    e.exception_code AS category,
    e.severity,
    e.status::text AS status,
    e.message AS title,
    e.assigned_to,
    e.created_at,
    extract(epoch FROM (now() - e.created_at)) / 86400.0 AS age_days
FROM import_exceptions e
JOIN import_jobs j ON j.id = e.import_job_id
JOIN projects p ON p.id = j.project_id
WHERE e.status IN ('open', 'assigned')
UNION ALL
SELECT
    p.tenant_id,
    i.project_id,
    i.id AS exception_id,
    'issue'::text AS source_type,
    i.issue_type AS category,
    i.severity,
    i.status::text AS status,
    i.title,
    i.assigned_to,
    i.created_at,
    extract(epoch FROM (now() - i.created_at)) / 86400.0 AS age_days
FROM issues i
JOIN projects p ON p.id = i.project_id
WHERE i.status IN ('open', 'in_progress', 'blocked');

CREATE VIEW v_document_register AS
SELECT
    p.tenant_id,
    d.project_id,
    d.contract_id,
    d.id AS document_id,
    d.document_number,
    d.title,
    d.category,
    d.discipline,
    d.status,
    r.id AS current_revision_id,
    r.revision_number,
    r.issued_date,
    r.issue_purpose,
    r.page_count,
    r.ocr_status
FROM documents d
JOIN projects p ON p.id = d.project_id
LEFT JOIN document_revisions r
    ON r.document_id = d.id AND r.is_current;

CREATE VIEW v_stock_on_hand AS
SELECT
    p.tenant_id,
    sle.project_id,
    sle.warehouse_id,
    w.warehouse_code,
    w.name AS warehouse_name,
    sle.inventory_item_id,
    ii.item_code,
    ii.description,
    ii.unit,
    sum(sle.quantity_delta) AS quantity_on_hand,
    sum(sle.value_delta) AS ledger_value,
    max(sle.occurred_at) AS last_movement_at
FROM stock_ledger_entries sle
JOIN projects p ON p.id = sle.project_id
JOIN warehouses w ON w.id = sle.warehouse_id
JOIN inventory_items ii ON ii.id = sle.inventory_item_id
GROUP BY
    p.tenant_id, sle.project_id, sle.warehouse_id, w.warehouse_code, w.name,
    sle.inventory_item_id, ii.item_code, ii.description, ii.unit;

CREATE VIEW v_three_way_match_worklist AS
SELECT
    p.tenant_id,
    si.project_id,
    si.id AS supplier_invoice_id,
    si.invoice_number,
    si.invoice_date,
    si.due_date,
    s.supplier_code,
    o.legal_name AS supplier_name,
    po.purchase_order_number,
    si.currency,
    si.gross_amount,
    si.status AS invoice_status,
    twm.id AS current_match_id,
    twm.status AS match_status,
    twm.exception_count,
    twm.matched_at
FROM supplier_invoices si
JOIN projects p ON p.id = si.project_id
JOIN suppliers s ON s.id = si.supplier_id
JOIN organizations o ON o.id = s.organization_id
JOIN purchase_orders po ON po.id = si.purchase_order_id
LEFT JOIN three_way_matches twm
    ON twm.supplier_invoice_id = si.id
   AND twm.status <> 'superseded';

CREATE VIEW v_labor_cost_by_package AS
SELECT
    p.tenant_id,
    ts.project_id,
    tl.work_package_id,
    wp.package_code,
    tl.cost_code_id,
    cc.cost_code,
    tl.worker_id,
    w.worker_number,
    w.display_name,
    sum(tl.regular_hours) AS regular_hours,
    sum(tl.overtime_hours) AS overtime_hours,
    sum(tl.gross_amount) AS approved_gross_amount
FROM timesheet_lines tl
JOIN timesheets ts ON ts.id = tl.timesheet_id
JOIN projects p ON p.id = ts.project_id
JOIN workers w ON w.id = tl.worker_id
LEFT JOIN work_packages wp ON wp.id = tl.work_package_id
LEFT JOIN cost_codes cc ON cc.id = tl.cost_code_id
WHERE ts.status IN ('approved', 'included_in_payroll')
GROUP BY
    p.tenant_id, ts.project_id, tl.work_package_id, wp.package_code,
    tl.cost_code_id, cc.cost_code, tl.worker_id, w.worker_number, w.display_name;

CREATE VIEW v_three_money_streams AS
WITH stream_rows AS (
    SELECT
        ipc.project_id,
        date_trunc('month', ipc.period_end)::date AS period_month,
        ipc.net_current_amount AS employer_to_contractor_certified,
        0::numeric(20,4) AS contractor_to_supplier_paid,
        0::numeric(20,4) AS contractor_to_worker_paid
    FROM ipc_certificates ipc
    WHERE ipc.status IN ('certified', 'paid')

    UNION ALL

    SELECT
        si.project_id,
        date_trunc('month', sp.payment_date)::date,
        0::numeric(20,4),
        sp.net_paid_amount,
        0::numeric(20,4)
    FROM supplier_payments sp
    JOIN supplier_invoices si ON si.id = sp.supplier_invoice_id

    UNION ALL

    SELECT
        pb.project_id,
        date_trunc('month', wp.payment_date)::date,
        0::numeric(20,4),
        0::numeric(20,4),
        wp.amount
    FROM worker_payments wp
    JOIN payroll_lines pl ON pl.id = wp.payroll_line_id
    JOIN payroll_batches pb ON pb.id = pl.payroll_batch_id
)
SELECT
    p.tenant_id,
    sr.project_id,
    sr.period_month,
    sum(sr.employer_to_contractor_certified) AS employer_to_contractor_certified,
    sum(sr.contractor_to_supplier_paid) AS contractor_to_supplier_paid,
    sum(sr.contractor_to_worker_paid) AS contractor_to_worker_paid
FROM stream_rows sr
JOIN projects p ON p.id = sr.project_id
GROUP BY p.tenant_id, sr.project_id, sr.period_month;

-- ---------------------------------------------------------------------------
-- Row-level security helpers and starter policies
-- API authorization remains mandatory. These policies provide defense in depth.
-- Each request transaction should SET LOCAL app.tenant_id and app.user_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_app_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
    SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$fn$;

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$
    SELECT nullif(current_setting('app.user_id', true), '')::uuid
$fn$;

CREATE OR REPLACE FUNCTION has_tenant_permission(
    requested_tenant_id uuid,
    requested_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ecms, pg_temp
AS $fn$
    SELECT
        requested_tenant_id = current_app_tenant_id()
        AND EXISTS (
            SELECT 1
            FROM tenant_memberships tm
            JOIN tenant_member_roles tmr
              ON tmr.tenant_id = tm.tenant_id AND tmr.user_id = tm.user_id
            JOIN role_permissions rp ON rp.role_id = tmr.role_id
            WHERE tm.tenant_id = requested_tenant_id
              AND tm.user_id = current_app_user_id()
              AND tm.status = 'active'
              AND rp.permission_key = requested_permission
        )
$fn$;

CREATE OR REPLACE FUNCTION can_access_project(requested_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ecms, pg_temp
AS $fn$
    SELECT EXISTS (
        SELECT 1
        FROM projects p
        WHERE p.id = requested_project_id
          AND p.tenant_id = current_app_tenant_id()
          AND (
              EXISTS (
                  SELECT 1
                  FROM project_members pm
                  WHERE pm.project_id = p.id
                    AND pm.user_id = current_app_user_id()
                    AND pm.status = 'active'
                    AND (pm.valid_from IS NULL OR pm.valid_from <= current_date)
                    AND (pm.valid_to IS NULL OR pm.valid_to >= current_date)
              )
              OR has_tenant_permission(p.tenant_id, 'project.read_all')
          )
    )
$fn$;

CREATE OR REPLACE FUNCTION has_project_permission(
    requested_project_id uuid,
    requested_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ecms, pg_temp
AS $fn$
    SELECT
        can_access_project(requested_project_id)
        AND (
            EXISTS (
                SELECT 1
                FROM project_members pm
                JOIN project_member_roles pmr ON pmr.project_member_id = pm.id
                JOIN role_permissions rp ON rp.role_id = pmr.role_id
                WHERE pm.project_id = requested_project_id
                  AND pm.user_id = current_app_user_id()
                  AND pm.status = 'active'
                  AND rp.permission_key = requested_permission
            )
            OR EXISTS (
                SELECT 1
                FROM projects p
                WHERE p.id = requested_project_id
                  AND has_tenant_permission(p.tenant_id, requested_permission)
            )
        )
$fn$;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_read_policy ON projects
    FOR SELECT USING (can_access_project(id));

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contracts_read_policy ON contracts
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_read_policy ON documents
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY measurements_read_policy ON measurements
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY variations_read_policy ON variations
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY rfis_read_policy ON rfis
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE inspection_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY inspections_read_policy ON inspection_requests
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY issues_read_policy ON issues
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE ipc_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ipc_read_policy ON ipc_certificates
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_jobs_read_policy ON import_jobs
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requisitions_read_policy ON purchase_requisitions
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_read_policy ON purchase_orders
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY goods_receipts_read_policy ON goods_receipts
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_invoices_read_policy ON supplier_invoices
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE material_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_issues_read_policy ON material_issues
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_counts_read_policy ON stock_counts
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE stock_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_ledger_read_policy ON stock_ledger_entries
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workers_read_policy ON workers
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY timesheets_read_policy ON timesheets
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE payroll_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_batches_read_policy ON payroll_batches
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE control_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY control_evaluations_read_policy ON control_evaluations
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE ai_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_findings_read_policy ON ai_findings
    FOR SELECT USING (can_access_project(project_id));

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read_policy ON audit_events
    FOR SELECT USING (
        project_id IS NOT NULL
        AND can_access_project(project_id)
        AND has_project_permission(project_id, 'audit.read')
    );

-- ---------------------------------------------------------------------------
-- Seed stable permission catalog and system role templates
-- ---------------------------------------------------------------------------

INSERT INTO permissions (permission_key, description) VALUES
    ('project.create', 'Create a project in the tenant'),
    ('project.read_all', 'Read every project in the tenant'),
    ('project.manage', 'Edit project setup and members'),
    ('contract.read', 'Read contract records and controls'),
    ('contract.manage', 'Edit contract records and draft controls'),
    ('contract.approve_rule', 'Approve effective contract rules'),
    ('boq.read', 'Read BOQ versions and items'),
    ('boq.manage', 'Import and edit draft BOQ versions'),
    ('boq.approve', 'Approve or supersede a BOQ version'),
    ('variation.create', 'Create and price variations'),
    ('variation.review', 'Review and return variations'),
    ('variation.approve', 'Approve and incorporate variations'),
    ('measurement.read', 'Read measurements'),
    ('measurement.create', 'Create and submit measurements'),
    ('measurement.verify', 'Return, reject, or verify measurements'),
    ('ipc.read', 'Read IPCs'),
    ('ipc.prepare', 'Create and submit IPCs'),
    ('ipc.review', 'Review and recommend IPCs'),
    ('ipc.certify', 'Certify and lock IPCs'),
    ('payment.record', 'Record payments against certified IPCs'),
    ('document.read', 'Read project documents'),
    ('document.manage', 'Register documents and draft revisions'),
    ('document.issue', 'Accept, issue, or supersede document revisions'),
    ('rfi.create', 'Raise and manage RFIs'),
    ('rfi.respond', 'Issue formal RFI responses'),
    ('inspection.request', 'Request an inspection'),
    ('inspection.perform', 'Perform and close inspections'),
    ('issue.manage', 'Create, assign, and resolve issues'),
    ('supplier.manage', 'Create and maintain draft supplier records'),
    ('supplier.approve', 'Approve, suspend, or blacklist suppliers'),
    ('procurement.request', 'Create and submit purchase requisitions'),
    ('procurement.approve', 'Approve purchase requisitions and purchase orders'),
    ('procurement.order', 'Capture quotations and issue purchase orders'),
    ('goods.receive', 'Record, inspect, and accept goods receipts'),
    ('inventory.read', 'Read item, warehouse, and stock ledgers'),
    ('inventory.issue', 'Approve and post material issues and stock counts'),
    ('invoice.record', 'Record supplier invoices'),
    ('invoice.match', 'Run and review three-way matches'),
    ('supplier_payment.record', 'Record payment of approved supplier invoices'),
    ('worker.manage', 'Maintain and approve the worker roster'),
    ('attendance.record', 'Record and verify attendance'),
    ('timesheet.prepare', 'Prepare and submit timesheets'),
    ('timesheet.approve', 'Approve timesheets'),
    ('payroll.prepare', 'Calculate and submit payroll batches'),
    ('payroll.approve', 'Approve payroll batches'),
    ('worker_payment.record', 'Record approved worker payments'),
    ('control.read', 'Read structural-control evaluations'),
    ('control.override', 'Approve a documented control override'),
    ('ai_finding.review', 'Review and dispose advisory AI findings'),
    ('import.manage', 'Upload, map, validate, and commit imports'),
    ('workflow.act', 'Complete assigned workflow tasks'),
    ('report.read', 'Read and export project reports'),
    ('audit.read', 'Read project audit history')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO roles (tenant_id, role_key, name, description, is_system) VALUES
    (NULL, 'tenant_admin', 'Tenant Administrator', 'Full tenant setup and project access', true),
    (NULL, 'employer_pm', 'Employer Project Manager', 'Employer project and commercial approval role', true),
    (NULL, 'finance', 'Employer Finance', 'Certificate payment and finance reporting role', true),
    (NULL, 'engineer_lead', 'Engineer / Consultant Lead', 'Engineer administration and recommendation role', true),
    (NULL, 'quantity_surveyor', 'Quantity Surveyor', 'BOQ, measurement, and IPC preparation/review', true),
    (NULL, 'site_inspector', 'Site Inspector', 'Measurement verification and inspections', true),
    (NULL, 'contractor_pm', 'Contractor Project Manager', 'Contractor submissions and coordination', true),
    (NULL, 'contractor_qs', 'Contractor Quantity Surveyor', 'Contractor measurements and IPC applications', true),
    (NULL, 'procurement_officer', 'Procurement Officer', 'Requisitions, quotations, and purchase orders', true),
    (NULL, 'storekeeper', 'Storekeeper', 'Goods receipt, stores, material issue, and stock count', true),
    (NULL, 'foreman', 'Foreman', 'Attendance, timesheet preparation, and material receipt', true),
    (NULL, 'accounts_payable', 'Accounts Payable', 'Supplier invoice matching and payment recording', true),
    (NULL, 'payroll_officer', 'Payroll Officer', 'Payroll preparation and worker payment recording', true),
    (NULL, 'document_controller', 'Document Controller', 'Document register and transmittal control', true),
    (NULL, 'auditor_viewer', 'Auditor / Viewer', 'Read-only project and audit access', true)
ON CONFLICT DO NOTHING;

-- Tenant administrator receives every permission.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.role_key = 'tenant_admin'
ON CONFLICT DO NOTHING;

-- Read-only role.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN permissions p ON p.permission_key IN (
    'contract.read', 'boq.read', 'measurement.read', 'ipc.read',
    'document.read', 'report.read', 'audit.read'
)
WHERE r.tenant_id IS NULL AND r.role_key = 'auditor_viewer'
ON CONFLICT DO NOTHING;

-- Project-role templates.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN permissions p ON (
       (r.role_key = 'employer_pm' AND p.permission_key IN (
           'project.manage', 'contract.read', 'contract.manage', 'contract.approve_rule',
           'boq.read', 'boq.approve', 'variation.review', 'variation.approve',
           'measurement.read', 'ipc.read', 'ipc.review', 'ipc.certify',
           'document.read', 'issue.manage', 'report.read', 'audit.read'
       ))
    OR (r.role_key = 'finance' AND p.permission_key IN (
           'contract.read', 'boq.read', 'ipc.read', 'payment.record',
           'document.read', 'invoice.match', 'supplier_payment.record',
           'payroll.approve', 'worker_payment.record',
           'control.read', 'report.read', 'audit.read'
       ))
    OR (r.role_key = 'engineer_lead' AND p.permission_key IN (
           'contract.read', 'contract.manage', 'contract.approve_rule',
           'boq.read', 'boq.manage', 'variation.review',
           'measurement.read', 'measurement.verify', 'ipc.read', 'ipc.review',
           'document.read', 'document.issue', 'rfi.respond', 'inspection.perform',
           'issue.manage', 'report.read', 'audit.read', 'workflow.act'
       ))
    OR (r.role_key = 'quantity_surveyor' AND p.permission_key IN (
           'contract.read', 'boq.read', 'boq.manage', 'variation.create', 'variation.review',
           'measurement.read', 'measurement.create', 'measurement.verify',
           'ipc.read', 'ipc.prepare', 'ipc.review', 'document.read',
           'report.read', 'workflow.act'
       ))
    OR (r.role_key = 'site_inspector' AND p.permission_key IN (
           'contract.read', 'boq.read', 'measurement.read', 'measurement.verify',
           'document.read', 'inspection.perform', 'issue.manage', 'workflow.act'
       ))
    OR (r.role_key = 'contractor_pm' AND p.permission_key IN (
           'contract.read', 'boq.read', 'variation.create', 'measurement.read',
           'measurement.create', 'ipc.read', 'ipc.prepare', 'document.read',
           'document.manage', 'rfi.create', 'inspection.request', 'issue.manage',
           'supplier.approve', 'procurement.approve', 'inventory.read',
           'inventory.issue', 'worker.manage', 'timesheet.approve',
           'payroll.approve', 'control.read', 'control.override',
           'ai_finding.review', 'report.read', 'workflow.act'
       ))
    OR (r.role_key = 'contractor_qs' AND p.permission_key IN (
           'contract.read', 'boq.read', 'variation.create', 'measurement.read',
           'measurement.create', 'ipc.read', 'ipc.prepare', 'document.read',
           'rfi.create', 'inspection.request', 'report.read', 'workflow.act'
       ))
    OR (r.role_key = 'document_controller' AND p.permission_key IN (
           'document.read', 'document.manage', 'document.issue', 'contract.read',
           'boq.read', 'measurement.read', 'ipc.read', 'report.read'
       ))
    OR (r.role_key = 'procurement_officer' AND p.permission_key IN (
           'supplier.manage', 'procurement.request', 'procurement.order',
           'inventory.read', 'document.read', 'report.read', 'workflow.act'
       ))
    OR (r.role_key = 'storekeeper' AND p.permission_key IN (
           'goods.receive', 'inventory.read', 'inventory.issue',
           'document.read', 'issue.manage', 'workflow.act'
       ))
    OR (r.role_key = 'foreman' AND p.permission_key IN (
           'inventory.read', 'attendance.record', 'timesheet.prepare',
           'document.read', 'issue.manage', 'workflow.act'
       ))
    OR (r.role_key = 'accounts_payable' AND p.permission_key IN (
           'supplier.manage', 'invoice.record', 'invoice.match',
           'supplier_payment.record', 'inventory.read', 'report.read',
           'control.read', 'workflow.act'
       ))
    OR (r.role_key = 'payroll_officer' AND p.permission_key IN (
           'worker.manage', 'attendance.record', 'timesheet.prepare',
           'payroll.prepare', 'worker_payment.record', 'report.read',
           'control.read', 'workflow.act'
       ))
)
WHERE r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

COMMIT;
