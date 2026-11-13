import { db } from "../db";
import { HttpError } from "../auth";
import { buildEvidencePacket, categorizeDispute, type EvidenceItem } from "../evidence";
import { getProvider } from "../providers";
import { emitEvent } from "./outbound";

export const AUTO_SUBMIT_MIN_STRENGTH = 70;

/** (Re)assemble a dispute's evidence packet from the job's locker. Safe to call repeatedly. */
export async function assembleDispute(disputeId: string) {
  const d = await db.dispute.findUnique({
    where: { id: disputeId },
    include: { payment: { include: { merchant: true, job: { include: { evidence: true } } } } },
  });
  if (!d) throw new HttpError(404, "Dispute not found");
  if (d.submittedAt) return d; // frozen once submitted

  const p = d.payment;
  const category = categorizeDispute(d.reason);
  const items: EvidenceItem[] = (p.job?.evidence ?? []).map((e) => ({
    type: e.type, url: e.url, data: (e.data ?? {}) as Record<string, unknown>, capturedAt: e.capturedAt, capturedBy: e.capturedBy,
  }));
  const packet = buildEvidencePacket({
    category,
    reason: d.reason,
    merchant: p.merchant,
    job: p.job ? { externalRef: p.job.externalRef, title: p.job.title, details: p.job.details as Record<string, unknown> } : null,
    payment: p,
    items,
  });
  return db.dispute.update({
    where: { id: d.id },
    data: { category, strength: packet.strength, evidence: packet as unknown as object },
  });
}

/** Submit the packet to the provider. Owners/admins trigger this; auto-submit uses it too. */
export async function submitDispute(disputeId: string) {
  const d = await assembleDispute(disputeId);
  if (d.submittedAt) throw new HttpError(409, "Evidence already submitted");
  if (d.status !== "NEEDS_RESPONSE") throw new HttpError(409, `Dispute is ${d.status}`);
  if (d.respondBy && d.respondBy < new Date()) throw new HttpError(410, "Response deadline has passed");

  const full = await db.dispute.findUniqueOrThrow({ where: { id: d.id }, include: { payment: { include: { merchant: true } } } });
  const m = full.payment.merchant;
  if (!m.providerAccountId) throw new HttpError(400, "Merchant has no provider account");
  await getProvider(m.provider).submitDisputeEvidence(m.providerAccountId, full.providerDisputeId, full.evidence as never);
  const updated = await db.dispute.update({ where: { id: d.id }, data: { submittedAt: new Date(), status: "UNDER_REVIEW" } });
  await emitEvent(m.id, "dispute.submitted", { disputeId: d.id, paymentId: full.paymentId, strength: d.strength });
  return updated;
}

/** On dispute.created: assemble, and auto-submit when the merchant opted in and evidence is strong. */
export async function onDisputeCreated(disputeId: string) {
  const d = await assembleDispute(disputeId);
  const m = await db.merchant.findFirst({ where: { payments: { some: { disputes: { some: { id: disputeId } } } } } });
  const auto = (m?.settings as Record<string, unknown> | null)?.autoSubmitDisputes === true;
  if (auto && d.strength >= AUTO_SUBMIT_MIN_STRENGTH) await submitDispute(disputeId);
  return d;
}

/** When new evidence lands on a job, refresh any open (unsubmitted) disputes for it. */
export async function refreshDisputesForJob(jobId: string) {
  const open = await db.dispute.findMany({ where: { submittedAt: null, status: "NEEDS_RESPONSE", payment: { jobId } }, select: { id: true } });
  for (const d of open) await assembleDispute(d.id);
  return open.length;
}
