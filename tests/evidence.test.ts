import { describe, expect, it } from "vitest";
import { buildEvidencePacket, categorizeDispute, containsCardNumber, evidenceStrength, missingEvidence, type EvidenceItem } from "../src/lib/evidence";

const t = (h: number) => new Date(Date.UTC(2026, 10, 12, h, 0, 0));
const full: EvidenceItem[] = [
  { type: "TIMELINE_EVENT", data: { event: "dispatched" }, capturedAt: t(14), capturedBy: "dispatch" },
  { type: "GPS", data: { lat: 25.76, lng: -80.19, accuracyM: 8, label: "arrival" }, capturedAt: t(15), capturedBy: "truck 12" },
  { type: "TIMELINE_EVENT", data: { event: "arrived" }, capturedAt: t(15), capturedBy: "truck 12" },
  { type: "PHOTO", url: "https://files.example/p1.jpg", capturedAt: t(15), capturedBy: "truck 12" },
  { type: "SIGNATURE", url: "https://files.example/sig.png", capturedAt: t(16), capturedBy: "truck 12" },
  { type: "TIMELINE_EVENT", data: { event: "completed" }, capturedAt: t(16), capturedBy: "truck 12" },
  { type: "CALL_RECORDING", url: "https://files.example/call.mp3", capturedAt: t(13) },
  { type: "CUSTOMER_AUTHORIZATION", url: "https://files.example/terms.pdf", capturedAt: t(15) },
];

describe("categorizeDispute", () => {
  it.each([
    ["fraudulent", "FRAUD"], ["Visa 10.4 Other Fraud", "FRAUD"], ["unauthorized transaction", "FRAUD"],
    ["product_not_received", "NOT_RECEIVED"], ["13.1 Services Not Provided", "NOT_RECEIVED"],
    ["not as described", "NOT_AS_DESCRIBED"], ["duplicate", "DUPLICATE"],
    ["credit_not_processed", "CREDIT_NOT_PROCESSED"], ["general", "OTHER"],
  ])("%s → %s", (reason, cat) => expect(categorizeDispute(reason)).toBe(cat));
});

describe("evidence strength", () => {
  it("full towing packet scores 100 on fraud", () => expect(evidenceStrength("FRAUD", full)).toBe(100));
  it("receipt-only scores low and lists what's missing", () => {
    expect(evidenceStrength("FRAUD", [])).toBe(10);
    expect(missingEvidence("FRAUD", [])).toEqual(["SIGNATURE", "CUSTOMER_AUTHORIZATION", "CALL_RECORDING", "GPS", "PHOTO"]);
  });
  it("not-received is won by GPS + timeline", () => {
    const gpsTimeline = full.filter((e) => e.type === "GPS" || e.type === "TIMELINE_EVENT");
    expect(evidenceStrength("NOT_RECEIVED", gpsTimeline)).toBe(65);
  });
});

describe("buildEvidencePacket", () => {
  const p = buildEvidencePacket({
    category: "FRAUD",
    reason: "fraudulent",
    merchant: { dbaName: "Merchant One Towing", phone: "(555) 010-0100", vertical: "TOWING", pricingMode: "CASH_DISCOUNT" },
    job: { externalRef: "T-10441", title: "Light-duty tow" },
    payment: { id: "pay_1", createdAt: t(16), channel: "TAP_TO_PAY", funding: "CREDIT", brand: "VISA", last4: "4242", baseAmountCents: 24_500, feeAmountCents: 858, totalAmountCents: 25_358, feeLabel: "Card price (cash discount program)" },
    items: full,
  });
  it("orders timeline and extracts GPS", () => {
    expect(p.timeline.map((x) => x.event)).toEqual(["dispatched", "arrived", "completed"]);
    expect(p.locations[0]).toMatchObject({ lat: 25.76, lng: -80.19, accuracyM: 8 });
  });
  it("summary covers authorization, GPS, photos, call, disclosure", () => {
    expect(p.summary).toContain("Merchant One Towing performed Light-duty tow (job T-10441)");
    expect(p.summary).toContain("signed/authorized");
    expect(p.summary).toContain("GPS records");
    expect(p.summary).toContain("photo");
    expect(p.summary).toContain("recording");
    expect(p.summary).toContain("disclosed before payment");
    expect(p.attachments).toHaveLength(4); // photo, signature, call, authorization
    expect(p.strength).toBe(100);
  });
});

describe("containsCardNumber", () => {
  it("detects PANs in strings and nested objects", () => {
    expect(containsCardNumber("card 4242 4242 4242 4242 exp 12/28")).toBe(true);
    expect(containsCardNumber({ note: { text: "cc 4111-1111-1111-1111" } })).toBe(true);
  });
  it("ignores phone numbers, timestamps, non-Luhn digit runs", () => {
    expect(containsCardNumber("call 555-010-0100 at 1731426000")).toBe(false);
    expect(containsCardNumber("ref 1234567890123")).toBe(false);
  });
});
