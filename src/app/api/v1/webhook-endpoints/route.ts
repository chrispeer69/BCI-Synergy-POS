import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchantKey } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";

const EVENTS = ["payment.succeeded", "payment.failed", "payment.refunded", "dispute.created", "dispute.submitted", "*"] as const;
const Body = z.object({ url: z.string().url().startsWith("https://"), events: z.array(z.enum(EVENTS)).min(1) });

/** Register an outbound webhook (e.g. your dispatch system marks job PAID). Secret returned once. */
export const POST = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  const b = Body.parse(await req.json());
  const secret = `whsec_${randomToken(24)}`;
  const ep = await db.webhookEndpoint.create({ data: { merchantId: m.id, url: b.url, events: b.events, secret } });
  return NextResponse.json({ id: ep.id, url: ep.url, events: ep.events, secret }, { status: 201 });
});
