/**
 * Seed script: Jigjiga Bypass Road demo project
 *
 * Run:  npx tsx db/seed-jigjiga.ts
 *       — or —
 *       npm run db:seed:jigjiga
 *
 * Idempotent: checks for existing rows on natural keys before inserting.
 * Safe to re-run at any time.
 *
 * TWO PLACEHOLDER FILES must be replaced with real data before the demo:
 *
 *   1. db/seed-data/jigjiga-boq.csv
 *      Format: item_number,source_code,description,unit,original_quantity,rate,section_code,section_title
 *      One row per BOQ line item. section_code groups items into sections.
 *
 *   2. db/seed-data/jigjiga-ipc1.json
 *      Format: { period_start, period_end, items: [{ item_number, current_quantity }] }
 *      One entry per BOQ item with the accepted quantity for IPC #1.
 */
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCsvRows(filePath: string): Record<string, string>[] {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function upsertUuid(): string {
  // Generate a deterministic UUID for items that need a stable id across runs
  // We'll use Prisma's gen_random_uuid() by omitting id and letting DB default
  return undefined as unknown as string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding Jigjiga Bypass Road demo project...\n');

  // ── 1. Tenant ────────────────────────────────────────────────────────────
  const tenantSlug = 'ecms-demo';
  let tenant = await db.tenants.findFirst({ where: { slug: tenantSlug } });
  if (!tenant) {
    tenant = await db.tenants.create({
      data: {
        name: 'ECMS Demo',
        slug: tenantSlug,
        default_currency: 'ETB',
      },
    });
  }
  console.log(`  Tenant: ${tenant.name} (${tenant.id})`);

  // ── 2. Project ───────────────────────────────────────────────────────────
  const projectCode = 'JIGJIGA';
  const existingProject = await db.projects.findFirst({
    where: { project_code: projectCode, tenant_id: tenant.id },
  });

  const project = existingProject ?? await db.projects.create({
    data: {
      tenant_id: tenant.id,
      project_code: projectCode,
      name: 'Jigjiga Bypass Road',
      description: '6.93 km bypass road, chainage 0+000 to 6+930, Ethiopia',
      sector: 'roads',
      country_code: 'ET',
      currency: 'ETB',
      start_chainage_mm: BigInt(0),
      end_chainage_mm: BigInt(6_930_000),
      status: 'active',
    },
  });
  console.log(`  Project: ${project.name} (${project.id})`);

  // ── 3. Organizations ─────────────────────────────────────────────────────
  const orgDefs = [
    { legal_name: 'Ethiopian Roads Authority', short_name: 'ERA', organization_type: 'employer' as const },
    { legal_name: 'Yirgalem Construction', short_name: 'Yirgalem', organization_type: 'contractor' as const },
    { legal_name: 'ELDA/DAMRA', short_name: 'ELDA', organization_type: 'engineer' as const },
  ] as const;

  const orgs: Record<string, { id: string; legal_name: string }> = {};
  for (const def of orgDefs) {
    const existing = await db.organizations.findFirst({
      where: { legal_name: def.legal_name, tenant_id: tenant.id },
    });
    const org = existing ?? await db.organizations.create({
      data: {
        tenant_id: tenant.id,
        legal_name: def.legal_name,
        short_name: def.short_name,
        organization_type: def.organization_type,
      },
    });
    orgs[def.organization_type] = org;
    console.log(`  Org: ${org.legal_name} [${def.organization_type}] (${org.id})`);
  }

  // ── 4. Contract ──────────────────────────────────────────────────────────
  const contractNumber = 'JIGJIGA-2024-001';
  const existingContract = await db.contracts.findFirst({
    where: { project_id: project.id, contract_number: contractNumber },
  });

  const contract = existingContract ?? await db.contracts.create({
    data: {
      project_id: project.id,
      contract_number: contractNumber,
      title: 'Construction of Jigjiga Bypass Road (6.93 km)',
      contract_type: 'unit-price',
      status: 'active',
      currency: 'ETB',
      effective_date: new Date('2024-09-15'),
      signed_date: new Date('2024-09-01'),
      vat_percent: 15,
      retention_percent: 5,
      advance_percent: 20,
      price_adjustment_ceiling_percent: 15,
      original_contract_amount: 0, // TODO: set when real BOQ is supplied
      revised_contract_amount: 0,  // TODO: set when real BOQ is supplied
    },
  });
  console.log(`  Contract: ${contract.contract_number} (${contract.id})`);

  // ── 5. Contract parties ──────────────────────────────────────────────────
  const partyDefs = [
    { org_type: 'employer' as const, role: 'employer' as const },
    { org_type: 'contractor' as const, role: 'contractor' as const },
    { org_type: 'engineer' as const, role: 'engineer' as const },
  ] as const;

  for (const pd of partyDefs) {
    const org = orgs[pd.org_type];
    const existing = await db.contract_parties.findUnique({
      where: {
        contract_id_organization_id_role: {
          contract_id: contract.id,
          organization_id: org.id,
          role: pd.role,
        },
      },
    });
    if (!existing) {
      await db.contract_parties.create({
        data: {
          contract_id: contract.id,
          organization_id: org.id,
          role: pd.role,
          is_primary: true,
        },
      });
      console.log(`  Contract party: ${pd.role} → ${org.legal_name}`);
    }
  }

  // ── 6. Contract rules ────────────────────────────────────────────────────
  const effectiveDate = contract.effective_date ?? new Date('2024-09-15');
  const ruleDefs = [
    {
      rule_key: 'advance_recovery_percent',
      label: 'Advance Recovery Rate (monthly clawback)',
      numeric_value: 40,
      unit: '%',
    },
    {
      rule_key: 'vat_withholding_percent',
      label: 'VAT Withholding Rate (remitted to tax authority)',
      numeric_value: 50,
      unit: '%',
    },
  ] as const;

  for (const rd of ruleDefs) {
    const existing = await db.contract_rules.findUnique({
      where: {
        contract_id_rule_key_effective_from: {
          contract_id: contract.id,
          rule_key: rd.rule_key,
          effective_from: effectiveDate,
        },
      },
    });
    if (!existing) {
      await db.contract_rules.create({
        data: {
          contract_id: contract.id,
          rule_key: rd.rule_key,
          label: rd.label,
          data_type: 'numeric',
          numeric_value: rd.numeric_value,
          unit: rd.unit,
          effective_from: effectiveDate,
          is_approved: true,
        },
      });
      console.log(`  Contract rule: ${rd.rule_key} = ${rd.numeric_value}${rd.unit}`);
    }
  }

  // ── 7. BOQ version + sections + items ────────────────────────────────────
  const existingBoqVersion = await db.boq_versions.findFirst({
    where: { contract_id: contract.id, status: 'approved' },
  });

  let boqVersion = existingBoqVersion;
  if (!boqVersion) {
    boqVersion = await db.boq_versions.create({
      data: {
        contract_id: contract.id,
        version_number: 1,
        name: 'Original BOQ',
        status: 'approved',
        currency: 'ETB',
        effective_date: effectiveDate,
        approved_at: new Date(),
      },
    });
    console.log(`  BOQ version: ${boqVersion.name} v${boqVersion.version_number} (${boqVersion.id})`);
  } else {
    console.log(`  BOQ version: existing approved (${boqVersion.id})`);
  }

  // Parse CSV
  const csvPath = join(process.cwd(), 'db', 'seed-data', 'jigjiga-boq.csv');
  const csvRows = parseCsvRows(csvPath);
  console.log(`  BOQ CSV: ${csvRows.length} items from ${csvPath}`);

  // Deduplicate sections by section_code
  const sectionMap = new Map<string, { code: string; title: string; sort_order: number }>();
  let sortIdx = 0;
  for (const row of csvRows) {
    const code = row.section_code;
    if (code && !sectionMap.has(code)) {
      sectionMap.set(code, { code, title: row.section_title, sort_order: sortIdx++ });
    }
  }

  // Create sections
  const sectionIdMap = new Map<string, string>();
  for (const [code, sec] of Array.from(sectionMap.entries())) {
    const existing = await db.boq_sections.findUnique({
      where: { boq_version_id_section_code: { boq_version_id: boqVersion.id, section_code: code } },
    });
    const section = existing ?? await db.boq_sections.create({
      data: {
        boq_version_id: boqVersion.id,
        section_code: code,
        title: sec.title,
        sort_order: sec.sort_order,
      },
    });
    sectionIdMap.set(code, section.id);
  }
  console.log(`  BOQ sections: ${sectionMap.size}`);

  // Create items
  let itemCount = 0;
  let grandTotal = 0;
  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const existing = await db.boq_items.findUnique({
      where: { boq_version_id_item_number: { boq_version_id: boqVersion.id, item_number: row.item_number } },
    });
    if (!existing) {
      const qty = parseFloat(row.original_quantity) || 0;
      const rate = parseFloat(row.rate) || 0;
      const amount = qty * rate;
      grandTotal += amount;

      await db.boq_items.create({
        data: {
          boq_version_id: boqVersion.id,
          section_id: sectionIdMap.get(row.section_code) ?? null,
          item_number: row.item_number,
          source_code: row.source_code || null,
          description: row.description,
          unit: row.unit || null,
          item_type: 'work',
          original_quantity: qty,
          approved_quantity: qty,
          rate: rate,
          approved_amount: amount,
          sort_order: i,
        },
      });
      itemCount++;
    }
  }
  console.log(`  BOQ items: ${itemCount} created (${csvRows.length - itemCount} already existed)`);

  // Update contract amounts if they're still zero
  if (Number(contract.original_contract_amount) === 0 && grandTotal > 0) {
    await db.contracts.update({
      where: { id: contract.id },
      data: {
        original_contract_amount: grandTotal,
        revised_contract_amount: grandTotal,
      },
    });
    console.log(`  Contract amounts updated: ${grandTotal.toLocaleString()} ETB`);
  }

  // ── 8. IPC #1 stub ──────────────────────────────────────────────────────
  const ipcPath = join(process.cwd(), 'db', 'seed-data', 'jigjiga-ipc1.json');
  let ipcData: { period_start: string; period_end: string; items: Array<{ item_number: string; current_quantity: number }> };
  try {
    ipcData = JSON.parse(readFileSync(ipcPath, 'utf-8'));
  } catch {
    console.log('\n  IPC #1: skipped (could not parse jigjiga-ipc1.json)');
    console.log('  TODO: supply real IPC #1 figures, then re-run this script.');
    await db.$disconnect();
    return;
  }

  const existingIpc = await db.ipc_certificates.findFirst({
    where: { contract_id: contract.id, ipc_number: 1 },
  });

  if (existingIpc) {
    console.log(`  IPC #1: already exists (${existingIpc.id}, status: ${existingIpc.status})`);
  } else {
    // TODO: Once real figures are supplied, use calculateIpc() from lib/calculations/ipc.ts
    // to compute all the totals. For now, create a draft shell that can be calculated later
    // via POST /api/v1/ipcs/:id/calculate.
    const ipc = await db.ipc_certificates.create({
      data: {
        project_id: project.id,
        contract_id: contract.id,
        boq_version_id: boqVersion.id,
        ipc_number: 1,
        period_start: new Date(ipcData.period_start),
        period_end: new Date(ipcData.period_end),
        status: 'draft',
        currency: 'ETB',
      },
    });
    console.log(`  IPC #1: created draft shell (${ipc.id})`);
    console.log('  TODO: Run the calculate endpoint to populate IPC numbers from real data.');
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  await db.$disconnect();
  console.log('\nDone. Jigjiga Bypass Road seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
