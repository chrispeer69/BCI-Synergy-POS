import { NextResponse } from "next/server";
import { requireMerchantKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";

export const GET = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const url = new URL(req.url);
  const jobRef = url.searchParams.get("jobExternalRef");
  const payments = await db.payment.findMany({
    where: { merchantId: m.id, ...(jobRef ? { job: { externalRef: jobRef } } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(url.searchParams.get("limit") ?? 50), 200),
    select: {
      id: true, status: true, channel: true, funding: true, brand: true, last4: true,
      baseAmountCents: true, feeAmountCents: true, totalAmountCents: true, feeLabel: true,
      refundedCents: true, jobId: true, payLinkId: true, createdAt: true,
    },
  });
  return NextResponse.json({ data: payments });
});
