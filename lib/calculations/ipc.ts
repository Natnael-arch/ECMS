/**
 * IPC Calculation Engine — FIDIC/ERA deduction waterfall.
 *
 * Pure, deterministic: takes plain data in, returns plain data out.
 * No direct DB calls so it can be unit-tested without Postgres.
 *
 * Deduction order (waterfall):
 *   1. Work amount (sum of BOQ line amounts)
 *   2. Materials on Site (MOS) — credits add to current_additions,
 *      recoveries add to current_deductions
 *   3. Adjustments — positive (daywork/provisional sums) add to current_additions,
 *      negative (penalties/LD) add to current_deductions
 *   4. Retention (% of net base, with optional cumulative cap)
 *   5. Advance recovery (% of current work amount, capped at remaining advance)
 *   6. Price adjustment (index ratio, capped by ceiling %)
 *   7. VAT (% of net base − retention)
 *   8. Withholding tax (% of VAT — remitted to tax authority)
 *   9. Gross = work + price adj + VAT − retention + additions − deductions
 *  10. Net = gross − advance recovery − withholding tax
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IpcContract = {
  vat_percent: number;
  retention_percent: number;
  advance_percent: number;
  revised_contract_amount: number;
  price_adjustment_ceiling_percent: number;
};

export type IpcRules = {
  /** Monthly clawback rate (default 40%). NOT the same as advance_percent. */
  advance_recovery_percent: number;
  /** % of VAT remitted directly to tax authority (default 50). */
  vat_withholding_percent: number;
  /** If set, cumulative retention stops accruing once it hits this % of revised_contract_amount. */
  retention_cap_percent?: number;
};

export type PreviousIpc = {
  cumulative_work_amount: number;
  cumulative_retention: number;
  cumulative_advance_recovery: number;
  cumulative_price_adjustment: number;
  cumulative_net_amount: number;
};

export type BoqLineInput = {
  boq_item_id: string;
  rate_snapshot: number;
  previous_quantity: number;
  current_quantity_this_period: number;
  approved_quantity?: number;
};

export type MosLineInput = {
  mos_id: string;
  gross_value: number;
  eligible_value: number;
  current_credit: number;
  current_recovery: number;
};

export type AdjustmentInput = {
  adjustment_id: string;
  direction: number; // +1 for additions, -1 for deductions
  current_amount: number;
};

export type OverrunItem = {
  boq_item_id: string;
  approved_quantity: number;
  cumulative_quantity: number;
  overrun_quantity: number;
};

export type IpcInput = {
  contract: IpcContract;
  rules: IpcRules;
  previousIpc: PreviousIpc | null;
  boqLines: BoqLineInput[];
  mosLines?: MosLineInput[];
  adjustments?: AdjustmentInput[];
  priceAdjustmentIndexRatio?: number;
};

export type LineOutput = {
  boq_item_id: string;
  rate_snapshot: number;
  previous_quantity: number;
  current_quantity: number;
  cumulative_quantity: number;
  previous_amount: number;
  current_amount: number;
  cumulative_amount: number;
};

export type IpcResult = {
  lines: LineOutput[];
  current_work_amount: number;
  cumulative_work_amount: number;
  current_mos_credit: number;
  current_mos_recovery: number;
  current_additions: number;
  current_deductions: number;
  current_retention: number;
  cumulative_retention: number;
  current_advance_recovery: number;
  cumulative_advance_recovery: number;
  current_price_adjustment: number;
  cumulative_price_adjustment: number;
  current_vat: number;
  current_withholding_tax: number;
  current_gross_amount: number;
  net_current_amount: number;
  cumulative_net_amount: number;
  overrun_items: OverrunItem[];
};

// ---------------------------------------------------------------------------
// Rounding helper — consistent 2-decimal-place rounding across all outputs
// ---------------------------------------------------------------------------

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Core calculation — no side effects
// ---------------------------------------------------------------------------

export function calculateIpc(input: IpcInput): IpcResult {
  const { contract, rules, previousIpc, boqLines, mosLines, adjustments, priceAdjustmentIndexRatio } = input;
  const indexRatio = priceAdjustmentIndexRatio ?? 1;

  // 1. Line-level calculations + overrun detection
  const overrun_items: OverrunItem[] = [];
  const lines: LineOutput[] = boqLines.map((bl) => {
    const previous_quantity = round2(bl.previous_quantity);
    const current_quantity = round2(bl.current_quantity_this_period);
    const cumulative_quantity = round2(previous_quantity + current_quantity);
    const previous_amount = round2(previous_quantity * bl.rate_snapshot);
    const current_amount = round2(current_quantity * bl.rate_snapshot);
    const cumulative_amount = round2(cumulative_quantity * bl.rate_snapshot);

    if (bl.approved_quantity != null && cumulative_quantity > Number(bl.approved_quantity)) {
      overrun_items.push({
        boq_item_id: bl.boq_item_id,
        approved_quantity: Number(bl.approved_quantity),
        cumulative_quantity,
        overrun_quantity: round2(cumulative_quantity - Number(bl.approved_quantity)),
      });
    }

    return {
      boq_item_id: bl.boq_item_id,
      rate_snapshot: bl.rate_snapshot,
      previous_quantity,
      current_quantity,
      cumulative_quantity,
      previous_amount,
      current_amount,
      cumulative_amount,
    };
  });

  // 2. Work amounts
  const current_work_amount = round2(lines.reduce((s, l) => s + l.current_amount, 0));
  const cumulative_work_amount = round2(
    (previousIpc?.cumulative_work_amount ?? 0) + current_work_amount
  );

  // 3. Materials on Site — credits increase additions, recoveries increase deductions
  const current_mos_credit = round2(
    (mosLines ?? []).reduce((s, m) => s + m.current_credit, 0)
  );
  const current_mos_recovery = round2(
    (mosLines ?? []).reduce((s, m) => s + m.current_recovery, 0)
  );

  // 4. Adjustments — positive direction = additions, negative direction = deductions
  const current_additions = round2(
    current_mos_credit +
    (adjustments ?? [])
      .filter((a) => a.direction > 0)
      .reduce((s, a) => s + a.current_amount, 0)
  );
  const current_deductions = round2(
    current_mos_recovery +
    (adjustments ?? [])
      .filter((a) => a.direction < 0)
      .reduce((s, a) => s + Math.abs(a.current_amount), 0)
  );

  // Net base for retention/VAT: work + additions − deductions
  const net_base = round2(current_work_amount + current_additions - current_deductions);

  // 5. Retention — % of net base, with optional cumulative cap
  let current_retention = round2(net_base * (contract.retention_percent / 100));
  let cumulative_retention = round2(
    (previousIpc?.cumulative_retention ?? 0) + current_retention
  );

  if (rules.retention_cap_percent != null) {
    const retentionCap = round2(
      contract.revised_contract_amount * (rules.retention_cap_percent / 100)
    );
    if (cumulative_retention > retentionCap) {
      current_retention = round2(retentionCap - (previousIpc?.cumulative_retention ?? 0));
      if (current_retention < 0) current_retention = 0;
      cumulative_retention = round2(
        (previousIpc?.cumulative_retention ?? 0) + current_retention
      );
    }
  }

  // 6. Advance recovery — monthly clawback, capped at remaining advance balance
  const totalAdvance = round2(
    contract.revised_contract_amount * (contract.advance_percent / 100)
  );
  const previousAdvanceRecovery = previousIpc?.cumulative_advance_recovery ?? 0;
  let current_advance_recovery = round2(
    current_work_amount * (rules.advance_recovery_percent / 100)
  );
  const remainingAdvance = round2(totalAdvance - previousAdvanceRecovery);
  if (current_advance_recovery > remainingAdvance) {
    current_advance_recovery = remainingAdvance;
  }
  if (current_advance_recovery < 0) current_advance_recovery = 0;
  const cumulative_advance_recovery = round2(previousAdvanceRecovery + current_advance_recovery);

  // 7. Price adjustment — index-ratio based, capped by ceiling % in either direction
  let current_price_adjustment = round2(current_work_amount * (indexRatio - 1));
  const paCeiling = round2(
    Math.abs(current_work_amount) * (contract.price_adjustment_ceiling_percent / 100)
  );
  if (current_price_adjustment > paCeiling) {
    current_price_adjustment = paCeiling;
  } else if (current_price_adjustment < -paCeiling) {
    current_price_adjustment = -paCeiling;
  }
  const cumulative_price_adjustment = round2(
    (previousIpc?.cumulative_price_adjustment ?? 0) + current_price_adjustment
  );

  // 8. VAT — % of (net base + price adj − retention)
  const current_vat = round2(
    (net_base + current_price_adjustment - current_retention) *
      (contract.vat_percent / 100)
  );

  // 9. Withholding tax — portion of VAT remitted to tax authority
  const current_withholding_tax = round2(
    current_vat * (rules.vat_withholding_percent / 100)
  );

  // 10. Gross and net
  const current_gross_amount = round2(
    net_base + current_price_adjustment + current_vat - current_retention
  );
  const net_current_amount = round2(
    current_gross_amount - current_advance_recovery - current_withholding_tax
  );
  const cumulative_net_amount = round2(
    (previousIpc?.cumulative_net_amount ?? 0) + net_current_amount
  );

  return {
    lines,
    current_work_amount,
    cumulative_work_amount,
    current_mos_credit,
    current_mos_recovery,
    current_additions,
    current_deductions,
    current_retention,
    cumulative_retention,
    current_advance_recovery,
    cumulative_advance_recovery,
    current_price_adjustment,
    cumulative_price_adjustment,
    current_vat,
    current_withholding_tax,
    current_gross_amount,
    net_current_amount,
    cumulative_net_amount,
    overrun_items,
  };
}
