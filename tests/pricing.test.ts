import { describe, expect, it } from "vitest";
import { priceCharge, type PricingInput } from "../src/lib/pricing";

const now = new Date("2026-11-13T00:00:00Z");
const noticed = new Date("2026-09-01T00:00:00Z");
const base: PricingInput = {
  mode: "SURCHARGE",
  baseAmountCents: 10_000,
  funding: "CREDIT",
  state: "FL",
  surchargeBps: 300,
  creditCostBps: 300,
  cashDiscountBps: 350,
  surchargeNoticeAt: noticed,
  now,
};

describe("surcharge", () => {
  it("applies 3% on credit in allowed state", () => {
    const r = priceCharge(base);
    expect(r.feeCents).toBe(300);
    expect(r.totalCents).toBe(10_300);
  });
  it.each(["DEBIT", "PREPAID", "ACH", "UNKNOWN"] as const)("never surcharges %s", (funding) => {
    expect(priceCharge({ ...base, funding }).feeCents).toBe(0);
  });
  it.each(["CT", "MA", "CA", "ME"])("blocks surcharge in %s", (state) => {
    expect(priceCharge({ ...base, state }).feeCents).toBe(0);
  });
  it("caps at Colorado 2%", () => {
    expect(priceCharge({ ...base, state: "CO" }).feeCents).toBe(200);
  });
  it("caps at merchant actual cost", () => {
    expect(priceCharge({ ...base, creditCostBps: 240 }).feeCents).toBe(240);
  });
  it("caps at 3% network cap even if requested higher", () => {
    expect(priceCharge({ ...base, surchargeBps: 400, creditCostBps: 450 }).feeCents).toBe(300);
  });
  it("requires 30-day notice", () => {
    expect(priceCharge({ ...base, surchargeNoticeAt: null }).feeCents).toBe(0);
    expect(priceCharge({ ...base, surchargeNoticeAt: new Date("2026-11-01T00:00:00Z") }).feeCents).toBe(0);
  });
});

describe("cash discount", () => {
  const cd: PricingInput = { ...base, mode: "CASH_DISCOUNT" };
  it("applies card price to credit and debit, in any state", () => {
    expect(priceCharge({ ...cd, state: "CT" }).totalCents).toBe(10_350);
    expect(priceCharge({ ...cd, funding: "DEBIT" }).totalCents).toBe(10_350);
  });
  it("ACH pays cash price", () => {
    expect(priceCharge({ ...cd, funding: "ACH" }).totalCents).toBe(10_000);
  });
});

describe("standard", () => {
  it("no fee", () => {
    expect(priceCharge({ ...base, mode: "STANDARD" }).feeCents).toBe(0);
  });
  it("rejects invalid amount", () => {
    expect(() => priceCharge({ ...base, baseAmountCents: 0 })).toThrow();
    expect(() => priceCharge({ ...base, baseAmountCents: 10.5 })).toThrow();
  });
});
