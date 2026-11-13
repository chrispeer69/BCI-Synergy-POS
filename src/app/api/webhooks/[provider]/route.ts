import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { applyProviderEvent } from "@/lib/services/events";

/** Inbound provider webhooks: /api/webhooks/tilled, /api/webhooks/finix */
export const POST = handler(async (req: Request, ctx: { params: { provider: string } }) => {
  if (ctx.params.provider === "mock" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const provider = getProvider(ctx.params.provider);
  const raw = await req.text();
  const event = await provider.verifyAndParseWebhook(raw, req.headers);
  const r = await applyProviderEvent(provider.name, event, JSON.parse(raw));
  return NextResponse.json({ received: true, ...r });
});
