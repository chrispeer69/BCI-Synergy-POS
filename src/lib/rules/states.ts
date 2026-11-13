/**
 * US state credit-card surcharge rules.
 *
 * !!! COMPLIANCE DATA — HAVE PAYMENTS COUNSEL VERIFY BEFORE GOING LIVE !!!
 * Laws change; review quarterly. Last internal review: 2026-11.
 *
 * - BANNED: no line-item credit surcharge. Use CASH_DISCOUNT program instead.
 * - capBps: state cap where stricter than card-network cap.
 * - Debit/prepaid surcharging is prohibited everywhere (federal + network rules);
 *   that is enforced in the pricing engine, not here.
 */
export type StateRule = {
  surcharge: "ALLOWED" | "BANNED" | "RESTRICTED";
  capBps?: number;
  note?: string;
};

export const NETWORK_SURCHARGE_CAP_BPS = 300; // Visa 3% (lowest common network cap)
export const SURCHARGE_NOTICE_DAYS = 30; // advance notice to acquirer / networks

export const STATE_RULES: Record<string, StateRule> = {
  CT: { surcharge: "BANNED", note: "Statutory ban on credit surcharges" },
  MA: { surcharge: "BANNED", note: "Statutory ban on credit surcharges" },
  CA: { surcharge: "BANNED", note: "All-in pricing (SB 478) — treat line-item surcharge as prohibited" },
  ME: { surcharge: "RESTRICTED", note: "Restrictions apply — legal review required; engine disables surcharge" },
  CO: { surcharge: "ALLOWED", capBps: 200, note: "2% state cap" },
};

export function ruleForState(state: string): StateRule {
  return STATE_RULES[state.toUpperCase()] ?? { surcharge: "ALLOWED" };
}
