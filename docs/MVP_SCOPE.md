# ECMS MVP Scope

> This scope is derived from and must stay consistent with docs/ECMS_MVP_Technical_Blueprint.md — the blueprint is the source of truth on any conflict.

## Purpose

Deliver a usable project-control system for construction teams without attempting a full construction ERP in the first release. The first release completes one end-to-end commercial-control loop: project/contract setup, BOQ import, measurements, IPC assembly, contract deductions, certification, and payment.

## Included in the MVP

### 1. Tenancy and users

- One platform can host several clients; every record is tenant- and project-scoped.

### 2. Projects and parties

- Employer, engineer/consultant, contractor, subcontractor, supplier, and financier can be assigned to projects.

### 3. Contract controls

- Key clauses and configurable numeric/date rules drive alerts and IPC calculations.

### 4. BOQ and cost baseline

- Versioned hierarchical BOQ with sections, items, quantities, rates, provisional sums, and variations.

### 5. Field measurements

- Quantity records by BOQ item, date, location, and chainage, with attachments and approval state.

### 6. IPCs

- Periodic certificate workspace, line snapshots, adjustments, workflow, certification, and payment record.
- Adjustments include retention, advance recovery, VAT split, price adjustment, withholding, and other typed adjustments with clause/rule lineage.

### 7. Documents and drawings

- Document register, revision history, transmittals, OCR text, page references, and current-revision control.

### 8. RFIs and inspections

- Minimal field-quality loop connected to drawings, BOQ items, locations, and evidence.

### 9. Procurement and suppliers

- Controlled supplier master; PR, quotation, PO, GRN, invoice, three-way match, and supplier payment.

### 10. Stores and materials

- Warehouse/item master, material issue slips, immutable stock ledger, and stock counts.

### 11. Workforce and timesheets

- Fixed worker roster, attendance, approved timesheets, payroll batch, and worker payment.

### 12. Fraud controls

- Segregation of duties, hard payment gates, duplicate checks, control exceptions, and immutable decisions.

### 13. AI findings

- Advisory anomaly/duplicate/OCR findings with human review; no autonomous approval or payment block.

### 14. Imports and exceptions

- Repeatable staged import with row-level lineage, validation failures, and reconciliation.

### 15. Audit and notifications

- Immutable state-change history and reliable notification jobs.

### 16. Reporting

- Dashboard, BOQ progress, IPC statement, payment history, exception list, and source traceability.

## MVP User Roles

Roles are project assignments, not global labels. A user may be a consultant QS on one project and a viewer on another.

- Tenant administrator
- Employer project manager
- Employer finance
- Engineer / consultant lead
- Quantity surveyor
- Site inspector
- Contractor project manager
- Contractor quantity surveyor
- Document controller
- Auditor / viewer

## Deferred to Phase 2

- Full Primavera or MS Project scheduling.
- Full accounting/general ledger, tendering marketplace, fleet telematics, and plant maintenance. The MVP retains only the procurement, stock, and payable controls needed for the three money streams.
- Full BIM/IFC model authoring.
- Native mobile apps and offline conflict resolution; the MVP web app can be installable and tablet-friendly.
- General-purpose no-code workflow design.
- AI contract interpretation as an autonomous decision maker. OCR and suggestions are allowed; a human approves every contractual value.

## Navigation Principle

The MVP exposes the blueprint's application modules only: Overview, Cost & BOQ, Field, IPCs, Contract, Documents, Issues, Reports, and Setup. Each screen should lead with a task such as create, submit, review, approve, search, export, or open.
