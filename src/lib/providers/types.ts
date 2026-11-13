/**
 * Provider-agnostic payments interface. Swap Tilled / Finix / others without touching app code.
 * Card data NEVER touches our servers: the browser tokenizes via the provider's hosted fields
 * and we receive only a payment-method token.
 */
import type { Funding } from "../pricing";

export type OnboardMerchantInput = {
  legalName: string;
  dbaName: string;
  email: string;
  phone?: string;
  state: string;
  mcc: string;
};

export type OnboardMerchantResult = {
  providerAccountId: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "ACTIVE" | "REJECTED";
  // Hosted onboarding URL (KYC/KYB, bank account) if provider supports it
  onboardingUrl?: string;
};

export type LookupResult = { funding: Funding; brand?: string; last4?: string };

export type ChargeInput = {
  providerAccountId: string;
  paymentMethodToken: string;
  amountCents: number;
  platformFeeCents: number; // our cut, split at source where provider supports it
  currency: "usd";
  idempotencyKey: string;
  description?: string;
  metadata?: Record<string, string>;
};

export type ChargeResult = {
  providerPaymentId: string;
  status: "SUCCEEDED" | "PROCESSING" | "FAILED";
  failureReason?: string;
  funding: Funding;
  brand?: string;
  last4?: string;
};

export type NormalizedEvent =
  | { id: string; type: "payment.succeeded"; providerPaymentId: string }
  | { id: string; type: "payment.failed"; providerPaymentId: string; reason?: string }
  | { id: string; type: "payment.refunded"; providerPaymentId: string; amountCents: number }
  | { id: string; type: "dispute.created"; providerPaymentId: string; providerDisputeId: string; amountCents: number; reason: string; respondBy?: string }
  | { id: string; type: "dispute.closed"; providerDisputeId: string; won: boolean }
  | { id: string; type: "merchant.updated"; providerAccountId: string; status: "ACTIVE" | "REJECTED" | "UNDER_REVIEW" }
  | { id: string; type: "ignored"; raw: string };

export interface PaymentsProvider {
  readonly name: string;
  onboardMerchant(input: OnboardMerchantInput): Promise<OnboardMerchantResult>;
  /** Determine credit vs debit BEFORE charging so surcharge rules apply correctly. */
  lookupPaymentMethod(providerAccountId: string, paymentMethodToken: string): Promise<LookupResult>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  refund(providerAccountId: string, providerPaymentId: string, amountCents: number): Promise<{ ok: boolean }>;
  /** Client config for hosted fields on the pay page (public keys only). */
  hostedFieldsConfig(providerAccountId: string): { provider: string; publishableKey?: string; accountId: string; env: "sandbox" | "production" };
  verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: unknown) {
    super(message);
  }
}
