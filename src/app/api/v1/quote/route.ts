import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchantKey } from "@/lib/auth";
import { handler } from "@/lib/http";
import { quoteFor } from "@/lib/services/payments";

const Body = z.object({
  amountCents: z.number().int().positive(),
  funding: z.enum(["CREDIT", "DEBIT", "PREPAID", "ACH", "UNKNOWN"]).default("CREDIT"),
});

/** POST /api/v1/quote — price preview (what the AI agent tells the caller). */
export const POST = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const b = Body.parse(await req.json());
  return NextResponse.json(quoteFor(m, b.amountCents, b.funding));
});
