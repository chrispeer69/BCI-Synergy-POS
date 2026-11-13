import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { assignableRoles, can, resolveMerchantScope } from "../src/lib/permissions";
import { _resetRateLimits, rateLimit } from "../src/lib/ratelimit";
import { invoiceDecision, isClosable, isPeriod, periodBounds, previousPeriod } from "../src/lib/dues";

describe("passwords", () => {
  it("hashes and verifies; rejects wrong password", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });
  it("salts (same password → different hashes)", async () => {
    expect(await hashPassword("same-password-123")).not.toBe(await hashPassword("same-password-123"));
  });
  it("enforces minimum length", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
  it("rejects malformed stored hash", async () => {
    expect(await verifyPassword("anything", "bcrypt$garbage")).toBe(false);
  });
});

describe("permissions", () => {
  it("role grants", () => {
    expect(can("PLATFORM_ADMIN", "billing:close")).toBe(true);
    expect(can("OWNER", "billing:close")).toBe(false);
    expect(can("OWNER", "billing:read")).toBe(true);
    expect(can("DISPATCHER", "paylinks:create")).toBe(true);
    expect(can("DISPATCHER", "billing:read")).toBe(false);
    expect(can("VIEWER", "paylinks:create")).toBe(false);
  });
  it("owners cannot mint admins; dispatchers cannot assign anything", () => {
    expect(assignableRoles("OWNER")).not.toContain("PLATFORM_ADMIN");
    expect(assignableRoles("DISPATCHER")).toEqual([]);
  });
  it("non-admins are pinned to their own merchant", () => {
    expect(resolveMerchantScope({ role: "OWNER", merchantId: "m1" }, "m2")).toBe("m1");
    expect(resolveMerchantScope({ role: "PLATFORM_ADMIN", merchantId: null }, "m2")).toBe("m2");
  });
});

describe("rate limit", () => {
  beforeEach(() => _resetRateLimits());
  it("blocks after limit within window", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    const r = rateLimit("k", 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("billing periods", () => {
  it("validates and bounds periods", () => {
    expect(isPeriod("2026-11")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    const b = periodBounds("2026-12");
    expect(b.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(b.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("previous period wraps the year", () => {
    expect(previousPeriod(new Date("2027-01-01T11:00:00Z"))).toBe("2026-12");
    expect(previousPeriod(new Date("2026-11-13T00:00:00Z"))).toBe("2026-10");
  });
  it("cannot close a period that has not ended", () => {
    expect(isClosable("2026-11", new Date("2026-11-30T23:59:59Z"))).toBe(false);
    expect(isClosable("2026-11", new Date("2026-12-01T00:00:00Z"))).toBe(true);
  });
  it("invoice decision: balance → OPEN, covered → WAIVED $0", () => {
    expect(invoiceDecision(50_000, 27_375)).toEqual({ amountCents: 22_625, status: "OPEN" });
    expect(invoiceDecision(50_000, 50_000)).toEqual({ amountCents: 0, status: "WAIVED" });
    expect(invoiceDecision(50_000, 90_000)).toEqual({ amountCents: 0, status: "WAIVED" });
  });
});
