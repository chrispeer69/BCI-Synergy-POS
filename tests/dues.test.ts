import { describe, expect, it } from "vitest";
import { computeDuesCredit, freeMembershipVolumeCents } from "../src/lib/dues";
import { signWebhook, verifyWebhookSignature } from "../src/lib/crypto";

describe("elite dues credit", () => {
  it("partial coverage", () => {
    const r = computeDuesCredit(50_000, 27_375);
    expect(r).toMatchObject({ creditCents: 27_375, balanceDueCents: 22_625, excessCents: 0, coveredPct: 55 });
  });
  it("full coverage with excess", () => {
    const r = computeDuesCredit(50_000, 82_125);
    expect(r).toMatchObject({ creditCents: 50_000, balanceDueCents: 0, excessCents: 32_125, coveredPct: 100 });
  });
  it("free point at 0.90% take = ~$667K/yr for $6K dues", () => {
    expect(freeMembershipVolumeCents(600_000, 90)).toBe(66_666_667);
  });
  it("free point at 0.45% take = ~$1.33M/yr", () => {
    expect(freeMembershipVolumeCents(600_000, 45)).toBe(133_333_334);
  });
});

describe("webhook signing", () => {
  it("round-trips and rejects tampering", () => {
    const body = JSON.stringify({ a: 1 });
    const h = signWebhook("s3cret", body);
    expect(verifyWebhookSignature("s3cret", body, h)).toBe(true);
    expect(verifyWebhookSignature("s3cret", body + " ", h)).toBe(false);
    expect(verifyWebhookSignature("wrong", body, h)).toBe(false);
  });
});
