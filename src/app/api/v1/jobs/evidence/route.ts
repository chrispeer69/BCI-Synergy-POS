import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireMerchantKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { containsCardNumber } from "@/lib/evidence";
import { handler } from "@/lib/http";
import { refreshDisputesForJob } from "@/lib/services/disputes";

const Item = z.object({
  type: z.enum(["PHOTO", "SIGNATURE", "GPS", "TIMELINE_EVENT", "CALL_RECORDING", "DOCUMENT", "CUSTOMER_AUTHORIZATION", "NOTE"]),
  url: z.string().url().startsWith("https://").max(2048).optional(),
  data: z.record(z.unknown()).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capturedAt: z.string().datetime(),
  capturedBy: z.string().max(120).optional(),
});

const Body = z.object({
  job: z.object({ source: z.string().min(1).max(40), externalRef: z.string().min(1).max(120), title: z.string().max(200).optional() }),
  items: z.array(Item).min(1).max(100),
});

const needsUrl = new Set(["PHOTO", "SIGNATURE", "CALL_RECORDING", "DOCUMENT", "CUSTOMER_AUTHORIZATION"]);

/**
 * POST /api/v1/jobs/evidence — driver app / dispatch pushes scene evidence at time of service.
 * Card data is refused outright: evidence must never contain PANs.
 */
export const POST = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const b = Body.parse(await req.json());

  for (const [i, it] of b.items.entries()) {
    if (needsUrl.has(it.type) && !it.url) throw new HttpError(400, `items[${i}]: ${it.type} requires an https url`);
    if (it.type === "GPS" && (typeof it.data?.lat !== "number" || typeof it.data?.lng !== "number"))
      throw new HttpError(400, `items[${i}]: GPS requires numeric data.lat and data.lng`);
    if (containsCardNumber(it.data) || containsCardNumber(it.url ?? "")) throw new HttpError(422, `items[${i}]: card numbers are not allowed in evidence`);
    if (new Date(it.capturedAt).getTime() > Date.now() + 5 * 60_000) throw new HttpError(400, `items[${i}]: capturedAt is in the future`);
  }

  const job = await db.job.upsert({
    where: { merchantId_source_externalRef: { merchantId: m.id, source: b.job.source, externalRef: b.job.externalRef } },
    create: { merchantId: m.id, source: b.job.source, externalRef: b.job.externalRef, title: b.job.title ?? `Job ${b.job.externalRef}` },
    update: {},
  });
  await db.jobEvidence.createMany({
    data: b.items.map((it) => ({
      jobId: job.id, type: it.type, url: it.url, data: (it.data ?? {}) as object, sha256: it.sha256,
      capturedAt: new Date(it.capturedAt), capturedBy: it.capturedBy,
    })),
  });
  const refreshed = await refreshDisputesForJob(job.id);
  const count = await db.jobEvidence.count({ where: { jobId: job.id } });
  return NextResponse.json({ jobId: job.id, added: b.items.length, totalEvidence: count, disputesRefreshed: refreshed }, { status: 201 });
});

/** GET /api/v1/jobs/evidence?source=dispatch&externalRef=T-10441 */
export const GET = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const q = new URL(req.url).searchParams;
  const source = q.get("source"), externalRef = q.get("externalRef");
  if (!source || !externalRef) throw new HttpError(400, "source and externalRef are required");
  const job = await db.job.findUnique({
    where: { merchantId_source_externalRef: { merchantId: m.id, source, externalRef } },
    include: { evidence: { orderBy: { capturedAt: "asc" } } },
  });
  if (!job) throw new HttpError(404, "Job not found");
  return NextResponse.json({ jobId: job.id, data: job.evidence });
});
