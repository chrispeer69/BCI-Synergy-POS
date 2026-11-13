import { NextResponse } from "next/server";
import { z } from "zod";
import { handler } from "@/lib/http";
import { payPayLink } from "@/lib/services/payments";

const Body = z.object({ paymentMethodToken: z.string().min(4).max(200) });

/** Public: hosted pay page submits a provider payment-method token. No card data accepted. */
export const POST = handler(async (req: Request, ctx: { params: { token: string } }) => {
  const b = Body.parse(await req.json());
  const p = await payPayLink(ctx.params.token, b.paymentMethodToken);
  return NextResponse.json({
    status: p.status,
    totalAmountCents: p.totalAmountCents,
    feeAmountCents: p.feeAmountCents,
    feeLabel: p.feeLabel,
    last4: p.last4,
    brand: p.brand,
    failureReason: p.status === "FAILED" ? "Payment was declined" : undefined,
  });
});
