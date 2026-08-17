/**
 * IPC Calculation — contract_rules rule_keys
 *
 * These rule_keys are resolved by the calculate API route via the contract_rules
 * table. They override (or supplement) the base fields on contracts for the IPC
 * deduction waterfall.
 *
 * All are numeric_value entries with effective_from date-versioning.
 */

export const IPC_RULE_KEYS = {
  /**
   * Monthly clawback rate applied to current_work_amount.
   * DEFAULT: 40
   *
   * NOTE: This is NOT the same as contracts.advance_percent (the original loan
   * size as % of contract value). advance_recovery_percent is the monthly rate
   * at which the advance is recouped from interim payments.
   *
   * Example: contract value 500,000, advance_percent 20 → 100,000 advanced.
   *           Each month, 40% of work done is recovered until 100,000 is repaid.
   */
  advance_recovery_percent: 'advance_recovery_percent',

  /**
   * % of VAT remitted directly to the tax authority (not paid to contractor).
   * DEFAULT: 50
   *
   * In Ethiopian construction, VAT withholding splits the liability:
   *   - vat_withholding_percent goes to the tax authority (deducted from payment)
   *   - the remainder is paid to the contractor (included in net payment)
   *
   * The contractor later claims the withheld portion as input VAT credit.
   */
  vat_withholding_percent: 'vat_withholding_percent',

  /**
   * Optional cap: cumulative retention stops accruing once it reaches this %
   * of revised_contract_amount. ABSENT = no cap (retention accrues indefinitely).
   *
   * Example: retention_cap_percent = 10, revised_contract_amount = 500,000
   *          → cumulative retention capped at 50,000. Once hit, no further
   *            retention is deducted from subsequent IPCs.
   */
  retention_cap_percent: 'retention_cap_percent',
} as const;

export type IpcRuleKey = (typeof IPC_RULE_KEYS)[keyof typeof IPC_RULE_KEYS];
