import { db } from "@/lib/db";
import { isPeriod, previousPeriod } from "@/lib/dues";
import { usd } from "@/lib/format";
import { duesStatus, eliteDuesMonthlyCents } from "@/lib/services/dues";
import { requireUser } from "@/lib/session";
import { Kpi, Row, Shell } from "../Shell";
import { ClosePeriodButton } from "./ClosePeriodButton";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await requireUser("billing:read");
  const isAdmin = user.role === "PLATFORM_ADMIN";
  const period = searchParams.period && isPeriod(searchParams.period) ? searchParams.period : previousPeriod(new Date());

  const invoices = await db.duesInvoice.findMany({
    where: isAdmin ? { period } : { merchantId: user.merchantId ?? "__none__" },
    include: { merchant: { select: { dbaName: true, vertical: true } } },
    orderBy: isAdmin ? { amountCents: "desc" } : { period: "desc" },
    take: 500,
  });

  const sum = (f: (i: (typeof invoices)[number]) => number) => invoices.reduce((s, i) => s + f(i), 0);
  const billed = sum((i) => i.amountCents);
  const collected = sum((i) => (i.status === "PAID" ? i.amountCents : 0));
  const covered = sum((i) => i.creditCents);
  const free = invoices.filter((i) => i.status === "WAIVED").length;
  const current = !isAdmin && user.merchantId && user.merchant?.membershipTier === "ELITE" ? await duesStatus(user.merchantId) : null;

  return (
    <Shell user={user} active="billing">
      <div className="ticker">
        <span>ELITE MEMBERSHIP BILLING</span>
        <span>DUES<b>{usd(eliteDuesMonthlyCents())}/mo</b></span>
        {isAdmin && <span>PERIOD<b>{period}</b></span>}
        <span>RULE<b>Processing revenue credited first · balance invoiced on the 1st</b></span>
      </div>
      <div className="page">
        {isAdmin ? (
          <>
            <div className="kpis">
              <Kpi label="Elite members billed" value={String(invoices.length)} delta={`${free} fully covered (free)`} />
              <Kpi label="Covered by processing" value={usd(covered)} tone="up" delta="credited against dues" />
              <Kpi label="Invoiced balance" value={usd(billed)} delta={`${invoices.length - free} invoices`} />
              <Kpi label="Collected" value={usd(collected)} tone="up" delta={billed ? `${Math.round((collected / billed) * 100)}% of invoiced` : "—"} />
              <Kpi label="Outstanding" value={usd(billed - collected)} tone={billed - collected ? "down" : undefined} delta="open invoices" />
            </div>
            <div className="panel">
              <div className="panel-h">
                Period close
                <span className="tag">runs automatically on the 1st · safe to re-run</span>
              </div>
              <div className="panel-b" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <form style={{ display: "flex", gap: 8 }}>
                  <input name="period" defaultValue={period} className="input" style={{ width: 110 }} />
                  <button className="btn">View</button>
                </form>
                <ClosePeriodButton period={period} />
              </div>
            </div>
          </>
        ) : (
          current && (
            <div className="panel">
              <div className="panel-h">This month <span className="tag">{current.period}</span></div>
              <div className="panel-b">
                <Row k="Monthly dues" v={usd(current.duesCents)} />
                <Row k="Covered by your card processing so far" v={usd(current.creditCents)} tone="up" />
                <Row k="Balance if month ended today" v={usd(current.balanceDueCents)} />
                <div className={`meter ${current.coveredPct >= 100 ? "full" : ""}`}><i style={{ width: `${current.coveredPct}%` }} /></div>
              </div>
            </div>
          )
        )}

        <div className="panel">
          <div className="panel-h">Invoices <span className="tag">{invoices.length}</span></div>
          <table className="grid">
            <thead>
              <tr>
                {isAdmin ? <th>Member</th> : <th>Period</th>}
                {isAdmin && <th>Vertical</th>}
                <th className="num">Dues</th><th className="num">Covered</th><th className="num">Balance</th><th>Status</th><th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && <tr className="empty"><td colSpan={7}>No invoices{isAdmin ? ` for ${period} — run the close` : " yet"}</td></tr>}
              {invoices.map((i) => (
                <tr key={i.id}>
                  {isAdmin ? <td>{i.merchant.dbaName}</td> : <td className="mono">{i.period}</td>}
                  {isAdmin && <td className="dim">{i.merchant.vertical.replace(/_/g, " ")}</td>}
                  <td className="num">{usd(i.duesCents)}</td>
                  <td className="num up">{usd(i.creditCents)}</td>
                  <td className="num">{usd(i.amountCents)}</td>
                  <td><span className={`st st-${i.status === "WAIVED" ? "PAID" : i.status}`}>{i.status === "WAIVED" ? "FREE" : i.status}</span></td>
                  <td className="mono dim">{i.paidAt ? i.paidAt.toISOString().slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
