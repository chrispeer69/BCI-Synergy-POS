"use client";

import { useState } from "react";

export function SubmitDisputeButton({ id, strength }: { id: string; strength: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (strength < 50 && !window.confirm(`Evidence strength is ${strength}/100. Submit anyway?`)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/disputes/${id}/submit`, { method: "POST" });
    if (r.ok) return window.location.reload();
    setErr((await r.json().catch(() => ({}))).error ?? "Submit failed");
    setBusy(false);
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-primary" style={{ height: 24 }} onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
      {err && <span className="down mono" style={{ fontSize: 10 }}>{err}</span>}
    </span>
  );
}
