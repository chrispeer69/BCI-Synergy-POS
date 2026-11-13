/**
 * Dispute evidence engine (pure, no I/O).
 * Classifies dispute reasons, scores how strong the evidence on file is for that
 * category, and assembles a structured packet for submission.
 */

export type EvidenceType =
  | "PHOTO" | "SIGNATURE" | "GPS" | "TIMELINE_EVENT" | "CALL_RECORDING" | "DOCUMENT" | "CUSTOMER_AUTHORIZATION" | "NOTE";

export type DisputeCategory = "FRAUD" | "NOT_RECEIVED" | "NOT_AS_DESCRIBED" | "DUPLICATE" | "CREDIT_NOT_PROCESSED" | "OTHER";

export type EvidenceItem = {
  type: EvidenceType;
  url?: string | null;
  data?: Record<string, unknown>;
  capturedAt: Date;
  capturedBy?: string | null;
};

/** Map provider/network reason text or codes to a category. */
export function categorizeDispute(reason: string): DisputeCategory {
  const r = reason.toLowerCase().replace(/[^a-z0-9.]+/g, " ");
  if (/\b(fraud\w*|unauthori[sz]ed|not recogni[sz]ed|10\.\d|4837|4863|4870|4871)\b/.test(r)) return "FRAUD";
  if (/\b(not received|non receipt|services not provided|13\.1|4855)\b/.test(r)) return "NOT_RECEIVED";
  if (/\b(not as described|defective|quality|13\.3|4853)\b/.test(r)) return "NOT_AS_DESCRIBED";
  if (/\b(duplicate|paid by other means|12\.6|4834)\b/.test(r)) return "DUPLICATE";
  if (/\b(credit not processed|refund not processed|13\.6|4860)\b/.test(r)) return "CREDIT_NOT_PROCESSED";
  return "OTHER";
}

/** What wins each category, and how much each evidence type is worth (sums to 100). */
const WEIGHTS: Record<DisputeCategory, Partial<Record<EvidenceType | "RECEIPT", number>>> = {
  FRAUD: { SIGNATURE: 30, CUSTOMER_AUTHORIZATION: 20, CALL_RECORDING: 15, GPS: 15, PHOTO: 10, RECEIPT: 10 },
  NOT_RECEIVED: { GPS: 30, TIMELINE_EVENT: 25, PHOTO: 20, SIGNATURE: 15, RECEIPT: 10 },
  NOT_AS_DESCRIBED: { PHOTO: 30, CUSTOMER_AUTHORIZATION: 25, SIGNATURE: 20, DOCUMENT: 15, RECEIPT: 10 },
  DUPLICATE: { RECEIPT: 50, TIMELINE_EVENT: 25, DOCUMENT: 25 },
  CREDIT_NOT_PROCESSED: { CUSTOMER_AUTHORIZATION: 40, RECEIPT: 30, DOCUMENT: 30 },
  OTHER: { SIGNATURE: 20, CUSTOMER_AUTHORIZATION: 20, GPS: 15, PHOTO: 15, TIMELINE_EVENT: 10, DOCUMENT: 10, RECEIPT: 10 },
};

/** 0–100. Receipt (our own payment record) is always available. */
export function evidenceStrength(category: DisputeCategory, items: EvidenceItem[]): number {
  const have = new Set<string>(items.map((i) => i.type));
  have.add("RECEIPT");
  const w = WEIGHTS[category];
  return Object.entries(w).reduce((s, [t, pts]) => s + (have.has(t) ? pts ?? 0 : 0), 0);
}

/** What to go collect if you have time before the response deadline. */
export function missingEvidence(category: DisputeCategory, items: EvidenceItem[]): EvidenceType[] {
  const have = new Set<string>(items.map((i) => i.type));
  return (Object.keys(WEIGHTS[category]) as (EvidenceType | "RECEIPT")[])
    .filter((t) => t !== "RECEIPT" && !have.has(t)) as EvidenceType[];
}

export type PacketInput = {
  category: DisputeCategory;
  reason: string;
  merchant: { dbaName: string; phone?: string | null; vertical: string; pricingMode: string };
  job?: { externalRef?: string | null; title: string; details?: Record<string, unknown> } | null;
  payment: {
    id: string; createdAt: Date; channel: string; funding: string; brand?: string | null; last4?: string | null;
    baseAmountCents: number; feeAmountCents: number; totalAmountCents: number; feeLabel?: string | null;
  };
  items: EvidenceItem[];
};

export type EvidencePacket = {
  category: DisputeCategory;
  strength: number;
  missing: EvidenceType[];
  summary: string;
  receipt: Record<string, unknown>;
  timeline: { at: string; event: string; by?: string | null }[];
  locations: { at: string; lat: number; lng: number; accuracyM?: number; label?: string }[];
  attachments: { type: EvidenceType; url: string; capturedAt: string; capturedBy?: string | null }[];
  notes: string[];
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export function buildEvidencePacket(i: PacketInput): EvidencePacket {
  const sorted = [...i.items].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const timeline = sorted
    .filter((e) => e.type === "TIMELINE_EVENT")
    .map((e) => ({ at: e.capturedAt.toISOString(), event: String(e.data?.event ?? "event"), by: e.capturedBy }));
  const locations = sorted
    .filter((e) => e.type === "GPS" && typeof e.data?.lat === "number" && typeof e.data?.lng === "number")
    .map((e) => ({
      at: e.capturedAt.toISOString(),
      lat: e.data!.lat as number,
      lng: e.data!.lng as number,
      accuracyM: typeof e.data?.accuracyM === "number" ? (e.data.accuracyM as number) : undefined,
      label: typeof e.data?.label === "string" ? (e.data.label as string) : undefined,
    }));
  const attachments = sorted
    .filter((e) => e.url)
    .map((e) => ({ type: e.type, url: e.url!, capturedAt: e.capturedAt.toISOString(), capturedBy: e.capturedBy }));
  const notes = sorted.filter((e) => e.type === "NOTE" && typeof e.data?.text === "string").map((e) => e.data!.text as string);

  const has = (t: EvidenceType) => sorted.some((e) => e.type === t);
  const svc = i.job ? `${i.job.title}${i.job.externalRef ? ` (job ${i.job.externalRef})` : ""}` : "service";
  const parts = [
    `${i.merchant.dbaName} performed ${svc} and was paid ${money(i.payment.totalAmountCents)} on ${i.payment.createdAt.toISOString().slice(0, 10)} via ${i.payment.channel.replace(/_/g, " ").toLowerCase()} (${i.payment.brand ?? i.payment.funding} ending ${i.payment.last4 ?? "----"}).`,
  ];
  if (has("SIGNATURE") || has("CUSTOMER_AUTHORIZATION")) parts.push("The cardholder signed/authorized the service at the time it was performed.");
  if (locations.length) parts.push(`GPS records place the service vehicle on scene (${locations.length} location fix${locations.length > 1 ? "es" : ""}).`);
  if (timeline.length) parts.push(`Service timeline: ${timeline.map((t) => `${t.event} ${t.at.slice(11, 16)}Z`).join(" → ")}.`);
  if (has("PHOTO")) parts.push(`${sorted.filter((e) => e.type === "PHOTO").length} time-stamped photo(s) document the service.`);
  if (has("CALL_RECORDING")) parts.push("The customer requested service by phone; a recording of the request is available.");
  if (i.payment.feeAmountCents > 0)
    parts.push(`${i.payment.feeLabel ?? "Card fee"} of ${money(i.payment.feeAmountCents)} was disclosed before payment under the merchant's ${i.merchant.pricingMode.replace(/_/g, " ").toLowerCase()} program.`);

  return {
    category: i.category,
    strength: evidenceStrength(i.category, i.items),
    missing: missingEvidence(i.category, i.items),
    summary: parts.join(" "),
    receipt: {
      paymentId: i.payment.id,
      date: i.payment.createdAt.toISOString(),
      baseAmount: money(i.payment.baseAmountCents),
      fee: money(i.payment.feeAmountCents),
      feeLabel: i.payment.feeLabel ?? null,
      total: money(i.payment.totalAmountCents),
      method: `${i.payment.brand ?? i.payment.funding} ••${i.payment.last4 ?? "----"}`,
      merchant: i.merchant.dbaName,
      merchantPhone: i.merchant.phone ?? null,
    },
    timeline,
    locations,
    attachments,
    notes,
  };
}

/** Luhn check — used to refuse anything that looks like a card number entering the locker. */
function luhn(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** True if any string inside `value` contains a plausible PAN (13–19 digits passing Luhn). */
export function containsCardNumber(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const runs = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return runs.some((r) => {
    const d = r.replace(/\D/g, "");
    return d.length >= 13 && d.length <= 19 && luhn(d);
  });
}
