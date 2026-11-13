import { db } from "../db";
import { computeDuesCredit, periodOf } from "../dues";

export function eliteDuesMonthlyCents(): number {
  return Number(process.env.ELITE_DUES_CENTS_MONTHLY ?? 50_000);
}

/** Recompute the month's Elite dues credit from succeeded payments (idempotent). */
export async function recordDuesForPayment(merchantId: string, at: Date) {
  const m = await db.merchant.findUnique({ where: { id: merchantId } });
  if (!m || m.membershipTier !== "ELITE") return null;
  const period = periodOf(at);
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const agg = await db.payment.aggregate({
    where: { merchantId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, createdAt: { gte: start, lt: end } },
    _sum: { platformRevenueCents: true },
  });
  const r = computeDuesCredit(eliteDuesMonthlyCents(), agg._sum.platformRevenueCents ?? 0);
  return db.duesLedgerEntry.upsert({
    where: { merchantId_period: { merchantId, period } },
    create: { merchantId, period, duesCents: r.duesCents, creditCents: r.creditCents, balanceDueCents: r.balanceDueCents, excessCents: r.excessCents },
    update: { creditCents: r.creditCents, balanceDueCents: r.balanceDueCents, excessCents: r.excessCents },
  });
}

export async function duesStatus(merchantId: string, at = new Date()) {
  const period = periodOf(at);
  const row = await db.duesLedgerEntry.findUnique({ where: { merchantId_period: { merchantId, period } } });
  const r = computeDuesCredit(eliteDuesMonthlyCents(), row ? row.creditCents + row.excessCents : 0);
  return { period, ...r };
}
