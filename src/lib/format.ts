export const usd = (cents: number, opts: { compact?: boolean } = {}) => {
  const v = cents / 100;
  if (opts.compact && Math.abs(v) >= 1_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(v);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
};

export const ts = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(d);

export const pct = (n: number) => `${n.toFixed(0)}%`;
