import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { NormalizedEvent } from "../providers/types";
import { onPaymentSucceeded } from "./payments";
import { emitEvent } from "./outbound";
import { onDisputeCreated } from "./disputes";

/** Apply a verified provider event exactly once. */
export async function applyProviderEvent(provider: string, e: NormalizedEvent, raw: unknown) {
  try {
    await db.providerEvent.create({ data: { id: `${provider}:${e.id}`, provider, type: e.type, payload: raw as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { duplicate: true };
    throw err;
  }

  switch (e.type) {
    case "payment.succeeded": {
      const p = await db.payment.findUnique({ where: { providerPaymentId: e.providerPaymentId } });
      if (p) await onPaymentSucceeded(p.id);
      break;
    }
    case "payment.failed": {
      const p = await db.payment.update({ where: { providerPaymentId: e.providerPaymentId }, data: { status: "FAILED", failureReason: e.reason } }).catch(() => null);
      if (p) await emitEvent(p.merchantId, "payment.failed", { paymentId: p.id, reason: e.reason });
      break;
    }
    case "payment.refunded": {
      const p = await db.payment.findUnique({ where: { providerPaymentId: e.providerPaymentId } });
      if (p) {
        const refunded = Math.min(p.totalAmountCents, p.refundedCents + e.amountCents);
        await db.payment.update({
          where: { id: p.id },
          data: { refundedCents: refunded, status: refunded >= p.totalAmountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" },
        });
        await emitEvent(p.merchantId, "payment.refunded", { paymentId: p.id, amountCents: e.amountCents });
      }
      break;
    }
    case "dispute.created": {
      const p = await db.payment.findUnique({ where: { providerPaymentId: e.providerPaymentId } });
      if (p) {
        const d = await db.dispute.create({
          data: { paymentId: p.id, providerDisputeId: e.providerDisputeId, amountCents: e.amountCents, reason: e.reason, respondBy: e.respondBy ? new Date(e.respondBy) : null },
        });
        await db.payment.update({ where: { id: p.id }, data: { status: "DISPUTED" } });
        const assembled = await onDisputeCreated(d.id);
        await emitEvent(p.merchantId, "dispute.created", {
          disputeId: d.id, paymentId: p.id, jobId: p.jobId, amountCents: e.amountCents, reason: e.reason,
          category: assembled.category, strength: assembled.strength, respondBy: e.respondBy ?? null,
        });
      }
      break;
    }
    case "dispute.closed":
      await db.dispute.update({ where: { providerDisputeId: e.providerDisputeId }, data: { status: e.won ? "WON" : "LOST" } }).catch(() => null);
      break;
    case "merchant.updated":
      await db.merchant.update({ where: { providerAccountId: e.providerAccountId }, data: { status: e.status } }).catch(() => null);
      break;
  }
  await db.providerEvent.update({ where: { id: `${provider}:${e.id}` }, data: { processedAt: new Date() } });
  return { duplicate: false };
}
