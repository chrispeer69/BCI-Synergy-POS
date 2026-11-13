import { db } from "../db";
import { computeDuesCredit, periodBounds, periodOf } from "../dues";

export function eliteDuesMonthlyCents(): number {
  return Number(process.env.ELITE_DUES_CENTS_MONTHLY ?? 50_000);
}

/** Sum of platform revenue on settled payments for a merchant in a period. */
export async function periodRevenueCents(merchantId: string, period: string): Promise<number> {
  const { start, end } = periodBounds(period);
  const agg = await db.payment.aggregate({
    where: { merchantId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, createdAt: { gte: start, lt: end } },
    _sum: { platformRevenueCents: true },
  });
  return agg._sum.platformRevenueCents ?? 0;
}

/**
 * Recompute the month's Elite ledger row from settled payments (idempotent).
 * Finalized (closed) periods are never modified; post-close adjustments roll into the next invoice.
 */
export async function recomputeLedger(merchantId: string, period: string) {
  const existing = await db.duesLedgerEntry.findUnique({ where: { merchantId_period: { merchantId, period } } });
  if (existing?.finalizedAt) return existing;
  const r = computeDuesCredit(eliteDuesMonthlyCents(), await periodRevenueCents(merchantId, period));
  return db.duesLedgerEntry.upsert({
    where: { merchantId_period: { merchantId, period } },
    create: { merchantId, period, duesCents: r.duesCents, creditCents: r.creditCents, balanceDueCents: r.balanceDueCents, excessCents: r.excessCents },
    update: { duesCents: r.duesCents, creditCents: r.creditCents, balanceDueCents: r.balanceDueCents, excessCents: r.excessCents },
  });
}

/** Called after each successful payment. */
export async function recordDuesForPayment(merchantId: string, at: Date) {
  const m = await db.merchant.findUnique({ where: { id: merchantId }, select: { membershipTier: true } });
  if (m?.membershipTier !== "ELITE") return null;
  return recomputeLedger(merchantId, periodOf(at));
}

export async function duesStatus(merchantId: string, at = new Date()) {
  const period = periodOf(at);
  const row = await db.duesLedgerEntry.findUnique({ where: { merchantId_period: { merchantId, period } } });
  const r = computeDuesCredit(eliteDuesMonthlyCents(), row ? row.creditCents + row.excessCents : 0);
  return { period, ...r };
}
