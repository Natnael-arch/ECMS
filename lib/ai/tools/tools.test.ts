import { describe, it, expect } from 'vitest';
import { tools, projectSummary, boqStatus, ipcStatus, procurementStatus, workforceStatus, recentActivity } from './index';

// ---------------------------------------------------------------------------
// Mock Database Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const PM_USER_ID = '11111111-1111-1111-1111-111111111111';
const FOREMAN_USER_ID = '22222222-2222-2222-2222-222222222222';
const NON_MEMBER_USER_ID = '33333333-3333-3333-3333-333333333333';

function createMockDb() {
  return {
    tenant_member_roles: {
      findMany: async ({ where }: any) => {
        if (where.user_id === PM_USER_ID) {
          return [{ role_id: 'role-pm', roles: { role_key: 'employer_pm' } }];
        }
        if (where.user_id === FOREMAN_USER_ID) {
          return [{ role_id: 'role-foreman', roles: { role_key: 'foreman' } }];
        }
        return [];
      },
    },
    role_permissions: {
      findMany: async () => [],
    },
    permissions: {
      findMany: async () => [],
    },
    project_members: {
      findUnique: async ({ where }: any) => {
        const uid = where.project_id_user_id.user_id;
        if (uid === PM_USER_ID) return { id: 'pm-member-id' };
        if (uid === FOREMAN_USER_ID) return { id: 'foreman-member-id' };
        return null;
      },
    },
    project_member_roles: {
      findMany: async ({ where }: any) => {
        if (where.project_member_id === 'pm-member-id') {
          return [
            {
              roles: {
                role_key: 'employer_pm',
                role_permissions: [
                  { permission_key: 'ai_chat.use' },
                  { permission_key: 'contract.read' },
                  { permission_key: 'boq.read' },
                  { permission_key: 'ipc.read' },
                  { permission_key: 'inventory.read' },
                  { permission_key: 'worker.manage' },
                  { permission_key: 'audit.read' },
                ],
              },
            },
          ];
        }
        if (where.project_member_id === 'foreman-member-id') {
          return [
            {
              roles: {
                role_key: 'foreman',
                role_permissions: [
                  { permission_key: 'inventory.read' },
                ],
              },
            },
          ];
        }
        return [];
      },
    },
    projects: {
      findUnique: async () => ({
        id: PROJECT_ID,
        project_code: 'PRJ-001',
        name: 'Modjo-Hawassa Highway',
        description: 'Road Construction Phase 1',
        currency: 'ETB',
        start_chainage_mm: BigInt(0),
        end_chainage_mm: BigInt(45500000),
        planned_start_date: new Date('2024-01-01'),
        planned_finish_date: new Date('2026-12-31'),
        actual_start_date: new Date('2024-01-15'),
        contracts: [
          {
            revised_contract_amount: 50000000,
            original_contract_amount: 45000000,
            currency: 'ETB',
            contract_parties: [
              { role: 'employer', organizations: { name: 'Ethiopian Roads Authority' } },
              { role: 'contractor', organizations: { name: 'China Railway Corp' } },
              { role: 'engineer', organizations: { name: 'SMEC Engineering' } },
            ],
          },
        ],
        ipc_certificates: [
          { cumulative_work_amount: 15000000 },
        ],
      }),
    },
    boq_versions: {
      findFirst: async () => ({
        id: 'boq-v1',
        version_number: 1,
      }),
    },
    boq_items: {
      findMany: async () => [
        {
          id: 'item-1',
          item_number: '1.01',
          description: 'Site Clearance',
          unit: 'm2',
          original_quantity: 1000,
          approved_quantity: 1000,
          rate: 150,
          sort_order: 1,
          boq_sections: { id: 'sec-1', section_code: '1', title: 'General' },
        },
        {
          id: 'item-2',
          item_number: '1.02',
          description: 'Earthwork Excavation',
          unit: 'm3',
          original_quantity: 500,
          approved_quantity: 500,
          rate: 450,
          sort_order: 2,
          boq_sections: { id: 'sec-1', section_code: '1', title: 'General' },
        },
      ],
    },
    ipc_certificates: {
      findFirst: async ({ where }: any) => {
        if (where.status === 'certified') {
          return {
            id: 'ipc-1',
            ipc_number: 1,
            period_start: new Date('2024-01-01'),
            period_end: new Date('2024-01-31'),
            status: 'certified',
            cumulative_work_amount: 15000000,
            ipc_lines: [
              { boq_item_id: 'item-1', cumulative_quantity: 950 }, // 95% complete -> over 90%
              { boq_item_id: 'item-2', cumulative_quantity: 550 }, // 110% complete -> overrun
            ],
          };
        }
        return null;
      },
      findMany: async () => [
        {
          id: 'ipc-1',
          ipc_number: 1,
          certificate_reference: 'IPC/001',
          period_start: new Date('2024-01-01'),
          period_end: new Date('2024-01-31'),
          status: 'certified',
          currency: 'ETB',
          current_work_amount: 1000000,
          current_retention: 50000,
          net_current_amount: 950000,
          cumulative_work_amount: 1000000,
          cumulative_retention: 50000,
          cumulative_net_amount: 950000,
          _count: { ipc_lines: 2 },
        },
        {
          id: 'ipc-2',
          ipc_number: 2,
          certificate_reference: 'IPC/002',
          period_start: new Date('2024-02-01'),
          period_end: new Date('2024-02-28'),
          status: 'draft',
          currency: 'ETB',
          current_work_amount: 1200000,
          current_retention: 60000,
          net_current_amount: 1140000,
          cumulative_work_amount: 2200000,
          cumulative_retention: 110000,
          cumulative_net_amount: 2090000,
          calculation_version: 'v1',
          calculation_hash: 'abc123hash',
          _count: { ipc_lines: 2 },
        },
      ],
    },
    purchase_requisitions: {
      findMany: async () => [
        { id: 'pr-1', requisition_number: 'PR-001', status: 'approved', title: 'Cement Order', created_at: new Date() },
        { id: 'pr-2', requisition_number: 'PR-002', status: 'submitted', title: 'Rebar Order', created_at: new Date() },
      ],
    },
    purchase_orders: {
      findMany: async () => [
        { id: 'po-1', po_number: 'PO-001', status: 'issued', total_amount: 500000, currency: 'ETB', created_at: new Date() },
      ],
    },
    stock_ledger_entries: {
      findMany: async () => [
        {
          inventory_item_id: 'inv-1',
          quantity_delta: 100,
          value_delta: 50000,
          inventory_items: { item_code: 'MAT-CEM', name: 'Portland Cement', unit: 'bag' },
        },
        {
          inventory_item_id: 'inv-2',
          quantity_delta: 50,
          value_delta: 120000,
          inventory_items: { item_code: 'MAT-REB', name: 'Deformed Rebar 16mm', unit: 'ton' },
        },
      ],
    },
    workers: {
      findMany: async () => [
        { id: 'w-1', worker_number: 'W001', status: 'active' },
        { id: 'w-2', worker_number: 'W002', status: 'active' },
      ],
    },
    timesheets: {
      findFirst: async () => ({
        id: 'ts-1',
        timesheet_number: 'TS-2024-W05',
        period_start: new Date('2024-02-01'),
        period_end: new Date('2024-02-07'),
        status: 'approved',
      }),
    },
    payroll_batches: {
      findFirst: async () => ({
        id: 'pb-1',
        payroll_number: 'PAY-2024-01',
        period_start: new Date('2024-01-01'),
        period_end: new Date('2024-01-31'),
        status: 'approved',
        currency: 'ETB',
        gross_amount: 250000,
        net_amount: 220000,
      }),
    },
    audit_events: {
      findMany: async () => [
        {
          id: BigInt(1),
          action: 'APPROVE',
          entity_type: 'purchase_requisition',
          occurred_at: new Date(),
          metadata: { number: '14' },
          app_users: { display_name: 'John Doe', email: 'john@ecms.app' },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI Data Tools — Schema & Export Registries', () => {
  it('exports tools array with all 6 tools', () => {
    expect(tools).toHaveLength(6);
    for (const tool of tools) {
      expect(tool.schema).toBeDefined();
      expect(tool.schema.name).toBeTypeOf('string');
      expect(tool.schema.description).toBeTypeOf('string');
      expect(tool.schema.parameters).toBeDefined();
      expect(tool.schema.parameters.type).toBe('object');
      expect(tool.schema.parameters.required).toContain('projectId');
      expect(tool.run).toBeTypeOf('function');
    }
  });
});

describe('AI Data Tools — Permission Gating & Direct Execution', () => {
  const mockDb = createMockDb();

  describe('1. Project Summary Tool', () => {
    it('returns real data for authorized Project Manager', async () => {
      const res = await projectSummary.run(PROJECT_ID, PM_USER_ID, {}, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.name).toBe('Modjo-Hawassa Highway');
      expect(res.contractValue).toBe(50000000);
      expect(res.employerName).toBe('Ethiopian Roads Authority');
      expect(res.contractorName).toBe('China Railway Corp');
      expect(res.engineerName).toBe('SMEC Engineering');
    });

    it('returns restricted result for unauthorized user (missing ai_chat.use)', async () => {
      const res = await projectSummary.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
      expect(res.reason).toContain('ai_chat.use');
    });

    it('returns restricted result for non-project member', async () => {
      const res = await projectSummary.run(PROJECT_ID, NON_MEMBER_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });

  describe('2. BOQ Status Tool', () => {
    it('returns real data for authorized Project Manager with flags for >90% and overrun', async () => {
      const res = await boqStatus.run(PROJECT_ID, PM_USER_ID, {}, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.totalItems).toBe(2);
      expect(res.over90PercentCount).toBe(2); // item-1 (95%) and item-2 (110%)
      expect(res.overrunCount).toBe(1); // item-2 (110%)

      const item1 = res.items.find((i: any) => i.itemNumber === '1.01');
      expect(item1.percentComplete).toBe(95);
      expect(item1.isOver90Percent).toBe(true);
      expect(item1.isOverrun).toBe(false);

      const item2 = res.items.find((i: any) => i.itemNumber === '1.02');
      expect(item2.percentComplete).toBe(110);
      expect(item2.isOver90Percent).toBe(true);
      expect(item2.isOverrun).toBe(true);
      expect(item2.overrunQuantity).toBe(50);
    });

    it('returns restricted result for unauthorized user', async () => {
      const res = await boqStatus.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });

  describe('3. IPC Status Tool', () => {
    it('returns list of IPCs and current in-progress calculation status for PM', async () => {
      const res = await ipcStatus.run(PROJECT_ID, PM_USER_ID, {}, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.totalIpcs).toBe(2);
      expect(res.currentInProgressIpc).toBeDefined();
      expect(res.currentInProgressIpc.ipcNumber).toBe(2);
      expect(res.currentInProgressIpc.status).toBe('draft');
      expect(res.currentInProgressIpc.isCalculated).toBe(true);
    });

    it('returns restricted result for unauthorized user', async () => {
      const res = await ipcStatus.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });

  describe('4. Procurement Status Tool', () => {
    it('returns open PRs, POs, and top stock materials by value for PM', async () => {
      const res = await procurementStatus.run(PROJECT_ID, PM_USER_ID, { topN: 2 }, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.requisitionsSummary.totalCount).toBe(2);
      expect(res.purchaseOrdersSummary.totalCount).toBe(1);
      expect(res.topMaterialsByValue).toHaveLength(2);
      // Item 2 has higher value (120,000) than Item 1 (50,000)
      expect(res.topMaterialsByValue[0].name).toBe('Deformed Rebar 16mm');
      expect(res.topMaterialsByValue[0].totalValue).toBe(120000);
    });

    it('returns restricted result for user without ai_chat.use permission', async () => {
      const res = await procurementStatus.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });

  describe('5. Workforce Status Tool', () => {
    it('returns roster count, timesheet status, and payroll status for PM', async () => {
      const res = await workforceStatus.run(PROJECT_ID, PM_USER_ID, {}, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.roster.totalCount).toBe(2);
      expect(res.latestTimesheet.timesheetNumber).toBe('TS-2024-W05');
      expect(res.latestPayrollBatch.payrollNumber).toBe('PAY-2024-01');
    });

    it('returns restricted result for unauthorized user', async () => {
      const res = await workforceStatus.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });

  describe('6. Recent Activity Tool', () => {
    it('returns formatted plain language audit summaries for PM', async () => {
      const res = await recentActivity.run(PROJECT_ID, PM_USER_ID, { limit: 5 }, mockDb);
      expect(res).not.toHaveProperty('restricted');
      expect(res.events).toHaveLength(1);
      expect(res.events[0].summary).toContain('Requisition #14 was approved by John Doe');
    });

    it('returns restricted result for unauthorized user', async () => {
      const res = await recentActivity.run(PROJECT_ID, FOREMAN_USER_ID, {}, mockDb);
      expect(res).toHaveProperty('restricted', true);
    });
  });
});
