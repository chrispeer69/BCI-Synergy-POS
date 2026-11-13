import { bpsOf, type Funding } from "./pricing";

/**
 * Estimated provider cost (interchange + network + PFaaS markup) used for reporting
 * until the provider's actual fee data arrives via webhook/settlement reports.
 * Tune these to your negotiated pricing schedule.
 */
const EST_COST: Record<Funding, { bps: number; fixedCents: number }> = {
  CREDIT: { bps: 225, fixedCents: 10 },
  DEBIT: { bps: 80, fixedCents: 22 },
  PREPAID: { bps: 150, fixedCents: 20 },
  ACH: { bps: 0, fixedCents: 50 },
  UNKNOWN: { bps: 250, fixedCents: 10 },
};
const CARD_NOT_PRESENT_EXTRA_BPS = 30;

export function estimateProviderCost(totalCents: number, funding: Funding, cardPresent: boolean): number {
  const c = EST_COST[funding];
  const extra = cardPresent || funding === "ACH" ? 0 : CARD_NOT_PRESENT_EXTRA_BPS;
  return bpsOf(totalCents, c.bps + extra) + c.fixedCents;
}

export function platformMarginBps(): number {
  return Number(process.env.PLATFORM_MARGIN_BPS ?? 75);
}

/** Our revenue on a payment = margin bps of the amount charged. */
export function platformRevenue(totalCents: number, marginBps = platformMarginBps()): number {
  return bpsOf(totalCents, marginBps);
}

export function instantPayoutFee(amountCents: number): number {
  return bpsOf(amountCents, Number(process.env.INSTANT_PAYOUT_FEE_BPS ?? 100));
}
