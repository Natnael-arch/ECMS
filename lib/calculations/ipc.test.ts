import { describe, it, expect } from 'vitest';
import { calculateIpc, round2, type IpcContract, type IpcRules, type BoqLineInput } from './ipc';

// ---------------------------------------------------------------------------
// Shared fixtures — FIDIC/ERA standard contract
// ---------------------------------------------------------------------------

const CONTRACT: IpcContract = {
  vat_percent: 15,
  retention_percent: 5,
  advance_percent: 20,
  revised_contract_amount: 500_000,
  price_adjustment_ceiling_percent: 15,
};

const RULES: IpcRules = {
  advance_recovery_percent: 40,
  vat_withholding_percent: 50,
};

function makeBoqLine(
  id: string,
  rate: number,
  prevQty: number,
  curQty: number
): BoqLineInput {
  return { boq_item_id: id, rate_snapshot: rate, previous_quantity: prevQty, current_quantity_this_period: curQty };
}

// ---------------------------------------------------------------------------
// round2
// ---------------------------------------------------------------------------

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.3456)).toBe(2.35);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// IPC #1 — no previous certificate
// ---------------------------------------------------------------------------

describe('IPC #1 — first certificate (no previous)', () => {
  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: null,
    boqLines: [
      makeBoqLine('item-a', 100, 0, 150),
      makeBoqLine('item-b', 250, 0, 100),
    ],
  });

  it('computes line amounts from quantities × rate', () => {
    expect(result.lines).toHaveLength(2);

    const a = result.lines[0];
    expect(a.previous_quantity).toBe(0);
    expect(a.current_quantity).toBe(150);
    expect(a.cumulative_quantity).toBe(150);
    expect(a.previous_amount).toBe(0);
    expect(a.current_amount).toBe(15_000);
    expect(a.cumulative_amount).toBe(15_000);

    const b = result.lines[1];
    expect(b.previous_quantity).toBe(0);
    expect(b.current_quantity).toBe(100);
    expect(b.cumulative_quantity).toBe(100);
    expect(b.previous_amount).toBe(0);
    expect(b.current_amount).toBe(25_000);
    expect(b.cumulative_amount).toBe(25_000);
  });

  it('sums current_work_amount = 15000 + 25000 = 40000', () => {
    expect(result.current_work_amount).toBe(40_000);
    expect(result.cumulative_work_amount).toBe(40_000);
  });

  it('retention = 5% of 40000 = 2000', () => {
    expect(result.current_retention).toBe(2_000);
    expect(result.cumulative_retention).toBe(2_000);
  });

  it('advance recovery = 40% of 40000 = 16000', () => {
    expect(result.current_advance_recovery).toBe(16_000);
    expect(result.cumulative_advance_recovery).toBe(16_000);
  });

  it('no price adjustment when index ratio is default (1)', () => {
    expect(result.current_price_adjustment).toBe(0);
  });

  it('VAT = 15% of (40000 + 0 − 2000) = 5700', () => {
    expect(result.current_vat).toBe(5_700);
  });

  it('withholding tax = 50% of 5700 = 2850', () => {
    expect(result.current_withholding_tax).toBe(2_850);
  });

  it('gross = 40000 + 0 + 5700 − 2000 = 43700', () => {
    expect(result.current_gross_amount).toBe(43_700);
  });

  it('net = 43700 − 16000 − 2850 = 24850', () => {
    expect(result.net_current_amount).toBe(24_850);
    expect(result.cumulative_net_amount).toBe(24_850);
  });
});

// ---------------------------------------------------------------------------
// IPC #2 — mid-project, advance recovery within budget
// ---------------------------------------------------------------------------

describe('IPC #2 — mid-project, advance recovery within budget', () => {
  const prevIpc = {
    cumulative_work_amount: 40_000,
    cumulative_retention: 2_000,
    cumulative_advance_recovery: 16_000,
    cumulative_price_adjustment: 0,
    cumulative_net_amount: 24_850,
  };

  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: prevIpc,
    boqLines: [
      makeBoqLine('item-a', 100, 150, 200),
      makeBoqLine('item-b', 250, 100, 50),
    ],
  });

  it('line quantities carry forward correctly', () => {
    const a = result.lines[0];
    expect(a.previous_quantity).toBe(150);
    expect(a.current_quantity).toBe(200);
    expect(a.cumulative_quantity).toBe(350);
    expect(a.previous_amount).toBe(15_000);
    expect(a.current_amount).toBe(20_000);
    expect(a.cumulative_amount).toBe(35_000);

    const b = result.lines[1];
    expect(b.previous_quantity).toBe(100);
    expect(b.current_quantity).toBe(50);
    expect(b.cumulative_quantity).toBe(150);
    expect(b.previous_amount).toBe(25_000);
    expect(b.current_amount).toBe(12_500);
    expect(b.cumulative_amount).toBe(37_500);
  });

  it('current_work = 20000 + 12500 = 32500', () => {
    expect(result.current_work_amount).toBe(32_500);
  });

  it('cumulative_work = 40000 + 32500 = 72500', () => {
    expect(result.cumulative_work_amount).toBe(72_500);
  });

  it('retention = 5% of 32500 = 1625', () => {
    expect(result.current_retention).toBe(1_625);
    expect(result.cumulative_retention).toBe(3_625);
  });

  it('advance recovery = 40% of 32500 = 13000 (within remaining 84000)', () => {
    expect(result.current_advance_recovery).toBe(13_000);
    expect(result.cumulative_advance_recovery).toBe(29_000);
  });

  it('VAT = 15% of (32500 + 0 − 1625) = 4631.25', () => {
    // price_adjustment = 0 (no index ratio supplied), so base = work − retention
    expect(result.current_vat).toBe(4_631.25);
  });

  it('withholding tax = 50% of 4631.25 = 2315.63', () => {
    expect(result.current_withholding_tax).toBe(2_315.63);
  });

  it('gross = 32500 + 0 + 4631.25 − 1625 = 35506.25', () => {
    expect(result.current_gross_amount).toBe(35_506.25);
  });

  it('net = 35506.25 − 13000 − 2315.63 = 20190.62', () => {
    expect(result.net_current_amount).toBe(20_190.62);
  });

  it('cumulative net = 24850 + 20190.62 = 45040.62', () => {
    expect(result.cumulative_net_amount).toBe(45_040.62);
  });
});

// ---------------------------------------------------------------------------
// Advance recovery overshoot — must clamp, not overshoot
// ---------------------------------------------------------------------------

describe('Advance recovery overshoot — clamp to remaining balance', () => {
  // Contract: 20% advance on 500,000 = 100,000 total advance
  // Previous IPC already recovered 90,000 → remaining = 10,000
  // Current work: 100,000 × 40% = 40,000 would be owed, but must clamp to 10,000
  const prevIpc = {
    cumulative_work_amount: 400_000,
    cumulative_retention: 20_000,
    cumulative_advance_recovery: 90_000,
    cumulative_price_adjustment: 0,
    cumulative_net_amount: 280_000,
  };

  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: prevIpc,
    boqLines: [makeBoqLine('item-a', 100, 0, 1000)],
  });

  it('current_work = 100,000', () => {
    expect(result.current_work_amount).toBe(100_000);
  });

  it('raw 40% recovery would be 40,000 but clamps to remaining 10,000', () => {
    expect(result.current_advance_recovery).toBe(10_000);
  });

  it('cumulative_advance_recovery = 90,000 + 10,000 = 100,000 (= total advance)', () => {
    expect(result.cumulative_advance_recovery).toBe(100_000);
  });

  it('net amount is higher because less was deducted', () => {
    // retention = 5% × 100,000 = 5,000
    // VAT = 15% × (100,000 − 5,000) = 14,250
    // withholding = 50% × 14,250 = 7,125
    // gross = 100,000 + 14,250 − 5,000 = 109,250
    // net = 109,250 − 10,000 − 7,125 = 92,125
    expect(result.net_current_amount).toBe(92_125);
  });
});

// ---------------------------------------------------------------------------
// Retention cap — cumulative retention stops accruing
// ---------------------------------------------------------------------------

describe('Retention cap — stops accruing at cap threshold', () => {
  // Contract: 5% retention on 500,000 with 10% cap = 50,000 cap
  // Previous IPC cumulative retention = 48,000 (already near cap)
  // Current work = 100,000 → 5% = 5,000 → cumulative would be 53,000 > 50,000
  // Must clamp current retention to 50,000 − 48,000 = 2,000
  const prevIpc = {
    cumulative_work_amount: 350_000,
    cumulative_retention: 48_000,
    cumulative_advance_recovery: 0,
    cumulative_price_adjustment: 0,
    cumulative_net_amount: 250_000,
  };

  const result = calculateIpc({
    contract: CONTRACT,
    rules: { ...RULES, retention_cap_percent: 10 },
    previousIpc: prevIpc,
    boqLines: [makeBoqLine('item-a', 100, 0, 1000)],
  });

  it('current_work = 100,000', () => {
    expect(result.current_work_amount).toBe(100_000);
  });

  it('raw retention would be 5,000 but clamps to 2,000 (cap = 50,000)', () => {
    expect(result.current_retention).toBe(2_000);
  });

  it('cumulative_retention = 48,000 + 2,000 = 50,000 (exactly at cap)', () => {
    expect(result.cumulative_retention).toBe(50_000);
  });

  it('net amount reflects reduced retention deduction', () => {
    // VAT = 15% × (100,000 − 2,000) = 14,700
    // withholding = 50% × 14,700 = 7,350
    // advance recovery = 40% × 100,000 = 40,000
    // gross = 100,000 + 14,700 − 2,000 = 112,700
    // net = 112,700 − 40,000 − 7,350 = 65,350
    expect(result.net_current_amount).toBe(65_350);
  });
});

describe('Retention cap — already at cap in previous IPC', () => {
  const prevIpc = {
    cumulative_work_amount: 500_000,
    cumulative_retention: 50_000,
    cumulative_advance_recovery: 0,
    cumulative_price_adjustment: 0,
    cumulative_net_amount: 350_000,
  };

  const result = calculateIpc({
    contract: CONTRACT,
    rules: { ...RULES, retention_cap_percent: 10 },
    previousIpc: prevIpc,
    boqLines: [makeBoqLine('item-a', 100, 0, 500)],
  });

  it('current_retention = 0 (already at cap)', () => {
    expect(result.current_retention).toBe(0);
  });

  it('cumulative_retention stays at cap', () => {
    expect(result.cumulative_retention).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// Negative quantity — re-measurement correction
// ---------------------------------------------------------------------------

describe('Negative quantity — re-measurement correction', () => {
  const prevIpc = {
    cumulative_work_amount: 100_000,
    cumulative_retention: 5_000,
    cumulative_advance_recovery: 40_000,
    cumulative_price_adjustment: 0,
    cumulative_net_amount: 50_000,
  };

  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: prevIpc,
    boqLines: [
      // Previous period accepted 200 units; this period re-measurement corrects to 150
      // current_quantity_this_period = 150 − 200 = −50
      makeBoqLine('item-a', 100, 200, -50),
    ],
  });

  it('line quantities show correction', () => {
    const a = result.lines[0];
    expect(a.previous_quantity).toBe(200);
    expect(a.current_quantity).toBe(-50);
    expect(a.cumulative_quantity).toBe(150);
  });

  it('amounts decrease accordingly', () => {
    const a = result.lines[0];
    expect(a.previous_amount).toBe(20_000);
    expect(a.current_amount).toBe(-5_000);
    expect(a.cumulative_amount).toBe(15_000);
  });

  it('current_work_amount is negative (−5000)', () => {
    expect(result.current_work_amount).toBe(-5_000);
  });

  it('cumulative_work_amount = 100000 − 5000 = 95000', () => {
    expect(result.cumulative_work_amount).toBe(95_000);
  });

  it('retention is negative (refund to contractor)', () => {
    // 5% × −5000 = −250
    expect(result.current_retention).toBe(-250);
  });

  it('advance recovery is 0 (no recovery on negative work)', () => {
    // 40% × −5000 = −2000, but we floor at 0
    expect(result.current_advance_recovery).toBe(0);
  });

  it('net amount is negative (money flows back)', () => {
    // VAT = 15% × (−5000 + 0 − (−250)) = 15% × −4750 = −712.50
    // withholding = 50% × −712.50 = −356.25
    // gross = −5000 + 0 + (−712.50) − (−250) = −5462.50
    // net = −5462.50 − 0 − (−356.25) = −5106.25
    expect(result.net_current_amount).toBe(-5_106.25);
  });
});

// ---------------------------------------------------------------------------
// Price adjustment with index ratio
// ---------------------------------------------------------------------------

describe('Price adjustment with index ratio', () => {
  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: null,
    boqLines: [makeBoqLine('item-a', 100, 0, 1000)],
    priceAdjustmentIndexRatio: 1.05,
  });

  it('current_work = 100,000', () => {
    expect(result.current_work_amount).toBe(100_000);
  });

  it('price adjustment = 100000 × (1.05 − 1) = 5000', () => {
    expect(result.current_price_adjustment).toBe(5_000);
  });

  it('price adjustment within ceiling (15% × 100000 = 15000)', () => {
    expect(result.current_price_adjustment).toBeLessThanOrEqual(15_000);
  });

  it('VAT includes price adjustment in its base', () => {
    // retention = 5% × 100000 = 5000
    // base = 100000 + 5000 − 5000 = 100000
    // VAT = 15% × 100000 = 15000
    expect(result.current_vat).toBe(15_000);
  });
});

describe('Price adjustment capped by ceiling', () => {
  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: null,
    boqLines: [makeBoqLine('item-a', 100, 0, 1000)],
    priceAdjustmentIndexRatio: 1.30, // 30% increase, but ceiling is 15%
  });

  it('price adjustment clamped to 15% × 100000 = 15000', () => {
    expect(result.current_price_adjustment).toBe(15_000);
  });
});

describe('Negative price adjustment capped by ceiling', () => {
  const result = calculateIpc({
    contract: CONTRACT,
    rules: RULES,
    previousIpc: null,
    boqLines: [makeBoqLine('item-a', 100, 0, 1000)],
    priceAdjustmentIndexRatio: 0.70, // 30% decrease, but ceiling is 15%
  });

  it('price adjustment clamped to −15000', () => {
    expect(result.current_price_adjustment).toBe(-15_000);
  });
});

// ---------------------------------------------------------------------------
// Worked example — end-to-end two-IPC scenario (printed as table)
// ---------------------------------------------------------------------------

describe('Worked example — end-to-end IPC #1 then IPC #2', () => {
  const FAKE_CONTRACT: IpcContract = {
    vat_percent: 15,
    retention_percent: 5,
    advance_percent: 20,
    revised_contract_amount: 500_000,
    price_adjustment_ceiling_percent: 15,
  };

  const FAKE_RULES: IpcRules = {
    advance_recovery_percent: 40,
    vat_withholding_percent: 50,
  };

  // IPC #1: two BOQ items
  const ipc1 = calculateIpc({
    contract: FAKE_CONTRACT,
    rules: FAKE_RULES,
    previousIpc: null,
    boqLines: [
      makeBoqLine('BOQ-001', 100, 0, 150),
      makeBoqLine('BOQ-002', 250, 0, 100),
    ],
  });

  // IPC #2: same items, more work, with price adjustment
  const ipc2 = calculateIpc({
    contract: FAKE_CONTRACT,
    rules: FAKE_RULES,
    previousIpc: {
      cumulative_work_amount: ipc1.cumulative_work_amount,
      cumulative_retention: ipc1.cumulative_retention,
      cumulative_advance_recovery: ipc1.cumulative_advance_recovery,
      cumulative_price_adjustment: ipc1.cumulative_price_adjustment,
      cumulative_net_amount: ipc1.cumulative_net_amount,
    },
    boqLines: [
      makeBoqLine('BOQ-001', 100, 150, 200),
      makeBoqLine('BOQ-002', 250, 100, 50),
    ],
    priceAdjustmentIndexRatio: 1.05,
  });

  it('IPC #1 snapshot matches expected waterfall', () => {
    expect(ipc1.current_work_amount).toBe(40_000);
    expect(ipc1.current_retention).toBe(2_000);
    expect(ipc1.current_advance_recovery).toBe(16_000);
    expect(ipc1.current_price_adjustment).toBe(0);
    expect(ipc1.current_vat).toBe(5_700);
    expect(ipc1.current_withholding_tax).toBe(2_850);
    expect(ipc1.current_gross_amount).toBe(43_700);
    expect(ipc1.net_current_amount).toBe(24_850);
    expect(ipc1.cumulative_net_amount).toBe(24_850);
  });

  it('IPC #2 snapshot matches expected waterfall', () => {
    // VAT base = work + price_adj − retention = 32500 + 1625 − 1625 = 32500
    // VAT = 15% × 32500 = 4875
    expect(ipc2.current_work_amount).toBe(32_500);
    expect(ipc2.current_retention).toBe(1_625);
    expect(ipc2.current_advance_recovery).toBe(13_000);
    expect(ipc2.current_price_adjustment).toBe(1_625);
    expect(ipc2.current_vat).toBe(4_875);
    expect(ipc2.current_withholding_tax).toBe(2_437.50);
    expect(ipc2.current_gross_amount).toBe(37_375);
    expect(ipc2.net_current_amount).toBe(21_937.50);
  });

  it('cumulative totals are consistent', () => {
    expect(ipc2.cumulative_work_amount).toBe(72_500);
    expect(ipc2.cumulative_retention).toBe(3_625);
    expect(ipc2.cumulative_advance_recovery).toBe(29_000);
    expect(ipc2.cumulative_price_adjustment).toBe(1_625);
    expect(ipc2.cumulative_net_amount).toBe(46_787.50);
  });

  it('printed table for manual verification', () => {
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sep = '-'.repeat(78);

    const rows: string[] = [];
    rows.push('WORKED EXAMPLE — Fake contract: 15% VAT, 5% retention, 20% advance');
    rows.push('            40% advance recovery, 50% VAT withholding, ceiling 15%');
    rows.push('            Revised contract amount: 500,000.00');
    rows.push(sep);
    rows.push(
      `${'Field'.padEnd(34)} ${'IPC #1'.padStart(18)} ${'IPC #2'.padStart(18)}`
    );
    rows.push(sep);

    const table: [string, number, number][] = [
      ['Work amount (current)', ipc1.current_work_amount, ipc2.current_work_amount],
      ['Retention (current)', ipc1.current_retention, ipc2.current_retention],
      ['Advance recovery (current)', ipc1.current_advance_recovery, ipc2.current_advance_recovery],
      ['Price adjustment (current)', ipc1.current_price_adjustment, ipc2.current_price_adjustment],
      ['VAT (current)', ipc1.current_vat, ipc2.current_vat],
      ['Withholding tax (current)', ipc1.current_withholding_tax, ipc2.current_withholding_tax],
      ['Gross amount (current)', ipc1.current_gross_amount, ipc2.current_gross_amount],
      ['Net amount (current)', ipc1.net_current_amount, ipc2.net_current_amount],
      [sep, 0, 0],
      ['Work amount (cumulative)', ipc1.cumulative_work_amount, ipc2.cumulative_work_amount],
      ['Retention (cumulative)', ipc1.cumulative_retention, ipc2.cumulative_retention],
      ['Advance recovery (cumulative)', ipc1.cumulative_advance_recovery, ipc2.cumulative_advance_recovery],
      ['Price adjustment (cumulative)', ipc1.cumulative_price_adjustment, ipc2.cumulative_price_adjustment],
      ['Net amount (cumulative)', ipc1.cumulative_net_amount, ipc2.cumulative_net_amount],
    ];

    for (const [label, v1, v2] of table) {
      if (label === sep) {
        rows.push(sep);
      } else {
        rows.push(`${label.padEnd(34)} ${fmt(v1).padStart(18)} ${fmt(v2).padStart(18)}`);
      }
    }

    rows.push(sep);

    // Print to console for eyeball verification
    console.log('\n' + rows.join('\n') + '\n');

    // The assertion is that this doesn't throw — the real value is the console output
    expect(rows.length).toBeGreaterThan(10);
  });
});
