import { randomToken } from "../crypto";
import type { PaymentsProvider } from "./types";

/**
 * Local dev provider. Test tokens:
 *   tok_credit_4242   → credit, succeeds
 *   tok_debit_5555    → debit, succeeds
 *   tok_prepaid_1111  → prepaid, succeeds
 *   tok_decline_0002  → credit, declines
 *   tok_ach_6789      → ACH, succeeds
 */
export const mockProvider: PaymentsProvider = {
  name: "mock",

  async onboardMerchant() {
    return { providerAccountId: `acct_mock_${randomToken(8)}`, status: "ACTIVE" };
  },

  async lookupPaymentMethod(_acct, token) {
    const [, kind, last4] = token.split("_");
    const funding =
      kind === "debit" ? "DEBIT" : kind === "prepaid" ? "PREPAID" : kind === "ach" ? "ACH" : kind === "credit" || kind === "decline" ? "CREDIT" : "UNKNOWN";
    return { funding, brand: funding === "ACH" ? "ACH" : "VISA", last4 };
  },

  async charge(input) {
    const pm = await this.lookupPaymentMethod(input.providerAccountId, input.paymentMethodToken);
    const declined = input.paymentMethodToken.startsWith("tok_decline");
    return {
      providerPaymentId: `pay_mock_${randomToken(10)}`,
      status: declined ? "FAILED" : "SUCCEEDED",
      failureReason: declined ? "card_declined" : undefined,
      ...pm,
    };
  },

  async refund() {
    return { ok: true };
  },

  hostedFieldsConfig(accountId) {
    return { provider: "mock", accountId, env: "sandbox" };
  },

  async verifyAndParseWebhook(rawBody) {
    const e = JSON.parse(rawBody);
    return e;
  },
};
