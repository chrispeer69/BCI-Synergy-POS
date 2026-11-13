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
