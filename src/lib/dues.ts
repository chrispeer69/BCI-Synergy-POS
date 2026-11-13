/**
 * Elite "membership paid by processing" math.
 * Each month, platform revenue earned on a member's payments is credited against dues.
 */
export type DuesResult = {
  duesCents: number;
  creditCents: number;
  balanceDueCents: number;
  excessCents: number;
  coveredPct: number; // 0-100
};

export function computeDuesCredit(duesCents: number, platformRevenueCents: number): DuesResult {
  if (duesCents < 0 || platformRevenueCents < 0) throw new Error("amounts must be non-negative");
  const credit = Math.min(duesCents, platformRevenueCents);
  return {
    duesCents,
    creditCents: credit,
    balanceDueCents: duesCents - credit,
    excessCents: Math.max(0, platformRevenueCents - duesCents),
    coveredPct: duesCents === 0 ? 100 : Math.round((credit / duesCents) * 100),
  };
}

/** Annual card volume (cents) at which dues are fully covered. */
export function freeMembershipVolumeCents(annualDuesCents: number, totalTakeBps: number): number {
  if (totalTakeBps <= 0) return Infinity;
  return Math.ceil((annualDuesCents * 10_000) / totalTakeBps);
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(s: string): boolean {
  return PERIOD_RE.test(s);
}

/** [start, end) UTC bounds of a YYYY-MM period. */
export function periodBounds(period: string): { start: Date; end: Date } {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new Error(`Invalid period: ${period}`);
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
  return { start, end };
}

/** The month before the one containing `d` (what the monthly close bills). */
export function previousPeriod(d: Date): string {
  return periodOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
}

/** A period may only be closed once it has fully ended. */
export function isClosable(period: string, now: Date): boolean {
  return periodBounds(period).end <= now;
}

export type InvoiceDecision = { amountCents: number; status: "OPEN" | "WAIVED" };

/** Balance due → OPEN invoice; fully covered by processing → WAIVED ($0, kept for the record). */
export function invoiceDecision(duesCents: number, platformRevenueCents: number): InvoiceDecision {
  const r = computeDuesCredit(duesCents, platformRevenueCents);
  return r.balanceDueCents > 0 ? { amountCents: r.balanceDueCents, status: "OPEN" } : { amountCents: 0, status: "WAIVED" };
}
