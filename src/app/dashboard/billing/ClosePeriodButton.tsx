"use client";

import { useState } from "react";

export function ClosePeriodButton({ period }: { period: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/billing/close", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Close failed");
      setMsg(`${j.invoiced} invoiced · ${j.waived} free · ${j.skipped} already closed`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Close failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Closing…" : `Close ${period}`}</button>
      {msg && <span className="mono muted" style={{ fontSize: 11 }}>{msg}</span>}
    </>
  );
}
