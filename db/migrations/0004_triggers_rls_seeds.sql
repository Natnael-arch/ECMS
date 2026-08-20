-- ECMS migration 0004: RLS helpers, triggers, policies, and seed data
-- Extracted from 0001_ecms_mvp_schema.sql baseline

BEGIN;

-- =========================================================================
-- Section 1: RLS Helper Functions
-- =========================================================================

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

-- =========================================================================
-- Section 2: Trigger Functions
-- =========================================================================

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

CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$fn$;

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

-- =========================================================================
-- Section 3: Triggers
-- =========================================================================

-- Import rows: use set_updated_at instead of bump_row_version
CREATE TRIGGER trg_import_rows_updated
BEFORE UPDATE ON import_rows
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Dynamic bump_row_version triggers on all tables with row_version
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

-- Append-only triggers
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

-- Business rule triggers
CREATE TRIGGER trg_purchase_orders_gate
BEFORE INSERT OR UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_gate();

CREATE TRIGGER trg_goods_receipts_separation
BEFORE INSERT OR UPDATE ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_goods_receipt_separation();

CREATE TRIGGER trg_stock_ledger_nonnegative
BEFORE INSERT ON stock_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_negative_stock();

-- Stock posting triggers
CREATE TRIGGER trg_goods_receipts_post_stock
AFTER UPDATE OF status ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt_to_stock();

CREATE TRIGGER trg_goods_receipts_insert_stock
AFTER INSERT ON goods_receipts
FOR EACH ROW EXECUTE FUNCTION post_goods_receipt_to_stock();

CREATE TRIGGER trg_material_issues_post_stock
AFTER UPDATE OF status ON material_issues
FOR EACH ROW EXECUTE FUNCTION post_material_issue_to_stock();

CREATE TRIGGER trg_material_issues_insert_stock
AFTER INSERT ON material_issues
FOR EACH ROW EXECUTE FUNCTION post_material_issue_to_stock();

CREATE TRIGGER trg_stock_counts_post_adjustment
AFTER UPDATE OF status ON stock_counts
FOR EACH ROW EXECUTE FUNCTION post_stock_count_adjustment();

CREATE TRIGGER trg_stock_counts_insert_adjustment
AFTER INSERT ON stock_counts
FOR EACH ROW EXECUTE FUNCTION post_stock_count_adjustment();

-- Payment gate triggers
CREATE TRIGGER trg_supplier_payments_gate
BEFORE INSERT ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION validate_supplier_payment();

CREATE TRIGGER trg_worker_payments_gate
BEFORE INSERT ON worker_payments
FOR EACH ROW EXECUTE FUNCTION validate_worker_payment();

-- Matching and invoice gate triggers
CREATE TRIGGER trg_three_way_matches_pass_gate
BEFORE INSERT OR UPDATE ON three_way_matches
FOR EACH ROW EXECUTE FUNCTION validate_three_way_match_pass();

CREATE TRIGGER trg_supplier_invoices_state_gate
BEFORE INSERT OR UPDATE ON supplier_invoices
FOR EACH ROW EXECUTE FUNCTION validate_supplier_invoice_state();

-- Worker transaction gate triggers
CREATE TRIGGER trg_attendance_worker_gate
BEFORE INSERT OR UPDATE ON attendance_records
FOR EACH ROW EXECUTE FUNCTION validate_worker_transaction();

CREATE TRIGGER trg_timesheet_lines_worker_gate
BEFORE INSERT OR UPDATE ON timesheet_lines
FOR EACH ROW EXECUTE FUNCTION validate_worker_transaction();

-- Payroll gate trigger
CREATE TRIGGER trg_payroll_batches_approval_gate
BEFORE INSERT OR UPDATE ON payroll_batches
FOR EACH ROW EXECUTE FUNCTION validate_payroll_approval();

-- IPC payment gate trigger
CREATE TRIGGER trg_ipc_payments_gate
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_ipc_payment();

-- Locked IPC protection triggers
CREATE TRIGGER trg_ipc_lines_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_lines
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE TRIGGER trg_ipc_adjustments_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_adjustments
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE TRIGGER trg_ipc_mos_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_materials_on_site
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_child();

CREATE TRIGGER trg_ipc_measurement_links_lock
BEFORE INSERT OR UPDATE OR DELETE ON ipc_measurement_links
FOR EACH ROW EXECUTE FUNCTION protect_locked_ipc_measurement_link();

-- =========================================================================
-- Section 4: RLS Policies
-- =========================================================================

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

-- =========================================================================
-- Section 5: Seed Data
-- =========================================================================

-- 54 permissions
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

-- 15 system roles (tenant_id IS NULL)
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
