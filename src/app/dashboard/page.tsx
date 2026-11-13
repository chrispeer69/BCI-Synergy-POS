import { db } from "@/lib/db";
import { duesStatus, eliteDuesMonthlyCents } from "@/lib/services/dues";
import { ts, usd } from "@/lib/format";
import { resolveMerchantScope } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { Kpi, Row, Shell } from "./Shell";

export const dynamic = "force-dynamic";

const VERTICAL_LABEL: Record<string, string> = {
  TOWING: "Towing", AUTO_REPAIR: "Auto Repair", BODY_SHOP: "Body Shop", HVAC: "HVAC",
  PLUMBING: "Plumbing", ELECTRICAL: "Electrical", HOME_SERVICES: "Home Services", OTHER: "Other",
};
const MODE_LABEL: Record<string, string> = { STANDARD: "Standard", SURCHARGE: "Surcharge", CASH_DISCOUNT: "Cash Discount" };

export default async function Dashboard({ searchParams }: { searchParams: { m?: string } }) {
  const user = await requireUser("payments:read");
  const isAdmin = user.role === "PLATFORM_ADMIN";
  const merchants = isAdmin ? await db.merchant.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, dbaName: true } }) : undefined;
  const scope = resolveMerchantScope(user, searchParams.m);
  const m = scope
    ? await db.merchant.findUnique({ where: { id: scope } })
    : isAdmin
      ? await db.merchant.findFirst({ orderBy: { createdAt: "asc" } })
      : null;

  if (!m) {
    return (
      <Shell user={user} active="console">
        <div className="page">
          <div className="panel">
            <div className="panel-h">No merchants <span className="tag">POST /api/admin/merchants</span></div>
            <div className="panel-b muted">Board your first merchant to populate the console. Run <span className="mono">npm run db:seed</span> for demo data.</div>
          </div>
        </div>
      </Shell>
    );
  }

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const ok = { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] as ("SUCCEEDED" | "PARTIALLY_REFUNDED")[] };

  const [today, mtd, payments, links, disputes, dues] = await Promise.all([
    db.payment.aggregate({ where: { merchantId: m.id, status: ok, createdAt: { gte: dayStart } }, _sum: { totalAmountCents: true }, _count: true }),
    db.payment.aggregate({ where: { merchantId: m.id, status: ok, createdAt: { gte: monthStart } }, _sum: { totalAmountCents: true, platformRevenueCents: true, feeAmountCents: true }, _count: true }),
    db.payment.findMany({ where: { merchantId: m.id }, orderBy: { createdAt: "desc" }, take: 25, include: { job: { select: { externalRef: true, title: true } } } }),
    db.payLink.findMany({ where: { merchantId: m.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.dispute.count({ where: { payment: { merchantId: m.id }, status: { in: ["NEEDS_RESPONSE", "UNDER_REVIEW"] } } }),
    m.membershipTier === "ELITE" ? duesStatus(m.id) : Promise.resolve(null),
  ]);

  const mtdVol = mtd._sum.totalAmountCents ?? 0;
  const mtdRev = mtd._sum.platformRevenueCents ?? 0;
  const feesRecovered = mtd._sum.feeAmountCents ?? 0;
  const openLinkTotal = links.reduce((s, l) => s + l.baseAmountCents, 0);

  return (
    <Shell user={user} active="console" merchants={merchants} current={m.id}>
      <div className="ticker">
        <span>{m.dbaName.toUpperCase()}</span>
        <span>VERTICAL<b>{VERTICAL_LABEL[m.vertical]}</b></span>
        <span>STATE<b>{m.state}</b></span>
        <span>PROGRAM<b>{MODE_LABEL[m.pricingMode]}</b></span>
        <span>TIER<b className={m.membershipTier === "ELITE" ? "accent" : ""}>{m.membershipTier}</b></span>
        <span>STATUS<b className={m.status === "ACTIVE" ? "up" : "accent"}>{m.status}</b></span>
        <span>PROVIDER<b>{m.provider.toUpperCase()}</b></span>
      </div>

      <div className="page">
        <div className="kpis">
          <Kpi label="Volume · Today" value={usd(today._sum.totalAmountCents ?? 0)} delta={`${today._count} txns`} />
          <Kpi label="Volume · MTD" value={usd(mtdVol)} delta={`${mtd._count} txns`} />
          <Kpi label="Card fees recovered · MTD" value={usd(feesRecovered)} delta="paid by customers" />
          <Kpi label="Open pay links" value={usd(openLinkTotal)} delta={`${links.length} outstanding`} />
          <Kpi label="Open disputes" value={String(disputes)} delta={disputes ? "respond before deadline" : "none"} tone={disputes ? "down" : undefined} />
        </div>

        <div className="cols-2">
          <div className="panel">
            <div className="panel-h">Payments <span className="tag">last 25</span></div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Time</th><th>Job</th><th>Method</th><th>Channel</th>
                  <th className="num">Base</th><th className="num">Fee</th><th className="num">Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && <tr className="empty"><td colSpan={8}>No payments yet</td></tr>}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="mono dim">{ts(p.createdAt)}</td>
                    <td>{p.job?.externalRef ? <span className="mono">{p.job.externalRef}</span> : <span className="dim">—</span>}</td>
                    <td className="mono">{p.funding === "ACH" ? "ACH" : `${p.brand ?? ""} ${p.funding.slice(0, 2)} ••${p.last4 ?? "--"}`}</td>
                    <td className="dim">{p.channel.replace(/_/g, " ")}</td>
                    <td className="num">{usd(p.baseAmountCents)}</td>
                    <td className="num muted">{p.feeAmountCents ? usd(p.feeAmountCents) : "—"}</td>
                    <td className="num">{usd(p.totalAmountCents)}</td>
                    <td><span className={`st st-${p.status}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div className="panel">
              <div className="panel-h">Elite membership <span className="tag">{dues?.period ?? "—"}</span></div>
              <div className="panel-b">
                {dues ? (
                  <>
                    <Row k="Monthly dues" v={usd(eliteDuesMonthlyCents())} />
                    <Row k="Covered by processing" v={usd(dues.creditCents)} tone="up" />
                    <Row k="Balance due" v={usd(dues.balanceDueCents)} tone={dues.balanceDueCents ? undefined : "up"} />
                    <div className={`meter ${dues.coveredPct >= 100 ? "full" : ""}`}><i style={{ width: `${dues.coveredPct}%` }} /></div>
                    <div className="mono" style={{ marginTop: 8, fontSize: 11 }}>
                      {dues.coveredPct >= 100 ? <span className="up">MEMBERSHIP FREE THIS MONTH</span> : <span className="accent">{dues.coveredPct}% COVERED</span>}
                    </div>
                  </>
                ) : (
                  <div className="muted">Not enrolled. Elite members get dues credited by card processing.</div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">Open pay links <span className="tag">{links.length}</span></div>
              <table className="grid">
                <thead><tr><th>Customer</th><th>Desc</th><th className="num">Cash price</th></tr></thead>
                <tbody>
                  {links.length === 0 && <tr className="empty"><td colSpan={3}>None outstanding</td></tr>}
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{l.customerName ?? <span className="dim">—</span>}</td>
                      <td className="muted" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{l.description}</td>
                      <td className="num">{usd(l.baseAmountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isAdmin && <div className="panel">
              <div className="panel-h">Platform <span className="tag">operator view</span></div>
              <div className="panel-b">
                <Row k="Platform revenue · MTD" v={usd(mtdRev)} tone="up" />
                <Row k="Effective take" v={mtdVol ? `${((mtdRev / mtdVol) * 100).toFixed(2)}%` : "—"} />
              </div>
            </div>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
