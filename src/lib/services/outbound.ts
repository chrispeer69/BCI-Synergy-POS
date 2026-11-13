import { db } from "../db";
import { randomToken, signWebhook } from "../crypto";

/**
 * Deliver signed events to integrating systems (your dispatch SaaS, FSM, shop software).
 * Header: BCI-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>
 * Prod: move to a durable queue (e.g. pg-boss / SQS) with retries + backoff.
 */
export async function emitEvent(merchantId: string, type: string, data: Record<string, unknown>) {
  const endpoints = await db.webhookEndpoint.findMany({ where: { merchantId, active: true } });
  const targets = endpoints.filter((e) => e.events.includes(type) || e.events.includes("*"));
  if (!targets.length) return;
  const body = JSON.stringify({ id: `evt_${randomToken(12)}`, type, createdAt: new Date().toISOString(), data });
  await Promise.allSettled(
    targets.map(async (e) => {
      const res = await fetch(e.url, {
        method: "POST",
        headers: { "content-type": "application/json", "BCI-Signature": signWebhook(e.secret, body) },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.warn(`[webhook] ${e.url} → ${res.status}`);
    })
  );
}
