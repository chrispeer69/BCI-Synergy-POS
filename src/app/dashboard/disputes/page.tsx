import { db } from "@/lib/db";
import type { EvidencePacket } from "@/lib/evidence";
import { usd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { Kpi, Row, Shell } from "../Shell";
import { SubmitDisputeButton } from "./SubmitDisputeButton";

export const dynamic = "force-dynamic";

const CAT: Record<string, string> = {
  FRAUD: "Fraud / not authorized", NOT_RECEIVED: "Service not provided", NOT_AS_DESCRIBED: "Not as described",
  DUPLICATE: "Duplicate", CREDIT_NOT_PROCESSED: "Refund not processed", OTHER: "Other",
};

function daysLeft(d: Date | null): number | null {
  return d ? Math.ceil((d.getTime() - Date.now()) / 86_400_000) : null;
}

export default async function DisputesPage({ searchParams }: { searchParams: { d?: string } }) {
  const user = await requireUser("payments:read");
  const isAdmin = user.role === "PLATFORM_ADMIN";
  const canManage = can(user.role, "disputes:manage");

  const disputes = await db.dispute.findMany({
    where: isAdmin ? {} : { payment: { merchantId: user.merchantId ?? "__none__" } },
    include: { payment: { include: { merchant: { select: { dbaName: true } }, job: { select: { externalRef: true, title: true } } } } },
    orderBy: [{ status: "asc" }, { respondBy: "asc" }],
    take: 300,
  });

  const open = disputes.filter((d) => d.status === "NEEDS_RESPONSE");
  const atRisk = open.reduce((s, d) => s + d.amountCents, 0);
  const urgent = open.filter((d) => (daysLeft(d.respondBy) ?? 99) <= 3).length;
  const decided = disputes.filter((d) => d.status === "WON" || d.status === "LOST");
  const won = decided.filter((d) => d.status === "WON").length;
  const avgStrength = open.length ? Math.round(open.reduce((s, d) => s + d.strength, 0) / open.length) : 0;
  const sel = searchParams.d ? disputes.find((d) => d.id === searchParams.d) : undefined;
  const packet = sel?.evidence as unknown as EvidencePacket | undefined;

  return (
    <Shell user={user} active="disputes">
      <div className="ticker">
        <span>DISPUTES</span>
        <span>RULE<b>Evidence auto-assembles from the job locker · submit before deadline</b></span>
        <span>AUTO-SUBMIT<b>merchant setting · strength ≥ 70</b></span>
      </div>
      <div className="page">
        <div className="kpis">
          <Kpi label="Needs response" value={String(open.length)} tone={open.length ? "down" : undefined} delta={`${urgent} due ≤ 3 days`} />
          <Kpi label="Amount at risk" value={usd(atRisk)} tone={atRisk ? "down" : undefined} delta="open disputes" />
          <Kpi label="Avg evidence strength" value={open.length ? `${avgStrength}/100` : "—"} delta="open disputes" />
          <Kpi label="Win rate" value={decided.length ? `${Math.round((won / decided.length) * 100)}%` : "—"} tone="up" delta={`${won} won · ${decided.length - won} lost`} />
          <Kpi label="Under review" value={String(disputes.filter((d) => d.status === "UNDER_REVIEW").length)} delta="submitted, awaiting decision" />
        </div>

        <div className={sel ? "cols-2" : undefined}>
          <div className="panel">
            <div className="panel-h">Disputes <span className="tag">{disputes.length}</span></div>
            <table className="grid">
              <thead>
                <tr>
                  <th>Due</th>{isAdmin && <th>Merchant</th>}<th>Job</th><th>Reason</th>
                  <th className="num">Amount</th><th>Evidence</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {disputes.length === 0 && <tr className="empty"><td colSpan={8}>No disputes</td></tr>}
                {disputes.map((d) => {
                  const left = daysLeft(d.respondBy);
                  const pk = d.evidence as unknown as Partial<EvidencePacket>;
                  return (
                    <tr key={d.id} style={sel?.id === d.id ? { background: "var(--panel-2)" } : undefined}>
                      <td className={`mono ${d.status === "NEEDS_RESPONSE" && left !== null && left <= 3 ? "down" : "dim"}`}>
                        {d.status === "NEEDS_RESPONSE" ? (left === null ? "—" : left < 0 ? "PAST DUE" : `${left}d`) : "—"}
                      </td>
                      {isAdmin && <td>{d.payment.merchant.dbaName}</td>}
                      <td><a className="mono" href={`?d=${d.id}`}>{d.payment.job?.externalRef ?? d.paymentId.slice(-8)}</a></td>
                      <td className="muted">{CAT[d.category] ?? d.category}</td>
                      <td className="num">{usd(d.amountCents)}</td>
                      <td style={{ minWidth: 130 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className={`meter ${d.strength >= 70 ? "full" : ""}`} style={{ width: 70, marginTop: 0 }}><i style={{ width: `${d.strength}%`, background: d.strength < 40 ? "var(--down)" : undefined }} /></div>
                          <span className="mono" style={{ fontSize: 11 }}>{d.strength}</span>
                          {!!pk.missing?.length && d.status === "NEEDS_RESPONSE" && <span className="dim mono" style={{ fontSize: 10 }}>−{pk.missing.length}</span>}
                        </div>
                      </td>
                      <td><span className={`st st-${d.status}`}>{d.status.replace("_", " ")}</span></td>
                      <td>{canManage && d.status === "NEEDS_RESPONSE" && !d.submittedAt && (left === null || left >= 0) && <SubmitDisputeButton id={d.id} strength={d.strength} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sel && packet && (
            <div className="panel" style={{ alignSelf: "start" }}>
              <div className="panel-h">Evidence packet <span className="tag">{sel.payment.job?.externalRef ?? sel.id.slice(-8)}</span></div>
              <div className="panel-b" style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 12, lineHeight: 1.55 }}>{packet.summary}</div>
                <div>
                  <Row k="Category" v={CAT[packet.category] ?? packet.category} />
                  <Row k="Strength" v={`${packet.strength}/100`} tone={packet.strength >= 70 ? "up" : packet.strength < 40 ? "down" : undefined} />
                  <Row k="Receipt" v={`${packet.receipt?.total ?? ""} · ${packet.receipt?.method ?? ""}`} />
                  {sel.submittedAt && <Row k="Submitted" v={sel.submittedAt.toISOString().slice(0, 16).replace("T", " ")} tone="up" />}
                </div>
                {!!packet.missing?.length && (
                  <div>
                    <div className="field-label">Missing — add before deadline</div>
                    <div className="mono accent" style={{ fontSize: 11 }}>{packet.missing.map((m) => m.replace(/_/g, " ")).join(" · ")}</div>
                  </div>
                )}
                {!!packet.timeline?.length && (
                  <div>
                    <div className="field-label">Timeline</div>
                    {packet.timeline.map((t, i) => <Row key={i} k={t.event} v={t.at.slice(0, 16).replace("T", " ")} />)}
                  </div>
                )}
                {!!packet.locations?.length && (
                  <div>
                    <div className="field-label">GPS</div>
                    {packet.locations.map((l, i) => <Row key={i} k={l.label ?? l.at.slice(11, 16)} v={`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}${l.accuracyM ? ` ±${l.accuracyM}m` : ""}`} />)}
                  </div>
                )}
                {!!packet.attachments?.length && (
                  <div>
                    <div className="field-label">Attachments</div>
                    {packet.attachments.map((a, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--rule)" }}>
                        <a href={a.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11 }}>{a.type.replace(/_/g, " ")}</a>
                        <span className="mono dim" style={{ fontSize: 11 }}>{a.capturedAt.slice(0, 16).replace("T", " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
