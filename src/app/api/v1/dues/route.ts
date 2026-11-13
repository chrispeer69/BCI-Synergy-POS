import { NextResponse } from "next/server";
import { requireMerchantKey } from "@/lib/auth";
import { handler } from "@/lib/http";
import { duesStatus } from "@/lib/services/dues";

/** GET /api/v1/dues — Elite membership coverage meter for the current month. */
export const GET = handler(async (req: Request) => {
  const m = await requireMerchantKey(req);
  if (m.membershipTier !== "ELITE") return NextResponse.json({ tier: m.membershipTier, eligible: false });
  return NextResponse.json({ tier: "ELITE", eligible: true, ...(await duesStatus(m.id)) });
});
