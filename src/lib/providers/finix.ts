import { ProviderError, type PaymentsProvider } from "./types";

/**
 * Finix adapter (Identities → Merchants → Payment Instruments → Transfers).
 * VERIFY against Finix sandbox docs before go-live.
 */
const base = () => process.env.FINIX_API_BASE ?? "https://finix.sandbox-payments-api.com";

async function call<T>(path: string, init: RequestInit = {}, idem?: string): Promise<T> {
  const auth = Buffer.from(`${process.env.FINIX_USERNAME}:${process.env.FINIX_PASSWORD}`).toString("base64");
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "finix-version": "2022-02-01",
      authorization: `Basic ${auth}`,
      ...(idem ? { "idempotency-id": idem } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(`Finix ${path} failed`, res.status, body);
  return body as T;
}

export const finixProvider: PaymentsProvider = {
  name: "finix",

  async onboardMerchant(input) {
    const identity = await call<{ id: string }>("/identities", {
      method: "POST",
      body: JSON.stringify({
        entity: { business_name: input.legalName, doing_business_as: input.dbaName, email: input.email, phone: input.phone, mcc: input.mcc },
      }),
    });
    const merchant = await call<{ id: string; onboarding_state: string }>(`/identities/${identity.id}/merchants`, {
      method: "POST",
      body: JSON.stringify({ processor: "DUMMY_V1" }),
    });
    return { providerAccountId: merchant.id, status: merchant.onboarding_state === "APPROVED" ? "ACTIVE" : "UNDER_REVIEW" };
  },

  async lookupPaymentMethod(_acct, token) {
    const pi = await call<{ type: string; card_type?: string; brand?: string; last_four?: string }>(`/payment_instruments/${token}`);
    if (pi.type === "BANK_ACCOUNT") return { funding: "ACH" };
    const f = pi.card_type === "CREDIT" ? "CREDIT" : pi.card_type === "DEBIT" ? "DEBIT" : pi.card_type === "PREPAID" ? "PREPAID" : "UNKNOWN";
    return { funding: f, brand: pi.brand, last4: pi.last_four };
  },

  async charge(input) {
    const pm = await this.lookupPaymentMethod(input.providerAccountId, input.paymentMethodToken);
    const t = await call<{ id: string; state: string; failure_message?: string }>(
      "/transfers",
      {
        method: "POST",
        body: JSON.stringify({
          merchant: input.providerAccountId,
          source: input.paymentMethodToken,
          amount: input.amountCents,
          currency: "USD",
          fee: input.platformFeeCents,
          tags: input.metadata,
        }),
      },
      input.idempotencyKey
    );
    const status = t.state === "SUCCEEDED" ? "SUCCEEDED" : t.state === "PENDING" ? "PROCESSING" : "FAILED";
    return { providerPaymentId: t.id, status, failureReason: t.failure_message, ...pm };
  },

  async refund(_acct, paymentId, amountCents) {
    await call(`/transfers/${paymentId}/reversals`, { method: "POST", body: JSON.stringify({ refund_amount: amountCents }) });
    return { ok: true };
  },

  hostedFieldsConfig(accountId) {
    return { provider: "finix", accountId, env: base().includes("sandbox") ? "sandbox" : "production" };
  },

  async verifyAndParseWebhook(rawBody) {
    // TODO: configure Finix webhook authentication (basic auth or signing) and verify here.
    if (!process.env.FINIX_WEBHOOK_SECRET) throw new ProviderError("FINIX_WEBHOOK_SECRET not configured", 401);
    const e = JSON.parse(rawBody) as { id: string; type: string; entity: string; _embedded?: Record<string, any[]> };
    const t = e._embedded?.transfers?.[0];
    if (e.entity === "transfer" && t?.state === "SUCCEEDED") return { id: e.id, type: "payment.succeeded", providerPaymentId: t.id };
    if (e.entity === "transfer" && t?.state === "FAILED") return { id: e.id, type: "payment.failed", providerPaymentId: t.id, reason: t.failure_message };
    const d = e._embedded?.disputes?.[0];
    if (e.entity === "dispute" && d && e.type === "created")
      return { id: e.id, type: "dispute.created", providerPaymentId: d.transfer, providerDisputeId: d.id, amountCents: d.amount, reason: d.reason ?? "unknown", respondBy: d.respond_by };
    return { id: e.id, type: "ignored", raw: `${e.entity}.${e.type}` };
  },
};
