import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/server/session';
import { getProjectContext } from '@/lib/server/context';
import { writeAudit } from '@/lib/audit';
import { calculateIpc, round2 } from '@/lib/calculations/ipc';
import type { IpcContract, IpcRules, PreviousIpc, BoqLineInput } from '@/lib/calculations/ipc';

export const dynamic = 'force-dynamic';

const CALCULATION_VERSION = 'ipc-calc-v1';

/**
 * POST /api/v1/ipcs/:id/calculate
 *
 * Recalculate all numbers for a draft IPC from its linked measurement lines.
 * Re-runnable while status === 'draft': deletes existing ipc_lines and
 * ipc_measurement_links, then writes fresh ones in a single transaction.
 *
 * Body: { measurement_line_ids: string[] }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, projectId, userId } = await getProjectContext();

  const auth = await requireApiPermission('ipc.prepare', projectId);
  if (auth instanceof NextResponse) return auth;

  const ipc = await db.ipc_certificates.findUnique({ where: { id } });
  if (!ipc) return NextResponse.json({ error: 'IPC not found' }, { status: 404 });
  if (ipc.status !== 'draft') {
    return NextResponse.json({ error: 'Calculation only allowed while IPC is in draft status' }, { status: 409 });
  }

  const body = await req.json();
  const measurementLineIds: string[] = body?.measurement_line_ids;
  if (!Array.isArray(measurementLineIds) || measurementLineIds.length === 0) {
    return NextResponse.json({ error: 'measurement_line_ids must be a non-empty array' }, { status: 400 });
  }

  // ── Load contract + resolved rules ──────────────────────────────────────
  const contract = await db.contracts.findUnique({ where: { id: ipc.contract_id } });
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });

  const contractRules = await db.contract_rules.findMany({
    where: {
      contract_id: ipc.contract_id,
      effective_from: { lte: ipc.period_end },
      OR: [{ effective_to: null }, { effective_to: { gte: ipc.period_start } }],
    },
    orderBy: { effective_from: 'desc' },
  });

  // Resolve the effective rule for each key (latest effective_from wins)
  function resolveRule(key: string): number | undefined {
    const rule = contractRules.find((r) => r.rule_key === key);
    return rule?.numeric_value != null ? Number(rule.numeric_value) : undefined;
  }

  const rules: IpcRules = {
    advance_recovery_percent: resolveRule('advance_recovery_percent') ?? 40,
    vat_withholding_percent: resolveRule('vat_withholding_percent') ?? 50,
    retention_cap_percent: resolveRule('retention_cap_percent'),
  };

  const contractInput: IpcContract = {
    vat_percent: Number(contract.vat_percent),
    retention_percent: Number(contract.retention_percent),
    advance_percent: Number(contract.advance_percent),
    revised_contract_amount: Number(contract.revised_contract_amount),
    price_adjustment_ceiling_percent: Number(contract.price_adjustment_ceiling_percent),
  };

  // ── Load previous IPC (if any) ──────────────────────────────────────────
  let previousIpc: PreviousIpc | null = null;
  if (ipc.ipc_number > 1) {
    const prev = await db.ipc_certificates.findFirst({
      where: { contract_id: ipc.contract_id, ipc_number: ipc.ipc_number - 1 },
    });
    if (prev) {
      previousIpc = {
        cumulative_work_amount: Number(prev.cumulative_work_amount),
        cumulative_retention: Number(prev.cumulative_retention),
        cumulative_advance_recovery: Number(prev.cumulative_advance_recovery),
        cumulative_price_adjustment: Number(prev.cumulative_price_adjustment),
        cumulative_net_amount: Number(prev.cumulative_net_amount),
      };
    }
  }

  // ── Load measurement lines and aggregate by BOQ item ────────────────────
  const measurementLines = await db.measurement_lines.findMany({
    where: { id: { in: measurementLineIds } },
    select: {
      id: true,
      boq_item_id: true,
      accepted_quantity: true,
    },
  });

  // Validate all IDs were found
  if (measurementLines.length !== measurementLineIds.length) {
    const found = new Set(measurementLines.map((ml) => ml.id));
    const missing = measurementLineIds.filter((mlId) => !found.has(mlId));
    return NextResponse.json(
      { error: `Measurement line(s) not found: ${missing.join(', ')}` },
      { status: 404 }
    );
  }

  // Validate measurement lines belong to this IPC's contract
  const boqVersion = await db.boq_versions.findUnique({ where: { id: ipc.boq_version_id } });
  if (!boqVersion) {
    return NextResponse.json({ error: 'BOQ version not found' }, { status: 404 });
  }

  // Group accepted quantities by boq_item_id
  const qtyByBoqItem = new Map<string, number>();
  for (const ml of measurementLines) {
    const qty = ml.accepted_quantity != null ? Number(ml.accepted_quantity) : 0;
    qtyByBoqItem.set(ml.boq_item_id, (qtyByBoqItem.get(ml.boq_item_id) ?? 0) + qty);
  }

  // ── Load BOQ items ──────────────────────────────────────────────────────
  const boqItemIds = Array.from(qtyByBoqItem.keys());
  const boqItems = await db.boq_items.findMany({
    where: { id: { in: boqItemIds }, boq_version_id: ipc.boq_version_id },
  });

  const boqItemMap = new Map(boqItems.map((bi) => [bi.id, bi]));

  // Validate all BOQ items exist in the right version
  for (const boqId of boqItemIds) {
    if (!boqItemMap.has(boqId)) {
      return NextResponse.json(
        { error: `BOQ item ${boqId} not found in IPC's BOQ version` },
        { status: 400 }
      );
    }
  }

  // ── Load previous quantities from prior IPC lines (if any) ──────────────
  let previousLines: Array<{ boq_item_id: string; cumulative_quantity: number }> = [];
  if (ipc.ipc_number > 1) {
    const prevIpc = await db.ipc_certificates.findFirst({
      where: { contract_id: ipc.contract_id, ipc_number: ipc.ipc_number - 1 },
      select: { id: true },
    });
    if (prevIpc) {
      previousLines = await db.ipc_lines.findMany({
        where: { ipc_id: prevIpc.id },
        select: { boq_item_id: true, cumulative_quantity: true },
      });
    }
  }
  const prevCumQtyMap = new Map(previousLines.map((pl) => [pl.boq_item_id, Number(pl.cumulative_quantity)]));

  // ── Build input and calculate ───────────────────────────────────────────
  const boqLines: BoqLineInput[] = boqItemIds.map((boqId) => {
    const boq = boqItemMap.get(boqId)!;
    const rate = boq.rate != null ? Number(boq.rate) : 0;
    return {
      boq_item_id: boqId,
      rate_snapshot: rate,
      previous_quantity: prevCumQtyMap.get(boqId) ?? 0,
      current_quantity_this_period: qtyByBoqItem.get(boqId) ?? 0,
    };
  });

  const result = calculateIpc({
    contract: contractInput,
    rules,
    previousIpc,
    boqLines,
  });

  // ── Snapshot and hash ───────────────────────────────────────────────────
  const ruleSnapshot = { contract: contractInput, rules };
  const ruleSnapshotJson = JSON.stringify(ruleSnapshot);
  const hashInput = ruleSnapshotJson + JSON.stringify(result.lines.map((l) => ({
    boq_item_id: l.boq_item_id,
    current_quantity: l.current_quantity,
  })));
  const calculationHash = createHash('sha256').update(hashInput).digest('hex');

  // ── Build measurement link map ──────────────────────────────────────────
  // For each BOQ item → the measurement lines that contributed, with their quantities
  const mlByBoqItem = new Map<string, Array<{ measurement_line_id: string; quantity_included: number }>>();
  for (const ml of measurementLines) {
    const qty = ml.accepted_quantity != null ? Number(ml.accepted_quantity) : 0;
    const arr = mlByBoqItem.get(ml.boq_item_id) ?? [];
    arr.push({ measurement_line_id: ml.id, quantity_included: qty });
    mlByBoqItem.set(ml.boq_item_id, arr);
  }

  // ── Transaction: replace ipc_lines + ipc_measurement_links + update certificate ──
  await db.$transaction(async (tx) => {
    // Delete existing lines and links for this IPC (safe re-runnable)
    await tx.ipc_measurement_links.deleteMany({ where: { ipc_line: { ipc_id: id } } });
    await tx.ipc_lines.deleteMany({ where: { ipc_id: id } });

    // Write fresh ipc_lines
    for (let i = 0; i < result.lines.length; i++) {
      const line = result.lines[i];
      const boq = boqItemMap.get(line.boq_item_id)!;

      const ipcLine = await tx.ipc_lines.create({
        data: {
          ipc_id: id,
          line_number: i + 1,
          boq_item_id: line.boq_item_id,
          item_number_snapshot: boq.item_number,
          source_code_snapshot: boq.source_code ?? null,
          description_snapshot: boq.description,
          unit_snapshot: boq.unit ?? null,
          contract_quantity_snapshot: boq.approved_quantity ?? boq.original_quantity ?? null,
          rate_snapshot: line.rate_snapshot,
          previous_quantity: line.previous_quantity,
          current_quantity: line.current_quantity,
          cumulative_quantity: line.cumulative_quantity,
          previous_amount: line.previous_amount,
          current_amount: line.current_amount,
          cumulative_amount: line.cumulative_amount,
        },
      });

      // Write measurement links for this line
      const links = mlByBoqItem.get(line.boq_item_id) ?? [];
      for (const link of links) {
        await tx.ipc_measurement_links.create({
          data: {
            ipc_line_id: ipcLine.id,
            measurement_line_id: link.measurement_line_id,
            quantity_included: link.quantity_included,
            created_by: userId,
          },
        });
      }
    }

    // Update ipc_certificates with computed totals
    await tx.ipc_certificates.update({
      where: { id },
      data: {
        current_work_amount: result.current_work_amount,
        cumulative_work_amount: result.cumulative_work_amount,
        current_retention: result.current_retention,
        cumulative_retention: result.cumulative_retention,
        current_advance_recovery: result.current_advance_recovery,
        cumulative_advance_recovery: result.cumulative_advance_recovery,
        current_price_adjustment: result.current_price_adjustment,
        cumulative_price_adjustment: result.cumulative_price_adjustment,
        current_vat: result.current_vat,
        current_withholding_tax: result.current_withholding_tax,
        current_gross_amount: result.current_gross_amount,
        net_current_amount: result.net_current_amount,
        cumulative_net_amount: result.cumulative_net_amount,
        calculation_version: CALCULATION_VERSION,
        rule_snapshot: ruleSnapshot,
        calculation_hash: calculationHash,
      },
    });
  });

  // ── Audit ───────────────────────────────────────────────────────────────
  await writeAudit({
    tenantId,
    projectId,
    actorUserId: userId,
    action: 'CALCULATE',
    entityType: 'ipc_certificates',
    entityId: ipc.id,
    after: {
      calculation_version: CALCULATION_VERSION,
      calculation_hash: calculationHash,
      current_work_amount: result.current_work_amount,
      net_current_amount: result.net_current_amount,
      measurement_line_count: measurementLineIds.length,
      boq_line_count: result.lines.length,
    },
  });

  return NextResponse.json({
    ok: true,
    calculation_version: CALCULATION_VERSION,
    calculation_hash: calculationHash,
    summary: {
      current_work_amount: result.current_work_amount,
      cumulative_work_amount: result.cumulative_work_amount,
      current_retention: result.current_retention,
      current_advance_recovery: result.current_advance_recovery,
      current_price_adjustment: result.current_price_adjustment,
      current_vat: result.current_vat,
      current_withholding_tax: result.current_withholding_tax,
      current_gross_amount: result.current_gross_amount,
      net_current_amount: result.net_current_amount,
      cumulative_net_amount: result.cumulative_net_amount,
    },
    lines_written: result.lines.length,
    measurement_links_written: measurementLineIds.length,
  });
}
