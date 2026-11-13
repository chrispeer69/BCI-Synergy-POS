import { NETWORK_SURCHARGE_CAP_BPS, SURCHARGE_NOTICE_DAYS, ruleForState } from "./rules/states";

export type PricingMode = "STANDARD" | "SURCHARGE" | "CASH_DISCOUNT";
export type Funding = "CREDIT" | "DEBIT" | "PREPAID" | "ACH" | "UNKNOWN";

export type PricingInput = {
  mode: PricingMode;
  baseAmountCents: number; // cash price
  funding: Funding;
  state: string;
  surchargeBps: number; // requested
  creditCostBps: number; // merchant's actual credit acceptance cost
  cashDiscountBps: number; // posted card-price markup
  surchargeNoticeAt?: Date | null;
  now?: Date;
};

export type PricingResult = {
  feeCents: number;
  totalCents: number;
  appliedBps: number;
  feeLabel: string | null;
  notes: string[];
};

/** Round half-up to the cent. Inputs are integer cents. */
export function bpsOf(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

/**
 * Computes what the payer is charged.
 * Safe defaults: when in doubt (unknown funding, banned state, missing notice) → no fee.
 */
export function priceCharge(input: PricingInput): PricingResult {
  const notes: string[] = [];
  const base = input.baseAmountCents;
  if (!Number.isInteger(base) || base <= 0) throw new Error("baseAmountCents must be a positive integer");

  const none = (why?: string): PricingResult => {
    if (why) notes.push(why);
    return { feeCents: 0, totalCents: base, appliedBps: 0, feeLabel: null, notes };
  };

  switch (input.mode) {
    case "STANDARD":
      return none();

    case "CASH_DISCOUNT": {
      // Posted price is the card price; cash/ACH payers receive the discount.
      if (input.funding === "ACH") return none("Cash/ACH price applied");
      const bps = Math.max(0, input.cashDiscountBps);
      const fee = bpsOf(base, bps);
      return {
        feeCents: fee,
        totalCents: base + fee,
        appliedBps: bps,
        feeLabel: "Card price (cash discount program — pay by cash/ACH to save)",
        notes,
      };
    }

    case "SURCHARGE": {
      if (input.funding !== "CREDIT") {
        return none(
          input.funding === "UNKNOWN"
            ? "Card funding type unknown — surcharge not applied"
            : `Surcharge not permitted on ${input.funding.toLowerCase()}`
        );
      }
      const rule = ruleForState(input.state);
      if (rule.surcharge !== "ALLOWED") return none(`Surcharge not permitted in ${input.state}: ${rule.note ?? ""}`.trim());

      const now = input.now ?? new Date();
      if (!input.surchargeNoticeAt) return none("30-day surcharge notice not on file");
      const days = (now.getTime() - input.surchargeNoticeAt.getTime()) / 86_400_000;
      if (days < SURCHARGE_NOTICE_DAYS) return none(`Surcharge notice period not complete (${Math.floor(days)}/${SURCHARGE_NOTICE_DAYS} days)`);

      const caps = [input.surchargeBps, input.creditCostBps, NETWORK_SURCHARGE_CAP_BPS];
      if (rule.capBps !== undefined) caps.push(rule.capBps);
      const bps = Math.max(0, Math.min(...caps));
      if (bps < input.surchargeBps) notes.push(`Surcharge capped at ${(bps / 100).toFixed(2)}%`);
      const fee = bpsOf(base, bps);
      return {
        feeCents: fee,
        totalCents: base + fee,
        appliedBps: bps,
        feeLabel: `Credit card surcharge (${(bps / 100).toFixed(2)}%)`,
        notes,
      };
    }
  }
}
