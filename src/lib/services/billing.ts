import { db } from "../db";
import { HttpError } from "../auth";
import { invoiceDecision, isClosable, periodBounds } from "../dues";
import { createPayLink } from "./payments";
import { eliteDuesMonthlyCents, recomputeLedger } from "./dues";

/**
 * House account: the platform's own merchant account that collects Elite dues balances.
 * Set PLATFORM_MERCHANT_ID to its Merchant.id.
 */
async function houseMerchant() {
  const id = process.env.PLATFORM_MERCHANT_ID;
  if (!id) throw new HttpError(500, "PLATFORM_MERCHANT_ID not configured");
  const m = await db.merchant.findUnique({ where: { id } });
  if (!m || m.status !== "ACTIVE") throw new HttpError(500, "House merchant account missing or not active");
  return m;
}

export type CloseResult = {
  period: string;
  merchants: number;
  invoiced: number;
  waived: number;
  skipped: number;
  billedCents: number;
  coveredCents: number;
};

/**
 * Monthly close for Elite members (idempotent — safe to re-run):
 * 1. Recompute + finalize each Elite member's ledger for the period.
 * 2. Balance due → OPEN invoice + pay link on the house account (emailed/texted to owner).
 *    Fully covered → WAIVED $0 invoice for the record.
 */
export async function closePeriod(period: string, now = new Date()): Promise<CloseResult> {
  if (!isClosable(period, now)) throw new HttpError(400, `Period ${period} has not ended`);
  const { end } = periodBounds(period);

  const members = await db.merchant.findMany({
    where: { membershipTier: "ELITE", status: "ACTIVE", createdAt: { lt: end } },
    select: { id: true, dbaName: true, email: true, phone: true },
  });

  const out: CloseResult = { period, merchants: members.length, invoiced: 0, waived: 0, skipped: 0, billedCents: 0, coveredCents: 0 };
  let house: Awaited<ReturnType<typeof houseMerchant>> | null = null;

  for (const m of members) {
    if (await db.duesInvoice.findUnique({ where: { merchantId_period: { merchantId: m.id, period } } })) {
      out.skipped++;
      continue;
    }
    const ledger = await recomputeLedger(m.id, period);
    const revenue = ledger.creditCents + ledger.excessCents;
    const decision = invoiceDecision(eliteDuesMonthlyCents(), revenue);
    const credit = Math.min(ledger.duesCents, revenue);

    let payLinkId: string | null = null;
    if (decision.status === "OPEN") {
      house ??= await houseMerchant();
      const r = await createPayLink(house, {
        amountCents: decision.amountCents,
        description: `Elite membership ${period} · ${m.dbaName}`,
        customer: { name: m.dbaName, email: m.email, phone: m.phone ?? undefined },
        job: { source: "elite-dues", externalRef: `${m.id}:${period}`, title: `Elite dues ${period}` },
        expiresInHours: 24 * 30,
      });
      payLinkId = r.link.id;
    }

    await db.$transaction([
      db.duesInvoice.create({
        data: {
          merchantId: m.id, period, duesCents: ledger.duesCents, creditCents: credit,
          amountCents: decision.amountCents, status: decision.status, payLinkId,
        },
      }),
      db.duesLedgerEntry.update({ where: { id: ledger.id }, data: { finalizedAt: now } }),
    ]);

    out.coveredCents += credit;
    if (decision.status === "OPEN") {
      out.invoiced++;
      out.billedCents += decision.amountCents;
    } else out.waived++;
  }
  return out;
}
