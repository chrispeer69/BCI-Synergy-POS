import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchantKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { createPayLink } from "@/lib/services/payments";

const Body = z.object({
  amountCents: z.number().int().positive().max(10_000_000),
  description: z.string().min(1).max(200),
  customer: z.object({ name: z.string().max(120).optional(), phone: z.string().max(32).optional(), email: z.string().email().optional() }).optional(),
  job: z
    .object({
      externalRef: z.string().min(1).max(120),
      source: z.string().min(1).max(40),
      title: z.string().max(200).optional(),
      details: z.record(z.unknown()).optional(),
    })
    .optional(),
  expiresInHours: z.number().int().min(1).max(720).optional(),
});

/**
 * POST /api/v1/pay-links
 * Called by AI phone agent / auto text-back / dispatch to create a secure payment link.
 * Returns the URL to text the customer plus cash/credit/debit price preview to read back.
 */
export const POST = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const body = Body.parse(await req.json());
  const r = await createPayLink(m, body);
  return NextResponse.json(
    { id: r.link.id, url: r.url, status: r.link.status, expiresAt: r.link.expiresAt, pricing: r.pricing },
    { status: 201 }
  );
});

export const GET = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const links = await db.payLink.findMany({ where: { merchantId: m.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ data: links });
});
