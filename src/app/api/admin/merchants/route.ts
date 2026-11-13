import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { generateApiKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { MCC_BY_VERTICAL, getProvider } from "@/lib/providers";

const Body = z.object({
  legalName: z.string().min(2),
  dbaName: z.string().min(2),
  vertical: z.enum(["TOWING", "AUTO_REPAIR", "BODY_SHOP", "HVAC", "PLUMBING", "ELECTRICAL", "HOME_SERVICES", "OTHER"]),
  state: z.string().length(2).transform((s) => s.toUpperCase()),
  email: z.string().email(),
  phone: z.string().optional(),
  pricingMode: z.enum(["STANDARD", "SURCHARGE", "CASH_DISCOUNT"]).default("CASH_DISCOUNT"),
  membershipTier: z.enum(["NONE", "STANDARD", "ELITE"]).default("NONE"),
});

/** POST /api/admin/merchants — board a merchant with the provider, return a one-time API key. */
export const POST = handler(async (req: Request) => {
  requireAdmin(req);
  const b = Body.parse(await req.json());
  const provider = getProvider();
  const onboard = await provider.onboardMerchant({
    legalName: b.legalName, dbaName: b.dbaName, email: b.email, phone: b.phone, state: b.state, mcc: MCC_BY_VERTICAL[b.vertical],
  });
  const key = generateApiKey(process.env.NODE_ENV === "production" ? "live" : "test");
  const m = await db.merchant.create({
    data: {
      ...b,
      provider: provider.name,
      providerAccountId: onboard.providerAccountId,
      status: onboard.status,
      apiKeys: { create: { name: "default", prefix: key.prefix, hash: key.hash } },
    },
  });
  return NextResponse.json({ merchantId: m.id, status: m.status, onboardingUrl: onboard.onboardingUrl, apiKey: key.key }, { status: 201 });
});

export const GET = handler(async (req: Request) => {
  requireAdmin(req);
  const merchants = await db.merchant.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ data: merchants });
});
