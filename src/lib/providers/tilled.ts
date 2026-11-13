import { hmacSha256, safeEqualHex } from "../crypto";
import { ProviderError, type NormalizedEvent, type PaymentsProvider } from "./types";

/**
 * Tilled PayFac-as-a-Service adapter.
 * VERIFY every endpoint/field against Tilled API docs in sandbox before go-live —
 * shapes below follow Tilled's documented REST style (payment intents, tilled-account header).
 */
const base = () => process.env.TILLED_API_BASE ?? "https://sandbox-api.tilled.com";

async function call<T>(path: string, init: RequestInit & { account?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "tilled-api-key": process.env.TILLED_SECRET_KEY ?? "",
  };
  headers["tilled-account"] = init.account ?? process.env.TILLED_PARTNER_ACCOUNT_ID ?? "";
  const res = await fetch(`${base()}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(`Tilled ${path} failed`, res.status, body);
  return body as T;
}

const fundingMap = (f?: string) =>
  f === "credit" ? "CREDIT" : f === "debit" ? "DEBIT" : f === "prepaid" ? "PREPAID" : "UNKNOWN";

export const tilledProvider: PaymentsProvider = {
  name: "tilled",

  async onboardMerchant(input) {
    const acct = await call<{ id: string }>("/v1/accounts/connected", {
      method: "POST",
      body: JSON.stringify({ name: input.dbaName, email: input.email, metadata: { mcc: input.mcc, state: input.state } }),
    });
    return { providerAccountId: acct.id, status: "SUBMITTED" };
  },

  async lookupPaymentMethod(account, token) {
    const pm = await call<{ type: string; card?: { funding?: string; brand?: string; last4?: string } }>(`/v1/payment-methods/${token}`, { account });
    if (pm.type === "ach_debit") return { funding: "ACH" };
    return { funding: fundingMap(pm.card?.funding), brand: pm.card?.brand, last4: pm.card?.last4 };
  },

  async charge(input) {
    const pm = await this.lookupPaymentMethod(input.providerAccountId, input.paymentMethodToken);
    const pi = await call<{ id: string; status: string; last_payment_error?: { message?: string } }>("/v1/payment-intents", {
      method: "POST",
      account: input.providerAccountId,
      headers: { "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({
        amount: input.amountCents,
        currency: input.currency,
        payment_method_id: input.paymentMethodToken,
        payment_method_types: [pm.funding === "ACH" ? "ach_debit" : "card"],
        platform_fee_amount: input.platformFeeCents,
        confirm: true,
        description: input.description,
        metadata: input.metadata,
      }),
    });
    const status = pi.status === "succeeded" ? "SUCCEEDED" : pi.status === "processing" ? "PROCESSING" : "FAILED";
    return { providerPaymentId: pi.id, status, failureReason: pi.last_payment_error?.message, ...pm };
  },

  async refund(account, paymentId, amountCents) {
    await call("/v1/refunds", { method: "POST", account, body: JSON.stringify({ payment_intent_id: paymentId, amount: amountCents }) });
    return { ok: true };
  },

  hostedFieldsConfig(accountId) {
    return {
      provider: "tilled",
      publishableKey: process.env.NEXT_PUBLIC_TILLED_PUBLISHABLE_KEY,
      accountId,
      env: base().includes("sandbox") ? "sandbox" : "production",
    };
  },

  async verifyAndParseWebhook(rawBody, headers) {
    // Tilled signs: header "tilled-signature: t=<ts>,v1=<hmac(ts.body)>" — verify in sandbox.
    const sig = headers.get("tilled-signature") ?? "";
    const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
    const expected = hmacSha256(process.env.TILLED_WEBHOOK_SECRET ?? "", `${parts.t}.${rawBody}`);
    if (!parts.v1 || !safeEqualHex(expected, parts.v1)) throw new ProviderError("Invalid Tilled signature", 401);

    const e = JSON.parse(rawBody) as { id: string; type: string; data: Record<string, any> };
    const d = e.data ?? {};
    switch (e.type) {
      case "payment_intent.succeeded":
        return { id: e.id, type: "payment.succeeded", providerPaymentId: d.id };
      case "payment_intent.payment_failed":
        return { id: e.id, type: "payment.failed", providerPaymentId: d.id, reason: d.last_payment_error?.message };
      case "dispute.created":
        return { id: e.id, type: "dispute.created", providerPaymentId: d.payment_intent_id, providerDisputeId: d.id, amountCents: d.amount, reason: d.reason ?? "unknown", respondBy: d.evidence_due_by };
      case "dispute.updated":
        if (d.status === "won" || d.status === "lost") return { id: e.id, type: "dispute.closed", providerDisputeId: d.id, won: d.status === "won" };
        return { id: e.id, type: "ignored", raw: e.type };
      case "account.updated":
        return { id: e.id, type: "merchant.updated", providerAccountId: d.id, status: d.status === "active" ? "ACTIVE" : d.status === "rejected" ? "REJECTED" : "UNDER_REVIEW" };
      default:
        return { id: e.id, type: "ignored", raw: e.type } as NormalizedEvent;
    }
  },
};
