import type { Merchant } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../auth";
import { randomToken } from "../crypto";
import { estimateProviderCost, platformRevenue } from "../economics";
import { priceCharge, type Funding } from "../pricing";
import { getProvider } from "../providers";
import { emitEvent } from "./outbound";
import { recordDuesForPayment } from "./dues";

export function quoteFor(m: Merchant, baseAmountCents: number, funding: Funding) {
  return priceCharge({
    mode: m.pricingMode,
    baseAmountCents,
    funding,
    state: m.state,
    surchargeBps: m.surchargeBps,
    creditCostBps: m.creditCostBps,
    cashDiscountBps: m.cashDiscountBps,
    surchargeNoticeAt: m.surchargeNoticeAt,
  });
}

export type CreatePayLinkInput = {
  amountCents: number;
  description: string;
  customer?: { name?: string; phone?: string; email?: string };
  job?: { externalRef: string; source: string; title?: string; details?: Record<string, unknown> };
  expiresInHours?: number;
};

export async function createPayLink(m: Merchant, input: CreatePayLinkInput) {
  let jobId: string | undefined;
  if (input.job) {
    const job = await db.job.upsert({
      where: { merchantId_source_externalRef: { merchantId: m.id, source: input.job.source, externalRef: input.job.externalRef } },
      create: {
        merchantId: m.id,
        source: input.job.source,
        externalRef: input.job.externalRef,
        title: input.job.title ?? input.description,
        details: (input.job.details ?? {}) as object,
      },
      update: {},
    });
    jobId = job.id;
  }
  const link = await db.payLink.create({
    data: {
      merchantId: m.id,
      jobId,
      token: randomToken(18),
      description: input.description,
      baseAmountCents: input.amountCents,
      customerName: input.customer?.name,
      customerPhone: input.customer?.phone,
      customerEmail: input.customer?.email,
      expiresAt: new Date(Date.now() + (input.expiresInHours ?? 72) * 3_600_000),
    },
  });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/pay/${link.token}`;
  return {
    link,
    url,
    // Preview for the AI agent / dispatcher to read back to the caller
    pricing: {
      cashPriceCents: input.amountCents,
      creditPriceCents: quoteFor(m, input.amountCents, "CREDIT").totalCents,
      debitPriceCents: quoteFor(m, input.amountCents, "DEBIT").totalCents,
    },
  };
}

/** Customer submits payment on the hosted pay page with a provider token (no card data). */
export async function payPayLink(token: string, paymentMethodToken: string) {
  const link = await db.payLink.findUnique({ where: { token }, include: { merchant: true } });
  if (!link) throw new HttpError(404, "Payment link not found");
  if (link.status !== "OPEN") throw new HttpError(409, `Payment link is ${link.status.toLowerCase()}`);
  if (link.expiresAt < new Date()) {
    await db.payLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    throw new HttpError(410, "Payment link expired");
  }
  const m = link.merchant;
  if (m.status !== "ACTIVE" || !m.providerAccountId) throw new HttpError(403, "Merchant cannot accept payments yet");

  const provider = getProvider(m.provider);
  const pm = await provider.lookupPaymentMethod(m.providerAccountId, paymentMethodToken);
  const q = quoteFor(m, link.baseAmountCents, pm.funding);
  const revenue = platformRevenue(q.totalCents);
  const idempotencyKey = `paylink_${link.id}_${paymentMethodToken}`;

  const existing = await db.payment.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const payment = await db.payment.create({
    data: {
      merchantId: m.id,
      jobId: link.jobId,
      payLinkId: link.id,
      channel: "PAY_LINK",
      funding: pm.funding,
      status: "PROCESSING",
      baseAmountCents: link.baseAmountCents,
      feeAmountCents: q.feeCents,
      totalAmountCents: q.totalCents,
      feeLabel: q.feeLabel,
      providerCostCents: estimateProviderCost(q.totalCents, pm.funding, false),
      platformRevenueCents: revenue,
      idempotencyKey,
      brand: pm.brand,
      last4: pm.last4,
    },
  });

  const r = await provider.charge({
    providerAccountId: m.providerAccountId,
    paymentMethodToken,
    amountCents: q.totalCents,
    platformFeeCents: revenue,
    currency: "usd",
    idempotencyKey,
    description: link.description,
    metadata: { payLinkId: link.id, paymentId: payment.id },
  });

  // Keep PROCESSING here; onPaymentSucceeded performs the single SUCCEEDED transition.
  const updated = await db.payment.update({
    where: { id: payment.id },
    data: {
      status: r.status === "FAILED" ? "FAILED" : "PROCESSING",
      providerPaymentId: r.providerPaymentId,
      failureReason: r.failureReason,
    },
  });
  if (r.status === "SUCCEEDED") {
    await onPaymentSucceeded(updated.id);
    return db.payment.findUniqueOrThrow({ where: { id: updated.id } });
  }
  if (r.status === "FAILED") await emitEvent(m.id, "payment.failed", { paymentId: updated.id, reason: r.failureReason });
  return updated;
}

/**
 * Idempotent: safe to call from both the sync charge path and the provider webhook.
 * Only the caller that wins the PROCESSING/PENDING → SUCCEEDED transition emits side effects.
 */
export async function onPaymentSucceeded(paymentId: string) {
  const won = await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "SUCCEEDED" },
  });
  if (won.count === 0) return;
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.payLinkId) await db.payLink.updateMany({ where: { id: p.payLinkId, status: "OPEN" }, data: { status: "PAID" } });
  await recordDuesForPayment(p.merchantId, p.createdAt);
  await emitEvent(p.merchantId, "payment.succeeded", {
    paymentId: p.id,
    jobId: p.jobId,
    payLinkId: p.payLinkId,
    totalAmountCents: p.totalAmountCents,
    baseAmountCents: p.baseAmountCents,
    feeAmountCents: p.feeAmountCents,
    funding: p.funding,
  });
}
