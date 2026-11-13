import { finixProvider } from "./finix";
import { mockProvider } from "./mock";
import { tilledProvider } from "./tilled";
import type { PaymentsProvider } from "./types";

const registry: Record<string, PaymentsProvider> = {
  mock: mockProvider,
  tilled: tilledProvider,
  finix: finixProvider,
};

export function getProvider(name = process.env.PAYMENTS_PROVIDER ?? "mock"): PaymentsProvider {
  const p = registry[name];
  if (!p) throw new Error(`Unknown payments provider: ${name}`);
  return p;
}

/** Merchant Category Codes per vertical (verify with provider underwriting). */
export const MCC_BY_VERTICAL: Record<string, string> = {
  TOWING: "7549",
  AUTO_REPAIR: "7538",
  BODY_SHOP: "7531",
  HVAC: "1711",
  PLUMBING: "1711",
  ELECTRICAL: "1731",
  HOME_SERVICES: "7349",
  OTHER: "7399",
};
